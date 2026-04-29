targetScope = 'resourceGroup'

// PIMActivation Portal — Azure Static Web Apps
// Copyright © 2026 Sebastian Flæng Markdanner — MIT License
//
// Usage:
//   az deployment group create \
//     --resource-group rg-pimactivation-portal \
//     --template-file portal.bicep
//
// Custom domains are added after deployment. Azure validates the DNS CNAME when
// the Static Web App custom domain is created, so the domain cannot be attached
// before the generated default hostname exists.

@description('Optional custom domain to document in the deployment output. Add and validate it on the Static Web App manually after deployment.')
param customDomain string = ''

@description('Azure region for the Static Web App.')
param location string = 'global'

@description('SKU for Static Web Apps: Free or Standard.')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Free'

@description('Tag applied to all resources.')
param resourceTag string = 'PIMActivation'

var appName = 'pimactivation-portal'
var tags    = { project: resourceTag }

// ── Static Web App ───────────────────────────────────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name:     appName
  location: location
  tags:     tags
  sku: {
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  properties: {
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates:   true
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output staticWebAppUrl  string = 'https://${staticWebApp.properties.defaultHostname}'
output staticWebAppName string = staticWebApp.name
output deploymentToken  string = staticWebApp.listSecrets().properties.apiKey
output customDomainNextStep string = empty(customDomain) ? '' : 'Create a CNAME from ${customDomain} to ${staticWebApp.properties.defaultHostname}, then add and validate the custom domain on the Static Web App.'
