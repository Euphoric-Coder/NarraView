import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

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
      const res = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      
      const items = await Promise.all((res.Items || []).map(async (item) => {
        if (item.videoUrl && item.videoUrl.startsWith('s3://')) {
          const key = item.videoUrl.split('/').slice(3).join('/');
          const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
          item.videoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        }
        if (item.posterUrl && item.posterUrl.startsWith('s3://')) {
          const key = item.posterUrl.split('/').slice(3).join('/');
          const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
          item.posterUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        }
        return item;
      }));
      
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(items) };
    }
    
    if (path === '/content/{contentId}' && method === 'GET') {
      const contentId = event.pathParameters.contentId;
      const res = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (!res.Item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
      const item = res.Item;
      if (item.videoUrl && item.videoUrl.startsWith('s3://')) {
        const key = item.videoUrl.split('/').slice(3).join('/');
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        item.videoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      }
      if (item.posterUrl && item.posterUrl.startsWith('s3://')) {
        const key = item.posterUrl.split('/').slice(3).join('/');
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        item.posterUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      }
      
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(item) };
    }
    
    // Write operations require admin token
    const authHeader = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    if (authHeader !== 'narraview-admin-token') {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    if (path === '/content' && method === 'POST') {
      const body = JSON.parse(event.body);
      const { contentId, title, description, contentType, language, videoUrl, posterUrl, durationSeconds, mediaPlayable, aiReady } = body;
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (check.Item) {
        return { statusCode: 409, headers: corsHeaders(), body: JSON.stringify({ error: 'Conflict: contentId already exists' }) };
      }
      
      const record = {
        contentId, title, description, contentType, language, videoUrl, posterUrl, durationSeconds,
        mediaPlayable: mediaPlayable ?? false, 
        aiReady: aiReady ?? false,
        ingestionStatus: 'registered',
        processing: {
          transcriptionStatus: 'not_started',
          sceneDetectionStatus: 'not_started',
          metadataExtractionStatus: 'not_started'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: record }));
      return { statusCode: 201, headers: corsHeaders(), body: JSON.stringify(record) };
    }
    
    if (path === '/content/{contentId}' && method === 'PATCH') {
      const contentId = event.pathParameters.contentId;
      const body = JSON.parse(event.body);
      
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (!check.Item) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      
      // Merge safe fields
      const updated = { 
        ...check.Item, 
        title: body.title ?? check.Item.title,
        description: body.description ?? check.Item.description,
        contentType: body.contentType ?? check.Item.contentType,
        language: body.language ?? check.Item.language,
        videoUrl: body.videoUrl ?? check.Item.videoUrl,
        posterUrl: body.posterUrl ?? check.Item.posterUrl,
        mediaPlayable: body.mediaPlayable ?? check.Item.mediaPlayable,
        aiReady: body.aiReady ?? check.Item.aiReady,
        updatedAt: new Date().toISOString() 
      };
      
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(updated) };
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
