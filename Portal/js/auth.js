/**
 * MSAL Authentication module — Portal (public client, browser-only)
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * Wraps MSAL's PublicClientApplication with:
 *   - Redirect-flow handling on page load
 *   - Silent token acquisition with interactive popup fallback
 *   - ARM token acquisition for Azure Resource PIM
 */

/* global msal, msalConfig, GRAPH_SCOPES, ARM_SCOPE */

const msalInstance = new msal.PublicClientApplication(window.msalConfig);

/** Resolves when MSAL v5 initialization completes. Awaited once in initAuth(). */
const _msalReady = msalInstance.initialize();

/** Currently active account */
let _account = null;

/** sessionStorage key that persists the chosen tenant across F5 refreshes (same tab session) */
const PREFERRED_TENANT_KEY = 'pim-portal-preferred-tenant';

/** Claims string to include in every token acquisition while an auth-context activation is in progress. */
let _activeAuthContextClaims = null;

/**
 * Must be called once on app startup.
 * Handles the redirect callback if present, sets the active account.
 * @returns {Promise<msal.AccountInfo|null>}
 */
async function initAuth() {
  try {
    await _msalReady;
    const response = await msalInstance.handleRedirectPromise();
    if (response && response.account) {
      msalInstance.setActiveAccount(response.account);
      _account = response.account;
      // Record which tenant was chosen so F5 restores the same one
      sessionStorage.setItem(PREFERRED_TENANT_KEY, response.account.tenantId);
      return _account;
    }
  } catch (err) {
    console.error('[Auth] handleRedirectPromise error:', err);
  }

  const preferredTenantId = sessionStorage.getItem(PREFERRED_TENANT_KEY);
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    // When multiple accounts exist (home + guest tenants), honour the stored preference
    const preferred = preferredTenantId
      ? (accounts.find(a => a.tenantId === preferredTenantId) ?? accounts[0])
      : accounts[0];
    msalInstance.setActiveAccount(preferred);
    _account = preferred;
    return _account;
  }

  return null;
}

/**
 * Trigger interactive sign-in (redirect).
 * The page navigates away to Microsoft and returns to /auth-callback,
 * which is rewritten to index.html. handleRedirectPromise() in initAuth()
 * picks up the response on the way back.
 */
async function signIn() {
  // Include ARM scope alongside Graph scopes so the admin/user only sees
  // a single consent prompt covering all required permissions.
  await msalInstance.loginRedirect({
    scopes: [...window.GRAPH_SCOPES, window.ARM_SCOPE],
    prompt: 'select_account'
  });
  // Page navigates away — execution does not continue here.
}

/**
 * Sign out the current user (redirect flow).
 */
async function signOut() {
  if (!_account) return;
  await msalInstance.logoutRedirect({ account: _account });
  // Page navigates away — execution does not continue here.
}

/**
 * Acquire a Graph access token (silent first, popup fallback).
 * @returns {Promise<string>} access token
 */
async function getGraphToken() {
  return _acquireToken(window.GRAPH_SCOPES, _activeAuthContextClaims || undefined);
}

/**
 * Acquire an ARM access token (silent first, popup fallback).
 * @returns {Promise<string>} access token
 */
async function getArmToken() {
  return _acquireToken([window.ARM_SCOPE], _activeAuthContextClaims || undefined);
}

/**
 * Set an auth context ID whose claims should be included in every token
 * acquisition until cleared. Call before bulkActivate, clear in a finally block.
 * @param {string|null} authContextId
 */
function setAuthContextClaims(authContextId) {
  _activeAuthContextClaims = authContextId
    ? JSON.stringify({ access_token: { acrs: { essential: true, value: authContextId } } })
    : null;
}

/**
 * @returns {msal.AccountInfo|null}
 */
function getAccount() {
  return _account;
}

/**
 * Returns the signed-in user's object ID (oid), required for Graph/ARM
 * $filter expressions. localAccountId is the oid claim from the id token.
 * @returns {string|null}
 */
function getUserId() {
  return _account?.localAccountId || null;
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Returns the authority URL for the currently active account's tenant.
 * Always specifying this explicitly prevents MSAL from falling back to the
 * msalConfig default authority (the app's home tenant) when acquiring tokens
 * for a guest/switched tenant — which would cause ARM to return home-tenant
 * resources instead of the target tenant's resources.
 */
function _authority() {
  const tid = _account?.tenantId || _account?.idTokenClaims?.tid;
  return tid
    ? `https://login.microsoftonline.com/${tid}`
    : window.msalConfig.auth.authority;
}

async function _acquireToken(scopes, claims) {
  if (!_account) throw new Error('Not signed in');

  const authority = _authority();
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes,
      account:   _account,
      authority,
      ...(claims ? { claims } : {})
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof msal.InteractionRequiredAuthError) {
      // Silent acquisition failed — redirect to Microsoft for fresh tokens.
      // The page will reload on return and initAuth() will process the response.
      await msalInstance.acquireTokenRedirect({ scopes, account: _account, authority, ...(claims ? { claims } : {}) });
      // Page navigates away — execution does not continue here.
    }
    throw err;
  }
}

/**
 * Acquire a Graph token with a specific authentication context (auth context ID).
 * Used when a PIM role requires Conditional Access step-up.
 * @param {string} authContextId
 * @returns {Promise<string>}
 */
async function getGraphTokenWithAuthContext(authContextId) {
  const claims = JSON.stringify({
    access_token: { acrs: { essential: true, value: authContextId } }
  });
  return _acquireToken(window.GRAPH_SCOPES, claims);
}

/**
 * Proactively step up authentication for Conditional Access auth context IDs.
 * Uses acquireTokenRedirect (same flow as sign-in and MFA challenges) so the
 * user never sees a popup window. The page navigates away to Microsoft and
 * returns; bootstrap detects the saved PENDING_ACTIVATION_KEY and resumes.
 *
 * @param {string[]} authContextIds  - unique auth context IDs (e.g. 'c2', 'c3')
 * @param {object[]} roles           - the roles being activated
 */
async function stepUpForAuthContexts(authContextIds, roles) {
  const hasEntraGroup = roles.some(r => r.type === 'User' || r.type === 'Group');

  // Prefer Graph scopes; ARM follows automatically because CA is session-level.
  const scopes = hasEntraGroup ? window.GRAPH_SCOPES : [window.ARM_SCOPE];

  // Use the first auth context ID — session-level satisfaction covers all.
  const claims = JSON.stringify({
    access_token: { acrs: { essential: true, value: authContextIds[0] } }
  });

  await msalInstance.acquireTokenRedirect({ scopes, account: _account, authority: _authority(), claims });
  // Page navigates away — execution does not continue here.
}

/**
 * Request ARM consent interactively via a popup (used by the consent banner).
 * Unlike getArmToken(), this always uses a popup so the user doesn't navigate away.
 * @returns {Promise<void>}
 */
async function grantArmConsent() {
  if (!_account) throw new Error('Not signed in');
  await msalInstance.acquireTokenPopup({ scopes: [window.ARM_SCOPE], account: _account, authority: _authority() });
}

/**
 * Switch to a different Entra tenant using the currently signed-in account.
 * Uses loginRedirect with a tenant-specific authority and the current account's
 * UPN as loginHint so Microsoft can SSO the user silently when they are already
 * a guest/member of that tenant. The page navigates away; on return, initAuth()
 * picks up the new tenant's account via handleRedirectPromise().
 * @param {string} tenantId  Target tenant GUID
 */
async function switchTenant(tenantId) {
  // Persist before the redirect so initAuth() restores the right account on return
  sessionStorage.setItem(PREFERRED_TENANT_KEY, tenantId);
  // Include ARM scope so both Graph and ARM are consented in one single prompt.
  await msalInstance.loginRedirect({
    authority: `https://login.microsoftonline.com/${tenantId}`,
    scopes:     [...window.GRAPH_SCOPES, window.ARM_SCOPE],
    loginHint:  _account?.username,
  });
  // Page navigates away — execution does not continue here.
}

// Expose globally for other modules
window.portalAuth = { initAuth, signIn, signOut, getGraphToken, getArmToken, getGraphTokenWithAuthContext, stepUpForAuthContexts, grantArmConsent, setAuthContextClaims, getAccount, getUserId, switchTenant };
