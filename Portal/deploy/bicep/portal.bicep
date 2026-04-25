targetScope = 'resourceGroup'

// PIMActivation Portal — Azure Static Web Apps
// Copyright © 2026 Sebastian Flæng Markdanner — MIT License
//
// Usage:
//   az deployment group create \
//     --resource-group rg-pimactivation-portal \
//     --template-file portal.bicep \
//     --parameters customDomain=portal.pimactivation.com

@description('Custom domain to configure on the Static Web App (optional).')
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

// ── Custom domain (optional) ─────────────────────────────────────────────────
resource customDomainResource 'Microsoft.Web/staticSites/customDomains@2023-01-01' = if (!empty(customDomain)) {
  parent: staticWebApp
  name:   customDomain
  properties: {}
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output staticWebAppUrl  string = 'https://${staticWebApp.properties.defaultHostname}'
output staticWebAppName string = staticWebApp.name
output deploymentToken  string = staticWebApp.listSecrets().properties.apiKey
