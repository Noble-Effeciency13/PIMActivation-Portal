targetScope = 'resourceGroup'
extension microsoftGraphV1

metadata description = 'PIMActivation Portal - Self-Hosted Deployment. Provisions an Azure Static Web App, creates the Entra app registration, and deploys the portal SPA.'
metadata source = 'https://github.com/Noble-Effeciency13/PIMActivation-Portal'

// PIMActivation Portal — Self-Hosted Deployment
// Copyright © 2026 Sebastian Flæng Markdanner — MIT License
//
// Provisions an Azure Static Web App and fully deploys the PIMActivation Portal
// into your own Azure tenant in a single automated operation.
//
// The deployment:
//   1. Creates an Entra ID app registration for the portal
//   2. Adds the Static Web App and optional custom domain redirect URIs
//   3. Configures the Graph and Azure Management delegated API permissions
//   4. Downloads the portal source from GitHub
//   5. Injects the generated clientId and tenantId into msal-config.js
//   6. Deploys the portal files to the Static Web App via the SWA CLI
//
// Prerequisites (complete before deploying):
//   - Deploy with a principal that can create Microsoft Graph application
//     resources. Interactive deployments need Application.ReadWrite.All.
//   - After deployment, grant tenant-wide admin consent to the created app if
//     your tenant requires administrator consent for the configured scopes.

@description('Display name of the Entra ID app registration created for the portal.')
param applicationDisplayName string = 'PIMActivation Portal'

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
var portalUrl   = 'https://${staticWebApp.properties.defaultHostname}'
var customDomainUrl = 'https://${customDomain}'
var redirectUris = empty(customDomain) ? [ portalUrl ] : [ portalUrl, customDomainUrl ]
var applicationUniqueName = 'pimactivation-portal-${uniqueString(tenantId, resourceGroup().id)}'
var adminConsentUrl = uri(environment().authentication.loginEndpoint, '${tenantId}/adminconsent?client_id=${portalApplication.appId}')

// Contributor role definition ID (built-in)
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

// Microsoft first-party resource app IDs and delegated permission IDs.
var microsoftGraphAppId = '00000003-0000-0000-c000-000000000000'
var azureManagementAppId = '797f4846-ba00-4fd7-ba43-dac1f8f63013'
var graphDelegatedPermissions = [
  { id: 'e1fe6dd8-ba31-4d61-89e7-88639da4683d', type: 'Scope' } // User.Read
  { id: 'd01b97e9-cbc0-49fe-810a-750afd5527a3', type: 'Scope' } // RoleManagement.ReadWrite.Directory
  { id: '32531c59-1f32-461f-b8df-6f8a3b89f73b', type: 'Scope' } // PrivilegedAccess.ReadWrite.AzureADGroup
  { id: '7e26fdff-9cb1-4e56-bede-211fe0e420e8', type: 'Scope' } // RoleManagementPolicy.Read.AzureADGroup
  { id: '572fea84-0151-49b2-9301-11cb16974376', type: 'Scope' } // Policy.Read.All
  { id: '3361d15d-be43-4de6-b441-3c746d05163d', type: 'Scope' } // AdministrativeUnit.Read.All
  { id: 'e4c9e354-4dc5-45b8-9e7c-e1393b0b1a20', type: 'Scope' } // AuditLog.Read.All
  { id: '7427e0e9-2fba-42fe-b0c0-848c9e6a8182', type: 'Scope' } // offline_access
  { id: '37f7f235-527c-4136-accd-4a02d197296e', type: 'Scope' } // openid
  { id: '14dad69e-099b-42c9-810b-d002981feec1', type: 'Scope' } // profile
  { id: '64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0', type: 'Scope' } // email
]
var azureManagementDelegatedPermissions = [
  { id: '41094075-9dad-400e-a0bd-54e686782033', type: 'Scope' } // user_impersonation
]

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

// ── Entra ID app registration ────────────────────────────────────────────────
// Creates the single-tenant SPA app used by MSAL in the browser and configures
// the permissions the portal requests at sign-in or during activation flows.
resource portalApplication 'Microsoft.Graph/applications@v1.0' = {
  displayName: applicationDisplayName
  uniqueName: applicationUniqueName
  signInAudience: 'AzureADMyOrg'
  defaultRedirectUri: portalUrl
  spa: {
    redirectUris: redirectUris
  }
  info: {
    marketingUrl: 'https://pimactivation.com/'
    privacyStatementUrl: 'https://pimactivation.com/'
    supportUrl: 'https://github.com/Noble-Effeciency13/PIMActivation-Portal/issues'
    termsOfServiceUrl: 'https://pimactivation.com/'
  }
  requiredResourceAccess: [
    {
      resourceAppId: microsoftGraphAppId
      resourceAccess: graphDelegatedPermissions
    }
    {
      resourceAppId: azureManagementAppId
      resourceAccess: azureManagementDelegatedPermissions
    }
  ]
  tags: [
    'PIMActivation'
    'SelfHosted'
  ]
}

// ── Enterprise application ───────────────────────────────────────────────────
// Materializes the service principal for the app registration in this tenant.
resource portalServicePrincipal 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: portalApplication.appId
  appRoleAssignmentRequired: false
  tags: [
    'WindowsAzureActiveDirectoryIntegratedApp'
    'PIMActivation'
  ]
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
      { name: 'CLIENT_ID',      value: portalApplication.appId }
      { name: 'TENANT_ID',      value: tenantId }
      { name: 'SWA_NAME',       value: staticWebApp.name }
      { name: 'PORTAL_URL',     value: portalUrl }
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
      echo "==> Portal URL: ${PORTAL_URL}"
      echo "==> Portal app registration client ID: ${CLIENT_ID}"
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
    portalServicePrincipal
  ]
}

// ── Outputs ───────────────────────────────────────────────────────────────────
@description('URL of the deployed portal.')
output portalUrl string = portalUrl

@description('Name of the Azure Static Web App resource.')
output staticWebAppName string = staticWebApp.name

@description('Application (client) ID of the Entra ID app registration created for the portal.')
output clientId string = portalApplication.appId

@description('Object ID of the Entra ID app registration created for the portal.')
output applicationObjectId string = portalApplication.id

@description('Object ID of the enterprise application/service principal created for the portal.')
output servicePrincipalObjectId string = portalServicePrincipal.id

@description('SPA redirect URIs configured on the Entra ID app registration.')
output redirectUris array = redirectUris

@description('Admin consent URL for the created portal application.')
output adminConsentUrl string = adminConsentUrl

@description('Next step: grant admin consent for the delegated permissions if your tenant requires it.')
output nextStep string = 'Grant admin consent if required: ${adminConsentUrl}'
