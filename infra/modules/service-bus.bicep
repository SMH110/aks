targetScope = 'resourceGroup'

param location string
param tags object

// Namespace names must be globally unique.
var serviceBusName = 'sb-smh-aks-uk-dev-${uniqueString(resourceGroup().id)}'

resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: serviceBusName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource runsQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: 'simulation-runs'
  properties: {
    defaultMessageTimeToLive: 'P7D'
    lockDuration: 'PT1M'
    maxDeliveryCount: 5
    deadLetteringOnMessageExpiration: true
  }
}

output namespaceName string = serviceBus.name
output hostName string = '${serviceBus.name}.servicebus.windows.net'
output queueName string = runsQueue.name
