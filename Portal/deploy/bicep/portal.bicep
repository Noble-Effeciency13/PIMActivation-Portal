targetScope = 'resourceGroup'

// PIMActivation Portal — Azure Static Web Apps + Front Door + WAF
// Copyright © 2026 Sebastian Flæng Markdanner — MIT License
//
// Usage:
//   az deployment group create \
//     --resource-group rg-pimactivation-portal \
//     --template-file portal.bicep \
//     --parameters customDomain=pimactivation.com

@description('Custom domain to configure on the Front Door (optional).')
param customDomain string = ''

@description('Azure region for all resources.')
param location string = 'global'

@description('SKU for Static Web Apps: Free or Standard.')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Standard'

@description('Tag applied to all resources.')
param resourceTag string = 'PIMActivation'

var appName    = 'pimactivation-portal'
var uniqueSuffix = uniqueString(resourceGroup().id)
var tags         = { project: resourceTag }

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
    enterpriseGradeCdnStatus: staticWebAppSku == 'Standard' ? 'Enabled' : 'Disabled'
  }
}

// ── Custom domain (optional) ─────────────────────────────────────────────────
resource customDomainResource 'Microsoft.Web/staticSites/customDomains@2023-01-01' = if (!empty(customDomain)) {
  parent: staticWebApp
  name:   customDomain
  properties: {}
}

// ── Front Door + WAF (Standard tier only) ────────────────────────────────────
// Front Door provides global CDN, WAF, and DDoS mitigation.
resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-05-01' = if (staticWebAppSku == 'Standard') {
  name:     '${appName}-fd'
  location: 'global'
  tags:     tags
  sku:      { name: 'Standard_AzureFrontDoor' }
}

resource fdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = if (staticWebAppSku == 'Standard') {
  parent: frontDoorProfile
  name:   'portal'
  location: 'global'
  properties: { enabledState: 'Enabled' }
}

resource fdOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = if (staticWebAppSku == 'Standard') {
  parent: frontDoorProfile
  name:   'portal-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize:                   4
      successfulSamplesRequired:    3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath:              '/'
      probeRequestType:       'HEAD'
      probeProtocol:          'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource fdOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = if (staticWebAppSku == 'Standard') {
  parent: fdOriginGroup
  name:   'portal-origin'
  properties: {
    hostName:              staticWebApp.properties.defaultHostname
    httpPort:              80
    httpsPort:             443
    originHostHeader:      staticWebApp.properties.defaultHostname
    priority:              1
    weight:                1000
    enabledState:          'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource fdRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = if (staticWebAppSku == 'Standard') {
  parent: fdEndpoint
  name:   'portal-route'
  properties: {
    originGroup: { id: fdOriginGroup.id }
    supportedProtocols:   ['Http', 'Https']
    patternsToMatch:      ['/*']
    forwardingProtocol:   'HttpsOnly'
    httpsRedirect:        'Enabled'
    linkToDefaultDomain:  'Enabled'
  }
  dependsOn: [fdOrigin]
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output staticWebAppUrl string  = 'https://${staticWebApp.properties.defaultHostname}'
output staticWebAppName string = staticWebApp.name
output deploymentToken string  = staticWebApp.listSecrets().properties.apiKey
