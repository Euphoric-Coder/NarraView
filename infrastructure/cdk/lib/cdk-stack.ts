import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const contentTable = new dynamodb.Table(this, 'NarraViewContent', {
      partitionKey: { name: 'contentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // S3 Bucket for Media
    const mediaBucket = new s3.Bucket(this, 'NarraViewMedia', {
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: [
            'http://localhost:3000',
            'http://localhost:3001',
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Content Lambda Function
    const contentLambda = new NodejsFunction(this, 'ContentLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/content/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
      }
    });

    // Permissions for Content Lambda
    contentTable.grantReadWriteData(contentLambda);
    mediaBucket.grantPut(contentLambda); // To generate presigned URLs for upload
    mediaBucket.grantRead(contentLambda); // To generate presigned URLs for playback

    // Grant Transcribe Start permission
    contentLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['transcribe:StartTranscriptionJob', 'transcribe:GetTranscriptionJob'],
      resources: ['*'] // StartTranscriptionJob doesn't support resource-level ARNs
    }));

    // Transcription Completion Lambda Function
    const transcriptionCompletionLambda = new NodejsFunction(this, 'TranscriptionCompletionLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/transcription-completion/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(120),
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
      }
    });

    // Permissions for Transcription Completion Lambda
    contentTable.grantReadWriteData(transcriptionCompletionLambda);
    mediaBucket.grantReadWrite(transcriptionCompletionLambda);
    transcriptionCompletionLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['transcribe:GetTranscriptionJob'],
      resources: ['*']
    }));

    // EventBridge Rule for Transcribe state changes
    const transcribeEventRule = new events.Rule(this, 'TranscribeJobStateChangeRule', {
      eventPattern: {
        source: ['aws.transcribe'],
        detailType: ['Transcribe Job State Change'],
      },
    });
    transcribeEventRule.addTarget(new targets.LambdaFunction(transcriptionCompletionLambda));

    // Ask Scene Lambda Function (RAG inference placeholder for player)
    const askSceneLambda = new NodejsFunction(this, 'AskSceneLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/ask-scene/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        nodeModules: ['openai', '@aws/bedrock-token-generator']
      },
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
        BEDROCK_MANTLE_BASE_URL: 'https://bedrock-mantle.eu-north-1.api.aws/v1',
      }
    });

    contentTable.grantReadData(askSceneLambda);
    mediaBucket.grantRead(askSceneLambda);
    askSceneLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-mantle:CreateInference',
        'bedrock-mantle:CallWithBearerToken'
      ],
      resources: ['*']
    }));

    // Segmentation Worker Lambda Function (Scene Boundary Detection)
    const segmentationWorkerLambda = new NodejsFunction(this, 'SegmentationWorkerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/segmentation-worker/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(300), // Max 5 mins
      bundling: {
        nodeModules: ['openai', '@aws/bedrock-token-generator']
      },
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
        BEDROCK_MANTLE_BASE_URL: 'https://bedrock-mantle.eu-north-1.api.aws/v1',
      }
    });

    // Permissions for Segmentation Worker Lambda
    contentTable.grantReadWriteData(segmentationWorkerLambda);
    mediaBucket.grantReadWrite(segmentationWorkerLambda);
    segmentationWorkerLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-mantle:CreateInference',
        'bedrock-mantle:CallWithBearerToken'
      ],
      resources: ['*']
    }));

    // Add Env to Content Lambda
    contentLambda.addEnvironment('SEGMENTATION_WORKER_FUNCTION_NAME', segmentationWorkerLambda.functionName);
    segmentationWorkerLambda.grantInvoke(contentLambda);

    // Knowledge Extraction Worker Lambda Function
    const knowledgeExtractionWorkerLambda = new NodejsFunction(this, 'KnowledgeExtractionWorkerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/knowledge-worker/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(300), // Max 5 mins
      bundling: {
        nodeModules: ['openai', '@aws/bedrock-token-generator']
      },
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
        BEDROCK_MANTLE_BASE_URL: 'https://bedrock-mantle.eu-north-1.api.aws/v1',
      }
    });

    contentTable.grantReadWriteData(knowledgeExtractionWorkerLambda);
    mediaBucket.grantReadWrite(knowledgeExtractionWorkerLambda);
    knowledgeExtractionWorkerLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-mantle:CreateInference',
        'bedrock-mantle:CallWithBearerToken'
      ],
      resources: ['*']
    }));

    // Transcript Correction Worker Lambda Function
    const transcriptCorrectionWorkerLambda = new NodejsFunction(this, 'TranscriptCorrectionWorkerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/transcript-correction-worker/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(300), // Max 5 mins
      bundling: {
        nodeModules: ['openai', '@aws/bedrock-token-generator']
      },
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
        BEDROCK_MANTLE_BASE_URL: 'https://bedrock-mantle.eu-north-1.api.aws/v1',
      }
    });

    contentTable.grantReadWriteData(transcriptCorrectionWorkerLambda);
    mediaBucket.grantReadWrite(transcriptCorrectionWorkerLambda);
    transcriptCorrectionWorkerLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-mantle:CreateInference',
        'bedrock-mantle:CallWithBearerToken'
      ],
      resources: ['*']
    }));

    contentLambda.addEnvironment('TRANSCRIPT_CORRECTION_WORKER_FUNCTION_NAME', transcriptCorrectionWorkerLambda.functionName);
    transcriptCorrectionWorkerLambda.grantInvoke(contentLambda);

    contentLambda.addEnvironment('KNOWLEDGE_WORKER_FUNCTION_NAME', knowledgeExtractionWorkerLambda.functionName);
    knowledgeExtractionWorkerLambda.grantInvoke(contentLambda);

    // Intelligence Compiler Worker Lambda Function (v0.15)
    const intelligenceCompilerLambda = new NodejsFunction(this, 'IntelligenceCompilerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/lambdas/intelligence-compiler-worker/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(300), // Max 5 mins
      environment: {
        TABLE_NAME: contentTable.tableName,
        BUCKET_NAME: mediaBucket.bucketName,
      }
    });

    contentTable.grantReadWriteData(intelligenceCompilerLambda);
    mediaBucket.grantReadWrite(intelligenceCompilerLambda);

    contentLambda.addEnvironment('INTELLIGENCE_COMPILER_FUNCTION_NAME', intelligenceCompilerLambda.functionName);
    intelligenceCompilerLambda.grantInvoke(contentLambda);

    // Automated Forward Pipeline Chaining Permissions & Function Names
    transcriptCorrectionWorkerLambda.grantInvoke(transcriptionCompletionLambda);
    transcriptionCompletionLambda.addEnvironment('TRANSCRIPT_CORRECTION_WORKER_FUNCTION_NAME', transcriptCorrectionWorkerLambda.functionName);

    segmentationWorkerLambda.grantInvoke(transcriptCorrectionWorkerLambda);
    transcriptCorrectionWorkerLambda.addEnvironment('SEGMENTATION_WORKER_FUNCTION_NAME', segmentationWorkerLambda.functionName);

    knowledgeExtractionWorkerLambda.grantInvoke(segmentationWorkerLambda);
    segmentationWorkerLambda.addEnvironment('KNOWLEDGE_WORKER_FUNCTION_NAME', knowledgeExtractionWorkerLambda.functionName);

    intelligenceCompilerLambda.grantInvoke(knowledgeExtractionWorkerLambda);
    knowledgeExtractionWorkerLambda.addEnvironment('INTELLIGENCE_COMPILER_FUNCTION_NAME', intelligenceCompilerLambda.functionName);

    // API Gateway REST API
    const api = new apigateway.RestApi(this, 'NarraViewApi', {
      restApiName: 'NarraView API',
      description: 'API for NarraView Vega Application',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Admin-Token'],
      },
    });

    // Integration
    const askSceneIntegration = new apigateway.LambdaIntegration(askSceneLambda, {
      allowTestInvoke: false,
    });

    // Route: POST /ai/ask
    const aiResource = api.root.addResource('ai');
    const askResource = aiResource.addResource('ask');
    askResource.addMethod('POST', askSceneIntegration);

    // Route: /content
    const contentResource = api.root.addResource('content');
    const contentIntegration = new apigateway.LambdaIntegration(contentLambda, {
      allowTestInvoke: false,
    });
    
    contentResource.addMethod('GET', contentIntegration);
    contentResource.addMethod('POST', contentIntegration);
    
    const contentIdResource = contentResource.addResource('{contentId}');
    contentIdResource.addMethod('GET', contentIntegration);
    contentIdResource.addMethod('PATCH', contentIntegration);
    
    const mediaUrlResource = contentIdResource.addResource('media-url');
    mediaUrlResource.addMethod('GET', contentIntegration);
    
    const transcribeResource = contentIdResource.addResource('transcribe');
    transcribeResource.addMethod('POST', contentIntegration);
    
    const transcriptResource = contentIdResource.addResource('transcript');
    transcriptResource.addMethod('GET', contentIntegration);
    const correctTranscriptResource = transcriptResource.addResource('correct');
    correctTranscriptResource.addMethod('POST', contentIntegration);
    const correctedTranscriptResource = transcriptResource.addResource('corrected');
    correctedTranscriptResource.addMethod('GET', contentIntegration);
    
    const uploadUrlResource = contentResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', contentIntegration);
    
    const segmentsResource = contentIdResource.addResource('segments');
    segmentsResource.addMethod('GET', contentIntegration);
    const detectSegmentsResource = segmentsResource.addResource('detect');
    detectSegmentsResource.addMethod('POST', contentIntegration);
    
    const posterUploadUrlResource = contentResource.addResource('poster-upload-url');
    posterUploadUrlResource.addMethod('POST', contentIntegration);

    // Knowledge API
    const knowledgeResource = contentIdResource.addResource('knowledge');
    knowledgeResource.addMethod('GET', contentIntegration);
    const extractKnowledgeResource = knowledgeResource.addResource('extract');
    extractKnowledgeResource.addMethod('POST', contentIntegration);
    
    // Segment specific knowledge API
    const segmentKnowledgeResource = segmentsResource.addResource('{segmentId}').addResource('knowledge');
    segmentKnowledgeResource.addMethod('GET', contentIntegration);

    // Content Intelligence API (v0.15)
    const intelligenceResource = contentIdResource.addResource('intelligence');
    intelligenceResource.addMethod('GET', contentIntegration);
    const compileIntelligenceResource = intelligenceResource.addResource('compile');
    compileIntelligenceResource.addMethod('POST', contentIntegration);
    const intelligenceVersionsResource = intelligenceResource.addResource('versions');
    intelligenceVersionsResource.addMethod('GET', contentIntegration);
    const intelligenceVersionResource = intelligenceResource.addResource('{version}');
    intelligenceVersionResource.addMethod('GET', contentIntegration);

    // Pipeline Reprocess API
    const pipelineResource = contentIdResource.addResource('pipeline');
    const reprocessPipelineResource = pipelineResource.addResource('reprocess');
    reprocessPipelineResource.addMethod('POST', contentIntegration);

    // AI Activation API (v0.16)
    const contentAiResource = contentIdResource.addResource('ai');
    const activateAiResource = contentAiResource.addResource('activate');
    activateAiResource.addMethod('POST', contentIntegration);
    const deactivateAiResource = contentAiResource.addResource('deactivate');
    deactivateAiResource.addMethod('POST', contentIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'NarraViewApiUrl', {
      value: api.url,
      description: 'The base URL for the NarraView API Gateway',
    });
  }
}
