import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TranscribeClient, StartTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { computeInvalidatedProcessing, PipelineStage, normalizeTranscribeLanguageCode } from "./pipeline";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, { marshallOptions: { removeUndefinedValues: true } });
const s3Client = new S3Client({});
const transcribeClient = new TranscribeClient({});
const lambdaClient = new LambdaClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

export async function resolvePlaybackUrl(
  item: any,
  s3: S3Client,
  bucketName: string
): Promise<{ url: string; expiresIn: number; contentLength?: number; contentType?: string }> {
  let s3Bucket = bucketName;
  let s3Key: string | null = null;

  if (item.videoS3Key) {
    s3Key = item.videoS3Key;
  } else if (item.videoUrl && item.videoUrl.startsWith('s3://')) {
    const parts = item.videoUrl.slice(5).split('/');
    s3Bucket = parts[0];
    s3Key = parts.slice(1).join('/');
  }

  if (s3Key) {
    // S3 source: verify object and generate temporary presigned GET URL (Requirements 20, 25, 26, 27)
    let headRes: any;
    try {
      headRes = await s3.send(new HeadObjectCommand({ Bucket: s3Bucket, Key: s3Key }));
    } catch (err: any) {
      const isNotFound = err.name === 'NotFound' || err.name === 'NoSuchKey';
      const errorObj: any = new Error(isNotFound ? "Media not found in storage" : `Storage error: ${err.message}`);
      errorObj.statusCode = isNotFound ? 404 : 500;
      throw errorObj;
    }

    const contentType = headRes.ContentType || 'video/mp4';
    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      ResponseContentType: contentType
    });
    const expiresIn = 3600; // 1 hour
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn });
    return {
      url: presignedUrl,
      expiresIn,
      contentLength: headRes.ContentLength,
      contentType
    };
  }

  if (item.videoUrl && (item.videoUrl.startsWith('https://') || item.videoUrl.startsWith('http://'))) {
    return {
      url: item.videoUrl,
      expiresIn: 3600,
      contentType: 'video/mp4'
    };
  }

  const err: any = new Error("Unsupported media scheme or missing media URI");
  err.statusCode = 400;
  throw err;
}

export const handler = async (event: any) => {
  const method = event.httpMethod;
  const path = event.resource;
  
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  
  try {
    if (path === '/content' && method === 'GET') {
      const command = new ScanCommand({ TableName: TABLE_NAME });
      const response = await docClient.send(command);
      const items = response.Items || [];
      
      const resolvedItems = await Promise.all(items.map(async (item: any) => {
        let videoUrl = item.videoUrl;
        try {
          if (item.videoS3Key || (item.videoUrl && item.videoUrl.startsWith('s3://'))) {
            const pb = await resolvePlaybackUrl(item, s3Client, BUCKET_NAME);
            videoUrl = pb.url;
          }
        } catch {}

        let posterUrl = item.posterUrl;
        if (item.posterS3Key) {
          const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.posterS3Key });
          posterUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        }
        return {
          ...item,
          videoUrl,
          posterUrl
        };
      }));
      
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify(resolvedItems)
      };
    }
    
    if (path === '/content/{contentId}' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const command = new GetCommand({ TableName: TABLE_NAME, Key: { contentId } });
      const response = await docClient.send(command);
      
      if (!response.Item) {
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      }
      
      const item = response.Item;
      let videoUrl = item.videoUrl;
      try {
        if (item.videoS3Key || (item.videoUrl && item.videoUrl.startsWith('s3://'))) {
          const pb = await resolvePlaybackUrl(item, s3Client, BUCKET_NAME);
          videoUrl = pb.url;
        }
      } catch (err: any) {
        console.warn("Could not generate presigned video URL for item:", item.contentId, err.message);
      }

      let posterUrl = item.posterUrl;
      if (item.posterS3Key) {
        const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.posterS3Key });
        posterUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ ...item, videoUrl, posterUrl })
      };
    }

    if (path === '/content/{contentId}/media-url' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const command = new GetCommand({ TableName: TABLE_NAME, Key: { contentId } });
      const response = await docClient.send(command);
      
      if (!response.Item) {
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      }
      
      try {
        const mediaRes = await resolvePlaybackUrl(response.Item, s3Client, BUCKET_NAME);
        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify({
            url: mediaRes.url,
            expiresIn: mediaRes.expiresIn,
            contentType: mediaRes.contentType,
            contentLength: mediaRes.contentLength
          })
        };
      } catch (mediaErr: any) {
        return {
          statusCode: mediaErr.statusCode || 500,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: mediaErr.message || "Failed to resolve playback URL"
          })
        };
      }
    }

    if (path === '/content/{contentId}/segments' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const key = `content/${contentId}/segments/segments.json`;
      
      try {
        let bodyStr = '';
        try {
          const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
          bodyStr = await res.Body?.transformToString() || '{}';
        } catch (segErr: any) {
          if (segErr.name === 'NoSuchKey') {
            const fallbackKey = `content/${contentId}/segments/scenes.json`;
            const fallbackRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fallbackKey }));
            bodyStr = await fallbackRes.Body?.transformToString() || '{}';
          } else {
            throw segErr;
          }
        }
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Segments not found' }) };
        }
        throw err;
      }
    }

    if (path === '/content/{contentId}/transcripts/{type}' && method === 'GET') {
      const { contentId, type } = event.pathParameters;
      let key = `content/${contentId}/transcripts/normalized/transcript.json`;
      if (type === 'raw') {
        key = `content/${contentId}/transcripts/raw/transcribe.json`;
      } else if (type === 'corrected') {
        key = `content/${contentId}/transcripts/corrected/transcript.json`;
      }
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcript not found' }) };
        }
        throw err;
      }
    }

    // GET /content/{contentId}/intelligence/versions (Requirement 10 & 12)
    if ((path === '/content/{contentId}/intelligence/versions' || (path === '/content/{contentId}/intelligence/{version}' && event.pathParameters?.version === 'versions')) && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const requestId = event.requestContext?.requestId || event.headers?.['x-amzn-requestid'] || `req-${Date.now()}`;
      
      try {
        const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
        const item = check.Item;
        if (!item) {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found', contentId }) };
        }

        const prefix = `content/${contentId}/intelligence/v`;
        let listRes;
        try {
          listRes = await s3Client.send(new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
          }));
        } catch (s3Err: any) {
          if (s3Err.name === 'AccessDenied') {
            console.error("Storage access denied while listing intelligence versions:", s3Err);
            return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Storage access denied', details: s3Err.message }) };
          }
          throw s3Err;
        }

        const versionSet = new Set<string>();
        (listRes.Contents || []).forEach(obj => {
          const match = obj.Key?.match(/\/v(\d+)\/intelligence\.json$/);
          if (match) {
            versionSet.add(`v${match[1]}`);
          }
        });

        if (item.intelligence?.latestVersion && typeof item.intelligence.latestVersion === 'number') {
          for (let i = 1; i <= item.intelligence.latestVersion; i++) {
            versionSet.add(`v${i}`);
          }
        }

        const sortedVersions = Array.from(versionSet).sort((a, b) => {
          const numA = parseInt(a.replace('v', ''), 10);
          const numB = parseInt(b.replace('v', ''), 10);
          return numA - numB;
        });

        return {
          statusCode: 200,
          headers: {
            ...corsHeaders(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({
            contentId,
            latestVersion: item.intelligence?.latestVersion ? `v${item.intelligence.latestVersion}` : (sortedVersions[sortedVersions.length - 1] || null),
            versions: sortedVersions
          })
        };
      } catch (err: any) {
        console.error("Error listing intelligence versions:", err);
        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Internal server error listing versions', details: err.message })
        };
      }
    }

    // GET /content/{contentId}/intelligence (Latest intelligence package - Requirement 9)
    if (path === '/content/{contentId}/intelligence' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const requestId = event.requestContext?.requestId || event.headers?.['x-amzn-requestid'] || `req-${Date.now()}`;
      
      console.log(JSON.stringify({
        event: "INTELLIGENCE_READ_REQUEST",
        contentId,
        requestId
      }));

      try {
        const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
        const item = check.Item;
        if (!item) {
          console.log(JSON.stringify({
            event: "INTELLIGENCE_READ_NOT_FOUND",
            contentId,
            reason: "Content not found in DynamoDB",
            requestId
          }));
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found', contentId }) };
        }

        console.log(JSON.stringify({
          event: "CONTENT_LOOKUP_SUCCESS",
          contentId,
          requestId
        }));

        const latestVersion = item.intelligence?.latestVersion || null;
        let resolvedS3Key = item.intelligence?.latestS3Key || `content/${contentId}/intelligence/latest.json`;

        console.log(JSON.stringify({
          event: "INTELLIGENCE_POINTER_RESOLVED",
          contentId,
          resolvedS3Key,
          latestVersion,
          requestId
        }));

        console.log(JSON.stringify({
          event: "INTELLIGENCE_S3_READ_START",
          contentId,
          resolvedS3Key,
          requestId
        }));

        let res;
        try {
          res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: resolvedS3Key }));
        } catch (firstErr: any) {
          if ((firstErr.name === 'NoSuchKey' || firstErr.name === 'NotFound') && latestVersion) {
            resolvedS3Key = `content/${contentId}/intelligence/v${latestVersion}/intelligence.json`;
            console.log(JSON.stringify({
              event: "INTELLIGENCE_POINTER_RESOLVED",
              contentId,
              resolvedS3Key,
              latestVersion,
              fallback: true,
              requestId
            }));
            res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: resolvedS3Key }));
          } else {
            throw firstErr;
          }
        }

        const bodyStr = await res.Body?.transformToString();
        console.log(JSON.stringify({
          event: "INTELLIGENCE_S3_READ_SUCCESS",
          contentId,
          resolvedS3Key,
          latestVersion,
          requestId
        }));

        return {
          statusCode: 200,
          headers: {
            ...corsHeaders(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          body: bodyStr || '{}'
        };
      } catch (err: any) {
        if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
          console.log(JSON.stringify({
            event: "INTELLIGENCE_READ_NOT_FOUND",
            contentId,
            error: err.message,
            requestId
          }));
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Intelligence artifact not found', contentId }) };
        }

        console.error(JSON.stringify({
          event: "INTELLIGENCE_READ_FAILED",
          contentId,
          errorName: err.name,
          errorMessage: err.message,
          requestId
        }));

        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Storage error while reading intelligence artifact', details: err.message })
        };
      }
    }

    // GET /content/{contentId}/intelligence/{version} (Specific immutable version - Requirement 11)
    if (path === '/content/{contentId}/intelligence/{version}' && method === 'GET') {
      const { contentId, version } = event.pathParameters;
      const requestId = event.requestContext?.requestId || event.headers?.['x-amzn-requestid'] || `req-${Date.now()}`;
      const parsedVersion = version.startsWith('v') ? version : `v${version}`;
      const key = `content/${contentId}/intelligence/${parsedVersion}/intelligence.json`;
      
      console.log(JSON.stringify({
        event: "INTELLIGENCE_READ_REQUEST",
        contentId,
        requestedVersion: parsedVersion,
        resolvedS3Key: key,
        requestId
      }));

      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();

        console.log(JSON.stringify({
          event: "INTELLIGENCE_S3_READ_SUCCESS",
          contentId,
          resolvedS3Key: key,
          version: parsedVersion,
          requestId
        }));

        return {
          statusCode: 200,
          headers: {
            ...corsHeaders(),
            'Cache-Control': 'public, max-age=3600'
          },
          body: bodyStr || '{}'
        };
      } catch (err: any) {
        if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
          console.log(JSON.stringify({
            event: "INTELLIGENCE_READ_NOT_FOUND",
            contentId,
            resolvedS3Key: key,
            error: err.message,
            requestId
          }));
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: `Intelligence version ${version} not found`, contentId }) };
        }

        console.error(JSON.stringify({
          event: "INTELLIGENCE_READ_FAILED",
          contentId,
          resolvedS3Key: key,
          errorName: err.name,
          errorMessage: err.message,
          requestId
        }));

        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: `Storage error while reading intelligence version ${version}`, details: err.message })
        };
      }
    }

    // Pipeline Reprocess Orchestration Endpoint
    if (path === '/content/{contentId}/pipeline/reprocess' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      if (contentId === 'signal-lost') {
        return { 
          statusCode: 400, 
          headers: corsHeaders(), 
          body: JSON.stringify({ error: 'AI pipeline reprocessing is disabled for reference title Signal Lost' }) 
        };
      }
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      
      // Stop duplicate runs if pipeline is actively processing (allow recovery if stuck > 10 mins)
      let isForce = false;
      if (event.body) {
        try {
          const parsed = JSON.parse(event.body);
          if (parsed.force) isForce = true;
        } catch {}
      }
      const isStuck = item.processing?.pipelineStartedAt &&
        (Date.now() - new Date(item.processing.pipelineStartedAt).getTime() > 10 * 60 * 1000);

      if (item.processing?.pipelineStatus === 'processing' && !isStuck && !isForce) {
        return { 
          statusCode: 409, 
          headers: corsHeaders(), 
          body: JSON.stringify({ error: 'An AI pipeline reprocessing job is already active for this title' }) 
        };
      }

      let startFrom: PipelineStage = 'transcript_correction';
      if (event.body) {
        try {
          const parsed = JSON.parse(event.body);
          if (parsed.startFrom) startFrom = parsed.startFrom;
        } catch {}
      }

      // Check prerequisites for requested start stage
      if (startFrom === 'transcription') {
        if (!item.mediaPlayable) {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Media must be playable before starting transcription' }) };
        }
      } else if (startFrom === 'transcript_correction' || startFrom === 'scene_detection') {
        if (item.processing?.transcriptionStatus !== 'complete') {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcription must be complete before reprocessing downstream' }) };
        }
      } else if (startFrom === 'knowledge_extraction') {
        if (item.processing?.sceneDetectionStatus !== 'complete') {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Scene detection must be complete before resuming knowledge extraction' }) };
        }
      } else if (startFrom === 'intelligence_compilation') {
        if (item.processing?.metadataExtractionStatus !== 'complete') {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Knowledge extraction must be complete before compiling intelligence' }) };
        }
      }

      // Compute downstream invalidation
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, startFrom);

      // Initialize pipeline state
      const updatedProcessing = {
        ...invalidatedProcessing,
        pipelineStatus: 'processing',
        currentPipelineStage: startFrom,
        pipelineErrorStage: null,
        pipelineStartedAt: new Date().toISOString(),
        pipelineStartFrom: startFrom,
      };

      if (startFrom === 'transcription') {
        const safeContentId = contentId.replace(/[^0-9a-zA-Z._-]/g, '-');
        const jobName = `narraview-${safeContentId}-${Date.now()}`;
        let mediaFileUri = item.videoUrl || `s3://${BUCKET_NAME}/${item.videoS3Key}`;
        if (item.videoS3Key) {
          mediaFileUri = `s3://${BUCKET_NAME}/${item.videoS3Key}`;
        }
        
        let mediaFormat = 'mp4';
        const uriLower = mediaFileUri.toLowerCase().split('?')[0];
        if (uriLower.endsWith('.mp3')) mediaFormat = 'mp3';
        else if (uriLower.endsWith('.wav')) mediaFormat = 'wav';
        else if (uriLower.endsWith('.webm')) mediaFormat = 'webm';
        else if (uriLower.endsWith('.flac')) mediaFormat = 'flac';
        else if (uriLower.endsWith('.ogg')) mediaFormat = 'ogg';
        else if (uriLower.endsWith('.m4a')) mediaFormat = 'm4a';
        
        const languageCode = normalizeTranscribeLanguageCode(item.language);

        const transcribeCommand = new StartTranscriptionJobCommand({
          TranscriptionJobName: jobName,
          LanguageCode: languageCode as any,
          MediaFormat: mediaFormat as any,
          Media: { MediaFileUri: mediaFileUri }
        });
        
        await transcribeClient.send(transcribeCommand);
        
        updatedProcessing.transcriptionStatus = 'queued';
        updatedProcessing.transcribeJobName = jobName;

        const updated = {
          ...item,
          processing: updatedProcessing,
          transcription: {
            ...(item.transcription || {}),
            jobName,
            transcriptionJobName: jobName,
            transcriptionRunId: `run-${Date.now()}`,
            status: 'queued',
            startedAt: new Date().toISOString(),
            transcriptionStartedAt: new Date().toISOString(),
            latestSuccessfulTranscriptionJobName: item.transcription?.latestSuccessfulTranscriptionJobName ||
              (item.processing?.transcriptionStatus === 'complete' ? item.transcription?.jobName : undefined)
          },
          updatedAt: new Date().toISOString()
        };
        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
        return { statusCode: 202, headers: corsHeaders(), body: JSON.stringify({ contentId, pipelineStatus: 'processing', currentPipelineStage: startFrom, jobName }) };
      }

      // Dispatch specific worker
      if (startFrom === 'transcript_correction') {
        updatedProcessing.transcriptCorrectionStatus = 'queued';
      } else if (startFrom === 'scene_detection') {
        updatedProcessing.sceneDetectionStatus = 'queued';
      } else if (startFrom === 'knowledge_extraction') {
        updatedProcessing.metadataExtractionStatus = 'queued';
      } else if (startFrom === 'intelligence_compilation') {
        updatedProcessing.intelligenceCompilationStatus = 'queued';
      }

      const updated = {
        ...item,
        processing: updatedProcessing,
        updatedAt: new Date().toISOString()
      };
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));

      let targetWorkerFn: string | undefined;
      if (startFrom === 'transcript_correction') targetWorkerFn = process.env.TRANSCRIPT_CORRECTION_WORKER_FUNCTION_NAME;
      else if (startFrom === 'scene_detection') targetWorkerFn = process.env.SEGMENTATION_WORKER_FUNCTION_NAME;
      else if (startFrom === 'knowledge_extraction') targetWorkerFn = process.env.KNOWLEDGE_WORKER_FUNCTION_NAME;
      else if (startFrom === 'intelligence_compilation') targetWorkerFn = process.env.INTELLIGENCE_COMPILER_FUNCTION_NAME;

      if (targetWorkerFn) {
        await lambdaClient.send(new InvokeCommand({
          FunctionName: targetWorkerFn,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ contentId }))
        }));
      }

      return { 
        statusCode: 202, 
        headers: corsHeaders(), 
        body: JSON.stringify({ 
          contentId, 
          pipelineStatus: 'processing', 
          currentPipelineStage: startFrom 
        }) 
      };
    }

    if (path === '/content/{contentId}/intelligence/compile' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      
      if (item.processing?.pipelineStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot compile intelligence while pipeline reprocessing is active' }) };
      }

      // Verification: transcription, scene detection, and knowledge extraction must be complete
      if (
        item.processing?.transcriptionStatus !== 'complete' ||
        item.processing?.sceneDetectionStatus !== 'complete' ||
        item.processing?.metadataExtractionStatus !== 'complete'
      ) {
        return { 
          statusCode: 400, 
          headers: corsHeaders(), 
          body: JSON.stringify({ 
            error: 'Transcription, segment detection, and knowledge extraction must be complete before intelligence compilation' 
          }) 
        };
      }
      
      if (
        item.processing?.intelligenceCompilationStatus === 'queued' ||
        item.processing?.intelligenceCompilationStatus === 'processing'
      ) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Intelligence compilation already in progress' }) };
      }
      
      // Intelligence recompilation does NOT invalidate upstream stages
      const updated = {
        ...item,
        processing: {
          ...item.processing,
          intelligenceCompilationStatus: 'queued',
        },
        intelligence: {
          ...(item.intelligence || {}),
          status: 'queued',
          startedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      
      const invokeCommand = new InvokeCommand({
        FunctionName: process.env.INTELLIGENCE_COMPILER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ contentId })),
      });
      await lambdaClient.send(invokeCommand);
      
      return { statusCode: 202, headers: corsHeaders(), body: JSON.stringify({ contentId, status: 'queued' }) };
    }

    if (path === '/content/{contentId}/transcript/correct' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      
      const isCorrectionStuck = item.transcriptCorrection?.startedAt &&
        (Date.now() - new Date(item.transcriptCorrection.startedAt).getTime() > 10 * 60 * 1000);

      if (item.processing?.pipelineStatus === 'processing' && !isCorrectionStuck) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot run transcript correction while pipeline reprocessing is active' }) };
      }

      if (item.processing?.transcriptionStatus !== 'complete') {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcription must be complete before transcript correction' }) };
      }
      
      if ((item.processing?.transcriptCorrectionStatus === 'queued' || item.processing?.transcriptCorrectionStatus === 'processing') && !isCorrectionStuck) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcript correction already in progress' }) };
      }
      
      // Downstream invalidation: transcript correction rerun invalidates scene detection, knowledge extraction, intelligence compilation
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, 'transcript_correction');

      const updated = {
        ...item,
        processing: {
          ...invalidatedProcessing,
          transcriptCorrectionStatus: 'queued',
          pipelineStatus: 'idle',
        },
        transcriptCorrection: {
          status: 'queued',
          startedAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      
      const invokeCommand = new InvokeCommand({
        FunctionName: process.env.TRANSCRIPT_CORRECTION_WORKER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ contentId }))
      });
      await lambdaClient.send(invokeCommand);
      
      return { statusCode: 202, headers: corsHeaders(), body: JSON.stringify({ contentId, status: 'queued' }) };
    }
    
    if (path === '/content' && method === 'POST') {
      const body = JSON.parse(event.body);
      const { contentId, title, contentType, language, description, videoS3Key, videoUrl, posterS3Key, posterUrl } = body;
      
      if (!contentId || !title || !contentType || !language) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing required fields' }) };
      }
      
      const item = {
        contentId,
        title,
        contentType,
        language,
        description: description || '',
        videoS3Key: videoS3Key || null,
        videoUrl: videoUrl || null,
        posterS3Key: posterS3Key || null,
        posterUrl: posterUrl || null,
        mediaPlayable: !!(videoS3Key || videoUrl),
        aiReady: false,
        processing: {
          transcriptionStatus: 'not_started',
          transcriptCorrectionStatus: 'not_started',
          sceneDetectionStatus: 'not_started',
          metadataExtractionStatus: 'not_started',
          intelligenceCompilationStatus: 'not_started',
          pipelineStatus: 'idle',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const command = new PutCommand({ TableName: TABLE_NAME, Item: item });
      await docClient.send(command);
      
      return { statusCode: 201, headers: corsHeaders(), body: JSON.stringify(item) };
    }
    
    if (path === '/content/{contentId}' && method === 'PATCH') {
      const contentId = event.pathParameters.contentId;
      const body = JSON.parse(event.body);
      
      const updateKeys = Object.keys(body).filter(k => k !== 'contentId');
      if (updateKeys.length === 0) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No fields to update' }) };
      }
      
      let updateExpr = 'SET ' + updateKeys.map(k => `#${k} = :${k}`).join(', ') + ', #updatedAt = :updatedAt';
      const exprAttrNames: any = { '#updatedAt': 'updatedAt' };
      const exprAttrValues: any = { ':updatedAt': new Date().toISOString() };
      
      updateKeys.forEach(k => {
        exprAttrNames[`#${k}`] = k;
        exprAttrValues[`:${k}`] = body[k];
      });
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { contentId },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
        ReturnValues: 'ALL_NEW'
      });
      
      const response = await docClient.send(command);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response.Attributes) };
    }
    
    // Traceable Amazon Transcribe rerun path (Requirements 19-36)
    if (path === '/content/{contentId}/transcribe' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      console.log(JSON.stringify({
        event: "TRANSCRIBE_RERUN_REQUEST",
        contentId
      }));

      console.log(JSON.stringify({
        event: "CONTENT_LOOKUP_START",
        contentId
      }));

      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) {
        console.log(JSON.stringify({
          event: "CONTENT_LOOKUP_NOT_FOUND",
          contentId
        }));
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      }

      console.log(JSON.stringify({
        event: "CONTENT_LOOKUP_SUCCESS",
        contentId,
        title: item.title
      }));
      
      if (item.processing?.pipelineStatus === 'processing') {
        return { 
          statusCode: 409, 
          headers: corsHeaders(), 
          body: JSON.stringify({ error: 'Cannot trigger transcription while pipeline reprocessing is active' }) 
        };
      }

      // Check current job guard (Requirement 29)
      if (item.processing?.transcriptionStatus === 'queued' || item.processing?.transcriptionStatus === 'processing') {
        return { 
          statusCode: 409, 
          headers: corsHeaders(), 
          body: JSON.stringify({ error: 'Transcription is already running' }) 
        };
      }

      if (!item.mediaPlayable) {
        return { 
          statusCode: 400, 
          headers: corsHeaders(), 
          body: JSON.stringify({ error: 'Media is not playable or uploaded' }) 
        };
      }
      
      console.log(JSON.stringify({
        event: "TRANSCRIBE_MEDIA_RESOLVE_START",
        contentId
      }));

      let mediaFileUri = item.videoUrl;
      let s3Bucket = BUCKET_NAME;
      let s3Key = item.videoS3Key;
      let mediaSourceType = "s3";

      if (s3Key) {
        mediaFileUri = `s3://${s3Bucket}/${s3Key}`;
      } else if (item.videoUrl && item.videoUrl.startsWith('s3://')) {
        const parts = item.videoUrl.slice(5).split('/');
        s3Bucket = parts[0];
        s3Key = parts.slice(1).join('/');
        mediaFileUri = item.videoUrl;
      } else if (item.videoUrl && item.videoUrl.includes('.amazonaws.com/')) {
        const urlObj = new URL(item.videoUrl);
        s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
        mediaFileUri = `s3://${s3Bucket}/${s3Key}`;
      } else if (item.videoUrl) {
        mediaSourceType = "external_uri";
      }

      if (!mediaFileUri) {
        console.error(JSON.stringify({
          event: "TRANSCRIBE_START_FAILED",
          contentId,
          stage: "TRANSCRIBE_MEDIA_RESOLVE",
          errorName: "MissingMediaUri",
          errorMessage: "Missing media source URI",
          mediaSourceType
        }));
        return { 
          statusCode: 400, 
          headers: corsHeaders(), 
          body: JSON.stringify({ error: 'Missing media location URI' }) 
        };
      }

      // S3 Object Validation with HeadObject (Requirement 26)
      if (s3Key) {
        try {
          const headRes = await s3Client.send(new HeadObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key
          }));
          console.log(JSON.stringify({
            event: "TRANSCRIBE_MEDIA_RESOLVE_SUCCESS",
            contentId,
            bucket: s3Bucket,
            key: s3Key,
            contentLength: headRes.ContentLength,
            contentType: headRes.ContentType
          }));
        } catch (headErr: any) {
          console.error(JSON.stringify({
            event: "TRANSCRIBE_START_FAILED",
            contentId,
            stage: "TRANSCRIBE_MEDIA_RESOLVE",
            errorName: headErr.name || "HeadObjectFailed",
            errorMessage: headErr.message,
            awsRequestId: headErr.$metadata?.requestId,
            httpStatusCode: headErr.$metadata?.httpStatusCode,
            mediaSourceType
          }));
          const isNotFound = headErr.name === 'NotFound' || headErr.name === 'NoSuchKey';
          return {
            statusCode: isNotFound ? 404 : 400,
            headers: corsHeaders(),
            body: JSON.stringify({
              error: `Media S3 object validation failed: ${headErr.message}`,
              errorName: headErr.name,
              requestId: headErr.$metadata?.requestId
            })
          };
        }
      } else {
        console.log(JSON.stringify({
          event: "TRANSCRIBE_MEDIA_RESOLVE_SUCCESS",
          contentId,
          mediaFileUri,
          mediaSourceType
        }));
      }

      // Language code normalization and media format resolution (Requirements 25 & 27)
      const languageCode = normalizeTranscribeLanguageCode(item.language);
      let mediaFormat = 'mp4';
      const uriLower = mediaFileUri.toLowerCase().split('?')[0];
      if (uriLower.endsWith('.mp3')) mediaFormat = 'mp3';
      else if (uriLower.endsWith('.wav')) mediaFormat = 'wav';
      else if (uriLower.endsWith('.webm')) mediaFormat = 'webm';
      else if (uriLower.endsWith('.flac')) mediaFormat = 'flac';
      else if (uriLower.endsWith('.ogg')) mediaFormat = 'ogg';
      else if (uriLower.endsWith('.m4a')) mediaFormat = 'm4a';

      console.log(JSON.stringify({
        event: "TRANSCRIBE_INPUT_VALIDATION_SUCCESS",
        contentId,
        languageCode,
        mediaFormat
      }));

      // Generate unique job name satisfying ^[0-9a-zA-Z._-]+$ and narraview-{contentId}-{timestamp} (Requirements 21 & 22)
      const safeContentId = contentId.replace(/[^0-9a-zA-Z._-]/g, '-');
      const jobName = `narraview-${safeContentId}-${Date.now()}`;

      console.log(JSON.stringify({
        event: "TRANSCRIBE_JOB_NAME_CREATED",
        contentId,
        jobName
      }));

      console.log(JSON.stringify({
        event: "TRANSCRIBE_START_REQUEST",
        contentId,
        jobName
      }));

      const transcribeCommand = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: languageCode as any,
        MediaFormat: mediaFormat as any,
        Media: { MediaFileUri: mediaFileUri }
      });

      let transcribeRes: any;
      try {
        transcribeRes = await transcribeClient.send(transcribeCommand);
      } catch (err: any) {
        console.error(JSON.stringify({
          event: "TRANSCRIBE_START_FAILED",
          contentId,
          stage: "START_TRANSCRIPTION_JOB",
          errorName: err.name,
          errorMessage: err.message,
          awsRequestId: err.$metadata?.requestId,
          httpStatusCode: err.$metadata?.httpStatusCode,
          generatedTranscriptionJobName: jobName,
          mediaSourceType
        }));

        let statusCode = 500;
        if (err.name === 'ConflictException') statusCode = 409;
        else if (err.name === 'BadRequestException') statusCode = 400;
        else if (err.name === 'AccessDeniedException') statusCode = 502;
        else if (err.name === 'LimitExceededException') statusCode = 429;

        return {
          statusCode,
          headers: corsHeaders(),
          body: JSON.stringify({
            error: err.message || "Failed to start transcription job",
            errorName: err.name,
            requestId: err.$metadata?.requestId,
            jobName
          })
        };
      }

      console.log(JSON.stringify({
        event: "TRANSCRIBE_START_SUCCESS",
        contentId,
        jobName,
        awsRequestId: transcribeRes?.$metadata?.requestId,
        httpStatusCode: transcribeRes?.$metadata?.httpStatusCode
      }));
      
      // Invalidation: ONLY after successful StartTranscriptionJob (Requirements 30, 31, 32, 33)
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, 'transcription');

      const updated = {
        ...item,
        processing: {
          ...invalidatedProcessing,
          transcriptionStatus: 'queued',
          transcribeJobName: jobName,
          pipelineStatus: 'idle',
        },
        transcription: {
          ...(item.transcription || {}),
          jobName,
          transcriptionJobName: jobName,
          transcriptionRunId: `run-${Date.now()}`,
          status: 'queued',
          startedAt: new Date().toISOString(),
          transcriptionStartedAt: new Date().toISOString(),
          latestSuccessfulTranscriptionJobName: item.transcription?.latestSuccessfulTranscriptionJobName ||
            (item.processing?.transcriptionStatus === 'complete' ? item.transcription?.jobName : undefined)
        },
        updatedAt: new Date().toISOString()
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      return { 
        statusCode: 202, 
        headers: corsHeaders(), 
        body: JSON.stringify({ 
          contentId, 
          jobName, 
          status: 'queued',
          requestId: transcribeRes?.$metadata?.requestId
        }) 
      };
    }
    
    if (path === '/content/upload-url' && method === 'POST') {
      const body = JSON.parse(event.body);
      const { contentId, fileName, contentType } = body;
      const key = `content/${contentId}/source/${fileName}`;
      
      const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ uploadUrl, key, url: `s3://${BUCKET_NAME}/${key}` }) };
    }
    
    if (path === '/content/poster-upload-url' && method === 'POST') {
      const body = JSON.parse(event.body);
      const { contentId, fileName, contentType } = body;
      const key = `content/${contentId}/poster/${fileName}`;
      
      const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ uploadUrl, key, url: `s3://${BUCKET_NAME}/${key}` }) };
    }
    
    if (path === '/content/{contentId}/segments/detect' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      
      const isDetectionStuck = item.processing?.sceneDetectionStartedAt &&
        (Date.now() - new Date(item.processing.sceneDetectionStartedAt).getTime() > 10 * 60 * 1000);

      if (item.processing?.pipelineStatus === 'processing' && !isDetectionStuck) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot run scene detection while pipeline reprocessing is active' }) };
      }

      if (item.processing?.transcriptionStatus !== 'complete') {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcription must be complete before scene detection' }) };
      }
      
      if ((item.processing?.sceneDetectionStatus === 'queued' || item.processing?.sceneDetectionStatus === 'processing') && !isDetectionStuck) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Scene detection already in progress' }) };
      }
      
      // Invalidation: segment detection rerun invalidates knowledge extraction, intelligence compilation
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, 'scene_detection');

      const updated = {
        ...item,
        processing: {
          ...invalidatedProcessing,
          sceneDetectionStatus: 'queued',
          sceneDetectionStartedAt: new Date().toISOString(),
          pipelineStatus: 'idle',
        },
        updatedAt: new Date().toISOString()
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      
      const invokeCommand = new InvokeCommand({
        FunctionName: process.env.SEGMENTATION_WORKER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ contentId }))
      });
      await lambdaClient.send(invokeCommand);
      
      return { statusCode: 202, headers: corsHeaders(), body: JSON.stringify({ contentId, status: 'queued' }) };
    }

    if (path === '/content/{contentId}/knowledge/extract' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      
      const isKnowledgeStuck = item.processing?.knowledgeExtractionStartedAt &&
        (Date.now() - new Date(item.processing.knowledgeExtractionStartedAt).getTime() > 10 * 60 * 1000);

      if (item.processing?.pipelineStatus === 'processing' && !isKnowledgeStuck) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot run knowledge extraction while pipeline reprocessing is active' }) };
      }

      if (item.processing?.sceneDetectionStatus !== 'complete') {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Scene detection must be complete before knowledge extraction' }) };
      }
      
      if ((item.processing?.metadataExtractionStatus === 'queued' || item.processing?.metadataExtractionStatus === 'processing') && !isKnowledgeStuck) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Knowledge extraction already in progress' }) };
      }
      
      // Invalidation: knowledge extraction rerun invalidates intelligence compilation
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, 'knowledge_extraction');

      const updated = {
        ...item,
        processing: {
          ...invalidatedProcessing,
          metadataExtractionStatus: 'queued',
          knowledgeExtractionStartedAt: new Date().toISOString(),
          pipelineStatus: 'idle',
        },
        updatedAt: new Date().toISOString()
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      
      const invokeCommand = new InvokeCommand({
        FunctionName: process.env.KNOWLEDGE_WORKER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ contentId }))
      });
      await lambdaClient.send(invokeCommand);
      
      return { statusCode: 202, headers: corsHeaders(), body: JSON.stringify({ contentId, status: 'queued' }) };
    }

    if (path === '/content/{contentId}/knowledge' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const requestId = event.requestContext?.requestId || event.headers?.['x-amzn-requestid'] || `req-${Date.now()}`;
      
      console.log(JSON.stringify({
        event: "KNOWLEDGE_READ_REQUEST",
        contentId,
        requestId
      }));

      try {
        const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
        const item = check.Item;
        if (!item) {
          console.log(JSON.stringify({
            event: "KNOWLEDGE_READ_NOT_FOUND",
            contentId,
            reason: "Content not found in DynamoDB",
            requestId
          }));
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found', contentId }) };
        }

        console.log(JSON.stringify({
          event: "CONTENT_LOOKUP_SUCCESS",
          contentId,
          requestId
        }));

        // Resolve authoritative knowledge artifact pointer (Requirement 4 & 7)
        let resolvedS3Key = item.knowledge?.knowledgeS3Key || `content/${contentId}/knowledge/knowledge.json`;

        console.log(JSON.stringify({
          event: "KNOWLEDGE_METADATA_RESOLVED",
          contentId,
          resolvedS3Key,
          requestId
        }));

        console.log(JSON.stringify({
          event: "KNOWLEDGE_S3_READ_START",
          contentId,
          resolvedS3Key,
          requestId
        }));

        let res;
        try {
          res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: resolvedS3Key }));
        } catch (firstErr: any) {
          const fallbackKey = `content/${contentId}/knowledge/knowledge.json`;
          if ((firstErr.name === 'NoSuchKey' || firstErr.name === 'NotFound') && resolvedS3Key !== fallbackKey) {
            resolvedS3Key = fallbackKey;
            console.log(JSON.stringify({
              event: "KNOWLEDGE_METADATA_RESOLVED",
              contentId,
              resolvedS3Key,
              fallback: true,
              requestId
            }));
            res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: resolvedS3Key }));
          } else {
            throw firstErr;
          }
        }

        const bodyStr = await res.Body?.transformToString();

        console.log(JSON.stringify({
          event: "KNOWLEDGE_S3_READ_SUCCESS",
          contentId,
          resolvedS3Key,
          requestId
        }));

        return {
          statusCode: 200,
          headers: {
            ...corsHeaders(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          body: bodyStr || '{}'
        };
      } catch (err: any) {
        if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
          console.log(JSON.stringify({
            event: "KNOWLEDGE_READ_NOT_FOUND",
            contentId,
            resolvedS3Key: `content/${contentId}/knowledge/knowledge.json`,
            error: err.message,
            requestId
          }));
          return {
            statusCode: 404,
            headers: corsHeaders(),
            body: JSON.stringify({ error: 'Knowledge artifact not found', contentId })
          };
        }

        console.error(JSON.stringify({
          event: "KNOWLEDGE_READ_FAILED",
          contentId,
          errorName: err.name,
          errorMessage: err.message,
          requestId
        }));

        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Storage error while reading knowledge artifact', details: err.message })
        };
      }
    }

    if (path === '/content/{contentId}/segments/{segmentId}/knowledge' && method === 'GET') {
      const { contentId, segmentId } = event.pathParameters;
      const key = `content/${contentId}/knowledge/segments/${segmentId}.json`;
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Segment knowledge not found' }) };
        }
        throw err;
      }
    }
    
  } catch (error: any) {
    console.error("Content API Unhandled Error:", error);
    return { 
      statusCode: 500, 
      headers: corsHeaders(), 
      body: JSON.stringify({ 
        error: error.message || 'Internal server error',
        errorName: error.name
      }) 
    };
  }
};

const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PATCH,DELETE",
});
