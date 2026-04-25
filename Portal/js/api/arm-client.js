/**
 * Azure ARM client — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * All Azure Resource Manager calls for Azure Resource PIM.
 * Uses tenant-root asTarget() filter — no subscription enumeration.
 */

/* global portalAuth */

const ARM_BASE    = 'https://management.azure.com';
const ARM_VERSION_ELIG   = '2022-04-01-preview';
const ARM_VERSION_ACTIVE = '2022-04-01-preview';
const ARM_VERSION_REQ    = '2022-04-01-preview';

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
  return items.filter(r => r.properties?.assignmentType === 'Activated').map(item => ({
    uid:         item.id,
    type:        'AzureResource',
    id:          item.properties?.roleDefinitionId || item.name,
    name:        item.properties?.expandedProperties?.roleDefinition?.displayName || item.properties?.roleDefinitionId || 'Unknown',
    scope:       _formatScope(item.properties?.scope || '', item.properties?.expandedProperties?.scope?.displayName),
    scopeId:     item.properties?.scope || '',
    memberType:  item.properties?.memberType || 'Direct',
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
  activateAzureRole,
  deactivateAzureRole
};
