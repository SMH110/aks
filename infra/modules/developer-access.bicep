targetScope = 'resourceGroup'

param developerPrincipalId string
param serviceBusNamespaceName string
param queueName string
param cosmosAccountName string

// Reference resources created by the other modules.
resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' existing = {
  name: serviceBusNamespaceName
}

resource runsQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' existing = {
  parent: serviceBus
  name: queueName
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' existing = {
  name: cosmosAccountName
}

// Microsoft's built-in role identifiers.
var senderRoleId = '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39'
var receiverRoleId = '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0'
var cosmosContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource developerSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(runsQueue.id, developerPrincipalId, senderRoleId)
  scope: runsQueue
  properties: {
    principalId: developerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', senderRoleId)
  }
}

resource developerReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(runsQueue.id, developerPrincipalId, receiverRoleId)
  scope: runsQueue
  properties: {
    principalId: developerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', receiverRoleId)
  }
}

resource developerCosmosAccess 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, developerPrincipalId, cosmosContributorRoleId)
  properties: {
    principalId: developerPrincipalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosContributorRoleId}'
    scope: cosmos.id
  }
}
