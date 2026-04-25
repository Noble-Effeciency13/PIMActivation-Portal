/**
 * Bulk activation/deactivation engine — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * Splits a mixed list of roles by type and:
 *   - Entra / Group  → Graph $batch (max 20 per chunk, 429 retry)
 *   - AzureResource  → Promise.allSettled (parallel, up to 4 concurrent)
 *
 * Unified result shape:
 *   { success, summary: { total, succeeded, failed },
 *     results: [{ uid, type, status, success, error?, activatedAt?, deactivatedAt? }] }
 */

/* global graphClient, armClient */

const AZURE_PARALLEL_LIMIT = 4;

// ── Bulk activate ─────────────────────────────────────────────────────────────

/**
 * @param {object[]} roles   — array of role descriptors (uid, type, id, ...)
 * @param {object}   options — { durationMinutes, justification, ticketNumber }
 * @returns {Promise<BulkResult>}
 */
async function bulkActivate(roles, options = {}) {
  const entraGroup = roles.filter(r => r.type === 'User' || r.type === 'Group');
  const azure      = roles.filter(r => r.type === 'AzureResource');

  const [egResults, azResults] = await Promise.all([
    _bulkActivateEntraGroup(entraGroup, options),
    _bulkActivateAzure(azure, options)
  ]);

  return _buildResult([...egResults, ...azResults]);
}

// ── Bulk deactivate ───────────────────────────────────────────────────────────

/**
 * @param {object[]} roles — array of role descriptors
 * @returns {Promise<BulkResult>}
 */
async function bulkDeactivate(roles) {
  const entraGroup = roles.filter(r => r.type === 'User' || r.type === 'Group');
  const azure      = roles.filter(r => r.type === 'AzureResource');

  const [egResults, azResults] = await Promise.all([
    _bulkDeactivateEntraGroup(entraGroup),
    _bulkDeactivateAzure(azure)
  ]);

  return _buildResult([...egResults, ...azResults]);
}

// ── Entra/Group implementation ────────────────────────────────────────────────

async function _bulkActivateEntraGroup(roles, options) {
  if (roles.length === 0) return [];

  const requests = roles.map(role => {
    if (role.type === 'Group') {
      return {
        id:     role.uid,
        method: 'POST',
        url:    '/identityGovernance/privilegedAccess/group/assignmentScheduleRequests',
        body: {
          action:      'selfActivate',
          groupId:     role.groupId || role.id,
          accessId:    role.accessId || 'member',
          principalId: portalAuth.getUserId(),
          justification: options.justification || 'Activated via PIM Portal',
          ticketInfo:  options.ticketNumber ? { ticketNumber: options.ticketNumber, ticketSystem: '' } : undefined,
          scheduleInfo: {
            startDateTime: new Date().toISOString(),
            expiration: { type: 'AfterDuration', duration: `PT${options.durationMinutes || 60}M` }
          }
        },
        headers: { 'Content-Type': 'application/json' }
      };
    }
    // Entra user role
    return {
      id:     role.uid,
      method: 'POST',
      url:    '/roleManagement/directory/roleAssignmentScheduleRequests',
      body: {
        action:           'selfActivate',
        principalId:      portalAuth.getUserId(),
        roleDefinitionId: role.id,
        directoryScopeId: role.directoryScopeId || '/',
        justification:    options.justification || 'Activated via PIM Portal',
        ticketInfo:       options.ticketNumber ? { ticketNumber: options.ticketNumber, ticketSystem: '' } : undefined,
        scheduleInfo: {
          startDateTime: new Date().toISOString(),
          expiration: { type: 'AfterDuration', duration: `PT${options.durationMinutes || 60}M` }
        }
      },
      headers: { 'Content-Type': 'application/json' }
    };
  });

  const responses = await graphClient.graphBatch(requests);
  return _mapBatchResponses(roles, responses, 'activate');
}

async function _bulkDeactivateEntraGroup(roles) {
  if (roles.length === 0) return [];

  const requests = roles.map(role => {
    if (role.type === 'Group') {
      return {
        id:     role.uid,
        method: 'POST',
        url:    '/identityGovernance/privilegedAccess/group/assignmentScheduleRequests',
        body: { action: 'selfDeactivate', groupId: role.groupId || role.id, accessId: role.accessId || 'member', principalId: portalAuth.getUserId() },
        headers: { 'Content-Type': 'application/json' }
      };
    }
    return {
      id:     role.uid,
      method: 'POST',
      url:    '/roleManagement/directory/roleAssignmentScheduleRequests',
      body: { action: 'selfDeactivate', principalId: portalAuth.getUserId(), roleDefinitionId: role.id, directoryScopeId: role.directoryScopeId || '/' },
      headers: { 'Content-Type': 'application/json' }
    };
  });

  const responses = await graphClient.graphBatch(requests);
  return _mapBatchResponses(roles, responses, 'deactivate');
}

function _mapBatchResponses(roles, responses, action) {
  const resMap = Object.fromEntries(responses.map(r => [r.id, r]));
  return roles.map(role => {
    const res = resMap[role.uid];
    if (!res) return { uid: role.uid, type: role.type, success: false, error: 'No response from batch' };
    const ok  = res.status >= 200 && res.status < 300;
    return {
      uid:     role.uid,
      type:    role.type,
      success: ok,
      status:  res.status,
      error:   ok ? undefined : (res.body?.error?.message || `HTTP ${res.status}`),
      [action === 'activate' ? 'activatedAt' : 'deactivatedAt']: ok ? new Date().toISOString() : undefined
    };
  });
}

// ── Azure Resource implementation ─────────────────────────────────────────────

async function _bulkActivateAzure(roles, options) {
  if (roles.length === 0) return [];
  return _runWithLimit(roles, AZURE_PARALLEL_LIMIT, async role => {
    try {
      await armClient.activateAzureRole(role.scopeId || role.scope, role.id, options);
      return { uid: role.uid, type: role.type, success: true, activatedAt: new Date().toISOString() };
    } catch (err) {
      return { uid: role.uid, type: role.type, success: false, error: err.message };
    }
  });
}

async function _bulkDeactivateAzure(roles) {
  if (roles.length === 0) return [];
  return _runWithLimit(roles, AZURE_PARALLEL_LIMIT, async role => {
    try {
      await armClient.deactivateAzureRole(role.scopeId || role.scope, role.id);
      return { uid: role.uid, type: role.type, success: true, deactivatedAt: new Date().toISOString() };
    } catch (err) {
      return { uid: role.uid, type: role.type, success: false, error: err.message };
    }
  });
}

/** Run tasks with a maximum concurrency limit */
async function _runWithLimit(items, limit, fn) {
  const results = [];
  let   idx     = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Result builder ────────────────────────────────────────────────────────────

function _buildResult(results) {
  const succeeded = results.filter(r => r.success).length;
  return {
    success: succeeded === results.length,
    summary: { total: results.length, succeeded, failed: results.length - succeeded },
    results
  };
}

window.batchClient = { bulkActivate, bulkDeactivate };
