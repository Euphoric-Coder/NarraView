import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
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

    // Lambda Function
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
        ENABLE_BEDROCK_FALLBACK: 'true',
        AI_PROVIDER: 'bedrock-mantle',
        BEDROCK_MANTLE_BASE_URL: 'https://bedrock-mantle.eu-north-1.api.aws/v1',
        
      }
    });

    // Grant Bedrock InvokeModel permission for Nova Pro (dormant provider)
    askSceneLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*']
    }));

    // Grant Bedrock Mantle permissions (active provider)
    askSceneLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-mantle:CreateInference',
        'bedrock-mantle:CallWithBearerToken'
      ],
      resources: ['*']
    }));

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
    const askSceneIntegration = new apigateway.LambdaIntegration(askSceneLambda);

    // Route: POST /ai/ask
    const aiResource = api.root.addResource('ai');
    const askResource = aiResource.addResource('ask');
    askResource.addMethod('POST', askSceneIntegration);

    // New Route: /content
    const contentResource = api.root.addResource('content');
    const contentIntegration = new apigateway.LambdaIntegration(contentLambda);
    
    contentResource.addMethod('GET', contentIntegration);
    contentResource.addMethod('POST', contentIntegration);
    
    const contentIdResource = contentResource.addResource('{contentId}');
    contentIdResource.addMethod('GET', contentIntegration);
    contentIdResource.addMethod('PATCH', contentIntegration);
    
    const uploadUrlResource = contentResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', contentIntegration);
    
    const posterUploadUrlResource = contentResource.addResource('poster-upload-url');
    posterUploadUrlResource.addMethod('POST', contentIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'NarraViewApiUrl', {
      value: api.url,
      description: 'The base URL for the NarraView API Gateway',
    });
  }
}
