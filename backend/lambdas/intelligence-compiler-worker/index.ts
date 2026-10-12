import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { compileContentIntelligence } from "./compiler";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || "";
const BUCKET_NAME = process.env.BUCKET_NAME || "";

export const handler = async (event: { contentId: string }) => {
  const { contentId } = event;
  console.log(JSON.stringify({
    event: "INTELLIGENCE_COMPILE_START",
    contentId,
    timestamp: new Date().toISOString(),
  }));

  try {
    // 1. Fetch content metadata from DynamoDB
    const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const item = check.Item;
    if (!item) {
      throw new Error(`Content not found in DynamoDB: ${contentId}`);
    }

    // Set status to processing
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...item,
        processing: {
          ...item.processing,
          intelligenceCompilationStatus: "processing",
        },
        intelligence: {
          ...(item.intelligence || {}),
          status: "processing",
        },
        updatedAt: new Date().toISOString(),
      },
    }));

    // 2. Fetch transcript (try corrected first, fallback to normalized)
    let transcriptData: any = null;
    let correctedTranscriptKey: string | undefined = undefined;
    const normalizedTranscriptKey = `content/${contentId}/transcripts/normalized/transcript.json`;

    try {
      const corrKey = `content/${contentId}/transcripts/corrected/transcript.json`;
      const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: corrKey }));
      const str = await res.Body?.transformToString();
      if (str) {
        transcriptData = JSON.parse(str);
        correctedTranscriptKey = corrKey;
        console.log(`[IntelligenceCompiler] Loaded corrected transcript: ${corrKey}`);
      }
    } catch (err: any) {
      console.log(`[IntelligenceCompiler] No corrected transcript found (${err.name}), falling back to normalized transcript.`);
    }

    if (!transcriptData) {
      const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: normalizedTranscriptKey }));
      const str = await res.Body?.transformToString();
      if (!str) throw new Error(`Normalized transcript not found at ${normalizedTranscriptKey}`);
      transcriptData = JSON.parse(str);
      console.log(`[IntelligenceCompiler] Loaded normalized transcript: ${normalizedTranscriptKey}`);
    }

    // 3. Fetch segments
    const segmentsKey = `content/${contentId}/segments/segments.json`;
    const segmentsRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: segmentsKey }));
    const segmentsStr = await segmentsRes.Body?.transformToString();
    if (!segmentsStr) throw new Error(`Segments not found at ${segmentsKey}`);
    const segmentsDoc = JSON.parse(segmentsStr);

    // 4. Fetch knowledge
    const knowledgeKey = `content/${contentId}/knowledge/knowledge.json`;
    const knowledgeRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: knowledgeKey }));
    const knowledgeStr = await knowledgeRes.Body?.transformToString();
    if (!knowledgeStr) throw new Error(`Knowledge not found at ${knowledgeKey}`);
    const knowledgeDoc = JSON.parse(knowledgeStr);

    console.log(JSON.stringify({
      event: "SOURCE_LOAD_COMPLETE",
      contentId,
      correctedTranscriptUsed: !!correctedTranscriptKey,
      segmentCount: segmentsDoc.segments?.length || 0,
      factsCount: knowledgeDoc.facts?.length || 0,
      entitiesCount: knowledgeDoc.entities?.length || 0,
      conceptsCount: knowledgeDoc.concepts?.length || 0,
      relationshipsCount: knowledgeDoc.relationships?.length || 0,
    }));

    // Determine version (incrementing from existing latestVersion)
    const currentVersion = item.intelligence?.latestVersion || 0;
    const nextVersion = currentVersion + 1;

    // 5. Compile canonical intelligence package
    const intelligencePackage = compileContentIntelligence({
      content: {
        contentId,
        title: item.title,
        contentType: item.contentType || "general",
        language: item.language || "en",
        durationSeconds: item.durationSeconds,
      },
      transcript: transcriptData,
      segmentsDoc,
      knowledgeDoc,
      sourceKeys: {
        correctedTranscriptKey,
        normalizedTranscriptKey,
        segmentsKey,
        knowledgeKey,
      },
      version: nextVersion,
    });

    console.log(JSON.stringify({
      event: "CANONICAL_NORMALIZATION_COMPLETE",
      contentId,
      version: nextVersion,
      peopleCount: intelligencePackage.people.length,
      entitiesCount: intelligencePackage.entities.length,
      conceptsCount: intelligencePackage.concepts.length,
    }));

    console.log(JSON.stringify({
      event: "FACT_DEDUP_COMPLETE",
      contentId,
      factsBefore: knowledgeDoc.facts?.length || 0,
      factsAfter: intelligencePackage.facts.length,
      duplicateFactsRemoved: intelligencePackage.quality.duplicateFactsRemoved,
    }));

    console.log(JSON.stringify({
      event: "RELATIONSHIP_VALIDATION_COMPLETE",
      contentId,
      relationshipsBefore: knowledgeDoc.relationships?.length || 0,
      relationshipsAfter: intelligencePackage.relationships.length,
      duplicateRelationsRemoved: intelligencePackage.quality.duplicateRelationsRemoved,
      referentialIntegrity: intelligencePackage.quality.referentialIntegrity,
    }));

    console.log(JSON.stringify({
      event: "TEMPORAL_INDEX_COMPLETE",
      contentId,
      revealPointsCount: intelligencePackage.temporalIndex.revealPoints.length,
    }));

    console.log(JSON.stringify({
      event: "PACKAGE_VALIDATION_COMPLETE",
      contentId,
      qualityScore: intelligencePackage.quality.qualityScore,
      unresolvedAsrTerms: intelligencePackage.quality.unresolvedAsrTerms,
    }));

    // 6. Write versioned and latest intelligence package to S3
    const versionedS3Key = `content/${contentId}/intelligence/v${nextVersion}/intelligence.json`;
    const latestS3Key = `content/${contentId}/intelligence/latest.json`;
    const packagePayload = JSON.stringify(intelligencePackage, null, 2);

    await Promise.all([
      s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: versionedS3Key,
        Body: packagePayload,
        ContentType: "application/json",
      })),
      s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: latestS3Key,
        Body: packagePayload,
        ContentType: "application/json",
      })),
    ]);

    console.log(JSON.stringify({
      event: "INTELLIGENCE_PERSISTED",
      contentId,
      versionedS3Key,
      latestS3Key,
    }));

    // 7. Update DynamoDB metadata & pipeline completion
    const currentCheck = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const isPipeline = currentCheck.Item?.processing?.pipelineStatus === 'processing';
    const compiledAt = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...(currentCheck.Item || item),
        processing: {
          ...((currentCheck.Item || item).processing || {}),
          intelligenceCompilationStatus: "complete",
          ...(isPipeline ? {
            pipelineStatus: "complete",
            currentPipelineStage: null,
            pipelineCompletedAt: compiledAt,
          } : {}),
        },
        intelligence: {
          status: "complete",
          latestVersion: nextVersion,
          latestS3Key,
          versionedS3Key,
          compiledAt,
          compilerVersion: "0.15.0",
          qualityScore: intelligencePackage.quality.qualityScore,
          segmentCount: intelligencePackage.timeline.length,
          factCount: intelligencePackage.facts.length,
          entityCount: intelligencePackage.entities.length,
          conceptCount: intelligencePackage.concepts.length,
          relationshipCount: intelligencePackage.relationships.length,
          unresolvedAsrTermsCount: intelligencePackage.quality.unresolvedAsrTerms.length,
        },
        updatedAt: compiledAt,
      },
    }));

    // Structured Quality Summary Log (Section 48)
    console.log(JSON.stringify({
      event: "INTELLIGENCE_COMPILE_COMPLETE",
      contentId,
      version: nextVersion,
      factsBefore: knowledgeDoc.facts?.length || 0,
      factsAfter: intelligencePackage.facts.length,
      relationsBefore: knowledgeDoc.relationships?.length || 0,
      relationsAfter: intelligencePackage.relationships.length,
      unresolvedAsrTerms: intelligencePackage.quality.unresolvedAsrTerms.length,
      temporalIndexEntries: intelligencePackage.temporalIndex.revealPoints.length,
      qualityScore: intelligencePackage.quality.qualityScore,
      completedAt: compiledAt,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        contentId,
        status: "complete",
        version: nextVersion,
        latestS3Key,
      }),
    };
  } catch (err: any) {
    console.error(JSON.stringify({
      event: "INTELLIGENCE_COMPILE_FAILED",
      contentId,
      error: err.message,
      stack: err.stack,
    }));

    try {
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (check.Item) {
        const isPipeline = check.Item.processing?.pipelineStatus === 'processing';
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...check.Item,
            processing: {
              ...check.Item.processing,
              intelligenceCompilationStatus: "failed",
              ...(isPipeline ? {
                pipelineStatus: "failed",
                pipelineErrorStage: "intelligence_compilation",
              } : {}),
            },
            intelligence: {
              ...(check.Item.intelligence || {}),
              status: "failed",
              error: err.message,
            },
            updatedAt: new Date().toISOString(),
          },
        }));
      }
    } catch (saveErr) {
      console.error("Failed to record error state in DynamoDB:", saveErr);
    }

    throw err;
  }
};
