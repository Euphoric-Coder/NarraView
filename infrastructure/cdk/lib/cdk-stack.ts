import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    // Integration
    const askSceneIntegration = new apigateway.LambdaIntegration(askSceneLambda);

    // Route: POST /ai/ask
    const aiResource = api.root.addResource('ai');
    const askResource = aiResource.addResource('ask');
    askResource.addMethod('POST', askSceneIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'NarraViewApiUrl', {
      value: api.url,
      description: 'The base URL for the NarraView API Gateway',
    });
  }
}
