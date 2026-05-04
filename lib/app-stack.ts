import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as logs from "aws-cdk-lib/aws-logs";

/**
 * Application stack: contains the SSM parameter, Lambda function,
 * and Step Functions state machine. Deployed via the CI/CD pipeline.
 */
export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------
    // 1. SSM Parameter — dynamic configuration
    // -----------------------------------------------------------
    const configParam = new ssm.StringParameter(this, "AppGreetingParam", {
      parameterName: "/app/config/greeting",
      stringValue:
        "Hello from a pipeline-managed SSM parameter — deployed automatically on push.",
      description: "Greeting message read by the workflow Lambda at runtime",
      tier: ssm.ParameterTier.STANDARD,
    });

    // -----------------------------------------------------------
    // 2. Lambda function — reads the SSM parameter
    // -----------------------------------------------------------
    const workflowLambda = new lambda.Function(this, "WorkflowTaskLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: cdk.Duration.seconds(10),
      description: "Reads /app/config/greeting from SSM and returns it",
    });

    // -----------------------------------------------------------
    // 3. IAM — least-privilege grant for SSM
    // -----------------------------------------------------------
    configParam.grantRead(workflowLambda);

    // -----------------------------------------------------------
    // 4. Step Functions — workflow orchestration
    // -----------------------------------------------------------
    const waitState = new sfn.Wait(this, "WaitTwoSeconds", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(2)),
      comment: "Brief pause before invoking the Lambda",
    });

    const invokeLambdaTask = new tasks.LambdaInvoke(
      this,
      "InvokeWorkflowLambda",
      {
        lambdaFunction: workflowLambda,
        payloadResponseOnly: true,
        comment: "Invokes the Lambda which reads the SSM parameter",
      }
    );

    invokeLambdaTask.addRetry({
      maxAttempts: 3,
      interval: cdk.Duration.seconds(2),
      backoffRate: 2,
      errors: [
        "States.TaskFailed",
        "Lambda.ServiceException",
        "Lambda.AWSLambdaException",
        "Lambda.SdkClientException",
      ],
    });

    const failState = new sfn.Fail(this, "WorkflowFailed", {
      cause: "Lambda invocation failed after all retries",
      error: "WorkflowExecutionError",
    });

    invokeLambdaTask.addCatch(failState, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    const definition = waitState.next(invokeLambdaTask);

    const stateMachineLogGroup = new logs.LogGroup(
      this,
      "StateMachineLogGroup",
      {
        logGroupName: `/aws/vendedlogs/states/${
          cdk.Stack.of(this).stackName
        }-WorkflowStateMachine`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    const stateMachine = new sfn.StateMachine(this, "WorkflowStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(5),
      logs: {
        destination: stateMachineLogGroup,
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: false,
      comment: "Workflow that waits, then invokes the SSM-reading Lambda",
    });

    // -----------------------------------------------------------
    // Stack outputs
    // -----------------------------------------------------------
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: workflowLambda.functionName,
      description: "Name of the workflow Lambda function",
    });

    new cdk.CfnOutput(this, "SsmParameterName", {
      value: configParam.parameterName,
      description: "Name of the SSM parameter holding the greeting",
    });

    new cdk.CfnOutput(this, "StateMachineArn", {
      value: stateMachine.stateMachineArn,
      description: "ARN of the workflow state machine",
    });
  }
}
