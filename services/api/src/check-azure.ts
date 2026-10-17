import { CosmosClient } from "@azure/cosmos";
import { AzureCliCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

// Use the user identity signed in through az login.
const credential = new AzureCliCredential();

const cosmos = new CosmosClient({
  endpoint: required("COSMOS_ENDPOINT"),
  aadCredentials: credential,
});

const database = cosmos.database(required("COSMOS_DATABASE"));

const bus = new ServiceBusClient(
  required("SERVICE_BUS_NAMESPACE"),
  credential,
);

const receiver = bus.createReceiver(required("SERVICE_BUS_QUEUE"));

try {
  await database.container("jobs").read();
  await database.container("runs").read();

  console.log("Cosmos DB: jobs and runs containers accessible");

  await receiver.peekMessages(1);

  console.log("Service Bus: queue accessible");
} finally {
  await receiver.close();
  await bus.close();
  cosmos.dispose();
}