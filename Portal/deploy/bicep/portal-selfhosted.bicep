targetScope = 'resourceGroup'

metadata description = 'PIMActivation Portal - Self-Hosted Deployment. Provisions an Azure Static Web App and deploys the portal SPA configured for an existing Entra app registration.'
metadata source = 'https://github.com/Noble-Effeciency13/PIMActivation-Portal'

// PIMActivation Portal — Self-Hosted Deployment
// Copyright © 2026 Sebastian Flæng Markdanner — MIT License
//
// Provisions an Azure Static Web App and fully deploys the PIMActivation Portal
// into your own Azure tenant in a single automated operation.
//
// The deployment:
//   1. Creates the Static Web App
//   2. Downloads the portal source archive
//   3. Caches the source archive in a customer-owned storage account
//   4. Injects the supplied clientId and tenantId into msal-config.js
//   5. Deploys the portal files to the Static Web App via the SWA CLI
//   6. Attempts to add the SPA redirect URIs to the Entra app registration
//   7. Outputs the SPA redirect URIs in case Graph permissions require manual setup
//
// Prerequisites (complete before deploying):
//   - Create or choose an Entra ID SPA app registration and pass its client ID.
//   - The deployment attempts to add the redirectUris output to the app registration.
//     If the deployment identity cannot update the Entra app through Microsoft Graph,
//     add the redirectUris output manually after deployment.
//   - Grant tenant-wide admin consent if your tenant requires administrator
//     consent for the configured delegated scopes.
//   - If customDomain is set, add the custom domain to the Static Web App manually
//     after deployment once DNS can point at the generated default hostname.

@description('Required application (client) ID of an existing single-tenant Entra ID SPA app registration for the portal.')
@minLength(36)
@maxLength(36)
param applicationClientId string

@description('Tenant ID of your Azure AD directory. Defaults to the current subscription tenant.')
param tenantId string = subscription().tenantId

@description('Optional custom domain to add as an Entra SPA redirect URI (e.g. pim.contoso.com). The Static Web App custom domain must be added manually after deployment, once DNS can point at the generated default hostname.')
param customDomain string = ''

@description('Optional repository branch to deploy from instead of the latest published release. Leave blank (default) to deploy the latest release asset (portal-source.zip). Set e.g. to "main" to pull the newest commit at deployment time.')
param portalSourceBranch string = ''

@description('Optional publicly reachable ZIP archive containing the repository files. Takes precedence over portalSourceBranch and the default release asset. The archive must include Portal/index.html. Private GitHub repositories return 404 to the deployment script unless you provide an authenticated or pre-signed archive URL.')
param portalSourceArchiveUrl string = ''

@description('Unique value used to force the deployment script to run on each deployment. The default also gives each run a fresh deployment script resource name to avoid Azure Files sharing violations during retries.')
@minLength(1)
@maxLength(16)
param deploymentScriptRunId string = utcNow('yyyyMMddHHmmss')

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
var scriptName  = 'script-pimactivation-deploy-${suffix}-${deploymentScriptRunId}'
var sourceCacheStorageName = 'stpimact${suffix}'
var sourceCacheContainerName = 'portal-source'
var sourceCacheBlobName = 'portal-source.zip'
var releaseSourceArchiveUrl = 'https://github.com/Noble-Effeciency13/PIMActivation-Portal/releases/latest/download/portal-source.zip'
var branchSourceArchiveUrl = 'https://github.com/Noble-Effeciency13/PIMActivation-Portal/archive/refs/heads/${portalSourceBranch}.zip'
var defaultSourceArchiveUrl = empty(portalSourceBranch) ? releaseSourceArchiveUrl : branchSourceArchiveUrl
var resolvedSourceArchiveUrl = empty(portalSourceArchiveUrl) ? defaultSourceArchiveUrl : portalSourceArchiveUrl
var tags        = { project: resourceTag }
var portalUrl   = 'https://${staticWebApp.properties.defaultHostname}'
var customDomainUrl = 'https://${customDomain}'
var redirectUris = empty(customDomain) ? [ portalUrl ] : [ portalUrl, customDomainUrl ]
var adminConsentUrl = uri(environment().authentication.loginEndpoint, '${tenantId}/adminconsent?client_id=${applicationClientId}')

// Contributor role definition ID (built-in).
// Scoped narrowly to the Static Web App resource so the deployment identity can
// read the SWA deployment token via listSecrets() — no broader RG access is granted.
// Website Contributor's Microsoft.Web/staticSites/* wildcard does not authorize
// Microsoft.Web/staticSites/listSecrets/action in practice, which blocks
// `az staticwebapp secrets list`. Contributor (scoped to the SWA only) is the
// narrowest built-in role that reliably grants the listSecrets action.
// (Source-cache storage uses account-key auth from listKeys() in the bicep, and the
// Microsoft Graph redirect-URI PATCH is authorized via Graph permissions, not Azure RBAC.)
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

// ── Managed Identity ──────────────────────────────────────────────────────────
// Required by the ARM deploymentScript resource — it runs inside a container
// and uses this identity to call Azure APIs (read the SWA deployment token).
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name:     idName
  location: location
  tags:     tags
}

// ── Contributor on the Static Web App ────────────────────────────────────────
// Scoped to the SWA resource only; lets the deploy identity call listSecrets()
// for the deployment token used by the SWA CLI. No resource-group-wide access.
// Contributor (not Website Contributor) is required because the staticSites/*
// wildcard in Website Contributor does not authorize listSecrets/action in
// practice. Scope stays at the single SWA resource to keep blast radius minimal.
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: staticWebApp
  name: guid(staticWebApp.id, deployIdentity.id, contributorRoleId)
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

// ── Source archive cache ─────────────────────────────────────────────────────
// Keeps a copy of the downloaded portal source in the customer's resource group
// so the deployed self-hosted environment has its own source snapshot.
resource sourceCacheStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name:     sourceCacheStorageName
  location: location
  tags:     tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess:   false
    minimumTlsVersion:       'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource sourceCacheContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${sourceCacheStorage.name}/default/${sourceCacheContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource brandingContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${sourceCacheStorage.name}/default/branding'
  properties: {
    publicAccess: 'None'
  }
}

// ── Deployment script ─────────────────────────────────────────────────────────
// Downloads the portal source, injects config, and deploys via the SWA CLI.
// Runs in an AzureCLI container. Timeout: 30 minutes.
// Fresh script resource names avoid Azure Files sharing violations when retrying failed deploymentScripts.
#disable-next-line use-stable-resource-identifiers
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
    azCliVersion:      '2.64.0'
    retentionInterval: 'PT1H'
    timeout:           'PT30M'
    cleanupPreference: 'OnExpiration'
    forceUpdateTag:    deploymentScriptRunId
    environmentVariables: [
      { name: 'CLIENT_ID',      value: applicationClientId }
      { name: 'TENANT_ID',      value: tenantId }
      { name: 'SWA_NAME',       value: staticWebApp.name }
      { name: 'PORTAL_URL',     value: portalUrl }
      { name: 'CUSTOM_DOMAIN_URL', value: empty(customDomain) ? '' : customDomainUrl }
      { name: 'RESOURCE_GROUP', value: resourceGroup().name }
      { name: 'SOURCE_ARCHIVE_URL', value: resolvedSourceArchiveUrl }
      { name: 'SOURCE_CACHE_ACCOUNT', value: sourceCacheStorage.name }
      { name: 'SOURCE_CACHE_CONTAINER', value: sourceCacheContainerName }
      { name: 'SOURCE_CACHE_BLOB', value: sourceCacheBlobName }
      { name: 'SOURCE_CACHE_KEY', secureValue: sourceCacheStorage.listKeys().keys[0].value }
      { name: 'DOTNET_SYSTEM_GLOBALIZATION_INVARIANT', value: '1' }
    ]
    scriptContent: '''
      set -e

      if [ -z "${CLIENT_ID}" ]; then
        echo "ERROR: applicationClientId is required. Create an Entra ID SPA app registration first, then rerun this deployment with its client ID."
        exit 1
      fi

      export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

      echo "==> Installing Node.js and deployment tools..."
      if command -v tdnf >/dev/null 2>&1; then
        tdnf install -y nodejs npm curl unzip ca-certificates || tdnf install -y nodejs curl unzip ca-certificates
        tdnf install -y jq || true
        tdnf install -y icu || tdnf install -y libicu || tdnf install -y icu-libs || true
        tdnf clean all
      elif command -v apk >/dev/null 2>&1; then
        apk add --no-cache \
          nodejs npm curl unzip ca-certificates jq \
          libc6-compat icu-libs krb5-libs libgcc libssl3 libstdc++ zlib
      elif command -v apt-get >/dev/null 2>&1; then
        apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs npm curl unzip ca-certificates jq
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libicu-dev || true
        rm -rf /var/lib/apt/lists/*
      else
        echo "ERROR: unsupported AzureCLI deployment script image; no known package manager was found."
        exit 1
      fi

      if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo "ERROR: Node.js and npm are required for Static Web Apps deployment."
        exit 1
      fi

      echo "==> Downloading portal source archive..."
      SOURCE_DOWNLOAD_LOG=/tmp/portal-source-download.log
      set +e
      curl -fsSL --retry 3 --retry-delay 5 --connect-timeout 20 --max-time 300 \
        "${SOURCE_ARCHIVE_URL}" \
        -o portal-source.zip \
        2>"${SOURCE_DOWNLOAD_LOG}"
      DOWNLOAD_EXIT=$?
      set -e

      if [ ${DOWNLOAD_EXIT} -ne 0 ]; then
        echo "WARNING: failed to download portalSourceArchiveUrl. Attempting to use the cached source archive from this resource group."
        set +e
        az storage blob download \
          --account-name "${SOURCE_CACHE_ACCOUNT}" \
          --account-key "${SOURCE_CACHE_KEY}" \
          --container-name "${SOURCE_CACHE_CONTAINER}" \
          --name "${SOURCE_CACHE_BLOB}" \
          --file portal-source.zip \
          --overwrite true \
          --only-show-errors >/dev/null
        CACHE_DOWNLOAD_EXIT=$?
        set -e

        if [ ${CACHE_DOWNLOAD_EXIT} -ne 0 ]; then
          if [ -s "${SOURCE_DOWNLOAD_LOG}" ]; then
            cat "${SOURCE_DOWNLOAD_LOG}"
          fi
          echo "ERROR: failed to download portalSourceArchiveUrl and no usable cached source archive was found. Provide a publicly reachable ZIP archive, or a pre-signed/authenticated URL, that contains Portal/index.html. Private GitHub archive URLs commonly return 404 from Azure Deployment Scripts."
          exit ${DOWNLOAD_EXIT}
        fi
      else
        echo "==> Caching portal source archive in this resource group..."
        az storage blob upload \
          --account-name "${SOURCE_CACHE_ACCOUNT}" \
          --account-key "${SOURCE_CACHE_KEY}" \
          --container-name "${SOURCE_CACHE_CONTAINER}" \
          --name "${SOURCE_CACHE_BLOB}" \
          --file portal-source.zip \
          --overwrite true \
          --only-show-errors >/dev/null
      fi

      mkdir source
      UNZIP_LOG=/tmp/portal-source-unzip.log
      set +e
      unzip -q portal-source.zip -d source 2>"${UNZIP_LOG}"
      UNZIP_EXIT=$?
      set -e

      if [ ${UNZIP_EXIT} -gt 1 ]; then
        cat "${UNZIP_LOG}"
        echo "ERROR: failed to extract portalSourceArchiveUrl."
        exit ${UNZIP_EXIT}
      fi

      find source -depth -name '*\\*' -print | while IFS= read -r entry; do
        normalized=$(printf '%s' "${entry}" | sed 's#\\#/#g')
        if [ "${entry}" != "${normalized}" ]; then
          mkdir -p "$(dirname "${normalized}")"
          mv "${entry}" "${normalized}"
        fi
      done

      PORTAL_INDEX=$(find source -maxdepth 4 -type f -path '*/Portal/index.html' | head -n 1)
      if [ -z "${PORTAL_INDEX}" ]; then
        if [ -s "${UNZIP_LOG}" ]; then
          cat "${UNZIP_LOG}"
        fi
        echo "ERROR: portalSourceArchiveUrl downloaded successfully, but the ZIP does not contain Portal/index.html."
        exit 1
      fi

      PORTAL_DIR=$(dirname "${PORTAL_INDEX}")

      echo "==> Injecting configuration..."
      echo "==> Portal URL: ${PORTAL_URL}"
      echo "==> Portal app registration client ID: ${CLIENT_ID}"
      sed -i "s|__PORTAL_CLIENT_ID__|${CLIENT_ID}|g" "${PORTAL_DIR}/js/msal-config.js"
      sed -i "s|__PORTAL_TENANT_ID__|${TENANT_ID}|g" "${PORTAL_DIR}/js/msal-config.js"

      echo "==> Verifying injection..."
      if grep -q '__PORTAL_CLIENT_ID__\|__PORTAL_TENANT_ID__' "${PORTAL_DIR}/js/msal-config.js"; then
        echo "ERROR: placeholder injection failed" && exit 1
      fi

      echo "==> Preparing Static Web Apps deployment payload..."
      DEPLOY_DIR=/tmp/pimactivation-portal-deploy
      rm -rf "${DEPLOY_DIR}"
      mkdir -p "${DEPLOY_DIR}"
      cp "${PORTAL_DIR}/index.html" "${DEPLOY_DIR}/"
      cp "${PORTAL_DIR}/staticwebapp.config.json" "${DEPLOY_DIR}/"
      for asset_dir in css js images favicons branding; do
        if [ -d "${PORTAL_DIR}/${asset_dir}" ]; then
          cp -R "${PORTAL_DIR}/${asset_dir}" "${DEPLOY_DIR}/"
        fi
      done

      echo "==> Syncing custom branding from private storage account..."
      mkdir -p "${DEPLOY_DIR}/branding"
      az storage container create \
        --account-name "${SOURCE_CACHE_ACCOUNT}" \
        --account-key "${SOURCE_CACHE_KEY}" \
        --name branding \
        --auth-mode key \
        --only-show-errors >/dev/null 2>&1 || true

      if [ -f "${PORTAL_DIR}/branding/branding.schema.json" ]; then
        az storage blob upload \
          --account-name "${SOURCE_CACHE_ACCOUNT}" \
          --account-key "${SOURCE_CACHE_KEY}" \
          --container-name branding \
          --name "branding.schema.json" \
          --file "${PORTAL_DIR}/branding/branding.schema.json" \
          --overwrite false \
          --only-show-errors >/dev/null 2>&1 || true
      fi
      if [ -f "${PORTAL_DIR}/branding/config.sample.json" ]; then
        az storage blob upload \
          --account-name "${SOURCE_CACHE_ACCOUNT}" \
          --account-key "${SOURCE_CACHE_KEY}" \
          --container-name branding \
          --name "config.sample.json" \
          --file "${PORTAL_DIR}/branding/config.sample.json" \
          --overwrite false \
          --only-show-errors >/dev/null 2>&1 || true
      fi

      az storage blob download-batch \
        --account-name "${SOURCE_CACHE_ACCOUNT}" \
        --account-key "${SOURCE_CACHE_KEY}" \
        --source branding \
        --destination "${DEPLOY_DIR}/branding" \
        --overwrite true \
        --only-show-errors >/dev/null 2>&1 || true

      if [ ! -f "${DEPLOY_DIR}/index.html" ] || [ ! -f "${DEPLOY_DIR}/staticwebapp.config.json" ]; then
        echo "ERROR: deployment payload is missing index.html or staticwebapp.config.json."
        exit 1
      fi

      echo "==> Deployment payload file count: $(find "${DEPLOY_DIR}" -type f | wc -l)"

      echo "==> Retrieving SWA deployment token..."
      DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
        --name "${SWA_NAME}" \
        --resource-group "${RESOURCE_GROUP}" \
        --query "properties.apiKey" \
        --output tsv)

      if [ -z "${DEPLOYMENT_TOKEN}" ]; then
        echo "ERROR: failed to retrieve the Static Web Apps deployment token."
        exit 1
      fi

      echo "==> Installing SWA CLI..."
      SWA_NPM_LOG=/tmp/swa-npm-install.log
      set +e
      npm install -g @azure/static-web-apps-cli@2.0.9 \
        --loglevel=error \
        --no-audit \
        --no-fund \
        --no-progress \
        >"${SWA_NPM_LOG}" 2>&1
      NPM_EXIT=$?
      set -e

      if [ ${NPM_EXIT} -ne 0 ]; then
        cat "${SWA_NPM_LOG}"
        echo "ERROR: failed to install the Static Web Apps CLI."
        exit ${NPM_EXIT}
      fi

      echo "==> SWA CLI version: $(swa --version)"

      echo "==> Deploying portal to Azure Static Web Apps..."
      SWA_DEPLOY_LOG=/tmp/swa-deploy.log
      SCRIPT_WORKDIR=$(pwd)
      SWA_WORKDIR=/tmp/pimactivation-swa-cli-workdir
      rm -rf "${SWA_WORKDIR}"
      mkdir -p "${SWA_WORKDIR}"
      cd "${SWA_WORKDIR}"
      set +e
      swa deploy \
        --app-location "${SWA_WORKDIR}" \
        --output-location "${DEPLOY_DIR}" \
        --swa-config-location "${DEPLOY_DIR}" \
        --deployment-token "${DEPLOYMENT_TOKEN}" \
        --app-name "${SWA_NAME}" \
        --resource-group "${RESOURCE_GROUP}" \
        --api-language node \
        --api-version 18 \
        --env production \
        --no-use-keychain \
        >"${SWA_DEPLOY_LOG}" 2>&1
      SWA_DEPLOY_EXIT=$?
      set -e
      cd "${SCRIPT_WORKDIR}"

      if [ ${SWA_DEPLOY_EXIT} -ne 0 ]; then
        cat "${SWA_DEPLOY_LOG}"
        STATIC_SITES_CLIENT=$(find /root/.swa/deploy -type f -name StaticSitesClient 2>/dev/null | head -n 1 || true)
        if [ -n "${STATIC_SITES_CLIENT}" ]; then
          echo "==> StaticSitesClient native dependency check..."
          ldd "${STATIC_SITES_CLIENT}" || true
        fi
        echo "ERROR: Static Web Apps deployment failed."
        exit ${SWA_DEPLOY_EXIT}
      fi

      echo "==> Updating Entra app registration redirect URIs..."
      REQUIRED_REDIRECT_URIS=$(jq -nc \
        --arg portalUrl "${PORTAL_URL}" \
        --arg customDomainUrl "${CUSTOM_DOMAIN_URL}" \
        '[$portalUrl] + (if $customDomainUrl == "" then [] else [$customDomainUrl] end)')
      APP_REDIRECT_LOG=/tmp/entra-app-redirect-update.log

      set +e
      GRAPH_FILTER=$(printf "appId eq '%s'" "${CLIENT_ID}" | jq -sRr @uri)
      APP_LOOKUP=$(az rest \
        --method GET \
        --uri "https://graph.microsoft.com/v1.0/applications?\$filter=${GRAPH_FILTER}&\$select=id,spa" \
        --output json \
        2>"${APP_REDIRECT_LOG}")
      GRAPH_LOOKUP_EXIT=$?

      APP_OBJECT_ID=""
      CURRENT_REDIRECT_URIS="[]"
      if [ ${GRAPH_LOOKUP_EXIT} -eq 0 ]; then
        APP_OBJECT_ID=$(printf '%s' "${APP_LOOKUP}" | jq -r '.value[0].id // empty')
        CURRENT_REDIRECT_URIS=$(printf '%s' "${APP_LOOKUP}" | jq -c '.value[0].spa.redirectUris // []')
      fi

      GRAPH_PATCH_EXIT=1
      if [ ${GRAPH_LOOKUP_EXIT} -eq 0 ] && [ -n "${APP_OBJECT_ID}" ]; then
        UPDATED_REDIRECT_URIS=$(jq -nc \
          --argjson current "${CURRENT_REDIRECT_URIS}" \
          --argjson required "${REQUIRED_REDIRECT_URIS}" \
          '$current + $required | map(select(. != null and . != "")) | unique')
        PATCH_BODY=$(jq -nc --argjson redirectUris "${UPDATED_REDIRECT_URIS}" '{spa:{redirectUris:$redirectUris}}')
        az rest \
          --method PATCH \
          --uri "https://graph.microsoft.com/v1.0/applications/${APP_OBJECT_ID}" \
          --headers "Content-Type=application/json" \
          --body "${PATCH_BODY}" \
          --only-show-errors \
          >>"${APP_REDIRECT_LOG}" 2>&1
        GRAPH_PATCH_EXIT=$?
      fi
      set -e

      if [ ${GRAPH_LOOKUP_EXIT} -eq 0 ] && [ -z "${APP_OBJECT_ID}" ]; then
        echo "WARNING: no Entra application was found for applicationClientId ${CLIENT_ID}. Add these SPA redirect URIs manually:"
        printf '%s\n' "${REQUIRED_REDIRECT_URIS}" | jq -r '.[]'
      elif [ ${GRAPH_LOOKUP_EXIT} -ne 0 ] || [ ${GRAPH_PATCH_EXIT} -ne 0 ]; then
        echo "WARNING: unable to update the Entra app registration redirect URIs automatically. The deployment identity must be allowed to update the application through Microsoft Graph, for example by owning the app or having an appropriate Application.ReadWrite permission. Add these SPA redirect URIs manually if they are not already present:"
        printf '%s\n' "${REQUIRED_REDIRECT_URIS}" | jq -r '.[]'
        if [ -s "${APP_REDIRECT_LOG}" ]; then
          cat "${APP_REDIRECT_LOG}"
        fi
      else
        echo "==> Entra app registration redirect URIs updated:"
        printf '%s\n' "${UPDATED_REDIRECT_URIS}" | jq -r '.[]'
      fi

      echo "==> Deployment complete."
    '''
  }
  dependsOn: [
    roleAssignment
    sourceCacheContainer
    brandingContainer
  ]
}

// ── Outputs ───────────────────────────────────────────────────────────────────
@description('URL of the deployed portal.')
output portalUrl string = portalUrl

@description('Name of the Azure Static Web App resource.')
output staticWebAppName string = staticWebApp.name

@description('Customer-owned storage account used to keep a private copy of the portal source archive.')
output sourceArchiveCache string = '${sourceCacheStorage.name}/${sourceCacheContainerName}/${sourceCacheBlobName}'

@description('Name of the private storage account hosting branding assets.')
output brandingStorageAccountName string = sourceCacheStorage.name

@description('Application (client) ID of the existing Entra ID app registration configured for the portal.')
output clientId string = applicationClientId

@description('SPA redirect URIs to add to the Entra ID app registration after deployment.')
output redirectUris array = redirectUris

@description('Next step for custom domain validation, if customDomain was provided.')
output customDomainNextStep string = empty(customDomain) ? '' : 'Create a CNAME from ${customDomain} to ${staticWebApp.properties.defaultHostname}, then add and validate the custom domain on the Static Web App.'

@description('Admin consent URL for the portal application.')
output adminConsentUrl string = adminConsentUrl

@description('Next step after deployment.')
output nextStep string = 'The deployment script attempts to add redirectUris to the app registration. If the deployment log shows a Microsoft Graph permission warning, add redirectUris manually, then grant admin consent if required: ${adminConsentUrl}'
