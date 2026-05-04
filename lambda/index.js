// Lambda handler: reads a configuration value from SSM Parameter Store
// and returns it. Demonstrates dynamic configuration management — the
// parameter can change without redeploying the Lambda.

const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const ssm = new SSMClient({});

exports.handler = async (event) => {
  console.log("Lambda invoked with event:", JSON.stringify(event));

  const command = new GetParameterCommand({
    Name: "/app/config/greeting",
    WithDecryption: false,
  });

  try {
    const result = await ssm.send(command);
    const greeting = result.Parameter.Value;

    console.log("Retrieved from SSM:", greeting);

    return {
      status: "Success",
      greeting: greeting,
    };
  } catch (err) {
    console.error("Failed to retrieve SSM parameter:", err);
    throw err;
  }
};
