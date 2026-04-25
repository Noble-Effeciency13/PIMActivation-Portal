/**
 * Role renderer — Portal
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * Renders eligible and active role tables.
 * Progressive: Entra+Group rendered first, Azure appended when loaded.
 * Expiry countdown timers update every minute.
 */

/* global graphClient, armClient, policyCache, PolicyCache, portalAuth, escapeHtml, formatExpiry */

class RoleManager {
  constructor() {
    this.eligibleRoles  = [];
    this.activeRoles    = [];
    this.selectedEligible = new Set();
    this.selectedActive   = new Set();
    this._expiryTimers    = [];
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  /**
   * Load all roles. Renders Entra+Group first, then appends Azure.
   */
  async loadRoles() {
    this.eligibleRoles = [];
    this.activeRoles   = [];
    this.selectedEligible.clear();
    this.selectedActive.clear();
    this._stopExpiryTimers();

    // Phase 1: Entra + Group (fast)
    const [entraElig, groupElig, entraActive, groupActive] = await Promise.all([
      graphClient.getEligibleEntraRoles().catch(e => { console.error('[Roles] Entra eligible:', e); return []; }),
      graphClient.getEligibleGroupRoles().catch(e => { console.error('[Roles] Group eligible:', e); return []; }),
      graphClient.getActiveEntraRoles().catch(e    => { console.error('[Roles] Entra active:', e);  return []; }),
      graphClient.getActiveGroupRoles().catch(e    => { console.error('[Roles] Group active:', e);   return []; })
    ]);

    this.eligibleRoles = [...entraElig, ...groupElig];
    this.activeRoles   = [...entraActive, ...groupActive];

    // Enrich with policy data
    await this._enrichWithPolicy();

    this.renderEligibleRoles();
    this.renderActiveRoles();
    this.updateButtons();

    // Phase 2: Azure (may be slower — ARM cold start)
    try {
      const [azureElig, azureActive] = await Promise.all([
        armClient.getEligibleAzureRoles(),
        armClient.getActiveAzureRoles()
      ]);
      this.eligibleRoles = [...this.eligibleRoles, ...azureElig];
      this.activeRoles   = [...this.activeRoles,   ...azureActive];

      this.renderEligibleRoles();
      this.renderActiveRoles();
      this.updateButtons();
    } catch (err) {
      console.warn('[Roles] Azure roles unavailable:', err.message);
    }

    this._startExpiryTimers();
  }

  // ── Policy enrichment ──────────────────────────────────────────────────────

  async _enrichWithPolicy() {
    const account  = portalAuth.getAccount();
    const tenantId = account?.tenantId || account?.idTokenClaims?.tid || 'default';

    await Promise.allSettled(
      this.eligibleRoles.map(async role => {
        try {
          let policy = null;
          if (role.type === 'User') {
            policy = await policyCache.getEntraPolicy(tenantId, role.id, role.directoryScopeId);
          } else if (role.type === 'Group') {
            policy = await policyCache.getGroupPolicy(tenantId, role.groupId || role.id, role.accessId || 'member');
          }
          if (policy) {
            const details = PolicyCache.extractPolicyDetails(policy);
            Object.assign(role, details);
          }
        } catch { /* non-fatal */ }
      })
    );
  }

  // ── Render eligible ────────────────────────────────────────────────────────

  renderEligibleRoles() {
    const tbody = document.getElementById('eligible-roles-body');
    if (!tbody) return;

    const query  = document.getElementById('eligible-search')?.value?.toLowerCase() || '';
    const roles  = this.eligibleRoles.filter(r => _matchesSearch(r, query));

    document.getElementById('eligible-count').textContent = `${roles.length} role(s)`;

    if (roles.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="10">${this.eligibleRoles.length === 0 ? 'No eligible roles found.' : 'No roles match your filter.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = roles.map((role, i) => {
      const uid       = role.uid || role.id;
      const checked   = this.selectedEligible.has(uid) ? 'checked' : '';
      const typeBadge = _typeBadge(role.type);
      const scope     = role.scope || 'Directory';
      const memberType = role.memberType || 'Direct';
      const maxDur    = role.maxDurationHours ? `${role.maxDurationHours}h` : '–';

      return `<tr data-uid="${escapeHtml(uid)}" data-index="${i}">
        <td class="col-check"><label class="check-area"><input type="checkbox" class="eligible-check" data-uid="${escapeHtml(uid)}" ${checked}></label></td>
        <td data-label="Type">${typeBadge}</td>
        <td data-label="Role">${escapeHtml(role.name)}</td>
        <td data-label="Scope">${escapeHtml(scope)}</td>
        <td data-label="Member">${escapeHtml(memberType)}</td>
        <td data-label="Max">${maxDur}</td>
        <td data-label="MFA">${_yesNo(role.requiresMfa)}</td>
        <td data-label="Justification">${_flagHtml(role.requiresJustification)}</td>
        <td data-label="Ticket">${_flagHtml(role.requiresTicket)}</td>
        <td data-label="Approval">${_flagHtml(role.requiresApproval)}</td>
      </tr>`;
    }).join('');

    // Re-attach checkbox listeners
    tbody.querySelectorAll('.eligible-check').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.selectedEligible.add(cb.dataset.uid);
        else            this.selectedEligible.delete(cb.dataset.uid);
        this.updateButtons();
      });
    });
  }

  // ── Render active ──────────────────────────────────────────────────────────

  renderActiveRoles() {
    const tbody = document.getElementById('active-roles-body');
    if (!tbody) return;

    const query = document.getElementById('active-search')?.value?.toLowerCase() || '';
    const roles = this.activeRoles.filter(r => _matchesSearch(r, query));

    document.getElementById('active-count').textContent = `${roles.length} role(s)`;

    if (roles.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${this.activeRoles.length === 0 ? 'No active roles.' : 'No roles match your filter.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = roles.map((role, i) => {
      const uid      = role.uid || role.id;
      const checked  = this.selectedActive.has(uid) ? 'checked' : '';
      const typeBadge = _typeBadge(role.type);
      const resource = role.name;
      const scope    = role.scope || 'Directory';
      const memberType = role.memberType || 'Direct';
      const expiresHtml = role.endDateTime
        ? `<span class="expiry-timer" data-expires="${escapeHtml(role.endDateTime)}">${formatExpiry(role.endDateTime)}</span>`
        : '–';

      return `<tr data-uid="${escapeHtml(uid)}" data-index="${i}">
        <td class="col-check"><label class="check-area"><input type="checkbox" class="active-check" data-uid="${escapeHtml(uid)}" ${checked}></label></td>
        <td data-label="Type">${typeBadge}</td>
        <td data-label="Role">${escapeHtml(resource)}</td>
        <td data-label="Resource">${escapeHtml(resource)}</td>
        <td data-label="Scope">${escapeHtml(scope)}</td>
        <td data-label="Member">${escapeHtml(memberType)}</td>
        <td data-label="Expires">${expiresHtml}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.active-check').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.selectedActive.add(cb.dataset.uid);
        else            this.selectedActive.delete(cb.dataset.uid);
        this.updateButtons();
      });
    });
  }

  // ── Expiry timers ──────────────────────────────────────────────────────────

  _startExpiryTimers() {
    this._stopExpiryTimers();
    const tick = () => {
      document.querySelectorAll('.expiry-timer[data-expires]').forEach(el => {
        el.textContent = formatExpiry(el.dataset.expires);
      });
    };
    this._expiryTimers.push(setInterval(tick, 60000));
  }

  _stopExpiryTimers() {
    this._expiryTimers.forEach(t => clearInterval(t));
    this._expiryTimers = [];
  }

  // ── Button state ───────────────────────────────────────────────────────────

  updateButtons() {
    const activateBtn    = document.getElementById('activate-selected-btn');
    const deactivateBtn  = document.getElementById('deactivate-selected-btn');
    const activateBar    = document.getElementById('eligible-action-bar');
    const deactivateBar  = document.getElementById('active-action-bar');
    const selEligCount   = document.getElementById('selected-eligible-count');
    const selActCount    = document.getElementById('selected-active-count');

    const ne = this.selectedEligible.size;
    const na = this.selectedActive.size;

    if (activateBtn)   activateBtn.disabled   = ne === 0;
    if (deactivateBtn) deactivateBtn.disabled  = na === 0;
    if (activateBar)   activateBar.style.display   = ne > 0 ? 'flex' : 'none';
    if (deactivateBar) deactivateBar.style.display  = na > 0 ? 'flex' : 'none';
    if (selEligCount)  selEligCount.textContent  = `${ne} selected`;
    if (selActCount)   selActCount.textContent   = `${na} selected`;
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

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
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _typeBadge(type) {
  const cls = type === 'AzureResource' ? 'badge-azure' : type === 'Group' ? 'badge-group' : 'badge-user';
  const lbl = type === 'AzureResource' ? 'Azure' : type === 'Group' ? 'Group' : 'Entra';
  return `<span class="type-badge ${cls}">${lbl}</span>`;
}

function _yesNo(val) {
  return val ? '<span class="flag-yes">Yes</span>' : '<span class="flag-no">No</span>';
}

function _flagHtml(val) {
  return val ? '<span class="flag-required">●</span>' : '<span class="flag-not-required">○</span>';
}

function _matchesSearch(role, query) {
  if (!query) return true;
  return [role.name, role.scope, role.type].some(s => s && s.toLowerCase().includes(query));
}

window.roleManager = new RoleManager();
