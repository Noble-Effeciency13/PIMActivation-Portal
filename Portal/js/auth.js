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

/** Currently active account */
let _account = null;

/**
 * Must be called once on app startup.
 * Handles the redirect callback if present, sets the active account.
 * @returns {Promise<msal.AccountInfo|null>}
 */
async function initAuth() {
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response && response.account) {
      msalInstance.setActiveAccount(response.account);
      _account = response.account;
      return _account;
    }
  } catch (err) {
    console.error('[Auth] handleRedirectPromise error:', err);
  }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
    _account = accounts[0];
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
  await msalInstance.loginRedirect({
    scopes: window.GRAPH_SCOPES,
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
  return _acquireToken(window.GRAPH_SCOPES);
}

/**
 * Acquire an ARM access token (silent first, popup fallback).
 * @returns {Promise<string>} access token
 */
async function getArmToken() {
  return _acquireToken([window.ARM_SCOPE]);
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

async function _acquireToken(scopes, claims) {
  if (!_account) throw new Error('Not signed in');

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes,
      account: _account,
      ...(claims ? { claims } : {})
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof msal.InteractionRequiredAuthError) {
      // Silent acquisition failed — redirect to Microsoft for fresh tokens.
      // The page will reload on return and initAuth() will process the response.
      await msalInstance.acquireTokenRedirect({ scopes, account: _account, ...(claims ? { claims } : {}) });
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
 * Opens an MSAL popup so the user can satisfy Conditional Access (MFA,
 * compliant device, etc.) without navigating away from the page.
 * Returns normally when the popup completes; throws on cancellation or failure.
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

  await msalInstance.acquireTokenPopup({ scopes, account: _account, claims });
  // Returns normally — caller continues with activation
}

// Expose globally for other modules
window.portalAuth = { initAuth, signIn, signOut, getGraphToken, getArmToken, getGraphTokenWithAuthContext, stepUpForAuthContexts, getAccount, getUserId };
