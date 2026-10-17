targetScope = 'resourceGroup'

param location string
param tags object

var cosmosName = 'cosmos-smh-aks-uk-dev-${uniqueString(resourceGroup().id)}'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: cosmosName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'

    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]

    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]

    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }

    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: 'simlab'
  properties: {
    resource: {
      id: 'simlab'
    }
    options: {}
  }
}

resource jobs 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'jobs'
  properties: {
    resource: {
      id: 'jobs'
      partitionKey: {
        paths: [
          '/jobId'
        ]
        kind: 'Hash'
        version: 2
      }
    }
    options: {}
  }
}

resource runs 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'runs'
  properties: {
    resource: {
      id: 'runs'
      partitionKey: {
        paths: [
          '/jobId'
        ]
        kind: 'Hash'
        version: 2
      }
    }
    options: {}
  }
}

output accountName string = cosmos.name
output endpoint string = cosmos.properties.documentEndpoint
output databaseName string = database.name
