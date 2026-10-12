import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TranscribeClient, StartTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { computeInvalidatedProcessing, PipelineStage } from "./pipeline";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const transcribeClient = new TranscribeClient({});
const lambdaClient = new LambdaClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

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
        if (item.videoS3Key) {
          const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.videoS3Key });
          videoUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        }
        let posterUrl = item.posterUrl;
        if (item.posterS3Key) {
          const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.posterS3Key });
          posterUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        }
        return { ...item, videoUrl, posterUrl };
      }));
      
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(resolvedItems) };
    }
    
    if (path === '/content/{contentId}' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const command = new GetCommand({ TableName: TABLE_NAME, Key: { contentId } });
      const response = await docClient.send(command);
      
      if (!response.Item) {
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      }
      
      const item = response.Item;
      if (item.videoS3Key) {
        const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.videoS3Key });
        item.videoUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      }
      if (item.posterS3Key) {
        const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.posterS3Key });
        item.posterUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      }
      
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(item) };
    }

    if (path === '/content/{contentId}/transcript' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const key = `content/${contentId}/transcripts/normalized/transcript.json`;
      
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

    if (path === '/content/{contentId}/transcript/corrected' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const key = `content/${contentId}/transcripts/corrected/transcript.json`;
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Corrected transcript not found' }) };
        }
        throw err;
      }
    }

    if (path === '/content/{contentId}/intelligence' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const key = `content/${contentId}/intelligence/latest.json`;
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Intelligence package not found' }) };
        }
        throw err;
      }
    }

    if (path === '/content/{contentId}/intelligence/versions' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Content not found' }) };
      
      const latestVersion = item.intelligence?.latestVersion || 0;
      const versions = [];
      for (let v = 1; v <= latestVersion; v++) {
        versions.push({
          version: v,
          s3Key: `content/${contentId}/intelligence/v${v}/intelligence.json`,
          isLatest: v === latestVersion,
        });
      }
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ contentId, latestVersion, versions }) };
    }

    if (path === '/content/{contentId}/intelligence/{version}' && method === 'GET') {
      const { contentId, version } = event.pathParameters;
      const parsedVersion = version.startsWith('v') ? version : `v${version}`;
      const key = `content/${contentId}/intelligence/${parsedVersion}/intelligence.json`;
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: `Intelligence version ${version} not found` }) };
        }
        throw err;
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
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
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
        const jobName = `narraview-${contentId}-${Date.now()}`;
        const mediaFileUri = item.videoUrl || `s3://${BUCKET_NAME}/${item.videoS3Key}`;
        
        let mediaFormat = 'mp4';
        if (mediaFileUri.endsWith('.mp3')) mediaFormat = 'mp3';
        else if (mediaFileUri.endsWith('.wav')) mediaFormat = 'wav';
        else if (mediaFileUri.endsWith('.webm')) mediaFormat = 'webm';
        
        const transcribeCommand = new StartTranscriptionJobCommand({
          TranscriptionJobName: jobName,
          LanguageCode: item.language || 'en-US',
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
            jobName,
            status: 'queued',
            startedAt: new Date().toISOString()
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
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
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
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
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
    
    if (path === '/content/{contentId}/transcribe' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
      if (item.processing?.pipelineStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot trigger transcription while pipeline reprocessing is active' }) };
      }

      if (!item.mediaPlayable) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Media is not playable or uploaded' }) };
      }
      
      if (item.processing?.transcriptionStatus === 'queued' || item.processing?.transcriptionStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcription job already in progress' }) };
      }
      
      let mediaFileUri = item.videoUrl;
      if (item.videoS3Key) {
        mediaFileUri = `s3://${BUCKET_NAME}/${item.videoS3Key}`;
      } else if (item.videoUrl && item.videoUrl.includes('.amazonaws.com/')) {
        const urlObj = new URL(item.videoUrl);
        const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
        mediaFileUri = `s3://${BUCKET_NAME}/${key}`;
      }
      
      if (!mediaFileUri) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing media location URI' }) };
      }
      
      const jobName = `narraview-${contentId}-${Date.now()}`;
      let mediaFormat = 'mp4';
      if (mediaFileUri.endsWith('.mp3')) mediaFormat = 'mp3';
      else if (mediaFileUri.endsWith('.wav')) mediaFormat = 'wav';
      else if (mediaFileUri.endsWith('.webm')) mediaFormat = 'webm';
      
      const transcribeCommand = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: item.language || 'en-US',
        MediaFormat: mediaFormat as any,
        Media: { MediaFileUri: mediaFileUri }
      });
      
      await transcribeClient.send(transcribeCommand);
      
      // Invalidation: transcription rerun invalidates transcript correction, scene detection, knowledge extraction, intelligence compilation
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
          jobName,
          status: 'queued',
          startedAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      return { statusCode: 202, headers: corsHeaders(), body: JSON.stringify({ contentId, jobName, status: 'queued' }) };
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
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
      if (item.processing?.pipelineStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot run segment detection while pipeline reprocessing is active' }) };
      }

      if (item.processing?.transcriptionStatus !== 'complete') {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcription must be complete before segment detection' }) };
      }
      
      if (item.processing?.sceneDetectionStatus === 'queued' || item.processing?.sceneDetectionStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Segment detection already in progress' }) };
      }
      
      // Invalidation: segment detection rerun invalidates knowledge extraction, intelligence compilation
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, 'scene_detection');

      const updated = {
        ...item,
        processing: {
          ...invalidatedProcessing,
          sceneDetectionStatus: 'queued',
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
    
    if (path === '/content/{contentId}/segments' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const key = `content/${contentId}/segments/segments.json`;
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Segments not found' }) };
        }
        throw err;
      }
    }

    if (path === '/content/{contentId}/knowledge/extract' && method === 'POST') {
      const contentId = event.pathParameters.contentId;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const item = check.Item;
      if (!item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
      if (item.processing?.pipelineStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Cannot run knowledge extraction while pipeline reprocessing is active' }) };
      }

      if (item.processing?.transcriptionStatus !== 'complete' || item.processing?.sceneDetectionStatus !== 'complete') {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Transcription and scene detection must be complete before knowledge extraction' }) };
      }
      
      if (item.processing?.metadataExtractionStatus === 'queued' || item.processing?.metadataExtractionStatus === 'processing') {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Knowledge extraction already in progress' }) };
      }
      
      // Invalidation: knowledge extraction rerun invalidates intelligence compilation
      const invalidatedProcessing = computeInvalidatedProcessing(item.processing, 'knowledge_extraction');

      const updated = {
        ...item,
        processing: {
          ...invalidatedProcessing,
          metadataExtractionStatus: 'queued',
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
      const key = `content/${contentId}/knowledge/knowledge.json`;
      
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const res = await s3Client.send(command);
        const bodyStr = await res.Body?.transformToString();
        return { statusCode: 200, headers: corsHeaders(), body: bodyStr || '{}' };
      } catch (err: any) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Knowledge not found' }) };
        }
        throw err;
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
    console.error(error);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PATCH,DELETE",
});
