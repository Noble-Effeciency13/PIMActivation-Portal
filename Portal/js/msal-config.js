/**
 * MSAL Public Client Configuration
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * CLIENT_ID is injected at CI/CD deploy time via sed replacement.
 * The placeholder __PORTAL_CLIENT_ID__ is replaced by the GitHub secret
 * PORTAL_CLIENT_ID in .github/workflows/deploy-portal.yml before publishing.
 *
 * Scopes requested on first sign-in (delegated, user-consented).
 * We request the minimal set; additional scopes are acquired silently on demand.
 */

/* global msal */

window.msalConfig = {
  auth: {
    clientId:    '__PORTAL_CLIENT_ID__',
    authority:   'https://login.microsoftonline.com/organizations',
    redirectUri: window.location.origin + '/auth-callback',
    postLogoutRedirectUri: window.location.origin
  },
  cache: {
    cacheLocation:        'sessionStorage',
    storeAuthStateInCookie: false
  },
  system: {
    loggerOptions: {
      loggerCallback(level, message) {
        if (level === msal.LogLevel.Error || level === msal.LogLevel.Warning) {
          console.warn('[MSAL]', message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: msal.LogLevel.Warning
    }
  }
};

/** Delegated scopes needed for Entra PIM and user profile */
window.GRAPH_SCOPES = [
  'User.Read',
  'RoleManagement.ReadWrite.Directory',
  'PrivilegedAccess.ReadWrite.AzureADGroup',
  'Policy.Read.All',
  'AdministrativeUnit.Read.All',
  'AuditLog.Read.All',
  'offline_access',
  'openid',
  'profile',
  'email'
];

/** Delegated scope for Azure ARM (Resource PIM) */
window.ARM_SCOPE = 'https://management.azure.com/user_impersonation';
