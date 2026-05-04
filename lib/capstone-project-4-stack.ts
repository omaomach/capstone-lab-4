import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class CapstoneProject4Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------
    // 1. SSM Parameter — dynamic configuration
    // -----------------------------------------------------------
    // Stored in Parameter Store so the value can be changed in the
    // console without redeploying the Lambda. The Lambda reads this
    // at runtime via the AWS SDK.
    const configParam = new ssm.StringParameter(this, "AppGreetingParam", {
      parameterName: "/app/config/greeting",
      stringValue: "Hello from CI/CD Automated Infrastructure!",
      description: "Greeting message read by the workflow Lambda at runtime",
      tier: ssm.ParameterTier.STANDARD,
    });

    // -----------------------------------------------------------
    // 2. Lambda function — reads the SSM parameter
    // -----------------------------------------------------------
    // Code lives in ./lambda (handler is index.handler).
    // Runtime is Node.js 20 — current AWS-supported LTS as of 2026.
    const workflowLambda = new lambda.Function(this, "WorkflowTaskLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: cdk.Duration.seconds(10),
      description: "Reads /app/config/greeting from SSM and returns it",
    });

    // -----------------------------------------------------------
    // 3. IAM — least-privilege grant
    // -----------------------------------------------------------
    // grantRead() generates a policy allowing ssm:GetParameter and
    // ssm:GetParameters scoped to THIS parameter's ARN only.
    configParam.grantRead(workflowLambda);

    // -----------------------------------------------------------
    // Stack outputs — make key identifiers visible after deploy
    // -----------------------------------------------------------
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: workflowLambda.functionName,
      description: "Name of the workflow Lambda function",
    });

    new cdk.CfnOutput(this, "SsmParameterName", {
      value: configParam.parameterName,
      description: "Name of the SSM parameter holding the greeting",
    });
  }
}
