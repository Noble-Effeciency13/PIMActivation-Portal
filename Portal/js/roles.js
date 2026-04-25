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
    this._pendingRequests = [];
    this.selectedEligible = new Set();
    this.selectedActive   = new Set();
    this._timers          = [];
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async loadRoles() {
    this.eligibleRoles    = [];
    this.activeRoles      = [];
    this._pendingRequests = [];
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

    this._pendingRequests = Array.isArray(pending) ? pending : [];
    this._annotatePending(pending);

    // Render immediately — policy columns show "—" until background enrichment finishes
    this.renderEligible();
    this.renderActive();

    // Policy enrichment runs in background; re-renders both tables when done
    // (active table also needs re-render so AU display names are applied)
    this._enrichPolicy().then(() => { this.renderEligible(); this.renderActive(); }).catch(() => {});

    if (typeof updateProgress === 'function') updateProgress(60, 'Loading Azure roles\u2026');

    // Phase 2: Azure (may take longer — ARM cold start / MFA step-up)
    try {
      const [azureElig, azureActive, azurePending] = await Promise.all([
        armClient.getEligibleAzureRoles(),
        armClient.getActiveAzureRoles(),
        armClient.getPendingAzureRequests().catch(e => { console.warn('[Roles] Azure pending:', e.message); return []; })
      ]);
      const dedupAzureElig   = _deduplicateAzure(azureElig);
      // Active roles: dedup on role+scope so the same assignment doesn't appear
      // twice, but Owner@MG and Owner@Subscription remain separate entries.
      const dedupAzureActive = _deduplicateAzureActive(azureActive);
      this.eligibleRoles = [...this.eligibleRoles, ...dedupAzureElig];
      this.activeRoles   = [...this.activeRoles,   ...dedupAzureActive];
      // Merge Azure pending into the global pending list and re-render
      this._pendingRequests = [...this._pendingRequests, ...azurePending];
      this.renderEligible();
      this.renderActive();
      // Enrich Azure eligible roles with PIM policies (fire-and-forget, same as Entra)
      this._enrichAzurePolicy(dedupAzureElig).then(() => this.renderEligible()).catch(() => {});
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

    // Bulk-fetch all tenant-root Entra policies in one call.
    // This avoids per-role queries that 403 on AU-scoped roles (the caller
    // does not need AU-admin permissions — tenant-root policies cover all
    // role definitions and work for both directory-wide and AU-scoped assignments).
    const policyAssignments = await graphClient.getAllEntraRolePolicies().catch(err => {
      console.warn('[Roles] Entra policy bulk fetch failed:', err.message);
      return [];
    });
    const policyByRoleId = new Map(policyAssignments.map(a => [a.roleDefinitionId, a.policy]));

    for (const role of this.eligibleRoles) {
      if (role.type !== 'User') continue;
      const policy = policyByRoleId.get(role.id);
      if (policy) Object.assign(role, PolicyCache.extractPolicyDetails(policy));
    }

    // Group roles: per-group policy (Group policies aren't scoped the same way)
    await Promise.allSettled(
      this.eligibleRoles
        .filter(r => r.type === 'Group')
        .map(async role => {
          try {
            const policy = await policyCache.getGroupPolicy(tenantId, role.groupId || role.id, role.accessId || 'member');
            if (policy) Object.assign(role, PolicyCache.extractPolicyDetails(policy));
          } catch { /* non-fatal */ }
        })
    );

    // Resolve Administrative Unit display names for AU-scoped Entra roles
    const auIds = [];
    for (const role of this.eligibleRoles) {
      if (role.type !== 'User') continue;
      const m = (role.directoryScopeId || '').match(/\/administrativeUnits\/([a-f0-9-]{36})/i);
      if (m) auIds.push(m[1]);
    }
    if (auIds.length > 0) {
      const resolved = await graphClient.resolveAdministrativeUnits(auIds).catch(() => new Map());
      resolved.forEach((name, id) => _auNames.set(id, name));
    }
  }

  // ── Azure policy enrichment ───────────────────────────────────────────

  async _enrichAzurePolicy(roles) {
    await Promise.allSettled(roles.map(async azureRole => {
      if (!azureRole.scopeId || !azureRole.id) return;
      try {
        const policy = await armClient.getAzureRolePolicy(azureRole.scopeId, azureRole.id);
        if (policy) {
          const live = this.eligibleRoles.find(r => r.uid === azureRole.uid);
          if (live) Object.assign(live, PolicyCache.extractPolicyDetails(policy));
        }
      } catch (err) {
        console.warn('[Roles] Azure policy fetch failed for', azureRole.name, err.message);
      }
    }));
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
      tbody.innerHTML = '<tr class="row-placeholder"><td colspan="9">' + msg + '</td></tr>';
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

      // Human-readable policy values for the mobile expand panel
      const maxText     = role.maxDurationHours != null
        ? (role.maxDurationHours % 1 === 0 ? role.maxDurationHours + 'h' : Math.round(role.maxDurationHours * 60) + 'm')
        : 'Loading\u2026';
      const mfaText     = role.requiresMfa          ? 'Required'     : 'Not required';
      const authCtxText = role.requiresAuthContext
        ? (role.authContextId ? escapeHtml(role.authContextId) : 'Required')
        : 'Not required';

      const mainRow =
        '<tr class="' + selCls + '" data-uid="' + escapeHtml(uid) + '">' +
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
          '<td class="col-expand">' +
            '<button class="expand-btn" data-uid="' + escapeHtml(uid) + '" aria-label="Show policy details" aria-expanded="false">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
                '<polyline points="6 9 12 15 18 9"/>' +
              '</svg>' +
            '</button>' +
          '</td>' +
        '</tr>';

      const detailRow =
        '<tr class="row-detail" data-detail-uid="' + escapeHtml(uid) + '" hidden>' +
          '<td colspan="99">' +
            '<div class="policy-detail">' +
              '<span class="pd-label">Max duration</span><span class="pd-value">' + maxText + '</span>' +
              '<span class="pd-label">MFA</span><span class="pd-value">' + mfaText + '</span>' +
              '<span class="pd-label">Auth Context</span><span class="pd-value">' + authCtxText + '</span>' +
              '<span class="pd-label">Justification</span><span class="pd-value">' + (role.requiresJustification ? 'Required' : 'Not required') + '</span>' +
              '<span class="pd-label">Ticket</span><span class="pd-value">' + (role.requiresTicket ? 'Required' : 'Not required') + '</span>' +
              '<span class="pd-label">Approval</span><span class="pd-value">' + (role.requiresApproval ? 'Required' : 'Not required') + '</span>' +
            '</div>' +
          '</td>' +
        '</tr>';

      return mainRow + detailRow;
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

    // Wire expand buttons — tap to reveal policy panel on mobile
    tbody.querySelectorAll('.expand-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const detail = tbody.querySelector('.row-detail[data-detail-uid="' + btn.dataset.uid + '"]');
        if (!detail) return;
        const isOpen = !detail.hidden;
        detail.hidden = isOpen;
        btn.classList.toggle('open', !isOpen);
        btn.setAttribute('aria-expanded', String(!isOpen));
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
    const n     = roles.length;

    // Build awaiting-approval ghost rows: pending requests matched to eligible roles
    const seenPending = new Set();
    const pendingRoles = [];
    for (const req of (this._pendingRequests || [])) {
      let match;
      if (req.type === 'AzureResource') {
        // Azure: match on roleDefinitionId GUID + scopeId
        const reqGuid = (req.roleDefinitionId || '').split('/').pop().toLowerCase();
        match = this.eligibleRoles.find(r =>
          r.type === 'AzureResource' &&
          (r.id || '').split('/').pop().toLowerCase() === reqGuid &&
          (!req.scopeId || r.scopeId === req.scopeId)
        );
        // Fallback: match on GUID only (scope-agnostic) if no scope match
        if (!match && reqGuid) {
          match = this.eligibleRoles.find(r =>
            r.type === 'AzureResource' &&
            (r.id || '').split('/').pop().toLowerCase() === reqGuid
          );
        }
      } else if (req.type === 'User') {
        // Entra: match on roleDefinitionId + directoryScopeId when available
        match = this.eligibleRoles.find(r =>
          r.type === 'User' &&
          r.id === req.roleId &&
          (!req.directoryScopeId || r.directoryScopeId === req.directoryScopeId)
        );
        // Fallback: match on roleId only
        if (!match) {
          match = this.eligibleRoles.find(r => r.type === 'User' && r.id === req.roleId);
        }
      } else if (req.type === 'Group') {
        match = this.eligibleRoles.find(r =>
          r.type === 'Group' &&
          (r.groupId || r.id) === req.groupId &&
          (r.accessId || 'member') === (req.accessId || 'member')
        );
      }
      const key = match && (match.uid || match.id) + ':' + (match.scopeId || match.directoryScopeId || '');
      if (match && key && !seenPending.has(key)) {
        seenPending.add(key);
        // Build a display object — for Azure pending we have name/scope directly on req
        const displayRole = req.type === 'AzureResource' && !match
          ? { uid: req.roleDefinitionId + ':' + req.scopeId, type: req.type, name: req.name, scope: req.scope, scopeId: req.scopeId }
          : match;
        pendingRoles.push(displayRole);
      }
    }
    const filteredPending = query
      ? pendingRoles.filter(r => [r.name, _scopeDisplay(r), r.type].some(s => s && s.toLowerCase().includes(query)))
      : pendingRoles;
    const totalShown = n + filteredPending.length;

    document.getElementById('active-count').textContent = totalShown + ' role' + (totalShown !== 1 ? 's' : '');

    if (totalShown === 0) {
      const msg = (this.activeRoles.length === 0 && !this._pendingRequests?.length)
        ? 'No active roles.' : 'No roles match your search.';
      tbody.innerHTML = '<tr class="row-placeholder"><td colspan="4">' + msg + '</td></tr>';
      this._updateBars();
      return;
    }

    const mainHtml = roles.map(role => {
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

    const pendingHtml = filteredPending.map(role => {
      const badge = _typeBadge(role.type);
      return '<tr class="row-awaiting-approval" data-uid="' + escapeHtml(role.uid || role.id) + '">' +
        '<td class="col-cb"><label class="cb-wrap">' +
          '<input type="checkbox" disabled aria-label="' + escapeHtml(role.name) + ' (awaiting approval)">' +
        '</label></td>' +
        '<td class="col-type" data-label="Type">' + badge + '</td>' +
        '<td class="col-role" data-label="Role"><div class="role-cell">' +
          '<span class="role-name">' + escapeHtml(role.name) + '</span>' +
          '<span class="role-scope">' + escapeHtml(_scopeDisplay(role)) + '</span>' +
          '<span class="awaiting-tag">Awaiting approval</span>' +
        '</div></td>' +
        '<td class="col-expires"></td>' +
      '</tr>';
    }).join('');

    tbody.innerHTML = mainHtml + pendingHtml;

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

/**
 * Active Azure role deduplication.
 * Keys on roleGuid + scopeId so the same assignment never appears twice,
 * but the same role at different scopes (e.g. Owner@MG vs Owner@Subscription)
 * are kept as separate entries.
 */
function _deduplicateAzureActive(roles) {
  const seen = new Map();
  for (const role of roles) {
    const key = `${_roleGuid(role.id)}:${role.scopeId || ''}`;
    if (!seen.has(key)) seen.set(key, role);
  }
  return [...seen.values()];
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
  if (s === '/' || s === 'Directory') return 'Directory';
  // Resolve Administrative Unit GUIDs to human-readable names
  const auMatch = typeof s === 'string' && s.match(/\/administrativeUnits\/([a-f0-9-]{36})/i);
  if (auMatch) {
    const name = _auNames.get(auMatch[1]);
    return 'Administrative Unit: ' + (name || auMatch[1]);
  }
  return s;
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
  const parts = [];
  if (role.requiresMfa) {
    parts.push('<span class="pol-dot pol-required" title="MFA required">MFA</span>');
  }
  if (role.requiresAuthContext) {
    const tip = role.authContextId ? 'Auth context: ' + escapeHtml(role.authContextId) : 'Auth context required';
    parts.push('<span class="pol-dot pol-auth-ctx" title="' + escapeHtml(tip) + '">AC</span>');
  }
  if (parts.length === 0) return '<span class="pol-none" title="No MFA or auth context required">&ndash;</span>';
  return '<div class="pol-mfa-cell">' + parts.join('') + '</div>';
}

// Module-level map for Administrative Unit display names (populated during _enrichPolicy)
const _auNames = new Map(); // GUID → displayName

window.roleManager = new RoleManager();