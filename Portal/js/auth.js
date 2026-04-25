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
 * Trigger interactive sign-in (popup).
 * @returns {Promise<msal.AccountInfo>}
 */
async function signIn() {
  const response = await msalInstance.loginPopup({
    scopes:         window.GRAPH_SCOPES,
    prompt:         'select_account'
  });
  msalInstance.setActiveAccount(response.account);
  _account = response.account;
  return _account;
}

/**
 * Sign out the current user.
 */
async function signOut() {
  if (!_account) return;
  await msalInstance.logoutPopup({ account: _account });
  _account = null;
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

// ── Private helpers ──────────────────────────────────────────────────────────

async function _acquireToken(scopes) {
  if (!_account) throw new Error('Not signed in');

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes,
      account: _account
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof msal.InteractionRequiredAuthError) {
      const result = await msalInstance.acquireTokenPopup({ scopes, account: _account });
      return result.accessToken;
    }
    throw err;
  }
}

// Expose globally for other modules
window.portalAuth = { initAuth, signIn, signOut, getGraphToken, getArmToken, getAccount };
