import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { TranscribeClient, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const transcribeClient = new TranscribeClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

export const handler = async (event: any) => {
  console.log("Received event:", JSON.stringify(event));

  const detail = event.detail;
  if (!detail || !detail.TranscriptionJobName || !detail.TranscriptionJobStatus) {
    return;
  }

  const jobName = detail.TranscriptionJobName as string;
  const status = detail.TranscriptionJobStatus as string; // COMPLETED or FAILED

  // Parse contentId from jobName
  // Format: narraview-{contentId}-{timestamp}
  const match = jobName.match(/^narraview-(.+)-\d+$/);
  if (!match) {
    console.error("Could not parse contentId from job name:", jobName);
    return;
  }
  const contentId = match[1];

  if (status === 'FAILED') {
    console.log(`Transcription failed for ${contentId}. Updating DynamoDB.`);
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { contentId },
      UpdateExpression: "SET processing.transcriptionStatus = :status, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":status": "failed",
        ":updatedAt": new Date().toISOString()
      }
    }));
    return;
  }

  if (status === 'COMPLETED') {
    console.log(`Transcription completed for ${contentId}. Fetching results.`);
    const getJobCommand = new GetTranscriptionJobCommand({ TranscriptionJobName: jobName });
    const jobResponse = await transcribeClient.send(getJobCommand);
    const transcriptUri = jobResponse.TranscriptionJob?.Transcript?.TranscriptFileUri;
    
    if (!transcriptUri) {
      console.error("No transcript URI found");
      return;
    }

    const transcriptResponse = await fetch(transcriptUri);
    if (!transcriptResponse.ok) {
      console.error("Failed to fetch transcript file");
      return;
    }
    const rawTranscript = await transcriptResponse.json();

    // 1. Store raw transcript
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `content/${contentId}/transcripts/raw/transcribe.json`,
      Body: JSON.stringify(rawTranscript),
      ContentType: 'application/json'
    }));

    // 2. Normalize transcript
    const normalized = normalizeTranscript(contentId, rawTranscript, jobResponse.TranscriptionJob?.LanguageCode || 'en');

    // 3. Store normalized transcript
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `content/${contentId}/transcripts/normalized/transcript.json`,
      Body: JSON.stringify(normalized),
      ContentType: 'application/json'
    }));

    // 4. Update DynamoDB
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { contentId },
      UpdateExpression: "SET processing.transcriptionStatus = :status, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":status": "complete",
        ":updatedAt": new Date().toISOString()
      }
    }));
    console.log(`Successfully completed transcription pipeline for ${contentId}`);
  }
};

function normalizeTranscript(contentId: string, raw: any, language: string) {
  const items = raw?.results?.items || [];
  const segments: any[] = [];
  
  let currentSegment: any = null;
  let segmentWordCount = 0;

  for (const item of items) {
    if (item.type === 'pronunciation') {
      const startTime = parseFloat(item.start_time);
      const endTime = parseFloat(item.end_time);
      const word = item.alternatives[0]?.content;
      
      if (!currentSegment) {
        currentSegment = {
          id: `seg-${segments.length + 1}`,
          startTime,
          endTime,
          text: word,
          confidence: parseFloat(item.alternatives[0]?.confidence || '1')
        };
        segmentWordCount = 1;
      } else {
        // Append word
        currentSegment.text += ' ' + word;
        currentSegment.endTime = endTime;
        segmentWordCount++;
        
        // Target: 5-15s chunks or punctuation breaks
        const duration = currentSegment.endTime - currentSegment.startTime;
        if (duration >= 10 || segmentWordCount > 25) {
          segments.push(currentSegment);
          currentSegment = null;
        }
      }
    } else if (item.type === 'punctuation' && currentSegment) {
      const punc = item.alternatives[0]?.content;
      currentSegment.text += punc;
      
      // End segment on major punctuation if duration is reasonable
      if (['.', '?', '!'].includes(punc)) {
        const duration = currentSegment.endTime - currentSegment.startTime;
        if (duration >= 5) {
          segments.push(currentSegment);
          currentSegment = null;
        }
      }
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return {
    contentId,
    language,
    segments,
    metadata: {
      source: "amazon-transcribe",
      createdAt: new Date().toISOString()
    }
  };
}
