/**
 * Azure ARM client — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * All Azure Resource Manager calls for Azure Resource PIM.
 * Uses tenant-root asTarget() filter — no subscription enumeration.
 */

/* global portalAuth */

const ARM_BASE    = 'https://management.azure.com';
const ARM_VERSION_ELIG   = '2020-10-01-preview';
const ARM_VERSION_ACTIVE = '2020-10-01-preview';
const ARM_VERSION_REQ    = '2020-10-01-preview';

async function armGet(path, apiVersion) {
  const token = await portalAuth.getArmToken();
  const resp  = await fetch(`${ARM_BASE}${path}?api-version=${apiVersion}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ARM GET ${path} → ${resp.status}: ${body}`);
  }
  return resp.json();
}

async function armPost(path, body, apiVersion) {
  const token = await portalAuth.getArmToken();
  const resp  = await fetch(`${ARM_BASE}${path}?api-version=${apiVersion}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ARM POST ${path} → ${resp.status}: ${text}`);
  }
  if (resp.status === 201 || resp.status === 204) return null;
  return resp.json();
}

async function armGetAll(path, apiVersion) {
  const items = [];
  let url = `${ARM_BASE}${path}?api-version=${apiVersion}&$filter=asTarget()&$expand=expandedProperties`;
  while (url) {
    const token = await portalAuth.getArmToken();
    const resp  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`ARM paginated GET → ${resp.status}: ${body}`);
    }
    const page = await resp.json();
    if (page.value) items.push(...page.value);
    url = page.nextLink || null;
  }
  return items;
}

// ── Eligible Azure roles ──────────────────────────────────────────────────────

/**
 * Fetch all Azure Resource eligible role assignments for the signed-in user.
 * Uses the tenant-root asTarget() filter — no subscription enumeration needed.
 * @returns {Promise<object[]>}
 */
async function getEligibleAzureRoles() {
  const items = await armGetAll(
    '/providers/Microsoft.Authorization/roleEligibilityScheduleInstances',
    ARM_VERSION_ELIG
  );
  return items.map(item => _mapEligibleAzureItem(item));
}

function _mapEligibleAzureItem(item) {
  const scope       = item.properties?.scope || '';
  const scopeDisplay = _formatScope(scope, item.properties?.expandedProperties?.scope?.displayName);
  return {
    uid:              item.id,
    type:             'AzureResource',
    id:               item.properties?.roleDefinitionId || item.name,
    name:             item.properties?.expandedProperties?.roleDefinition?.displayName || item.properties?.roleDefinitionId || 'Unknown',
    scope:            scopeDisplay,
    scopeId:          scope,
    memberType:       item.properties?.memberType || 'Direct',
    scheduleInfo:     item.properties?.scheduleInfo,
    maxDurationHours: null // fetched from policy on demand
  };
}

// ── Active Azure roles ────────────────────────────────────────────────────────

/**
 * Fetch active Azure Resource role assignments for the signed-in user.
 * @returns {Promise<object[]>}
 */
async function getActiveAzureRoles() {
  const items = await armGetAll(
    '/providers/Microsoft.Authorization/roleAssignmentScheduleInstances',
    ARM_VERSION_ACTIVE
  );
  // Show all active Azure roles (PIM-activated AND permanently assigned)
  // assignmentType === 'Activated' would exclude permanent assignments
  return items.map(item => ({
    uid:         item.id,
    type:        'AzureResource',
    id:          item.properties?.roleDefinitionId || item.name,
    name:        item.properties?.expandedProperties?.roleDefinition?.displayName || item.properties?.roleDefinitionId || 'Unknown',
    scope:       _formatScope(item.properties?.scope || '', item.properties?.expandedProperties?.scope?.displayName),
    scopeId:     item.properties?.scope || '',
    memberType:  item.properties?.memberType || 'Direct',
    assignmentType: item.properties?.assignmentType || 'Assigned',
    endDateTime: item.properties?.endDateTime || null
  }));
}

// ── Activate / deactivate Azure roles ────────────────────────────────────────

/**
 * Activate a single Azure Resource PIM role.
 * @param {string} scopeId  — full ARM scope (e.g. /subscriptions/..., /providers/Microsoft.Management/...)
 * @param {string} roleId   — role definition ID (GUID)
 * @param {object} options  — { durationMinutes, justification, ticketNumber }
 */
async function activateAzureRole(scopeId, roleId, options = {}) {
  const requestName = crypto.randomUUID();
  return armPost(
    `${scopeId}/providers/Microsoft.Authorization/roleAssignmentScheduleRequests/${requestName}`,
    {
      properties: {
        requestType:      'SelfActivate',
        roleDefinitionId: roleId,
        principalId:      portalAuth.getUserId(),
        justification:    options.justification || 'Activated via PIM Portal',
        ticketInfo:       options.ticketNumber ? { ticketNumber: options.ticketNumber, ticketSystem: '' } : undefined,
        scheduleInfo: {
          startDateTime: new Date().toISOString(),
          expiration: {
            type:     'AfterDuration',
            duration: `PT${options.durationMinutes || 60}M`
          }
        }
      }
    },
    ARM_VERSION_REQ
  );
}

/**
 * Deactivate a single Azure Resource PIM role.
 */
async function deactivateAzureRole(scopeId, roleId) {
  const requestName = crypto.randomUUID();
  return armPost(
    `${scopeId}/providers/Microsoft.Authorization/roleAssignmentScheduleRequests/${requestName}`,
    {
      properties: {
        requestType:      'SelfDeactivate',
        roleDefinitionId: roleId,
        principalId:      portalAuth.getUserId()
      }
    },
    ARM_VERSION_REQ
  );
}

// ── Azure role policies ─────────────────────────────────────────────────────────

// Session cache: scopeId:roleGuid → { rules } result
const _azurePolicyCache = new Map();

/**
 * Fetch the PIM role management policy for a given Azure scope + role definition.
 * Uses a two-step approach:
 *   1. List policy assignments at the scope to find the policyId matching the role.
 *   2. Fetch the policy directly — rules are at properties.rules.
 *
 * The nested $expand=policy($expand=rules) syntax is NOT supported by ARM, so
 * we fetch the policy object separately instead.
 *
 * @param {string} scopeId          — full ARM scope (e.g. /subscriptions/...)
 * @param {string} roleDefinitionId — full role def resource ID or bare GUID
 * @returns {Promise<{rules: object[]}|null>}
 */
async function getAzureRolePolicy(scopeId, roleDefinitionId) {
  // Normalise to GUID for resilient matching across scope formats
  const roleGuid   = (roleDefinitionId || '').split('/').pop().toLowerCase();
  const cacheKey   = `${scopeId}:${roleGuid}`;
  if (_azurePolicyCache.has(cacheKey)) return _azurePolicyCache.get(cacheKey);

  const token   = await portalAuth.getArmToken();
  const headers = { Authorization: `Bearer ${token}` };

  // Step 1: find the policy assignment for this role.
  // Filter by roleDefinitionId so we get exactly one result even on large
  // subscriptions with hundreds of role definitions (avoids pagination issues).
  let policyId = null;
  let nextUrl  = `${ARM_BASE}${scopeId}/providers/Microsoft.Authorization/roleManagementPolicyAssignments` +
                 `?api-version=2020-10-01-preview` +
                 `&$filter=roleDefinitionId eq '${encodeURIComponent(roleDefinitionId)}'`;

  while (nextUrl && !policyId) {
    const listResp = await fetch(nextUrl, { headers });
    if (!listResp.ok) {
      const body = await listResp.text();
      throw new Error(`ARM policy list \u2192 ${listResp.status}: ${body}`);
    }
    const listData = await listResp.json();
    const match    = (listData.value || []).find(
      a => (a.properties?.roleDefinitionId || '').split('/').pop().toLowerCase() === roleGuid
    );
    if (match) {
      policyId = match.properties?.policyId;
    } else {
      nextUrl = listData.nextLink || null;
    }
  }

  if (!policyId) {
    _azurePolicyCache.set(cacheKey, null);
    return null;
  }

  // Step 2: fetch the policy object — rules live at properties.rules[]
  const policyResp = await fetch(`${ARM_BASE}${policyId}?api-version=2020-10-01-preview`, { headers });
  if (!policyResp.ok) {
    const body = await policyResp.text();
    throw new Error(`ARM policy fetch \u2192 ${policyResp.status}: ${body}`);
  }
  const policyData = await policyResp.json();
  const rules  = policyData?.properties?.rules || [];
  const result = rules.length > 0 ? { rules } : null;
  _azurePolicyCache.set(cacheKey, result);
  return result;
}

// ── Pending Azure requests ───────────────────────────────────────────────────

/**
 * Fetch Azure PIM activation requests for the current user that are
 * awaiting approval (status eq 'PendingApproval').
 * Uses the tenant-root asTarget() filter — no subscription enumeration needed.
 * @returns {Promise<object[]>} array of { type, roleDefinitionId, scopeId, scope, name }
 */
async function getPendingAzureRequests() {
  const items = await armGetAll(
    '/providers/Microsoft.Authorization/roleAssignmentScheduleRequests',
    ARM_VERSION_REQ
  );
  return items
    .filter(item =>
      item.properties?.status === 'PendingApproval' &&
      item.properties?.requestType === 'SelfActivate'
    )
    .map(item => ({
      type:             'AzureResource',
      roleDefinitionId: item.properties?.roleDefinitionId || '',
      scopeId:          item.properties?.scope || '',
      scope:            _formatScope(
                          item.properties?.scope || '',
                          item.properties?.expandedProperties?.scope?.displayName
                        ),
      name:             item.properties?.expandedProperties?.roleDefinition?.displayName || item.properties?.roleDefinitionId || 'Unknown'
    }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _formatScope(scopePath, displayName) {
  if (displayName) return displayName;
  if (!scopePath)  return 'Unknown';
  const mg  = scopePath.match(/\/providers\/Microsoft\.Management\/managementGroups\/([^/]+)/);
  if (mg)  return `MG: ${mg[1]}`;
  const sub = scopePath.match(/\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/(.+)/);
  if (sub) return `${sub[2]} / ${sub[3]}`;
  const rg  = scopePath.match(/\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)/);
  if (rg)  return rg[2];
  const s   = scopePath.match(/\/subscriptions\/([^/]+)/);
  if (s)   return s[1];
  return scopePath;
}

window.armClient = {
  getEligibleAzureRoles,
  getActiveAzureRoles,
  getAzureRolePolicy,
  getPendingAzureRequests,
  activateAzureRole,
  deactivateAzureRole
};
