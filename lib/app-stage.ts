import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AppStack } from "./app-stack";

/**
 * Deployable Stage that wraps the AppStack.
 *
 * A Stage represents one deployable environment (e.g. "Production").
 * CDK Pipelines deploys Stages, not Stacks directly — so even with
 * a single environment, this wrapper is required by the pipeline API.
 */
export class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new AppStack(this, "AppStack", {
      description:
        "SSM + Lambda + Step Functions workflow (deployed via pipeline)",
    });
  }
}
