targetScope = 'resourceGroup'

// PIMActivation Portal — Self-Hosted Deployment
// Copyright © 2026 Sebastian Flæng Markdanner — MIT License
//
// Provisions an Azure Static Web App and fully deploys the PIMActivation Portal
// into your own Azure tenant in a single automated operation.
//
// The deploymentScript resource:
//   1. Downloads the portal source from GitHub
//   2. Injects your clientId and tenantId into msal-config.js
//   3. Deploys the portal files to the Static Web App via the SWA CLI
//
// Prerequisites (complete before deploying):
//   - Register an Entra ID app:
//       Platform: Single-page application
//       Redirect URI: https://<swa-default-hostname>
//       API permissions (delegated):
//         User.Read, RoleManagement.ReadWrite.Directory,
//         PrivilegedAccess.ReadWrite.AzureADGroup,
//         RoleManagementPolicy.Read.AzureADGroup, Policy.Read.All,
//         AdministrativeUnit.Read.All, AuditLog.Read.All
//   - Copy the Application (client) ID and your Tenant ID into the parameters below

@description('Application (client) ID of the Entra ID app registration for the portal. Required.')
param clientId string

@description('Tenant ID of your Azure AD directory. Defaults to the current subscription tenant.')
param tenantId string = subscription().tenantId

@description('Optional custom domain to configure on the Static Web App (e.g. pim.contoso.com).')
param customDomain string = ''

@description('Azure region for the Static Web App.')
param location string = resourceGroup().location

@description('SKU for the Static Web App.')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Free'

@description('Tag applied to all resources.')
param resourceTag string = 'PIMActivation'

var suffix      = uniqueString(resourceGroup().id)
var appName     = 'pimactivation-portal-${suffix}'
var idName      = 'id-pimactivation-deploy-${suffix}'
var scriptName  = 'script-pimactivation-deploy-${suffix}'
var tags        = { project: resourceTag }

// Contributor role definition ID (built-in)
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

// ── Managed Identity ──────────────────────────────────────────────────────────
// Required by the ARM deploymentScript resource — it runs inside a container
// and uses this identity to call Azure APIs (read the SWA deployment token).
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name:     idName
  location: location
  tags:     tags
}

// ── Contributor on resource group ─────────────────────────────────────────────
// The identity needs Contributor on the RG so it can read SWA listSecrets().
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployIdentity.id, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId:      deployIdentity.properties.principalId
    principalType:    'ServicePrincipal'
  }
}

// ── Static Web App ────────────────────────────────────────────────────────────
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

// ── Custom domain (optional) ──────────────────────────────────────────────────
resource customDomainResource 'Microsoft.Web/staticSites/customDomains@2023-01-01' = if (!empty(customDomain)) {
  parent: staticWebApp
  name:   customDomain
  properties: {}
}

// ── Deployment script ─────────────────────────────────────────────────────────
// Downloads the portal source, injects config, and deploys via the SWA CLI.
// Runs in an AzureCLI container on Alpine Linux. Timeout: 10 minutes.
resource deployScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name:     scriptName
  location: location
  tags:     tags
  kind:     'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${deployIdentity.id}': {}
    }
  }
  properties: {
    azCliVersion:      '2.59.0'
    retentionInterval: 'PT1H'
    timeout:           'PT10M'
    cleanupPreference: 'OnSuccess'
    environmentVariables: [
      { name: 'CLIENT_ID',      value: clientId }
      { name: 'TENANT_ID',      value: tenantId }
      { name: 'SWA_NAME',       value: staticWebApp.name }
      { name: 'RESOURCE_GROUP', value: resourceGroup().name }
    ]
    scriptContent: '''
      set -e

      echo "==> Installing Node.js and tools..."
      apk add --no-cache nodejs npm curl unzip

      echo "==> Downloading portal source..."
      curl -fsSL \
        "https://github.com/Noble-Effeciency13/PIMActivation-Portal/archive/refs/heads/main.zip" \
        -o main.zip
      unzip -q main.zip
      cd PIMActivation-Portal-main

      echo "==> Injecting configuration..."
      sed -i "s|__PORTAL_CLIENT_ID__|${CLIENT_ID}|g" Portal/js/msal-config.js
      sed -i "s|__PORTAL_TENANT_ID__|${TENANT_ID}|g" Portal/js/msal-config.js

      echo "==> Verifying injection..."
      if grep -q '__PORTAL_CLIENT_ID__\|__PORTAL_TENANT_ID__' Portal/js/msal-config.js; then
        echo "ERROR: placeholder injection failed" && exit 1
      fi

      echo "==> Retrieving SWA deployment token..."
      DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
        --name "${SWA_NAME}" \
        --resource-group "${RESOURCE_GROUP}" \
        --query "properties.apiKey" \
        --output tsv)

      echo "==> Installing SWA CLI..."
      npm install -g @azure/static-web-apps-cli --quiet --no-progress

      echo "==> Deploying portal to Azure Static Web Apps..."
      swa deploy Portal/ \
        --deployment-token "${DEPLOYMENT_TOKEN}" \
        --env production \
        --no-use-keychain

      echo "==> Deployment complete."
    '''
  }
  dependsOn: [
    roleAssignment
    staticWebApp
  ]
}

// ── Outputs ───────────────────────────────────────────────────────────────────
@description('URL of the deployed portal.')
output portalUrl string = 'https://${staticWebApp.properties.defaultHostname}'

@description('Name of the Azure Static Web App resource.')
output staticWebAppName string = staticWebApp.name

@description('Next step: update your Entra app registration redirect URI to match portalUrl.')
output nextStep string = 'Add ${portalUrl} as a redirect URI in your Entra app registration (${clientId}).'
