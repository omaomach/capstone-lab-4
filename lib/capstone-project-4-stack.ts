import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as logs from "aws-cdk-lib/aws-logs";

export class CapstoneProject4Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------
    // 1. SSM Parameter — dynamic configuration
    // -----------------------------------------------------------
    const configParam = new ssm.StringParameter(this, "AppGreetingParam", {
      parameterName: "/app/config/greeting",
      stringValue: "Hello from CI/CD Automated Infrastructure!",
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
    // State 1: Wait — pauses the workflow for 2 seconds.
    // Demonstrates the Wait state type and gives the visual graph
    // a clearly-distinguishable first node.
    const waitState = new sfn.Wait(this, "WaitTwoSeconds", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(2)),
      comment: "Brief pause before invoking the Lambda",
    });

    // State 2: Task — invokes the Lambda function.
    // payloadResponseOnly: true unwraps the Lambda response so the
    // state output is just the return value (cleaner than the full
    // Lambda invocation envelope).
    const invokeLambdaTask = new tasks.LambdaInvoke(
      this,
      "InvokeWorkflowLambda",
      {
        lambdaFunction: workflowLambda,
        payloadResponseOnly: true,
        comment: "Invokes the Lambda which reads the SSM parameter",
      }
    );

    // Retry policy — runs on transient failures (throttling, timeouts).
    // Exponential backoff: waits 2s, then 4s, then 8s between attempts.
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

    // Catch state — if all retries are exhausted, route to a Fail
    // state with a clear cause. Without this, errors propagate
    // silently as raw exceptions in the execution history.
    const failState = new sfn.Fail(this, "WorkflowFailed", {
      cause: "Lambda invocation failed after all retries",
      error: "WorkflowExecutionError",
    });

    invokeLambdaTask.addCatch(failState, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // Definition: chain the states together. Wait → Invoke Lambda → done.
    const definition = waitState.next(invokeLambdaTask);

    // Log group for the state machine — created explicitly so it's
    // managed by CloudFormation and has a sensible retention period.
    const stateMachineLogGroup = new logs.LogGroup(
      this,
      "StateMachineLogGroup",
      {
        logGroupName:
          "/aws/vendedlogs/states/CapstoneProject4-WorkflowStateMachine",
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
