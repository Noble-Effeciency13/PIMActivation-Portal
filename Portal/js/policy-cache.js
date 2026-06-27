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
    return this._getOrFetch(key, () => graphClient.getEntraRolePolicy(roleId, scopeId, { preferBeta: true }));
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
    return this._getOrFetch(key, () => graphClient.getGroupPolicy(groupId, accessId, { preferBeta: true }));
  }

  /**
   * Extract policy details into a normalized object.
   * @param {object|null} policy
   * @returns {{ requiresJustification, requiresTicket, requiresMfa, requiresAuthContext, authContextId, requiresApproval, requiresCustomExtension, customExtensionIds, customExtensionNames, maxDurationHours }}
   */
  static extractPolicyDetails(policy) {
    const defaults = {
      requiresJustification: false,
      requiresTicket:        false,
      requiresMfa:           false,
      requiresAuthContext:   false,
      authContextId:         null,
      requiresApproval:      false,
      requiresCustomExtension: false,
      customExtensionIds:    [],
      customExtensionNames:  [],
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
    const customExtensions = PolicyCache._extractCustomExtensionRefs(rules);

    const enabledRules = Array.isArray(enablementRule?.enabledRules) ? enablementRule.enabledRules : [];

    let maxHours = 8;
    if (expiryRule?.maximumDuration) {
      const dur = expiryRule.maximumDuration;
      let h = 0;
      const mD = dur.match(/(\d+)D/);
      const mH = dur.match(/(\d+)H/);
      const mM = dur.match(/T.*?(\d+)M/);
      if (mD) h += parseInt(mD[1], 10) * 24;
      if (mH) h += parseInt(mH[1], 10);
      if (mM) h += parseInt(mM[1], 10) / 60;
      if (h > 0) maxHours = h;
    }

    return {
      requiresMfa:           enabledRules.includes('MultiFactorAuthentication'),
      requiresJustification: enabledRules.includes('Justification'),
      requiresTicket:        enabledRules.includes('Ticketing'),
      requiresAuthContext:   authCtxRule?.isEnabled === true,
      authContextId:         authCtxRule?.isEnabled ? (authCtxRule?.claimValue || null) : null,
      // Approval_EndUser_Assignment uses setting.isApprovalRequired, NOT isEnabled
      requiresApproval:      approvalRule?.setting?.isApprovalRequired === true,
      requiresCustomExtension: customExtensions.length > 0,
      customExtensionIds:    customExtensions.map(ext => ext.id).filter(Boolean),
      customExtensionNames:  customExtensions.map(ext => ext.displayName).filter(Boolean),
      maxDurationHours:      maxHours
    };
  }

  static _extractCustomExtensionRefs(rules) {
    const refs = [];
    const seen = new Set();
    for (const rule of rules) {
      if (!PolicyCache._looksLikeCustomExtensionRule(rule) || !PolicyCache._ruleAllowsCustomExtension(rule)) continue;

      const ruleRefs = PolicyCache._collectCustomExtensionRefs(rule);
      if (ruleRefs.length === 0) ruleRefs.push({ id: null, displayName: null });

      for (const ref of ruleRefs) {
        const key = ref.id || ref.displayName || JSON.stringify(ref);
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(ref);
      }
    }
    return refs;
  }

  static _looksLikeCustomExtensionRule(rule) {
    const text = String(rule?.id || '') + ' ' + String(rule?.['@odata.type'] || '');
    if (/custom\s*_?extension|customextension|callout/i.test(text)) return true;
    return PolicyCache._hasCustomExtensionKey(rule);
  }

  static _ruleAllowsCustomExtension(rule) {
    if (rule?.isEnabled === false || rule?.enabled === false) return false;
    if (rule?.setting?.isEnabled === false || rule?.setting?.isCustomExtensionRequired === false) return false;
    return true;
  }

  static _hasCustomExtensionKey(value) {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(item => PolicyCache._hasCustomExtensionKey(item));

    for (const [key, child] of Object.entries(value)) {
      if (/custom\s*_?extension|customextension|callout/i.test(key)) return true;
      if (PolicyCache._hasCustomExtensionKey(child)) return true;
    }
    return false;
  }

  static _collectCustomExtensionRefs(value) {
    const refs = [];
    const visit = (node, key = '') => {
      if (node == null) return;

      const keyLooksRelevant = /custom\s*_?extension|customextension|callout/i.test(String(key));
      if (typeof node === 'string') {
        if (keyLooksRelevant) refs.push({ id: node, displayName: null });
        return;
      }

      if (Array.isArray(node)) {
        node.forEach(item => visit(item, key));
        return;
      }

      if (typeof node !== 'object') return;

      const typeLooksRelevant = /custom\s*_?extension|customextension|callout/i.test(String(node['@odata.type'] || ''));
      if (keyLooksRelevant || typeLooksRelevant) {
        refs.push({
          id:          node.id || node.customExtensionId || node.extensionId || null,
          displayName: node.displayName || node.name || null
        });
      }

      Object.entries(node).forEach(([childKey, child]) => visit(child, childKey));
    };

    visit(value);
    return refs;
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
