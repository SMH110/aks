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

output resourceGroupId string = labResourceGroup.id
