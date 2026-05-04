import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as pipelines from "aws-cdk-lib/pipelines";
import { AppStage } from "./app-stage";

/**
 * Pipeline stack: defines a self-mutating CodePipeline that watches
 * the GitHub repo and deploys the AppStage (which contains AppStack)
 * on every push to `main`.
 *
 * On first deploy, this stack must be created manually with `cdk deploy`.
 * After that, the pipeline updates itself on every push — no further
 * manual deploys required.
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------
    // Source — GitHub via CodeStar Connection
    // -----------------------------------------------------------
    // The connection ARN points to the OAuth-authorized link between
    // this AWS account and the omaomach GitHub account, created in
    // Step 4.2. The pipeline uses it to clone the repo and to listen
    // for push events on `main`.
    const githubConnectionArn =
      "arn:aws:codeconnections:eu-west-1:574128098399:connection/9b9be27d-90a2-4a68-813c-a2967165c3e2";

    const source = pipelines.CodePipelineSource.connection(
      "omaomach/capstone-lab-4",
      "main",
      {
        connectionArn: githubConnectionArn,
        triggerOnPush: true,
      }
    );

    // -----------------------------------------------------------
    // Synth step — installs deps, runs CDK synth in CodeBuild
    // -----------------------------------------------------------
    // `commands` runs in a CodeBuild container on every pipeline run.
    // - `npm ci` installs dependencies from package-lock.json (faster,
    //    deterministic vs `npm install`).
    // - `npx cdk synth` produces the cloud assembly the pipeline deploys.
    const synthStep = new pipelines.ShellStep("Synth", {
      input: source,
      commands: ["npm ci", "npx cdk synth"],
      primaryOutputDirectory: "cdk.out",
    });

    // -----------------------------------------------------------
    // The pipeline itself
    // -----------------------------------------------------------
    const pipeline = new pipelines.CodePipeline(this, "WorkflowPipeline", {
      pipelineName: "CapstoneProject4-Pipeline",
      synth: synthStep,
      crossAccountKeys: false, // Single-account; no cross-account key needed (saves ~$1/mo)
      selfMutation: true, // Pipeline updates itself when pipeline-stack.ts changes
    });

    // -----------------------------------------------------------
    // Deployment stage — deploys the AppStage (which holds AppStack)
    // -----------------------------------------------------------
    // The stage is named "Production" — this becomes the CloudFormation
    // stack prefix (so the deployed app stack will be `Production-AppStack`).
    pipeline.addStage(
      new AppStage(this, "Production", {
        env: {
          account: "574128098399",
          region: "eu-west-1",
        },
      })
    );
  }
}
