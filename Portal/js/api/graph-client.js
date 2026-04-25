/**
 * Graph API client — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * All Microsoft Graph calls for Entra PIM (User / Group).
 * Uses delegated tokens — everything runs in the user's browser.
 */

/* global portalAuth */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const BETA_BASE  = 'https://graph.microsoft.com/beta';

// ── Generic fetch wrapper ─────────────────────────────────────────────────────
async function graphGet(path, useBeta = false) {
  const token = await portalAuth.getGraphToken();
  const base  = useBeta ? BETA_BASE : GRAPH_BASE;
  const resp  = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Graph GET ${path} → ${resp.status}: ${body}`);
  }
  return resp.json();
}

async function graphPost(path, body, useBeta = false) {
  const token = await portalAuth.getGraphToken();
  const base  = useBeta ? BETA_BASE : GRAPH_BASE;
  const resp  = await fetch(`${base}${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph POST ${path} → ${resp.status}: ${text}`);
  }
  // 204 No Content
  if (resp.status === 204) return null;
  return resp.json();
}

// ── Page-through helper ───────────────────────────────────────────────────────
async function graphGetAll(path, useBeta = false) {
  const items = [];
  let url = path;
  while (url) {
    const page = await graphGet(url.startsWith('http') ? url.replace(useBeta ? BETA_BASE : GRAPH_BASE, '') : url, useBeta);
    if (page.value) items.push(...page.value);
    url = page['@odata.nextLink'] || null;
  }
  return items;
}

// ── Eligible roles ────────────────────────────────────────────────────────────

/**
 * Fetch all Entra role eligibility schedules for the signed-in user.
 * @returns {Promise<object[]>}
 */
async function getEligibleEntraRoles() {
  const userId = portalAuth.getUserId();
  const data = await graphGetAll(
    `/roleManagement/directory/roleEligibilityScheduleInstances?$filter=principalId eq '${userId}'&$expand=roleDefinition,principal`,
    false
  );
  return data.map(item => ({
    uid:              item.id,
    type:             'User',
    id:               item.roleDefinitionId,
    name:             item.roleDefinition?.displayName || item.roleDefinitionId,
    scope:            item.directoryScopeId === '/' ? 'Directory' : item.directoryScopeId,
    directoryScopeId: item.directoryScopeId,
    memberType:       item.memberType || 'Direct',
    scheduleInfo:     item.scheduleInfo
  }));
}

/**
 * Fetch all PIM group membership eligibility for the signed-in user.
 * @returns {Promise<object[]>}
 */
async function getEligibleGroupRoles() {
  const userId = portalAuth.getUserId();
  const data = await graphGetAll(
    `/identityGovernance/privilegedAccess/group/eligibilityScheduleInstances?$filter=principalId eq '${userId}'&$expand=group,principal`,
    false
  );
  return data.map(item => ({
    uid:              item.id,
    type:             'Group',
    id:               item.groupId,
    groupId:          item.groupId,
    accessId:         item.accessId,
    name:             item.group?.displayName || item.groupId,
    scope:            'Group',
    directoryScopeId: '/',
    memberType:       item.memberType || 'Direct',
    scheduleInfo:     item.scheduleInfo
  }));
}

// ── Active roles ──────────────────────────────────────────────────────────────

/**
 * Fetch active Entra role assignments for the signed-in user.
 * @returns {Promise<object[]>}
 */
async function getActiveEntraRoles() {
  const userId = portalAuth.getUserId();
  const data = await graphGetAll(
    `/roleManagement/directory/roleAssignmentScheduleInstances?$filter=principalId eq '${userId}'&$expand=roleDefinition,principal`,
    false
  );
  return data.map(item => ({
    uid:              item.id,
    type:             'User',
    id:               item.roleDefinitionId,
    name:             item.roleDefinition?.displayName || item.roleDefinitionId,
    scope:            item.directoryScopeId === '/' ? 'Directory' : item.directoryScopeId,
    directoryScopeId: item.directoryScopeId,
    memberType:       item.memberType || 'Direct',
    assignmentType:   item.assignmentType || 'Assigned',
    endDateTime:      item.scheduleInfo?.expiration?.endDateTime || null
  }));
}

/**
 * Fetch active PIM group memberships for the signed-in user.
 * @returns {Promise<object[]>}
 */
async function getActiveGroupRoles() {
  const userId = portalAuth.getUserId();
  const data = await graphGetAll(
    `/identityGovernance/privilegedAccess/group/assignmentScheduleInstances?$filter=principalId eq '${userId}'&$expand=group`,
    false
  );
  return data.map(item => ({
    uid:            item.id,
    type:           'Group',
    id:             item.groupId,
    groupId:        item.groupId,
    accessId:       item.accessId,
    name:           item.group?.displayName || item.groupId,
    scope:          'Group',
    memberType:     item.memberType || 'Direct',
    assignmentType: item.assignmentType || 'Assigned',
    endDateTime:    item.scheduleInfo?.expiration?.endDateTime || null
  }));
}

// ── Policy ────────────────────────────────────────────────────────────────────

/**
 * Fetch the role management policy for a specific Entra role + scope.
 * NOTE: Will 403 for AU-scoped roles unless the caller has AU-admin permissions.
 * Prefer getAllEntraRolePolicies() for bulk enrichment.
 * @param {string} roleId  — role definition ID
 * @param {string} scopeId — directory scope ID
 * @returns {Promise<object>}
 */
async function getEntraRolePolicy(roleId, scopeId = '/') {
  const assignments = await graphGetAll(
    `/policies/roleManagementPolicyAssignments?$filter=roleDefinitionId eq '${roleId}' and scopeId eq '${encodeURIComponent(scopeId)}' and scopeType eq 'DirectoryRole'&$expand=policy($expand=rules)`,
    false
  );
  return assignments[0]?.policy || null;
}

/**
 * Bulk-fetch all Entra role management policy assignments at the tenant root scope.
 * Returns the raw policy assignment objects (each has .roleDefinitionId and .policy).
 * Use this instead of getEntraRolePolicy() to avoid 403s on AU-scoped role queries.
 * @returns {Promise<object[]>}
 */
async function getAllEntraRolePolicies() {
  return graphGetAll(
    `/policies/roleManagementPolicyAssignments?$filter=scopeId eq '%2F' and scopeType eq 'DirectoryRole'&$expand=policy($expand=rules)`,
    false
  );
}

/**
 * Fetch the role management policy for a PIM group.
 * @param {string} groupId
 * @param {string} accessId — 'member' | 'owner'
 * @returns {Promise<object>}
 */
async function getGroupPolicy(groupId, accessId = 'member') {
  const assignments = await graphGetAll(
    `/identityGovernance/privilegedAccess/group/policyAssignments?$filter=groupId eq '${groupId}' and accessId eq '${accessId}'&$expand=policy($expand=rules)`,
    false
  );
  return assignments[0]?.policy || null;
}

// ── Activation (single) ───────────────────────────────────────────────────────

/**
 * Activate a single Entra PIM role.
 */
async function activateEntraRole(roleId, scopeId, options = {}) {
  return graphPost('/roleManagement/directory/roleAssignmentScheduleRequests', {
    action:          'selfActivate',
    principalId:     portalAuth.getUserId(),
    roleDefinitionId: roleId,
    directoryScopeId: scopeId || '/',
    justification:   options.justification || 'Activated via PIM Portal',
    ticketInfo:      options.ticketNumber ? { ticketNumber: options.ticketNumber, ticketSystem: '' } : undefined,
    scheduleInfo: {
      startDateTime: new Date().toISOString(),
      expiration: {
        type:     'AfterDuration',
        duration: `PT${options.durationMinutes || 60}M`
      }
    }
  });
}

/**
 * Deactivate a single Entra PIM role.
 */
async function deactivateEntraRole(roleId, scopeId) {
  return graphPost('/roleManagement/directory/roleAssignmentScheduleRequests', {
    action:          'selfDeactivate',
    principalId:     portalAuth.getUserId(),
    roleDefinitionId: roleId,
    directoryScopeId: scopeId || '/'
  });
}

/**
 * Activate a single PIM group membership.
 */
async function activateGroupRole(groupId, accessId, options = {}) {
  return graphPost('/identityGovernance/privilegedAccess/group/assignmentScheduleRequests', {
    action:    'selfActivate',
    groupId,
    accessId:  accessId || 'member',
    principalId: portalAuth.getUserId(),
    justification: options.justification || 'Activated via PIM Portal',
    ticketInfo: options.ticketNumber ? { ticketNumber: options.ticketNumber, ticketSystem: '' } : undefined,
    scheduleInfo: {
      startDateTime: new Date().toISOString(),
      expiration: {
        type:     'AfterDuration',
        duration: `PT${options.durationMinutes || 60}M`
      }
    }
  });
}

/**
 * Deactivate a single PIM group membership.
 */
async function deactivateGroupRole(groupId, accessId) {
  return graphPost('/identityGovernance/privilegedAccess/group/assignmentScheduleRequests', {
    action:    'selfDeactivate',
    groupId,
    accessId:  accessId || 'member',
    principalId: portalAuth.getUserId()
  });
}

// ── Graph $batch ──────────────────────────────────────────────────────────────

/**
 * Execute a Graph $batch request.
 * Handles 429 Retry-After by retrying failed sub-requests once.
 * @param {object[]} requests — array of { id, method, url, body? }
 * @returns {Promise<object[]>} — array of { id, status, body }
 */
async function graphBatch(requests) {
  const CHUNK = 20;
  const allResponses = [];

  for (let i = 0; i < requests.length; i += CHUNK) {
    const chunk = requests.slice(i, i + CHUNK);
    const result = await _sendBatchChunk(chunk);
    allResponses.push(...result);
  }
  return allResponses;
}

async function _sendBatchChunk(chunk, retrying = false) {
  const token = await portalAuth.getGraphToken();
  const resp  = await fetch(`${GRAPH_BASE}/$batch`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ requests: chunk })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph $batch → ${resp.status}: ${text}`);
  }
  const data = await resp.json();

  if (retrying) return data.responses || [];

  // Check for throttled sub-requests
  const throttled = (data.responses || []).filter(r => r.status === 429);
  if (throttled.length > 0) {
    const retryAfter = parseInt(throttled[0].headers?.['Retry-After'] || '5', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    const retryIds = new Set(throttled.map(r => r.id));
    const retryChunk = chunk.filter(req => retryIds.has(req.id));
    const retried = await _sendBatchChunk(retryChunk, true);
    const kept    = (data.responses || []).filter(r => !retryIds.has(r.id));
    return [...kept, ...retried];
  }

  return data.responses || [];
}

// ── Pending approval requests ─────────────────────────────────────────────────

/**
 * Fetch pending PIM activation requests for the signed-in user.
 * Used to annotate eligible roles that already have a pending approval.
 * @returns {Promise<{type: string, roleId?: string, groupId?: string, accessId?: string, status: string}[]>}
 */
async function getPendingActivationRequests() {
  const userId = portalAuth.getUserId();
  try {
    const [entra, group] = await Promise.all([
      graphGetAll(
        `/roleManagement/directory/roleAssignmentScheduleRequests?$filter=principalId eq '${userId}' and status eq 'PendingApproval'`,
        false
      ).catch(() => []),
      graphGetAll(
        `/identityGovernance/privilegedAccess/group/assignmentScheduleRequests?$filter=principalId eq '${userId}' and status eq 'PendingApproval'`,
        false
      ).catch(() => [])
    ]);
    return [
      ...entra.map(r => ({ type: 'User',  roleId:  r.roleDefinitionId, status: r.status })),
      ...group.map(r => ({ type: 'Group', groupId: r.groupId, accessId: r.accessId, status: r.status }))
    ];
  } catch {
    return [];
  }
}

// Expose globally
window.graphClient = {
  getEligibleEntraRoles,
  getEligibleGroupRoles,
  getActiveEntraRoles,
  getActiveGroupRoles,
  getEntraRolePolicy,
  getAllEntraRolePolicies,
  getGroupPolicy,
  activateEntraRole,
  deactivateEntraRole,
  activateGroupRole,
  deactivateGroupRole,
  graphBatch,
  getPendingActivationRequests
};
