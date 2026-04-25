/**
 * Policy cache — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * In-memory cache for PIM role management policies.
 * Cache key: `<tenantId>:<scopeType>:<roleDefinitionId>`
 * TTL: 30 minutes (policies rarely change during a session)
 */

/* global graphClient */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

class PolicyCache {
  constructor() {
    this._store = new Map(); // key → { policy, expiresAt }
  }

  /**
   * Get (or fetch and cache) the policy for an Entra role.
   * @param {string} tenantId
   * @param {string} roleId
   * @param {string} scopeId
   * @returns {Promise<object|null>}
   */
  async getEntraPolicy(tenantId, roleId, scopeId = '/') {
    const key = `${tenantId}:Entra:${roleId}`;
    return this._getOrFetch(key, () => graphClient.getEntraRolePolicy(roleId, scopeId));
  }

  /**
   * Get (or fetch and cache) the policy for a PIM group.
   * @param {string} tenantId
   * @param {string} groupId
   * @param {string} accessId
   * @returns {Promise<object|null>}
   */
  async getGroupPolicy(tenantId, groupId, accessId = 'member') {
    const key = `${tenantId}:Group:${groupId}:${accessId}`;
    return this._getOrFetch(key, () => graphClient.getGroupPolicy(groupId, accessId));
  }

  /**
   * Extract policy details into a normalized object.
   * @param {object|null} policy
   * @returns {{ requiresJustification, requiresTicket, requiresMfa, requiresApproval, maxDurationHours }}
   */
  static extractPolicyDetails(policy) {
    const defaults = {
      requiresJustification: false,
      requiresTicket:        false,
      requiresMfa:           false,
      requiresAuthContext:   false,
      authContextId:         null,
      requiresApproval:      false,
      maxDurationHours:      8
    };
    if (!policy?.rules) return defaults;

    const rules = policy.rules;
    const find  = id => rules.find(r => r.id === id);

    // Justification, Ticketing and MFA are sub-rules inside Enablement_EndUser_Assignment.
    // They are NOT separate rule objects — checking Justification_EndUser_Assignment.isRequired
    // always returns undefined/false even when they are required.
    const enablementRule = find('Enablement_EndUser_Assignment');
    const authCtxRule    = find('AuthenticationContext_EndUser_Assignment');
    const approvalRule   = find('Approval_EndUser_Assignment');
    const expiryRule     = find('Expiration_EndUser_Assignment');

    const enabledRules = Array.isArray(enablementRule?.enabledRules) ? enablementRule.enabledRules : [];

    let maxHours = 8;
    if (expiryRule?.maximumDuration) {
      const m = expiryRule.maximumDuration.match(/PT(\d+)H/);
      if (m) maxHours = parseInt(m[1], 10);
    }

    return {
      requiresMfa:           enabledRules.includes('MultiFactorAuthentication'),
      requiresJustification: enabledRules.includes('Justification'),
      requiresTicket:        enabledRules.includes('Ticketing'),
      requiresAuthContext:   authCtxRule?.isEnabled === true,
      authContextId:         authCtxRule?.isEnabled ? (authCtxRule?.claimValue || null) : null,
      // Approval_EndUser_Assignment uses setting.isApprovalRequired, NOT isEnabled
      requiresApproval:      approvalRule?.setting?.isApprovalRequired === true,
      maxDurationHours:      maxHours
    };
  }

  invalidate(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }

  async _getOrFetch(key, fetchFn) {
    const cached = this._store.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.policy;

    try {
      const policy = await fetchFn();
      this._store.set(key, { policy, expiresAt: Date.now() + CACHE_TTL_MS });
      return policy;
    } catch (err) {
      console.warn('[PolicyCache] Failed to fetch policy for', key, err.message);
      return null;
    }
  }
}

window.policyCache = new PolicyCache();
