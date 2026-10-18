import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

const credential = new DefaultAzureCredential();

export const cosmos = new CosmosClient({
  endpoint: required("COSMOS_ENDPOINT"),
  aadCredentials: credential,
});

export const jobs = cosmos
  .database(required("COSMOS_DATABASE"))
  .container("jobs");

export const serviceBus = new ServiceBusClient(
  required("SERVICE_BUS_NAMESPACE"),
  credential,
);

export const sender = serviceBus.createSender(
  required("SERVICE_BUS_QUEUE"),
);