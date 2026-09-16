import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda Function
    const askSceneLambda = new NodejsFunction(this, 'AskSceneLambda', {
      runtime: new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS),
      entry: path.join(__dirname, '../../../backend/lambdas/ask-scene/index.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../../'),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
    });

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
