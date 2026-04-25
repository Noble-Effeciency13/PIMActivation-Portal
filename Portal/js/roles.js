/**
 * Role renderer — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * Features:
 *  - Grouped sort: [Entra] → [Group] → [Azure], alpha within each group
 *  - Azure scope deduplication (highest scope wins per role definition GUID)
 *  - Policy matrix columns: Max, MFA, Justification, Ticket, Approval
 *  - Pending approval indicator on eligible roles requiring approval
 *  - Select All active: only selects PIM-activated roles (endDateTime set)
 *  - Scope shown below role name (italic, muted, 11px)
 *  - Expiry countdown timers (30s tick, colour-coded near expiry)
 */

/* global graphClient, armClient, policyCache, PolicyCache, portalAuth, escapeHtml, formatExpiry, showToast */

class RoleManager {
  constructor() {
    this.eligibleRoles    = [];
    this.activeRoles      = [];
    this.selectedEligible = new Set();
    this.selectedActive   = new Set();
    this._timers          = [];
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async loadRoles() {
    this.eligibleRoles = [];
    this.activeRoles   = [];
    this.selectedEligible.clear();
    this.selectedActive.clear();
    this._stopTimers();
    this._resetSelectAll();

    if (typeof showProgress === 'function') showProgress('Loading Entra & Group roles\u2026');

    // Phase 1: Entra + Group (usually fast)
    const [entraElig, groupElig, entraActive, groupActive, pending] = await Promise.all([
      graphClient.getEligibleEntraRoles().catch(e => { console.error('[Roles] Entra elig:', e); return e; }),
      graphClient.getEligibleGroupRoles().catch(e => { console.error('[Roles] Group elig:', e); return e; }),
      graphClient.getActiveEntraRoles().catch(e  => { console.error('[Roles] Entra act:', e);  return e; }),
      graphClient.getActiveGroupRoles().catch(e  => { console.error('[Roles] Group act:', e);   return e; }),
      graphClient.getPendingActivationRequests().catch(() => [])
    ]);

    const all    = [entraElig, groupElig, entraActive, groupActive];
    const errors = all.filter(r => r instanceof Error);
    const toArr  = r => (r instanceof Error ? [] : r);

    if (errors.length === 4) {
      showToast('Failed to load roles: ' + errors[0].message, 'error', 12000);
    } else if (errors.length > 0) {
      showToast('Some role sources failed. Check the browser console.', 'warning', 8000);
    }

    this.eligibleRoles = [...toArr(entraElig), ...toArr(groupElig)];
    this.activeRoles   = [...toArr(entraActive), ...toArr(groupActive)];

    this._annotatePending(pending);

    // Render immediately — policy columns show "—" until background enrichment finishes
    this.renderEligible();
    this.renderActive();

    // Policy enrichment runs in background; re-renders eligible table when done
    this._enrichPolicy().then(() => this.renderEligible()).catch(() => {});

    if (typeof updateProgress === 'function') updateProgress(60, 'Loading Azure roles\u2026');

    // Phase 2: Azure (may take longer — ARM cold start / MFA step-up)
    try {
      const [azureElig, azureActive] = await Promise.all([
        armClient.getEligibleAzureRoles(),
        armClient.getActiveAzureRoles()
      ]);
      this.eligibleRoles = [...this.eligibleRoles, ..._deduplicateAzure(azureElig)];
      this.activeRoles   = [...this.activeRoles,   ..._deduplicateAzure(azureActive)];
      this.renderEligible();
      this.renderActive();
    } catch (err) {
      console.warn('[Roles] Azure roles unavailable:', err.message);
    }

    if (typeof hideProgress === 'function') hideProgress();
    this._startTimers();
  }

  // ── Policy enrichment ─────────────────────────────────────────────────────

  async _enrichPolicy() {
    const tenantId = portalAuth.getAccount()?.tenantId ||
                     portalAuth.getAccount()?.idTokenClaims?.tid || 'default';
    await Promise.allSettled(
      this.eligibleRoles.map(async role => {
        try {
          let policy = null;
          if (role.type === 'User') {
            policy = await policyCache.getEntraPolicy(tenantId, role.id, role.directoryScopeId);
          } else if (role.type === 'Group') {
            policy = await policyCache.getGroupPolicy(tenantId, role.groupId || role.id, role.accessId || 'member');
          }
          if (policy) Object.assign(role, PolicyCache.extractPolicyDetails(policy));
        } catch { /* non-fatal */ }
      })
    );
  }

  // ── Pending approval annotation ───────────────────────────────────────────

  _annotatePending(requests) {
    if (!Array.isArray(requests) || !requests.length) return;
    for (const role of this.eligibleRoles) {
      role._hasPendingApproval = requests.some(r =>
        (r.type === 'User'  && r.roleId  === role.id) ||
        (r.type === 'Group' && r.groupId === (role.groupId || role.id) &&
                               r.accessId === (role.accessId || 'member'))
      );
    }
  }

  // ── Render: eligible ──────────────────────────────────────────────────────

  renderEligible() {
    const tbody = document.getElementById('eligible-roles-body');
    if (!tbody) return;

    const query = (document.getElementById('eligible-search')?.value || '').toLowerCase();
    const roles = _sort(_filter(this.eligibleRoles, query));

    const n = roles.length;
    document.getElementById('eligible-count').textContent = n + ' role' + (n !== 1 ? 's' : '');

    if (n === 0) {
      const msg = this.eligibleRoles.length === 0 ? 'No eligible roles found.' : 'No roles match your search.';
      tbody.innerHTML = '<tr class="row-placeholder"><td colspan="8">' + msg + '</td></tr>';
      this._updateBars();
      return;
    }

    tbody.innerHTML = roles.map(role => {
      const uid      = role.uid || role.id;
      const checked  = this.selectedEligible.has(uid) ? 'checked' : '';
      const selCls   = this.selectedEligible.has(uid) ? 'row-selected' : '';
      const badge    = _typeBadge(role.type);
      const maxDisp  = _maxDuration(role.maxDurationHours);
      const pending  = role._hasPendingApproval
        ? '<span class="pending-badge" title="A pending approval request already exists">Pending</span>' : '';

      return '<tr class="' + selCls + '" data-uid="' + escapeHtml(uid) + '">' +
        '<td class="col-cb"><label class="cb-wrap">' +
          '<input type="checkbox" class="elig-cb" data-uid="' + escapeHtml(uid) + '" ' + checked +
          ' aria-label="' + escapeHtml(role.name) + '">' +
        '</label></td>' +
        '<td class="col-type" data-label="Type">' + badge + '</td>' +
        '<td class="col-role" data-label="Role"><div class="role-cell">' +
          '<span class="role-name">' + escapeHtml(role.name) + pending + '</span>' +
          '<span class="role-scope">' + escapeHtml(_scopeDisplay(role)) + '</span>' +
        '</div></td>' +
        '<td class="col-policy" data-label="Max"><span class="pol-max">' + maxDisp + '</span></td>' +
        '<td class="col-policy" data-label="MFA">'    + _polMfa(role)                                     + '</td>' +
        '<td class="col-policy" data-label="Just.">'  + _polDot(role.requiresJustification, 'J', 'pol-warning', 'Justification required') + '</td>' +
        '<td class="col-policy" data-label="Ticket">' + _polDot(role.requiresTicket,        'T', 'pol-warning', 'Ticket required')        + '</td>' +
        '<td class="col-policy" data-label="Apprv.">' + _polDot(role.requiresApproval,      'A', 'pol-purple',  'Approval required')       + '</td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.elig-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const uid = cb.dataset.uid;
        if (cb.checked) this.selectedEligible.add(uid);
        else            this.selectedEligible.delete(uid);
        cb.closest('tr').classList.toggle('row-selected', cb.checked);
        this._updateBars();
        this._syncHeader('eligible');
      });
    });

    this._updateBars();
  }

  // ── Render: active ────────────────────────────────────────────────────────

  renderActive() {
    const tbody = document.getElementById('active-roles-body');
    if (!tbody) return;

    const query = (document.getElementById('active-search')?.value || '').toLowerCase();
    const roles = _sort(_filter(this.activeRoles, query));

    const n = roles.length;
    document.getElementById('active-count').textContent = n + ' role' + (n !== 1 ? 's' : '');

    if (n === 0) {
      const msg = this.activeRoles.length === 0 ? 'No active roles.' : 'No roles match your search.';
      tbody.innerHTML = '<tr class="row-placeholder"><td colspan="4">' + msg + '</td></tr>';
      this._updateBars();
      return;
    }

    tbody.innerHTML = roles.map(role => {
      const uid    = role.uid || role.id;
      const isPim  = !!role.endDateTime;
      const checked = this.selectedActive.has(uid) ? 'checked' : '';
      const selCls  = this.selectedActive.has(uid) ? 'row-selected' : '';
      const badge   = _typeBadge(role.type);

      let expiryHtml;
      if (!isPim) {
        expiryHtml = '<span class="expiry-timer" style="color:var(--text-faint)" title="Permanent assignment">Permanent</span>';
      } else {
        const diff = Math.max(0, new Date(role.endDateTime).getTime() - Date.now());
        const cls  = diff < 1800000 ? 'expiry-critical' : diff < 3600000 ? 'expiry-soon' : '';
        expiryHtml = '<span class="expiry-timer ' + cls + '" data-expires="' +
          escapeHtml(role.endDateTime) + '">' + formatExpiry(role.endDateTime) + '</span>';
      }

      return '<tr class="' + selCls + '" data-uid="' + escapeHtml(uid) + '">' +
        '<td class="col-cb"><label class="cb-wrap">' +
          '<input type="checkbox" class="active-cb" data-uid="' + escapeHtml(uid) + '" ' + checked +
          ' aria-label="' + escapeHtml(role.name) + '">' +
        '</label></td>' +
        '<td class="col-type" data-label="Type">' + badge + '</td>' +
        '<td class="col-role" data-label="Role"><div class="role-cell">' +
          '<span class="role-name">' + escapeHtml(role.name) + '</span>' +
          '<span class="role-scope">' + escapeHtml(_scopeDisplay(role)) + '</span>' +
        '</div></td>' +
        '<td class="col-expires" data-label="Expires">' + expiryHtml + '</td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.active-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const uid = cb.dataset.uid;
        if (cb.checked) this.selectedActive.add(uid);
        else            this.selectedActive.delete(uid);
        cb.closest('tr').classList.toggle('row-selected', cb.checked);
        this._updateBars();
        this._syncHeader('active');
      });
    });

    this._updateBars();
  }

  // ── Select All ────────────────────────────────────────────────────────────

  selectAllEligible(checked) {
    document.querySelectorAll('.elig-cb').forEach(cb => {
      cb.checked = checked;
      const uid  = cb.dataset.uid;
      if (checked) this.selectedEligible.add(uid);
      else         this.selectedEligible.delete(uid);
      cb.closest('tr').classList.toggle('row-selected', checked);
    });
    this._updateBars();
  }

  selectAllActive(checked) {
    // Only select PIM-managed roles (those with an expiry)
    document.querySelectorAll('.active-cb').forEach(cb => {
      const uid  = cb.dataset.uid;
      const role = this.activeRoles.find(r => (r.uid || r.id) === uid);
      if (role && role.endDateTime) {
        cb.checked = checked;
        if (checked) this.selectedActive.add(uid);
        else         this.selectedActive.delete(uid);
        cb.closest('tr').classList.toggle('row-selected', checked);
      }
    });
    this._updateBars();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getSelectedEligibleRoles() {
    return [...this.selectedEligible]
      .map(uid => this.eligibleRoles.find(r => (r.uid || r.id) === uid))
      .filter(Boolean);
  }

  getSelectedActiveRoles() {
    return [...this.selectedActive]
      .map(uid => this.activeRoles.find(r => (r.uid || r.id) === uid))
      .filter(Boolean);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _updateBars() {
    const ne = this.selectedEligible.size;
    const na = this.selectedActive.size;

    const eligBar = document.getElementById('eligible-action-bar');
    const actBar  = document.getElementById('active-action-bar');
    const eligLbl = document.getElementById('eligible-selection-label');
    const actLbl  = document.getElementById('active-selection-label');
    const eligBtn = document.getElementById('activate-btn');
    const actBtn  = document.getElementById('deactivate-btn');

    if (eligBar) eligBar.hidden = ne === 0;
    if (actBar)  actBar.hidden  = na === 0;
    if (eligLbl) eligLbl.textContent = ne + ' role' + (ne !== 1 ? 's' : '') + ' selected';
    if (actLbl)  actLbl.textContent  = na + ' role' + (na !== 1 ? 's' : '') + ' selected';
    if (eligBtn) eligBtn.disabled = ne === 0;
    if (actBtn)  actBtn.disabled  = na === 0;
  }

  _syncHeader(which) {
    if (which === 'eligible') {
      const cbs  = [...document.querySelectorAll('.elig-cb')];
      const hdr  = document.getElementById('select-all-eligible');
      if (hdr && cbs.length) {
        hdr.checked       = cbs.every(c => c.checked);
        hdr.indeterminate = !hdr.checked && cbs.some(c => c.checked);
      }
    } else {
      const cbs  = [...document.querySelectorAll('.active-cb')].filter(cb => {
        const r = this.activeRoles.find(r => (r.uid || r.id) === cb.dataset.uid);
        return r && !!r.endDateTime;
      });
      const hdr  = document.getElementById('select-all-active');
      if (hdr && cbs.length) {
        hdr.checked       = cbs.every(c => c.checked);
        hdr.indeterminate = !hdr.checked && cbs.some(c => c.checked);
      }
    }
  }

  _resetSelectAll() {
    ['select-all-eligible', 'select-all-active'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.checked = false; el.indeterminate = false; }
    });
  }

  _stopTimers() {
    this._timers.forEach(t => clearInterval(t));
    this._timers = [];
  }

  _startTimers() {
    this._stopTimers();
    this._timers.push(setInterval(() => {
      document.querySelectorAll('.expiry-timer[data-expires]').forEach(el => {
        const diff = Math.max(0, new Date(el.dataset.expires).getTime() - Date.now());
        el.textContent = formatExpiry(el.dataset.expires);
        el.classList.toggle('expiry-critical', diff > 0 && diff < 1800000);
        el.classList.toggle('expiry-soon',     diff >= 1800000 && diff < 3600000);
      });
    }, 30000));
  }
}

// ── Module-private helpers ────────────────────────────────────────────────────

/** Sort: Entra → Group → Azure, alphabetical within each group */
function _sort(roles) {
  const order = { User: 0, Group: 1, AzureResource: 2 };
  return [...roles].sort((a, b) => {
    const t = (order[a.type] ?? 3) - (order[b.type] ?? 3);
    return t !== 0 ? t : (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  });
}

function _filter(roles, query) {
  if (!query) return roles;
  return roles.filter(r =>
    [r.name, _scopeDisplay(r), r.type].some(s => s && s.toLowerCase().includes(query))
  );
}

/**
 * Azure scope deduplication.
 * Groups by role definition GUID; keeps the assignment at the highest scope.
 * Higher in hierarchy = lower scopeRank number.
 */
function _deduplicateAzure(roles) {
  const map = new Map();
  for (const role of roles) {
    const key  = _roleGuid(role.id);
    const prev = map.get(key);
    if (!prev || _scopeRank(role.scopeId) < _scopeRank(prev.scopeId)) {
      map.set(key, role);
    }
  }
  return [...map.values()];
}

function _roleGuid(id) {
  if (!id) return id;
  const parts = String(id).split('/');
  return parts[parts.length - 1];
}

/** Lower rank = higher in Azure hierarchy */
function _scopeRank(scopeId) {
  if (!scopeId || scopeId === '/') return 0;
  if (/\/providers\/Microsoft\.Management\/managementGroups\//i.test(scopeId)) return 1;
  if (/^\/subscriptions\/[^/]+$/.test(scopeId)) return 2;
  if (/\/resourceGroups\//i.test(scopeId) && !/\/providers\//i.test(scopeId.split('/resourceGroups/')[1] || '')) return 3;
  return 4;
}

function _scopeDisplay(role) {
  if (role.type === 'AzureResource') return role.scope || role.scopeId || '';
  if (role.type === 'Group')         return role.scope || 'Group membership';
  const s = role.scope || role.directoryScopeId || '';
  return (s === '/' || s === 'Directory') ? 'Directory' : s;
}

function _typeBadge(type) {
  const cls = type === 'AzureResource' ? 'badge-azure' : type === 'Group' ? 'badge-group' : 'badge-entra';
  const lbl = type === 'AzureResource' ? 'Azure'       : type === 'Group' ? 'Group'       : 'Entra';
  return '<span class="type-badge ' + cls + '">[' + lbl + ']</span>';
}

function _maxDuration(hours) {
  if (hours == null) return '&ndash;';
  if (hours % 1 === 0) return hours + 'h';
  return Math.round(hours * 60) + 'm';
}

function _polDot(required, letter, colorClass, tooltip) {
  if (required) {
    return '<span class="pol-dot ' + colorClass + '" title="' + tooltip + '">' + letter + '</span>';
  }
  return '<span class="pol-none" title="Not required">&ndash;</span>';
}

function _polMfa(role) {
  if (!role.requiresMfa) return '<span class="pol-none" title="No MFA required">&ndash;</span>';
  const cls = role.authContextId ? 'pol-danger' : 'pol-required';
  const tip = role.authContextId ? 'Auth context: ' + role.authContextId : 'MFA required';
  return '<span class="pol-dot ' + cls + '" title="' + tip + '">MFA</span>';
}

window.roleManager = new RoleManager();