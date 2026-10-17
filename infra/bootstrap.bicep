targetScope = 'subscription'

param location string = 'uksouth'
param resourceGroupName string = 'rg-smh-aks-uk-dev'

resource labResourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: {
    project: 'simlab'
    environment: 'dev'
    managedBy: 'bicep'
  }
}

module messaging './modules/service-bus.bicep' = {
  name: 'service-bus'
  scope: labResourceGroup
  params: {
    location: location
    tags: labResourceGroup.tags
  }
}


module dataStore './modules/cosmos-db.bicep' = {
  name: 'cosmos-db'
  scope: labResourceGroup
  params: {
    location: location
    tags: labResourceGroup.tags
  }
}



output resourceGroupId string = labResourceGroup.id
output serviceBusNamespace string = messaging.outputs.namespaceName
output serviceBusHost string = messaging.outputs.hostName
output serviceBusQueue string = messaging.outputs.queueName
output cosmosAccountName string = dataStore.outputs.accountName
output cosmosEndpoint string = dataStore.outputs.endpoint
output cosmosDatabaseName string = dataStore.outputs.databaseName

