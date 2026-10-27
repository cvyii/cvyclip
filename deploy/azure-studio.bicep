targetScope = 'resourceGroup'

@allowed(['swedencentral', 'polandcentral', 'germanywestcentral', 'uaenorth', 'denmarkeast'])
param location string = 'uaenorth'
param appName string = 'cvyclip-studio'
@description('Immutable public image reference, preferably ghcr.io/cvyii/cvyclip@sha256:...')
param image string
@secure()
@minLength(12)
param workspacePassword string
@secure()
param openaiApiKey string
param transcriptionModel string = 'whisper-1'
param highlightModel string = 'gpt-4.1-mini'

var storageName = 'cvyclip${uniqueString(resourceGroup().id)}'
var containerName = 'cvyclip-private'
var blobContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource storage 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    accessTier: 'Hot'
    defaultToOAuthAuthentication: true
  }
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: storage
  name: 'default'
  properties: {}
}
resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: blobs
  name: containerName
  properties: { publicAccess: 'None' }
}
resource retention 'Microsoft.Storage/storageAccounts/managementPolicies@2025-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'delete-project-media-after-seven-days'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${containerName}/projects/'] }
            actions: { baseBlob: { delete: { daysAfterCreationGreaterThan: 7 } } }
          }
        }
        {
          name: 'remove-abandoned-wake-markers'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${containerName}/active/'] }
            actions: { baseBlob: { delete: { daysAfterCreationGreaterThan: 1 } } }
          }
        }
        {
          name: 'expire-old-usage-metadata'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${containerName}/usage/'] }
            actions: { baseBlob: { delete: { daysAfterCreationGreaterThan: 90 } } }
          }
        }
      ]
    }
  }
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: '${appName}-identity'
  location: location
}
resource blobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: container
  name: guid(container.id, identity.id, blobContributor)
  properties: {
    roleDefinitionId: blobContributor
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${appName}-environment'
  location: location
  properties: {
    appLogsConfiguration: { destination: 'none' }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
  }
}
resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [blobAccess, retention]
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 2
      ingress: { external: true, targetPort: 8080, transport: 'auto', allowInsecure: false }
      secrets: [
        { name: 'workspace-password', value: workspacePassword }
        { name: 'openai-api-key', value: openaiApiKey }
      ]
    }
    template: {
      containers: [{
        name: 'studio'
        image: image
        resources: { cpu: 1, memory: '2Gi' }
        env: [
          { name: 'WORKSPACE_PASSWORD', secretRef: 'workspace-password' }
          { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
          { name: 'AZURE_STORAGE_URL', value: storage.properties.primaryEndpoints.blob }
          { name: 'AZURE_STORAGE_CONTAINER', value: containerName }
          { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
          { name: 'OPENAI_TRANSCRIPTION_MODEL', value: transcriptionModel }
          { name: 'OPENAI_HIGHLIGHT_MODEL', value: highlightModel }
        ]
        probes: [
          { type: 'Startup', httpGet: { path: '/healthz', port: 8080 }, initialDelaySeconds: 5, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 60 }
          { type: 'Readiness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10, timeoutSeconds: 3, failureThreshold: 3 }
          { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, initialDelaySeconds: 30, periodSeconds: 30, timeoutSeconds: 3, failureThreshold: 3 }
        ]
      }]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        cooldownPeriod: 300
        pollingInterval: 30
        rules: [
          { name: 'http', http: { metadata: { concurrentRequests: '1' } } }
          {
            name: 'active-media-jobs'
            custom: {
              type: 'azure-blob'
              identity: identity.id
              metadata: { accountName: storage.name, blobContainerName: containerName, blobPrefix: 'active/', blobCount: '1', activationBlobCount: '0' }
            }
          }
        ]
      }
    }
  }
}
output studioUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output storageAccount string = storage.name
output appResourceId string = app.id
