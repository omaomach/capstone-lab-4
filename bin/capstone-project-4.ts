#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PipelineStack } from "../lib/pipeline-stack";

const app = new cdk.App();

// Single top-level stack: the pipeline. The pipeline itself
// deploys the AppStack via the AppStage wrapper.
new PipelineStack(app, "PipelineStack", {
  description: "CI/CD pipeline that deploys the AppStack on push to main",
  env: {
    account: "574128098399",
    region: "eu-west-1",
  },
});

app.synth();
