/**
 * app.js — Bootstrap & UI orchestration
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 */

/* global msal, portalAuth, roleManager, batchClient, armClient */

// ── Globals exposed for roles.js / templates ──────────────────────────────────

// ── Settings & Feature Flags ──────────────────────────────────────────────────
const FLAGS_KEY = 'pim-portal-flags';
const PENDING_ACTIVATION_KEY = 'pim-portal-pending-activation';
const _flags = {
  entra:               true,
  azure:               true,
  group:               true,
  defaultDuration:     8,
  showActiveInEligible: false,
  swapSections:         true,
  persistSectionState:  true,
  persistFilterBarState: true,
  quickAppearance:      true,
  showInactivePolicies: true,
  quickInactivePolicies: true,
  tenantScopedProfiles:  true,
  ...JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}')
};

_applyInactivePolicies();

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatExpiry(dateString) {
  if (!dateString) return '';
  const diff = Math.max(0, new Date(dateString).getTime() - Date.now());
  if (diff === 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 23) {
    const d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  }
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function formatExpiryDateTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return hh + ':' + mm + ' ' + dd + '-' + mo + '-' + yyyy;
}

// ── Toast & notification history ──────────────────────────────────────────────

const _toastHistory = [];
let _unreadCount = 0;

const _TOAST_ICONS = {
  success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

function _updateNotificationsBadge() {
  const badge = document.getElementById('notifications-badge');
  if (badge) badge.hidden = _unreadCount === 0;
}

/**
 * Show a toast notification.
 * Accepts either:
 *   showToast({ title, description?, type?, duration?, debugInfo?, activityDetails?, noHistory? })
 *   showToast(title, type?, duration?)   ← legacy positional form
 */
function showToast(msgOrOpts, type = 'info', duration = 5000) {
  let title, description, actualType, actualDuration, debugInfo, activityDetails, noHistory;

  if (msgOrOpts && typeof msgOrOpts === 'object') {
    title         = msgOrOpts.title       || '';
    description   = msgOrOpts.description || '';
    actualType    = msgOrOpts.type        || msgOrOpts.tone || 'info';
    actualDuration = msgOrOpts.duration   || 5000;
    debugInfo     = msgOrOpts.debugInfo;
    activityDetails = msgOrOpts.activityDetails;
    noHistory     = !!msgOrOpts.noHistory;
  } else {
    title         = msgOrOpts || '';
    description   = '';
    actualType    = type;
    actualDuration = duration;
    debugInfo     = undefined;
    activityDetails = undefined;
    noHistory     = false;
  }

  if (!noHistory) {
    _toastHistory.push({ title, description, type: actualType, time: new Date(), debugInfo, activityDetails });
    _unreadCount++;
    _updateNotificationsBadge();
  }

  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast toast-' + actualType + ' fade-in';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'toast-icon-wrap';
  iconWrap.innerHTML = _TOAST_ICONS[actualType] || _TOAST_ICONS.info;

  const body = document.createElement('div');
  body.className = 'toast-body';
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;
  body.appendChild(titleEl);
  if (description) {
    const descEl = document.createElement('div');
    descEl.className = 'toast-desc';
    descEl.textContent = description;
    body.appendChild(descEl);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'toast-dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  el.appendChild(iconWrap);
  el.appendChild(body);
  el.appendChild(dismissBtn);
  container.appendChild(el);

  const timer = setTimeout(() => el.remove(), actualDuration);
  dismissBtn.addEventListener('click', () => { el.remove(); clearTimeout(timer); }, { once: true });
}

// ── Notifications modal ───────────────────────────────────────────────────────

function showNotificationsModal() {
  const modal = document.getElementById('notifications-modal');
  if (!modal) return;
  _unreadCount = 0;
  _updateNotificationsBadge();
  _renderNotificationsList();
  modal.hidden = false;
  modal.querySelector('.modal')?.classList.add('fade-in');
}

function _formatRoleOutcomeList(roles, results, successLabel = 'Activated') {
  if (!results || !results.length) return '';
  
  const formatRole = r => {
    const role = roles.find(pr => (pr.uid || pr.id) === r.uid);
    if (!role) return r.uid;
    const scope = _scopeDisplayForModal(role);
    const scopeSuffix = (scope && scope !== 'Directory' && scope !== 'Group membership') ? ` [${scope}]` : '';
    return role.name + scopeSuffix;
  };

  const succeeded = results.filter(r => r.success && !r.pendingApproval).map(formatRole);
  const pending   = results.filter(r => r.pendingApproval).map(formatRole);

  const failed = results.filter(r => !r.success).map(r => {
    const role = roles.find(pr => (pr.uid || pr.id) === r.uid);
    const name = role ? formatRole(r) : r.uid;
    return name + (r.error ? ` (${r.error})` : '');
  });

  let msg = '';
  if (succeeded.length) msg += 'Activated: ' + succeeded.join(', ');
  if (pending.length) {
    if (msg) msg += '\n';
    msg += 'Pending approval: ' + pending.join(', ');
  }
  if (failed.length) {
    if (msg) msg += '\n';
    msg += 'Failed: ' + failed.join(', ');
  }
  return msg;
}

function _formatHistoryDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function _formatDurationMinutes(totalMinutes) {
  const minutes = Number(totalMinutes) || 0;
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return h + 'h ' + m + 'm';
  if (h) return h + 'h';
  return m + 'm';
}

function _activitySurfaceLabel(role) {
  if (!role) return '';
  if (role.type === 'AzureResource') return 'Azure';
  if (role.type === 'Group') return 'Group';
  return 'Entra';
}

function _buildRoleActivityDetails(roles, results, opts = {}) {
  const outcomeResults = results || [];
  const succeeded = outcomeResults.filter(r => r.success).length;
  const failed = outcomeResults.filter(r => !r.success).length;
  const pendingApproval = outcomeResults.filter(r => r.pendingApproval).length;
  const resultRows = outcomeResults.map(result => {
    const role = roles.find(r => (r.uid || r.id) === result.uid);
    const scope = role ? _scopeDisplayForModal(role) : '';
    const durationMinutes = role?._effectiveDurationMinutes || opts.durationMinutes || 0;
    return {
      name: role?.name || result.uid,
      scope,
      surface: _activitySurfaceLabel(role),
      status: result.pendingApproval ? 'Awaiting approval' : (result.success ? 'Succeeded' : 'Failed'),
      tone: result.pendingApproval ? 'pending' : (result.success ? 'success' : 'error'),
      statusCode: result.status || '',
      error: result.error || '',
      submittedAt: result.activatedAt || result.deactivatedAt || '',
      scheduledFor: result.scheduledFor || opts.scheduledStartDateTime || '',
      duration: opts.action === 'deactivate' ? '' : _formatDurationMinutes(durationMinutes)
    };
  });

  return {
    action: opts.action || 'activate',
    label: opts.label || 'Activation',
    submittedAt: new Date().toISOString(),
    total: outcomeResults.length || roles.length,
    succeeded,
    failed,
    pendingApproval,
    scheduledFor: opts.scheduledStartDateTime || '',
    duration: opts.action === 'deactivate' ? '' : _formatDurationMinutes(opts.durationMinutes),
    ticketNumber: opts.ticketNumber || '',
    justification: opts.justification || '',
    rows: resultRows
  };
}

function _renderActivityDetails(details) {
  if (!details) return '';
  const metaItems = [
    ['Action', details.label || 'Activity'],
    ['Submitted', _formatHistoryDateTime(details.submittedAt)],
    ['Total', String(details.total || 0)],
    ['Succeeded', String(details.succeeded || 0)],
    ['Failed', String(details.failed || 0)]
  ];
  if (details.pendingApproval) metaItems.push(['Approval', String(details.pendingApproval) + ' pending']);
  if (details.scheduledFor) metaItems.push(['Start', _formatHistoryDateTime(details.scheduledFor)]);
  if (details.duration) metaItems.push(['Duration', details.duration]);
  if (details.ticketNumber) metaItems.push(['Ticket', details.ticketNumber]);
  if (details.justification) metaItems.push(['Reason', details.justification]);

  const metaHtml = metaItems.map(([label, value]) =>
    '<span class="notif-meta-pill"><span>' + escapeHtml(label) + '</span>' + escapeHtml(value) + '</span>'
  ).join('');

  const rowsHtml = (details.rows || []).map(row => {
    const subItems = [];
    if (row.surface) subItems.push(row.surface);
    if (row.scope && row.scope !== 'Directory' && row.scope !== 'Group membership') subItems.push(row.scope);
    if (row.duration) subItems.push(row.duration);
    if (row.scheduledFor) subItems.push('Starts ' + _formatHistoryDateTime(row.scheduledFor));
    if (row.statusCode) subItems.push('HTTP ' + row.statusCode);

    return '<li class="notif-role-row">' +
      '<span class="notif-role-status notif-role-status-' + escapeHtml(row.tone || 'info') + '">' + escapeHtml(row.status || '') + '</span>' +
      '<div class="notif-role-main">' +
        '<div class="notif-role-name">' + escapeHtml(row.name) + '</div>' +
        (subItems.length ? '<div class="notif-role-meta">' + escapeHtml(subItems.join(' · ')) + '</div>' : '') +
        (row.error ? '<div class="notif-role-error">' + escapeHtml(row.error) + '</div>' : '') +
      '</div>' +
    '</li>';
  }).join('');

  return '<div class="notif-activity">' +
    '<div class="notif-meta-grid">' + metaHtml + '</div>' +
    (rowsHtml ? '<ul class="notif-role-list">' + rowsHtml + '</ul>' : '') +
  '</div>';
}

function hideNotificationsModal() {
  const modal = document.getElementById('notifications-modal');
  if (modal) modal.hidden = true;
}

function _renderNotificationsList() {
  const body = document.getElementById('notifications-modal-body');
  if (!body) return;

  if (_toastHistory.length === 0) {
    body.innerHTML = '<p class="notif-empty">No activity in this session yet.</p>';
    return;
  }

  const items = [..._toastHistory].reverse().map((n, idx) => {
    const timeStr = n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = n.time.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const icon = _TOAST_ICONS[n.type] || _TOAST_ICONS.info;
    const debugId = 'notif-debug-' + idx;

    return '<div class="notif-item">' +
      '<div class="notif-icon-wrap notif-icon-' + escapeHtml(n.type) + '">' + icon + '</div>' +
      '<div class="notif-content">' +
        '<div class="notif-row-top">' +
          '<span class="notif-title">' + escapeHtml(n.title) + '</span>' +
          '<span class="notif-time">' + escapeHtml(timeStr) + '</span>' +
        '</div>' +
        (n.description ? '<div class="notif-desc">' + escapeHtml(n.description) + '</div>' : '') +
        '<div class="notif-date">' + escapeHtml(dateStr) + '</div>' +
        _renderActivityDetails(n.activityDetails) +
        (n.debugInfo
          ? '<button class="notif-copy-btn" data-debug-id="' + escapeHtml(debugId) + '">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              'Copy details' +
            '</button>' +
            '<pre class="notif-debug" id="' + escapeHtml(debugId) + '" hidden>' + escapeHtml(JSON.stringify(n.debugInfo, null, 2)) + '</pre>'
          : '') +
      '</div>' +
    '</div>';
  }).join('');

  body.innerHTML = '<div class="notif-list">' + items + '</div>';

  // Wire copy buttons
  body.querySelectorAll('.notif-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pre = document.getElementById(btn.dataset.debugId);
      if (pre) navigator.clipboard?.writeText(pre.textContent).then(() => {
        const original = btn.innerHTML;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.innerHTML = original; }, 2000);
      });
    });
  });
}

// ── Progress status (spinning refresh button) ────────────────────────────────

function showProgress(label) {
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.classList.add('spinning');
    const status = label || 'Loading…';
    btn.dataset.status = status;
    btn.setAttribute('aria-label', status);
  }
}

function updateProgress(pct, label) {
  const btn = document.getElementById('refresh-btn');
  if (btn && label) {
    btn.dataset.status = label;
    btn.setAttribute('aria-label', label);
  }
}

function hideProgress() {
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.classList.remove('spinning');
    delete btn.dataset.status;
    btn.setAttribute('aria-label', 'Refresh roles');
  }
}

// ── Operation overlay (activation / deactivation) ─────────────────────────────

const _opOverlay = {
  _el:       null,
  _titleEl:  null,
  _fillEl:   null,
  _listEl:   null,
  _headerEl: null,
  _total:    0,
  _done:     0,

  _init() {
    if (this._el) return;
    this._el       = document.getElementById('op-overlay');
    this._titleEl  = document.getElementById('op-overlay-title');
    this._fillEl   = document.getElementById('op-progress-fill');
    this._listEl   = document.getElementById('op-role-list');
    this._headerEl = this._el?.querySelector('.op-header');
  },

  /** Open the overlay and populate a row per role (all spinning). */
  open(title, roles) {
    this._init();
    if (!this._el) return;
    this._total = roles.length;
    this._done  = 0;

    this._titleEl.textContent = title;
    this._headerEl.classList.remove('op-done');
    this._fillEl.style.width = '0%';
    this._fillEl.classList.remove('op-fill-done');

    this._listEl.innerHTML = roles.map(r => {
      const scope = r._activationScopeDisplay || roleManager.getScopeDisplay(r);
      return '<li class="op-role-item" data-uid="' + escapeHtml(r.uid || r.id) + '">' +
        '<span class="op-status-icon" aria-label="In progress"></span>' +
        '<span class="op-role-info">' +
          '<div class="op-role-name">'  + escapeHtml(r.name || r.id) + '</div>' +
          (scope ? '<div class="op-role-scope">' + escapeHtml(scope) + '</div>' : '') +
        '</span>' +
      '</li>';
    }).join('');

    this._el.hidden = false;
  },

  /** Update a single row after its result comes in. */
  update(result) {
    this._init();
    if (!this._el) return;
    const row = this._listEl?.querySelector('[data-uid="' + CSS.escape(result.uid) + '"]');
    if (row) {
      const icon = row.querySelector('.op-status-icon');
      if (icon) {
        if (result.pendingApproval) {
          icon.className = 'op-status-icon op-icon-pending';
          icon.setAttribute('aria-label', 'Awaiting approval');
        } else if (result.success) {
          icon.className = 'op-status-icon op-icon-ok';
          icon.setAttribute('aria-label', 'Completed');
        } else {
          icon.className = 'op-status-icon op-icon-fail';
          icon.setAttribute('aria-label', 'Failed');
        }
      }
    }
    this._done++;
    const pct = this._total > 0 ? (this._done / this._total) * 100 : 100;
    this._fillEl.style.width = pct + '%';
  },

  /** Mark the operation complete, briefly show the final state, then close. */
  close(delay = 1400) {
    this._init();
    if (!this._el) return;
    this._fillEl.style.width = '100%';
    this._fillEl.classList.add('op-fill-done');
    this._headerEl?.classList.add('op-done');
    setTimeout(() => {
      if (this._el) this._el.hidden = true;
    }, delay);
  }
};

// ── Section order & collapse ───────────────────────────────────────────────────

const SECTION_STATE_KEY  = 'pim-portal-section-states';

// ── Quick filters ─────────────────────────────────────────────────────────────
const QUICK_FILTERS_KEY         = 'pim-portal-quick-filters';
const ACTIVE_QUICK_FILTERS_KEY  = 'pim-portal-active-quick-filters';
const FILTER_BAR_STATE_KEY      = 'pim-portal-filter-bar-open';
const ACTIVE_FILTER_BAR_STATE_KEY = 'pim-portal-active-filter-bar-open';

let _filterBarOpen       = false;
let _activeFilterBarOpen = false;

function _applyFilterBarState() {
  const bar = document.getElementById('eligible-filter-bar');
  bar?.classList.toggle('filter-bar-hidden', !_filterBarOpen);
  const btn = document.getElementById('filter-toggle-btn');
  if (btn) {
    btn.classList.toggle('active', _filterBarOpen);
    btn.setAttribute('aria-expanded', String(_filterBarOpen));
  }
}

function _applyActiveFilterBarState() {
  const bar = document.getElementById('active-filter-bar');
  bar?.classList.toggle('filter-bar-hidden', !_activeFilterBarOpen);
  const btn = document.getElementById('active-filter-toggle-btn');
  if (btn) {
    btn.classList.toggle('active', _activeFilterBarOpen);
    btn.setAttribute('aria-expanded', String(_activeFilterBarOpen));
  }
}

function _getQuickFilters() {
  try { return JSON.parse(localStorage.getItem(QUICK_FILTERS_KEY) || '[]'); } catch { return []; }
}
function _saveQuickFilters(filters) {
  localStorage.setItem(QUICK_FILTERS_KEY, JSON.stringify(filters));
}
function _addQuickFilter(query) {
  const label = query.trim();
  if (!label) return;
  const filters = _getQuickFilters();
  if (filters.some(f => f.query.toLowerCase() === label.toLowerCase())) return;
  filters.push({ id: 'qf-' + Date.now(), label, query: label });
  _saveQuickFilters(filters);
}
function _deleteQuickFilter(id) {
  _saveQuickFilters(_getQuickFilters().filter(f => f.id !== id));
}

function _getActiveQuickFilters() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_QUICK_FILTERS_KEY) || '[]'); } catch { return []; }
}
function _saveActiveQuickFilters(filters) {
  localStorage.setItem(ACTIVE_QUICK_FILTERS_KEY, JSON.stringify(filters));
}
function _addActiveQuickFilter(query) {
  const label = query.trim();
  if (!label) return;
  const filters = _getActiveQuickFilters();
  if (filters.some(f => f.query.toLowerCase() === label.toLowerCase())) return;
  filters.push({ id: 'aqf-' + Date.now(), label, query: label });
  _saveActiveQuickFilters(filters);
}
function _deleteActiveQuickFilter(id) {
  _saveActiveQuickFilters(_getActiveQuickFilters().filter(f => f.id !== id));
}

function _applyInactivePolicies() {
  document.body.classList.toggle('show-inactive-policies', !!_flags.showInactivePolicies);
}

function _applySectionOrder() {
  document.querySelector('.app-main')?.classList.toggle('sections-swapped', !!_flags.swapSections);
}

function _getSectionStates() {
  try { return JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || '{}'); } catch { return {}; }
}

function _setSectionCollapsed(id, collapsed) {
  const section = document.getElementById(id);
  if (!section) return;
  section.classList.toggle('collapsed', collapsed);
  const btn = section.querySelector('.section-collapse-btn');
  if (btn) {
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
  }
}

function _toggleSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  const collapsed = !section.classList.contains('collapsed');
  _setSectionCollapsed(id, collapsed);
  if (_flags.persistSectionState) {
    const states = _getSectionStates();
    states[id] = collapsed;
    localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(states));
  }
}

function _applyInitialSectionStates() {
  const ids = ['section-active', 'section-eligible'];
  if (_flags.persistSectionState) {
    const states = _getSectionStates();
    ids.forEach(id => _setSectionCollapsed(id, !!states[id]));
  } else {
    ids.forEach(id => _setSectionCollapsed(id, false));
  }
}

// ── Consent banner ────────────────────────────────────────────────────────────

function showConsentBanner(err) {
  const msg = err?.message || '';
  const isConsentError = /AADSTS65001|interaction_required|consent_required|invalid_grant|unauthorized|forbidden|401|403/i.test(msg);
  if (!isConsentError) return;
  const banner = document.getElementById('consent-banner');
  if (banner) banner.hidden = false;
}

async function _grantAzureAccess() {
  const btn = document.getElementById('consent-grant-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in\u2026'; }
  try {
    await portalAuth.grantArmConsent();
    const banner = document.getElementById('consent-banner');
    if (banner) banner.hidden = true;
    showToast({ title: 'Access granted', description: 'Azure roles will now be loaded.', type: 'success' });
    await _refresh();
  } catch (err) {
    showToast({ title: 'Consent failed', description: err.message, type: 'error' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Grant Access'; }
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEME_KEY = 'pim-portal-theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(saved);
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  
  // Update Settings UI
  document.querySelectorAll('#settings-modal .theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === theme);
  });
  
  localStorage.setItem(THEME_KEY, theme);
  _renderQuickActions();
}

function showSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  // Sync pill buttons
  modal.querySelectorAll('.flag-pill').forEach(btn => {
    const active = _flags[btn.dataset.flag] !== false;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  // Sync default duration
  const durInput = document.getElementById('settings-default-duration');
  if (durInput) durInput.value = _flags.defaultDuration ?? 8;

  // Sync toggle switches
  [
    ['flag-show-active',        'showActiveInEligible'],
    ['flag-show-inactive',      'showInactivePolicies'],
    ['flag-swap-sections',      'swapSections'],
    ['flag-persist-sections',   'persistSectionState'],
    ['flag-persist-filter-bar', 'persistFilterBarState'],
    ['flag-tenant-profiles',    'tenantScopedProfiles'],
  ].forEach(([id, key]) => {
    const btn = document.getElementById(id);
    if (btn) {
      const on = !!_flags[key];
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', on);
    }
  });

  // Sync checkboxes
  const quickAppCb = document.getElementById('flag-quick-appearance');
  if (quickAppCb) quickAppCb.checked = !!_flags.quickAppearance;

  const quickInactCb = document.getElementById('flag-quick-inactive');
  if (quickInactCb) quickInactCb.checked = !!_flags.quickInactivePolicies;

  modal.hidden = false;
  modal.querySelector('.modal')?.classList.add('fade-in');
}

function hideSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.hidden = true;
  // Always collapse the confirmation row so it's gone next time the modal opens
  document.getElementById('settings-reset-btn')?.removeAttribute('hidden');
  const confirm = document.getElementById('settings-reset-confirm');
  if (confirm) confirm.hidden = true;
}

// ── Tenant picker ─────────────────────────────────────────────────────────────

const TENANT_CACHE_KEY = 'pim-portal-tenant-cache';

function _getTenantCache() {
  try { return JSON.parse(localStorage.getItem(TENANT_CACHE_KEY) || '{}'); } catch { return {}; }
}

function _updateTenantCache(tenants) {
  const cache = {};
  tenants.forEach(t => { cache[t.tenantId] = t; });
  localStorage.setItem(TENANT_CACHE_KEY, JSON.stringify(cache));
}

function _updateTenantDisplay(account) {
  const tenantEl = document.getElementById('user-tenant');
  if (!tenantEl) return;
  const tenantId   = account?.tenantId || account?.idTokenClaims?.tid || '';
  const cached     = _getTenantCache()[tenantId];
  if (cached?.displayName) {
    tenantEl.innerHTML =
      '<span class="uc-tenant-name">' + escapeHtml(cached.displayName) + '</span>' +
      '<span class="uc-tenant-id">'   + escapeHtml(tenantId) + '</span>';
  } else {
    tenantEl.textContent = tenantId;
  }
}

function _closeTenantPicker() {
  const modal = document.getElementById('tenant-picker-modal');
  if (modal) modal.hidden = true;
}

async function _openTenantPicker() {
  const modal = document.getElementById('tenant-picker-modal');
  const body  = document.getElementById('tenant-picker-body');
  if (!modal || !body) return;

  body.innerHTML = '<p class="tenant-picker-hint">Loading tenants…</p>';
  modal.hidden = false;
  modal.querySelector('.modal')?.classList.add('fade-in');

  try {
    const tenants = await armClient.getAccessibleTenants();
    _renderTenantList(body, tenants);
  } catch (err) {
    body.innerHTML =
      '<p class="tenant-picker-hint tenant-picker-error">Could not load tenants: ' +
      escapeHtml(err.message) + '</p>';
  }
}

function _renderTenantList(body, tenants) {
  const currentTenantId = portalAuth.getAccount()?.tenantId || '';

  // Cache names so the profile card can show the display name
  _updateTenantCache(tenants);
  _updateTenantDisplay(portalAuth.getAccount());

  if (tenants.length === 0) {
    body.innerHTML = '<p class="tenant-picker-hint">No other tenants found.</p>';
    return;
  }

  // Current tenant first, then alphabetical
  const sorted = [...tenants].sort((a, b) => {
    if (a.tenantId === currentTenantId) return -1;
    if (b.tenantId === currentTenantId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  body.innerHTML = sorted.map(t => {
    const isCurrent = t.tenantId === currentTenantId;
    return (
      '<button class="tenant-item' + (isCurrent ? ' tenant-item-current' : '') + '"' +
        ' data-tenant-id="' + escapeHtml(t.tenantId) + '"' +
        (isCurrent ? ' disabled aria-current="true"' : '') +
        ' title="' + escapeHtml(t.defaultDomain || t.tenantId) + '">' +
        '<div class="tenant-item-info">' +
          '<div class="tenant-item-name">' + escapeHtml(t.displayName) + '</div>' +
          '<div class="tenant-item-domain">' + escapeHtml(t.defaultDomain || t.tenantId) + '</div>' +
        '</div>' +
        (isCurrent
          ? '<span class="tenant-item-badge">Current</span>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>') +
      '</button>'
    );
  }).join('');

  body.querySelectorAll('.tenant-item:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tenantId = btn.dataset.tenantId;
      btn.disabled = true;
      btn.innerHTML = '<span class="tenant-item-switching">Switching…</span>';
      try {
        await portalAuth.switchTenant(tenantId);
        // Page navigates away — code below only runs if something went wrong
      } catch (err) {
        showToast({ title: 'Tenant switch failed', description: err.message, type: 'error' });
        _closeTenantPicker();
      }
    });
  });
}

function _renderQuickActions() {
  const container = document.getElementById('header-quick-actions');
  if (!container) return;

  if (!_flags.quickAppearance) {
    container.innerHTML = '';
    return;
  }

  // Always use the sun icon for Appearance quick setting
  const icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  container.innerHTML = `
    ${_flags.quickInactivePolicies ? `<div class="quick-action-wrap">
      <button class="icon-btn ${_flags.showInactivePolicies ? 'active' : ''}" id="quick-labels-btn" aria-label="Toggle Inactive Labels" title="Toggle Inactive Labels" aria-pressed="${!!_flags.showInactivePolicies}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>` : ''}
    <div class="quick-action-wrap">
      <button class="icon-btn" id="quick-theme-btn" aria-label="Appearance" title="Appearance (Quick Action)">
        ${icon}
      </button>
      <div class="quick-dropdown" id="quick-theme-dropdown" hidden>
        <button class="quick-dropdown-item" data-theme="system">System default</button>
        <button class="quick-dropdown-item" data-theme="dark">Dark</button>
        <button class="quick-dropdown-item" data-theme="light">Light</button>
        <button class="quick-dropdown-item" data-theme="hc">High Contrast</button>
      </div>
    </div>
  `;

  const btn = document.getElementById('quick-theme-btn');
  const dropdown = document.getElementById('quick-theme-dropdown');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });

  dropdown?.querySelectorAll('.quick-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      applyTheme(item.dataset.theme);
      dropdown.hidden = true;
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.hidden && !e.target.closest('.quick-action-wrap')) {
      dropdown.hidden = true;
    }
  });

  const labelsBtn = document.getElementById('quick-labels-btn');
  if (labelsBtn) {
    labelsBtn.addEventListener('click', () => {
      _flags.showInactivePolicies = !_flags.showInactivePolicies;
      localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
      _applyInactivePolicies();
      labelsBtn.classList.toggle('active', _flags.showInactivePolicies);
      labelsBtn.setAttribute('aria-pressed', _flags.showInactivePolicies);
      const sw = document.getElementById('flag-show-inactive');
      if (sw) {
        sw.classList.toggle('active', _flags.showInactivePolicies);
        sw.setAttribute('aria-checked', _flags.showInactivePolicies);
      }
    });
  }
}

function _saveFlag(key, checked) {
  _flags[key] = checked;
  localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
  showToast({ title: 'Settings saved', description: 'Refreshing roles…', type: 'info', noHistory: true, duration: 2000 });
  _refresh();
}

// ── Activation modal ──────────────────────────────────────────────────────────

let _pendingRoles = [];
let _azureScopeSelections = new Map();
const SCHEDULE_MIN_LEAD_MS = 60 * 1000;
const SCHEDULE_DEFAULT_STEP_MINUTES = 15;

function _formatDateTimeLocal(date) {
  const pad = value => String(value).padStart(2, '0');
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes());
}

function _getScheduleMinDate() {
  const minimumDate = new Date(Date.now() + SCHEDULE_MIN_LEAD_MS);
  if (minimumDate.getSeconds() || minimumDate.getMilliseconds()) {
    minimumDate.setMinutes(minimumDate.getMinutes() + 1);
  }
  minimumDate.setSeconds(0, 0);
  return minimumDate;
}

function _getDefaultScheduleDate() {
  const stepMs = SCHEDULE_DEFAULT_STEP_MINUTES * 60 * 1000;
  return new Date(Math.ceil(_getScheduleMinDate().getTime() / stepMs) * stepMs);
}

function _isScheduleEnabled() {
  return document.getElementById('schedule-toggle-btn')?.getAttribute('aria-pressed') === 'true';
}

function _setScheduleControls(enabled) {
  const btn = document.getElementById('schedule-toggle-btn');
  const row = document.getElementById('schedule-start-row');
  const input = document.getElementById('schedule-start-input');
  const confirmBtn = document.getElementById('modal-confirm-btn');

  if (btn) {
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
  }
  if (row) row.hidden = !enabled;
  if (input) {
    input.min = _formatDateTimeLocal(_getScheduleMinDate());
    if (enabled && !input.value) input.value = _formatDateTimeLocal(_getDefaultScheduleDate());
  }
  if (!enabled) _clearFieldError('schedule-start-input', 'schedule-start-error');
  if (confirmBtn) confirmBtn.textContent = enabled ? 'Schedule' : 'Activate';
}

function _resetScheduleControls() {
  const input = document.getElementById('schedule-start-input');
  if (input) {
    input.value = '';
    input.min = _formatDateTimeLocal(_getScheduleMinDate());
  }
  _setScheduleControls(false);
}

function _validateScheduledStart() {
  if (!_isScheduleEnabled()) return { hasError: false, scheduledStartDateTime: null };

  const input = document.getElementById('schedule-start-input');
  const rawValue = input?.value || '';
  if (!rawValue) {
    _setFieldError('schedule-start-input', 'schedule-start-error', 'Choose a start date and time.');
    input?.focus();
    return { hasError: true, scheduledStartDateTime: null };
  }

  const selectedDate = new Date(rawValue);
  if (Number.isNaN(selectedDate.getTime())) {
    _setFieldError('schedule-start-input', 'schedule-start-error', 'Choose a valid start date and time.');
    input?.focus();
    return { hasError: true, scheduledStartDateTime: null };
  }

  if (selectedDate.getTime() < _getScheduleMinDate().getTime()) {
    _setFieldError('schedule-start-input', 'schedule-start-error', 'Choose a future start time.');
    input?.focus();
    return { hasError: true, scheduledStartDateTime: null };
  }

  return { hasError: false, scheduledStartDateTime: selectedDate.toISOString() };
}

function showActivationModal(roles, opts = {}) {
  _pendingRoles = roles;
  _initAzureScopeSelections(roles, opts.reducedScopes);
  const modal = document.getElementById('activation-modal');
  if (!modal) return;

  // Populate role list
  const list = document.getElementById('modal-role-list');
  if (list) {
    list.innerHTML = roles.map(r =>
      '<div class="modal-role-item">' +
        escapeHtml(r.name) +
        '<span class="modal-role-scope">' + escapeHtml(_scopeDisplayForModal(r)) + '</span>' +
      '</div>'
    ).join('');
  }

  // Duration: use pre-filled opts if provided, else default 8h 0m
  const hoursInput = document.getElementById('duration-hours');
  const minsInput  = document.getElementById('duration-mins');
  const hint       = document.getElementById('duration-hint');

  const defaultH   = Math.floor(_flags.defaultDuration || 8);
  const defaultM   = Math.round(((_flags.defaultDuration || 8) - defaultH) * 60);
  const fillHours  = opts.durationHours != null ? opts.durationHours : defaultH;
  const fillMins   = opts.durationMins  != null ? opts.durationMins  : defaultM;
  if (hoursInput) hoursInput.value = fillHours;
  if (minsInput)  minsInput.value  = fillMins;

  // Slider: max = longest policy max across selected roles (so the full range is usable)
  const sliderMax = Math.max(...roles.map(r => (r.maxDurationHours || 24) * 60).filter(m => m > 0));
  const slider = document.getElementById('duration-slider');
  if (slider) {
    slider.max   = isFinite(sliderMax) ? sliderMax : 1440;
    slider.value = fillHours * 60 + fillMins;
  }

  // Highlight matching preset button (if any) and hide those exceeding max duration
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.h) === fillHours && Number(b.dataset.m) === fillMins);
    const btnMins = Number(b.dataset.h) * 60 + Number(b.dataset.m);
    b.style.display = (isFinite(sliderMax) && btnMins > sliderMax) ? 'none' : '';
  });

  if (hint) {
    const minMax = Math.min(...roles.map(r => r.maxDurationHours || 24).filter(h => h > 0));
    if (isFinite(minMax) && minMax < 8) {
      hint.textContent = '* Lowest policy max across selected roles is ' + minMax + 'h. Duration will be capped per role.';
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }

  // Justification is always visible; required only when policy enforces it
  const needsJust   = roles.some(r => r.requiresJustification);
  const needsTicket = roles.some(r => r.requiresTicket);
  const justRow   = document.getElementById('justification-row');
  const ticketRow = document.getElementById('ticket-row');
  if (justRow) {
    const reqMark = document.getElementById('justification-req-mark');
    if (reqMark) reqMark.hidden = !needsJust;
  }
  if (ticketRow) ticketRow.hidden = !needsTicket;

  // Pre-fill or clear values
  const justInput   = document.getElementById('justification-input');
  const ticketInput = document.getElementById('ticket-input');
  if (justInput)   justInput.value   = opts.justification || '';
  if (ticketInput) ticketInput.value = opts.ticketNumber || '';

  _resetScheduleControls();

  // Profile save checkbox
  const saveCb = document.getElementById('save-profile-checkbox');
  const nameRow = document.getElementById('profile-name-row');
  const nameInput = document.getElementById('profile-name-input');
  if (saveCb) saveCb.checked = false;
  if (nameRow) nameRow.hidden = true;
  if (nameInput) nameInput.value = '';

  // Clear any lingering validation errors
  _clearValidationErrors();

  _renderAzureScopeControls();

  // Kick off child-scope loading for any pre-configured reduced scopes (e.g. restored from a profile).
  _azureScopeSelections.forEach((state, uid) => {
    if (state.enabled) _loadAzureScopeChildren(uid);
  });

  modal.hidden = false;
  modal.querySelector('.modal')?.classList.add('fade-in');
  if (justInput && needsJust && !opts.justification) justInput.focus();
  else if (hoursInput) hoursInput.focus();
}

function hideActivationModal() {
  const modal = document.getElementById('activation-modal');
  if (modal) modal.hidden = true;
  _pendingRoles = [];
  // Intentionally not clearing _azureScopeSelections here — the Map is preserved
  // so that _handleSaveProfile (profiles modal) can capture the most-recently-
  // configured reduced scopes even after the activation modal has closed.
  // _initAzureScopeSelections (called by showActivationModal) will reinitialise it.
}

function _scopeDisplayForModal(role) {
  return roleManager.getScopeDisplay(role);
}

function _initAzureScopeSelections(roles, savedScopes) {
  _azureScopeSelections = new Map();
  const savedMap = new Map((savedScopes || []).map(s => [s.uid, s]));
  roles.filter(r => r.type === 'AzureResource').forEach(role => {
    const uid = role.uid || role.id;
    const baseScopeId = _normalizeScopeId(role.scopeId || role.scope);
    const baseDisplayName = role.scope || role.scopeId || 'Original scope';
    const saved = savedMap.get(uid);

    let restoredScopes = [];
    if (saved) {
      if (Array.isArray(saved.scopes) && saved.scopes.length > 0) {
        restoredScopes = saved.scopes.map(s => ({
          scopeId: _normalizeScopeId(s.scopeId),
          displayName: s.displayName || s.scopeId,
          type: s.type || 'Scope',
          path: s.path || []
        }));
      } else if (saved.scopeId && !_sameScopeId(saved.scopeId, baseScopeId)) {
        restoredScopes = [{
          scopeId: _normalizeScopeId(saved.scopeId),
          displayName: saved.displayName || saved.scopeId,
          type: 'Scope',
          path: saved.path || []
        }];
      }
    }

    const enabled = restoredScopes.length > 0;
    _azureScopeSelections.set(uid, {
      uid,
      enabled,
      baseScopeId,
      baseDisplayName,
      selectedScopes: restoredScopes,
      currentParentScopeId: baseScopeId,
      currentParentDisplayName: baseDisplayName,
      path: [{ scopeId: baseScopeId, displayName: baseDisplayName, type: 'Original scope' }],
      children: [],
      loading: false,
      error: '',
      requestId: 0
    });
  });
}

// Ensure _azureScopeSelections has entries for every currently-selected Azure
// Resource role without overwriting any state that was already configured
// (e.g. from a prior activation or from the profiles modal itself).
function _initProfilesAzureScopes() {
  const azureRoles = roleManager.getSelectedEligibleRoles().filter(r => r.type === 'AzureResource');
  for (const role of azureRoles) {
    const uid = role.uid || role.id;
    if (_azureScopeSelections.has(uid)) continue; // preserve existing state
    const baseScopeId = _normalizeScopeId(role.scopeId || role.scope);
    const baseDisplayName = role.scope || role.scopeId || 'Original scope';
    _azureScopeSelections.set(uid, {
      uid,
      enabled: false,
      baseScopeId,
      baseDisplayName,
      selectedScopes: [],
      currentParentScopeId: baseScopeId,
      currentParentDisplayName: baseDisplayName,
      path: [{ scopeId: baseScopeId, displayName: baseDisplayName, type: 'Original scope' }],
      children: [],
      loading: false,
      error: '',
      requestId: 0
    });
  }
}

function _renderAzureScopeList(roles, containerId, sectionId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const section = sectionId ? document.getElementById(sectionId) : null;

  const azureRoles = roles.filter(r => r.type === 'AzureResource');
  if (section) section.hidden = azureRoles.length === 0;
  if (!azureRoles.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = azureRoles.map(role => {
    const uid = role.uid || role.id;
    const state = _azureScopeSelections.get(uid);
    if (!state) return '';

    const count = (state.selectedScopes || []).length;
    const selectedText = state.enabled
      ? (count > 0 ? count + ' target scope' + (count !== 1 ? 's' : '') + ' selected' : 'Original scope')
      : state.baseDisplayName;
    const controlsHidden = state.enabled ? '' : ' hidden';

    const breadcrumbHtml = '<div class="azure-scope-breadcrumb">' +
      state.path.map((p, idx) => {
        if (idx === state.path.length - 1) {
          return '<span class="azure-scope-crumb-current">' + escapeHtml(p.displayName || p.scopeId) + '</span>';
        }
        return '<span class="azure-scope-crumb-link" data-uid="' + escapeHtml(uid) + '" data-crumb-index="' + idx + '">' +
          escapeHtml(p.displayName || p.scopeId) +
        '</span><span class="azure-scope-crumb-sep"> / </span>';
      }).join('') +
    '</div>';

    let checklistHtml = '';
    if (state.loading) {
      checklistHtml = '<div class="azure-scope-empty-state">Loading child resources…</div>';
    } else if (state.error) {
      checklistHtml = '<div class="azure-scope-empty-state scope-hint-error">' + escapeHtml(state.error) + '</div>';
    } else if (state.children && state.children.length > 0) {
      checklistHtml = '<div class="azure-scope-checklist">' +
        state.children.map(child => {
          const isSelected = (state.selectedScopes || []).some(s => _sameScopeId(s.scopeId, child.scopeId));
          return '<label class="azure-scope-check-item ' + (isSelected ? 'selected' : '') + '">' +
            '<input type="checkbox" class="azure-scope-checkbox" data-uid="' + escapeHtml(uid) + '" data-scope-id="' + escapeHtml(child.scopeId) + '" ' + (isSelected ? 'checked' : '') + '>' +
            '<div class="azure-scope-check-info">' +
              '<span class="azure-scope-check-name">' + escapeHtml(child.displayName || child.scopeId) + '</span>' +
              '<span class="azure-scope-check-type">' + escapeHtml(child.type || 'Resource') + '</span>' +
            '</div>' +
            '<button type="button" class="btn btn-ghost btn-xs azure-scope-explore-btn" data-uid="' + escapeHtml(uid) + '" data-scope-id="' + escapeHtml(child.scopeId) + '" title="Browse inside ' + escapeHtml(child.displayName || child.scopeId) + '">Browse ➔</button>' +
          '</label>';
        }).join('') +
      '</div>';
    } else {
      checklistHtml = '<div class="azure-scope-empty-state">No child resources found under this level.</div>';
    }

    let summaryText = 'Activate at original scope unless reduced scopes are checked.';
    if (state.enabled) {
      if (count > 0) {
        summaryText = 'Targeting ' + count + ' resource scope' + (count !== 1 ? 's' : '') + ': ' +
          state.selectedScopes.map(s => s.displayName || s.scopeId).join(', ');
      } else {
        summaryText = 'Check resources in the list above to restrict activation to those scopes.';
      }
    }

    return '<div class="azure-scope-item" data-uid="' + escapeHtml(uid) + '">' +
      '<div class="azure-scope-head">' +
        '<div class="azure-scope-role">' +
          '<span class="azure-scope-name">' + escapeHtml(role.name || role.id) + '</span>' +
          '<span class="azure-scope-current">' + escapeHtml(selectedText) + '</span>' +
        '</div>' +
        '<label class="azure-scope-toggle">' +
          '<input type="checkbox" class="azure-scope-toggle-input" data-uid="' + escapeHtml(uid) + '" ' + (state.enabled ? 'checked' : '') + '>' +
          '<span>Reduced scope</span>' +
        '</label>' +
      '</div>' +
      '<div class="azure-scope-controls"' + controlsHidden + '>' +
        breadcrumbHtml +
        checklistHtml +
        '<div class="scope-hint">' + escapeHtml(summaryText) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.azure-scope-toggle-input').forEach(input => {
    input.addEventListener('change', () => _toggleAzureReducedScope(input.dataset.uid, input.checked));
  });
  container.querySelectorAll('.azure-scope-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      _toggleAzureChildScopeCheck(cb.dataset.uid, cb.dataset.scopeId, cb.checked);
    });
  });
  container.querySelectorAll('.azure-scope-explore-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      _drillAzureChildScope(btn.dataset.uid, btn.dataset.scopeId);
    });
  });
  container.querySelectorAll('.azure-scope-crumb-link').forEach(link => {
    link.addEventListener('click', () => {
      _navigateToCrumb(link.dataset.uid, parseInt(link.dataset.crumbIndex, 10));
    });
  });
}

function _renderAzureScopeControls() {
  _renderAzureScopeList(_pendingRoles, 'azure-scope-list', 'azure-scope-row');
  _renderProfilesReducedScopes();
}

function _renderProfilesReducedScopes() {
  _renderAzureScopeList(roleManager.getSelectedEligibleRoles(), 'profiles-azure-scope-list', 'profiles-scope-section');
}

function _toggleAzureReducedScope(uid, enabled) {
  const state = _azureScopeSelections.get(uid);
  if (!state) return;
  if (!enabled) {
    _resetAzureScopeSelection(uid, false);
    return;
  }
  state.enabled = true;
  _renderAzureScopeControls();
  _loadAzureScopeChildren(uid);
}

function _toggleAzureChildScopeCheck(uid, scopeId, isChecked) {
  const state = _azureScopeSelections.get(uid);
  if (!state || !scopeId) return;
  if (!state.selectedScopes) state.selectedScopes = [];
  
  if (isChecked) {
    const child = state.children.find(c => _sameScopeId(c.scopeId, scopeId));
    if (child && !state.selectedScopes.some(s => _sameScopeId(s.scopeId, child.scopeId))) {
      state.selectedScopes.push({
        scopeId: child.scopeId,
        displayName: child.displayName || child.scopeId,
        type: child.type || 'Scope',
        path: [...state.path, { scopeId: child.scopeId, displayName: child.displayName || child.scopeId, type: child.type || 'Scope' }]
      });
    }
  } else {
    state.selectedScopes = state.selectedScopes.filter(s => !_sameScopeId(s.scopeId, scopeId));
  }
  _renderAzureScopeControls();
}

function _drillAzureChildScope(uid, scopeId) {
  const state = _azureScopeSelections.get(uid);
  if (!state || !scopeId) return;
  const selected = state.children.find(scope => _sameScopeId(scope.scopeId, scopeId));
  if (!selected) return;
  state.currentParentScopeId = selected.scopeId;
  state.currentParentDisplayName = selected.displayName || selected.scopeId;
  state.path.push({ scopeId: selected.scopeId, displayName: state.currentParentDisplayName, type: selected.type || 'Scope' });
  state.children = [];
  state.error = '';
  _renderAzureScopeControls();
  _loadAzureScopeChildren(uid);
}

function _navigateToCrumb(uid, crumbIndex) {
  const state = _azureScopeSelections.get(uid);
  if (!state || crumbIndex < 0 || crumbIndex >= state.path.length) return;
  state.path = state.path.slice(0, crumbIndex + 1);
  const current = state.path[state.path.length - 1];
  state.currentParentScopeId = current.scopeId;
  state.currentParentDisplayName = current.displayName;
  state.children = [];
  state.error = '';
  _renderAzureScopeControls();
  _loadAzureScopeChildren(uid);
}

function _resetAzureScopeSelection(uid, keepEnabled) {
  const state = _azureScopeSelections.get(uid);
  if (!state) return;
  state.requestId++;
  state.enabled = keepEnabled;
  state.selectedScopes = [];
  state.currentParentScopeId = state.baseScopeId;
  state.currentParentDisplayName = state.baseDisplayName;
  state.path = [{ scopeId: state.baseScopeId, displayName: state.baseDisplayName, type: 'Original scope' }];
  state.children = [];
  state.loading = false;
  state.error = '';
  _renderAzureScopeControls();
  if (keepEnabled) _loadAzureScopeChildren(uid);
}

async function _loadAzureScopeChildren(uid) {
  const state = _azureScopeSelections.get(uid);
  if (!state || !state.enabled || !state.currentParentScopeId) return;
  const requestId = ++state.requestId;
  state.loading = true;
  state.error = '';
  _renderAzureScopeControls();
  try {
    const children = await armClient.getAzureChildScopes(state.currentParentScopeId);
    if (state.requestId !== requestId) return;
    state.children = children;
    state.loading = false;
  } catch (err) {
    if (state.requestId !== requestId) return;
    state.children = [];
    state.loading = false;
    state.error = _scopeDiscoveryError(err);
  }
  _renderAzureScopeControls();
}

function _scopeDiscoveryError(err) {
  const message = err?.message || 'Unable to list child scopes.';
  if (/403|AuthorizationFailed|Forbidden/i.test(message)) return 'Child scopes could not be listed with your current permissions.';
  return 'Child scopes could not be loaded. Same-scope activation is still available.';
}

function _applyAzureScopeSelection(role, clone) {
  if (role.type !== 'AzureResource') return [clone];
  const uid = role.uid || role.id;
  const state = _azureScopeSelections.get(uid);
  if (!state || !state.enabled) {
    clone.scopeDisplay = role.scope || role.scopeId || '';
    return [clone];
  }
  if (!state.selectedScopes || state.selectedScopes.length === 0) {
    if (state.loading) throw new Error('Wait for scopes to finish loading for ' + (role.name || 'the Azure role') + '.');
    if (state.error) throw new Error('Scope discovery failed for ' + (role.name || 'the Azure role') + '. Turn off reduced scope or retry.');
    throw new Error('Select at least one reduced scope target for ' + (role.name || 'the Azure role') + ', or turn off reduced scope.');
  }

  return state.selectedScopes.map((target, idx) => {
    const scopeClone = Object.assign({}, clone, {
      _activationScopeId: target.scopeId,
      _activationScopeDisplay: target.displayName || target.scopeId,
      _linkedRoleEligibilityScheduleId: role.roleEligibilityScheduleId || null,
      scopeDisplay: target.displayName || target.scopeId,
      uid: state.selectedScopes.length > 1 ? (role.uid || role.id) + '_scope_' + idx : (role.uid || role.id)
    });
    return scopeClone;
  });
}

function _sameScopeId(a, b) {
  return _normalizeScopeId(a).toLowerCase() === _normalizeScopeId(b).toLowerCase();
}

function _normalizeScopeId(scopeId) {
  const scope = String(scopeId || '').trim();
  if (scope === '/') return '/';
  return scope.replace(/\/+$/, '');
}

// ── Inline validation helpers ─────────────────────────────────────────────────

function _setFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorId);
  if (input)  input.classList.add('input-error');
  if (errEl)  { errEl.textContent = message; errEl.hidden = false; }
}

function _clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorId);
  if (input)  input.classList.remove('input-error');
  if (errEl)  { errEl.textContent = ''; errEl.hidden = true; }
}

function _clearValidationErrors() {
  _clearFieldError('justification-input', 'justification-error');
  _clearFieldError('ticket-input', 'ticket-error');
  _clearFieldError('schedule-start-input', 'schedule-start-error');
}

// ── Activation execution (shared by handleActivate and post-CA-redirect resume) ─

/**
 * Persist activation state and trigger an MSAL redirect to satisfy a Conditional
 * Access claims challenge surfaced by the API. The page navigates away; the
 * bootstrap resume path picks up the saved payload and re-runs the activation
 * with the new token.
 * @returns {boolean} true if a step-up redirect was triggered (caller should stop).
 */
async function _handleClaimsChallenge(err, payload) {
  if (!(err instanceof portalAuth.ClaimsChallengeError)) return false;
  if (payload.claimsChallengeRetried) {
    // We already redirected once for a claims challenge in this attempt — don't
    // loop. Surface a clear error toast instead.
    showToast({
      title: 'Activation failed',
      description: 'The role still requires additional authentication after step-up. Please sign out and try again.',
      type: 'error',
      duration: 10000
    });
    sessionStorage.removeItem(PENDING_ACTIVATION_KEY);
    return true;
  }
  sessionStorage.setItem(PENDING_ACTIVATION_KEY, JSON.stringify({
    ...payload,
    claims: err.claims,
    claimsChallengeRetried: true
  }));
  showProgress('Redirecting for authentication…');
  try {
    await portalAuth.stepUpWithClaims({ scopes: err.scopes, claims: err.claims });
    // Page navigates away — execution does not continue here.
  } catch (redirectErr) {
    sessionStorage.removeItem(PENDING_ACTIVATION_KEY);
    showToast({
      title: 'Authentication redirect failed',
      description: redirectErr.message,
      type: 'error',
      duration: 10000
    });
  }
  return true;
}

async function _executeActivation(cappedRoles, justification, ticketNumber, extra = {}) {
  const isScheduled = Boolean(extra.scheduledStartDateTime);
  const verb = isScheduled ? 'Scheduling' : 'Activating';
  const activateLabel = verb + ' ' + cappedRoles.length + ' role' + (cappedRoles.length !== 1 ? 's' : '') + '…';
  _opOverlay.open(activateLabel, cappedRoles);
  try {
    const opts = {
      justification,
      ticketNumber,
      onProgress: r => _opOverlay.update(r)
    };
    if (extra.scheduledStartDateTime) opts.scheduledStartDateTime = extra.scheduledStartDateTime;
    const outcome = await batchClient.bulkActivate(cappedRoles, opts);
    const results         = outcome.results || [];
    const ok              = results.filter(r => r.success && !r.pendingApproval).length;
    const pendingApproval = results.filter(r => r.pendingApproval).length;
    const fail            = results.filter(r => !r.success).length;
    _opOverlay.close(fail > 0 ? 2500 : 1400);
    if (fail === 0 && pendingApproval === 0) {
      showToast({ title: 'Successfully activated', description: _formatRoleOutcomeList(cappedRoles, results), type: 'success', debugInfo: results });
    } else if (pendingApproval > 0 && ok === 0 && fail === 0) {
      const roleWord = pendingApproval !== 1 ? 'roles' : 'role';
      showToast({ title: 'Activation request sent', description: 'Awaiting approval for ' + pendingApproval + ' ' + roleWord + '\n' + _formatRoleOutcomeList(cappedRoles, results), type: 'info', duration: 8000, debugInfo: results });
    } else if (pendingApproval > 0 && fail === 0) {
      showToast({ title: ok + ' activated', description: pendingApproval + ' awaiting approval\n' + _formatRoleOutcomeList(cappedRoles, results), type: 'info', duration: 8000, debugInfo: results });
    } else if (ok === 0 && pendingApproval === 0) {
      const firstError = results.find(r => r.error)?.error || 'Activation failed';
      showToast({ title: 'Activation failed', description: firstError + '\n\n' + _formatRoleOutcomeList(cappedRoles, results), type: 'error', debugInfo: results });
    } else {
      showToast({ title: (ok + pendingApproval) + ' submitted', description: fail + ' failed.\n' + _formatRoleOutcomeList(cappedRoles, results), type: 'warning', debugInfo: results });
    }
    await _refresh();
  } catch (err) {
    _opOverlay.close(0);
    // Reactive Conditional Access step-up: persist state, redirect, resume on return.
    const handled = await _handleClaimsChallenge(err, {
      cappedRoles,
      justification,
      ticketNumber,
      scheduledStartDateTime: extra.scheduledStartDateTime || null,
      claimsChallengeRetried: extra.claimsChallengeRetried
    });
    if (handled) return;
    showToast({ title: 'Activation error', description: err.message, type: 'error', duration: 10000 });
    console.error('[App] Activate error:', err);
  }
}

// ── Activation handler ────────────────────────────────────────────────────────

async function handleActivate() {
  const hoursInput = document.getElementById('duration-hours');
  const minsInput  = document.getElementById('duration-mins');
  const justInput  = document.getElementById('justification-input');
  const ticketInput= document.getElementById('ticket-input');

  _clearValidationErrors();

  const hours          = parseInt(hoursInput?.value || '8', 10)  || 0;
  const mins           = parseInt(minsInput?.value  || '0', 10)  || 0;
  const requestedTotal = hours * 60 + mins;

  if (requestedTotal < 1) {
    showToast({ title: 'Invalid duration', description: 'Duration must be at least 1 minute.', type: 'warning' });
    return;
  }

  const justification = justInput?.value.trim()  || '';
  const ticketNumber  = ticketInput?.value.trim() || '';
  const scheduleValidation = _validateScheduledStart();
  const scheduledStartDateTime = scheduleValidation.scheduledStartDateTime;

  const anyNeedsJust   = _pendingRoles.some(r => r.requiresJustification);
  const anyNeedsTicket = _pendingRoles.some(r => r.requiresTicket);

  let hasError = scheduleValidation.hasError;
  if (anyNeedsJust && !justification) {
    _setFieldError('justification-input', 'justification-error', 'Justification is required.');
    if (!hasError) justInput?.focus();
    hasError = true;
  }
  if (anyNeedsTicket && !ticketNumber) {
    _setFieldError('ticket-input', 'ticket-error', 'Ticket number is required.');
    if (!hasError) ticketInput?.focus();
    hasError = true;
  }
  if (hasError) return;

  // Profile saving
  const saveCb = document.getElementById('save-profile-checkbox');
  const nameInput = document.getElementById('profile-name-input');
  if (saveCb?.checked) {
    const pName = nameInput?.value.trim();
    if (!pName) {
      _setFieldError('profile-name-input', null, 'Profile name is required');
      nameInput?.focus();
      return;
    }
    const reducedScopes = [];
    _azureScopeSelections.forEach((state, uid) => {
      if (state.enabled && state.selectedScopes && state.selectedScopes.length > 0) {
        reducedScopes.push({
          uid,
          scopes: state.selectedScopes.map(s => ({
            scopeId: s.scopeId,
            displayName: s.displayName || s.scopeId,
            path: s.path || []
          })),
          scopeId: state.selectedScopes[0].scopeId,
          displayName: state.selectedScopes[0].displayName || state.selectedScopes[0].scopeId,
          path: state.selectedScopes[0].path || []
        });
      }
    });
    await profileManager.saveProfile(pName, _pendingRoles, {
      tenantId:      _flags.tenantScopedProfiles ? portalAuth.getAccount()?.tenantId : null,
      justification,
      durationHours: hours,
      durationMins: mins,
      ticketNumber,
      reducedScopes
    }).catch(e => console.error('Failed to save profile:', e));
  }

  // Cap per-role duration and apply Azure-only reduced scope choices.
  let cappedRoles;
  try {
    cappedRoles = _pendingRoles.flatMap(role => {
      const maxMins = (role.maxDurationHours || 24) * 60;
      const clone = Object.assign({}, role, {
        _effectiveDurationMinutes: Math.min(requestedTotal, maxMins)
      });
      return _applyAzureScopeSelection(role, clone);
    });
  } catch (err) {
    showToast({ title: 'Scope error', description: err.message, type: 'warning', duration: 8000 });
    return;
  }

  hideActivationModal();

  // Proactive auth context step-up — collect unique acrs values from selected roles.
  // Saves activation state to sessionStorage and uses acquireTokenRedirect (consistent with
  // sign-in and MFA flows). Bootstrap resumes activation automatically on return.
  const authContextIds = [...new Set(
    cappedRoles
      .filter(r => r.requiresAuthContext && r.authContextId)
      .map(r => r.authContextId)
  )];
  if (authContextIds.length > 0) {
    // Save the full activation intent so bootstrap can resume after the redirect returns.
    sessionStorage.setItem(PENDING_ACTIVATION_KEY, JSON.stringify({
      cappedRoles,
      justification,
      ticketNumber,
      authContextId: authContextIds[0]
    }));
    showProgress('Redirecting for authentication…');
    await portalAuth.stepUpForAuthContexts(authContextIds, cappedRoles);
    // acquireTokenRedirect navigates away — execution does not continue here.
    return;
  }

  const isScheduled = Boolean(scheduledStartDateTime);
  const progressVerb = isScheduled ? 'Scheduling' : 'Activating';
  const successLabel = isScheduled ? 'Scheduled' : 'Activated';
  const resultVerb = isScheduled ? 'scheduled' : 'activated';
  const errorTitle = isScheduled ? 'Scheduling error' : 'Activation error';
  const activateLabel = progressVerb + ' ' + cappedRoles.length + ' role' + (cappedRoles.length !== 1 ? 's' : '') + '\u2026';
  _opOverlay.open(activateLabel, cappedRoles);

  try {
    const activateOptions = {
      justification,
      ticketNumber,
      onProgress: r => _opOverlay.update(r)
    };
    if (scheduledStartDateTime) activateOptions.scheduledStartDateTime = scheduledStartDateTime;

    const outcome = await batchClient.bulkActivate(cappedRoles, activateOptions);
    const ok   = outcome.summary?.succeeded ?? outcome.results?.filter(r => r.success).length ?? 0;
    const fail = outcome.summary?.failed    ?? outcome.results?.filter(r => !r.success).length ?? 0;
    const pendingApproval = (outcome.results || []).filter(r => r.pendingApproval).length;
    const activityDetails = _buildRoleActivityDetails(cappedRoles, outcome.results, {
      action: isScheduled ? 'schedule' : 'activate',
      label: isScheduled ? 'Scheduled activation' : 'Activation',
      scheduledStartDateTime,
      durationMinutes: requestedTotal,
      justification,
      ticketNumber
    });
    _opOverlay.close(fail > 0 ? 2500 : 1400);
    if (fail === 0 && pendingApproval === 0) {
      showToast({ title: isScheduled ? 'Successfully scheduled' : 'Successfully activated', description: _formatRoleOutcomeList(cappedRoles, outcome.results, successLabel), type: 'success', debugInfo: outcome.results, activityDetails });
    } else if (pendingApproval > 0 && fail === 0) {
      showToast({ title: ok + ' ' + resultVerb, description: pendingApproval + ' awaiting approval\n' + _formatRoleOutcomeList(cappedRoles, outcome.results, successLabel), type: 'info', duration: 8000, debugInfo: outcome.results, activityDetails });
    } else if (ok === 0 && pendingApproval === 0) {
      const firstError = outcome.results?.find(r => r.error)?.error || (isScheduled ? 'Scheduling failed' : 'Activation failed');
      showToast({ title: isScheduled ? 'Scheduling failed' : 'Activation failed', description: firstError + '\n\n' + _formatRoleOutcomeList(cappedRoles, outcome.results, successLabel), type: 'error', debugInfo: outcome.results, activityDetails });
    } else {
      showToast({ title: ok + ' role' + (ok !== 1 ? 's' : '') + ' ' + resultVerb, description: fail + ' failed.\n' + _formatRoleOutcomeList(cappedRoles, outcome.results, successLabel), type: 'warning', debugInfo: outcome.results, activityDetails });
    }
    await _refresh();
  } catch (err) {
    _opOverlay.close(0);
    // Reactive Conditional Access step-up: persist state and redirect for a
    // new token with the required claims, then resume on return.
    const handled = await _handleClaimsChallenge(err, {
      cappedRoles,
      justification,
      ticketNumber,
      scheduledStartDateTime: scheduledStartDateTime || null
    });
    if (handled) return;
    showToast({ title: errorTitle, description: err.message, type: 'error', duration: 10000 });
    console.error('[App] Activate error:', err);
  } finally {
    portalAuth.setAuthContextClaims(null);
  }
}

// ── Deactivation handler ──────────────────────────────────────────────────────

async function handleDeactivate() {
  const roles = roleManager.getSelectedActiveRoles().filter(r => r.endDateTime);
  if (!roles.length) { showToast({ title: 'No roles selected', description: 'Select at least one PIM-managed active role.', type: 'warning' }); return; }

  const deactivateLabel = 'Deactivating ' + roles.length + ' role' + (roles.length !== 1 ? 's' : '') + '…';
  _opOverlay.open(deactivateLabel, roles);
  try {
    const outcome = await batchClient.bulkDeactivate(roles, { onProgress: r => _opOverlay.update(r) });
    const ok   = outcome.summary?.succeeded ?? outcome.results?.filter(r => r.success).length ?? 0;
    const fail = outcome.summary?.failed    ?? outcome.results?.filter(r => !r.success).length ?? 0;

    // Optimistically remove successfully deactivated roles so the table updates
    // instantly — API propagation can lag several seconds after a 200 response.
    const succeededUids = (outcome.results || [])
      .filter(r => r.success)
      .map(r => r.uid);
    if (succeededUids.length) roleManager.removeActiveRoles(succeededUids);

    _opOverlay.close(fail > 0 ? 2500 : 1400);
    const activityDetails = _buildRoleActivityDetails(roles, outcome.results, {
      action: 'deactivate',
      label: 'Deactivation'
    });
    if (fail === 0) {
      showToast({ title: 'Successfully deactivated', description: _formatRoleOutcomeList(roles, outcome.results, 'Deactivated'), type: 'success', debugInfo: outcome.results, activityDetails });
    } else {
      const firstError = outcome.results?.find(r => r.error)?.error || 'Deactivation failed';
      showToast({ title: ok + ' deactivated', description: fail + ' failed. ' + firstError + '\n' + _formatRoleOutcomeList(roles, outcome.results, 'Deactivated'), type: 'warning', debugInfo: outcome.results, activityDetails });
    }
    // Background sync — small delay gives the API time to propagate the deactivation
    // before we re-fetch, preventing the role from briefly reappearing.
    setTimeout(() => _refresh(), 3000);
  } catch (err) {
    _opOverlay.close(0);
    showToast({ title: 'Deactivation error', description: err.message, type: 'error', duration: 10000 });
    console.error('[App] Deactivate error:', err);
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function _refresh(manual = false) {
  if (manual) showToast({ title: 'Refreshing roles...', type: 'info', noHistory: true, duration: 2000 });
  try {
    await roleManager.loadRoles(_flags);
    if (manual) {
      showToast({
        title: 'Roles refreshed',
        description: `${roleManager.activeRoles.length} active, ${roleManager.eligibleRoles.length} eligible`,
        type: 'info',
        noHistory: true
      });
    }
  } catch (err) {
    console.error('[App] Refresh error:', err);
    showToast({ title: 'Refresh failed', description: err.message, type: 'error' });
  }
}

// ── Activation profiles ────────────────────────────────────────────────────

function showProfilesModal(focusSave = false) {
  const modal = document.getElementById('profiles-modal');
  if (!modal) return;
  _renderProfilesList();
  modal.hidden = false;
  modal.querySelector('.modal')?.classList.add('fade-in');
  if (focusSave) setTimeout(() => document.getElementById('profiles-name-input')?.focus(), 50);
}

function hideProfilesModal() {
  const modal = document.getElementById('profiles-modal');
  if (modal) modal.hidden = true;
}

async function _renderProfilesList() {
  const body = document.getElementById('profiles-modal-body');
  if (!body) return;

  _initProfilesAzureScopes();

  const _profileTenantId = _flags.tenantScopedProfiles ? portalAuth.getAccount()?.tenantId : null;
  const profiles = await profileManager.getProfiles(_profileTenantId).catch(() => []);
  const selected = roleManager.getSelectedEligibleRoles();

  let html = '';

  // Save-new-profile row
  html += '<div class="form-row profile-save-section">' +
    '<div class="profile-save-row">' +
      '<input type="text" id="profiles-name-input" class="form-input" placeholder="Profile name…" maxlength="60" style="flex:1">' +
      '<button type="button" class="btn btn-primary btn-sm" id="profiles-save-confirm-btn"' +
        (selected.length === 0 ? ' disabled title="Select eligible roles first"' : '') + '>' +
        'Save (' + selected.length + ' role' + (selected.length !== 1 ? 's' : '') + ')' +
      '</button>' +
    '</div>' +
    '<div id="profiles-scope-section" hidden>' +
      '<div class="profiles-scope-heading">Reduced scopes <span class="profiles-scope-subheading">(optional \u2014 Azure Resource roles only)</span></div>' +
      '<div id="profiles-azure-scope-list" class="azure-scope-list"></div>' +
    '</div>' +
    '<div class="profile-save-extras">' +
      '<textarea id="profiles-justification-input" class="form-textarea profile-justification" rows="2" maxlength="500" placeholder="Default justification (optional)…"></textarea>' +
      '<div class="profile-duration-row">' +
        '<span class="form-label" style="font-size:12px;white-space:nowrap">Default duration:</span>' +
        '<input type="number" id="profiles-hours-input" class="duration-num" min="0" max="999" value="8" aria-label="Hours"> h' +
        '<input type="number" id="profiles-mins-input"  class="duration-num" min="0" max="59"  value="0"  aria-label="Minutes"> m' +
      '</div>' +
    '</div>' +
  '</div>';

  // Profile list
  if (profiles.length === 0) {
    html += '<p class="profile-empty">No profiles saved yet.<br>Select eligible roles and click <strong>Save as profile</strong> to create one.</p>';
  } else {
    // Sort: most recently used/created first
    profiles.sort((a, b) => {
      const ts = s => s ? new Date(s).getTime() : 0;
      return (ts(b.lastUsedAt) || ts(b.createdAt)) - (ts(a.lastUsedAt) || ts(a.createdAt));
    });
    html += '<div class="profile-list">';
    for (const p of profiles) {
      const lastUsed = p.lastUsedAt ? _timeAgo(p.lastUsedAt) : 'Never used';
      
      // Peek roles
      const peekItems = p.roles.map(pr => {
        const found = roleManager.eligibleRoles.find(r => (r.uid || r.id) === (pr.uid || pr.id));
        const scope = found ? roleManager.getScopeDisplay(found) : (pr.scope || pr.directoryScopeId || '');
        const reducedScope = (p.reducedScopes || []).find(s => s.uid === (pr.uid || pr.id));
        let reducedScopeText = '';
        if (reducedScope) {
          if (Array.isArray(reducedScope.scopes) && reducedScope.scopes.length > 1) {
            reducedScopeText = '→ ' + reducedScope.scopes.length + ' target scopes (' + reducedScope.scopes.map(s => s.displayName || s.scopeId).join(', ') + ')';
          } else if (Array.isArray(reducedScope.scopes) && reducedScope.scopes.length === 1) {
            reducedScopeText = '→ ' + (reducedScope.scopes[0].displayName || reducedScope.scopes[0].scopeId);
          } else {
            reducedScopeText = '→ ' + (reducedScope.displayName || reducedScope.scopeId);
          }
        }
        return '<li class="peek-item ' + (found ? '' : 'missing') + '">' +
          '<span class="peek-dot"></span>' +
          '<div style="flex:1; min-width:0; display:flex; flex-direction:column;">' +
            '<span>' + escapeHtml(pr.name) + '</span>' +
            '<span style="font-size:9px; opacity:0.7;">' + escapeHtml(scope) + '</span>' +
            (reducedScopeText ? '<span class="peek-reduced-scope">' + escapeHtml(reducedScopeText) + '</span>' : '') +
          '</div>' +
          (found ? '' : ' (unavailable)') + '</li>';
      }).join('');

      html +=
        '<div class="profile-item">' +
          '<div class="profile-main" data-profile-id="' + escapeHtml(p.id) + '">' +
            '<div class="profile-info">' +
              '<div class="profile-name">' + escapeHtml(p.name) + '</div>' +
              '<div class="profile-meta">' + p.roles.length + ' role' + (p.roles.length !== 1 ? 's' : '') + ' · ' + lastUsed + '</div>' +
            '</div>' +
            '<div class="profile-actions">' +
              '<button type="button" class="btn btn-primary btn-sm profile-activate-btn" data-profile-id="' + escapeHtml(p.id) + '">Activate</button>' +
              '<button type="button" class="btn btn-danger btn-sm profile-delete-btn" data-profile-id="' + escapeHtml(p.id) + '" aria-label="Delete profile">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
                  '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>' +
                '</svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="profile-roles-peek"><ul class="peek-list">' + peekItems + '</ul></div>' +
        '</div>';
    }
    html += '</div>';
  }

  body.innerHTML = html;

  body.querySelectorAll('.profile-main').forEach(el => {
    el.addEventListener('click', () => _handleActivateProfile(el.dataset.profileId));
  });

  body.querySelector('#profiles-save-confirm-btn')?.addEventListener('click', _handleSaveProfile);
  body.querySelector('#profiles-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      _handleSaveProfile();
    }
  });

  body.querySelectorAll('.profile-activate-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _handleActivateProfile(btn.dataset.profileId);
    });
  });

  // Wire delete
  body.querySelectorAll('.profile-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this profile?')) return;
      try {
        const profileId = btn.dataset.profileId;
        const profiles = await profileManager.getProfiles();
        const profile = profiles.find(p => p.id === profileId);
        await profileManager.deleteProfile(profileId);
        showToast({ title: 'Profile deleted', description: profile?.name || 'Profile removed', type: 'info' });
        _renderProfilesList();
      } catch (err) {
        showToast({ title: 'Delete failed', description: err.message, type: 'error' });
      }
    });
  });

  // Render Azure reduced scope pickers for the save form
  _renderProfilesReducedScopes();
}

async function _handleSaveProfile() {
  const body       = document.getElementById('profiles-modal-body');
  const nameInput  = body?.querySelector('#profiles-name-input');
  const justInput  = body?.querySelector('#profiles-justification-input');
  const hrsInput   = body?.querySelector('#profiles-hours-input');
  const minsInput  = body?.querySelector('#profiles-mins-input');
  const name = nameInput?.value.trim();
  if (!name) { nameInput?.focus(); showToast({ title: 'Missing name', description: 'Enter a profile name.', type: 'warning' }); return; }
  const roles = roleManager.getSelectedEligibleRoles();
  if (!roles.length) { showToast({ title: 'No roles', description: 'Select eligible roles first.', type: 'warning' }); return; }
  // Capture any reduced scopes configured for matching Azure roles — the Map persists
  // from the most recent activation modal session so the user can configure scopes,
  // activate (or cancel), and still have them picked up when saving from here.
  const reducedScopes = [];
  roles.forEach(role => {
    if (role.type !== 'AzureResource') return;
    const uid = role.uid || role.id;
    const state = _azureScopeSelections.get(uid);
    if (state && state.enabled && state.selectedScopes && state.selectedScopes.length > 0) {
      reducedScopes.push({
        uid,
        scopes: state.selectedScopes.map(s => ({
          scopeId: s.scopeId,
          displayName: s.displayName || s.scopeId,
          path: s.path || []
        })),
        scopeId: state.selectedScopes[0].scopeId,
        displayName: state.selectedScopes[0].displayName || state.selectedScopes[0].scopeId,
        path: state.selectedScopes[0].path || []
      });
    }
  });
  const opts = {
    tenantId:      _flags.tenantScopedProfiles ? portalAuth.getAccount()?.tenantId : null,
    justification: justInput?.value.trim() || '',
    durationHours: parseInt(hrsInput?.value  || '8', 10) || 0,
    durationMins:  parseInt(minsInput?.value || '0', 10) || 0,
    reducedScopes
  };
  try {
    await profileManager.saveProfile(name, roles, opts);
    showToast({ title: 'Profile saved', description: name, type: 'success' });
    _renderProfilesList();
  } catch (err) {
    showToast({ title: 'Save failed', description: err.message, type: 'error' });
  }
}

/**
 * Export all saved profiles to a JSON file.
 */
async function _handleExportProfiles() {
  try {
    const profiles = await profileManager.getAllProfiles();
    if (profiles.length === 0) {
      showToast({ title: 'No profiles', description: 'There are no profiles to export.', type: 'info' });
      return;
    }
    const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    a.href = url;
    a.download = `pim-activation-profiles-${dateStr}-${timeStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ title: 'Exported', description: `${profiles.length} profile${profiles.length === 1 ? '' : 's'} exported.`, type: 'success' });
  } catch (err) {
    showToast({ title: 'Export failed', description: err.message, type: 'error' });
  }
}

/**
 * Handle import file selection.
 */
async function _handleImportProfiles(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = JSON.parse(event.target.result);
      if (!Array.isArray(json)) throw new Error('Invalid format: expected an array of profiles');
      
      await profileManager.importProfiles(json);
      showToast({ title: 'Imported', description: `${json.length} profile${json.length === 1 ? '' : 's'} imported successfully.`, type: 'success' });
      _renderProfilesList();
    } catch (err) {
      showToast({ title: 'Import failed', description: 'Invalid JSON file or format.', type: 'error' });
    } finally {
      e.target.value = ''; // Reset input so same file can be imported again
    }
  };
  reader.readAsText(file);
}

async function _handleActivateProfile(profileId) {
  const profiles = await profileManager.getProfiles().catch(() => []);
  const profile  = profiles.find(p => p.id === profileId);
  if (!profile) return;

  // Match saved role UIDs to the current eligible list
  const eligible = roleManager.eligibleRoles;
  const resolved = profile.roles
    .map(pr => eligible.find(r => (r.uid || r.id) === (pr.uid || pr.id)))
    .filter(Boolean);

  if (!resolved.length) {
    showToast({ title: 'No eligible roles', description: 'None of the roles in this profile are currently eligible.', type: 'error' });
    return;
  }
  const skipped = profile.roles.length - resolved.length;
  if (skipped > 0) {
    showToast({
      title: `Profile "${profile.name}"`,
      description: `${skipped} role(s) are no longer eligible and were skipped.`,
      type: 'warning'
    });
  }

  await profileManager.touchProfile(profileId).catch(() => {});
  hideProfilesModal();
  showActivationModal(resolved, {
    justification:  profile.justification || '',
    durationHours:  profile.durationHours ?? 8,
    durationMins:   profile.durationMins  ?? 0,
    reducedScopes:  profile.reducedScopes || []
  });
}

function _timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2)  return 'Just now';
  if (m < 60) return m + ' minutes ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hour' + (h !== 1 ? 's' : '') + ' ago';
  const d = Math.floor(h / 24);
  return d + ' day' + (d !== 1 ? 's' : '') + ' ago';
}
// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  initTheme();
  _applySectionOrder();
  _applyInitialSectionStates();
  _filterBarOpen = _flags.persistFilterBarState
    ? localStorage.getItem(FILTER_BAR_STATE_KEY) === 'true'
    : false;
  _applyFilterBarState();
  _activeFilterBarOpen = _flags.persistFilterBarState
    ? localStorage.getItem(ACTIVE_FILTER_BAR_STATE_KEY) === 'true'
    : false;
  _applyActiveFilterBarState();

  // Update loading message while MSAL processes the redirect token exchange
  const loadingMsg = document.getElementById('loading-msg');
  if (loadingMsg) loadingMsg.textContent = 'Signing you in…';

  // Handle MSAL redirect promise
  try {
    await portalAuth.initAuth();
  } catch (err) {
    console.error('[App] Auth init error:', err);
  }

  const account = portalAuth.getAccount();
  if (!account) {
    // Not signed in — attempt redirect. loginRedirect() navigates away;
    // if it throws before navigating, show a fallback sign-in button.
    const loadingMsg = document.getElementById('loading-msg');
    if (loadingMsg) loadingMsg.textContent = 'Redirecting to sign-in\u2026';
    try {
      await portalAuth.signIn();
      // loginRedirect navigates away — code below only runs if something went wrong
    } catch (err) {
      console.error('[App] signIn error:', err);
      // Show manual sign-in button so user isn't stuck on infinite spinner
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        if (loadingMsg) loadingMsg.textContent = 'Sign-in redirect failed.';
        const btn = document.createElement('button');
        btn.textContent = 'Sign in';
        btn.className = 'btn btn-primary';
        btn.style.marginTop = '14px';
        btn.addEventListener('click', () => {
          btn.disabled = true;
          btn.textContent = 'Redirecting\u2026';
          portalAuth.signIn().catch(e => {
            btn.disabled = false;
            btn.textContent = 'Sign in';
            console.error('[App] Retry signIn error:', e);
          });
        });
        overlay.appendChild(btn);
      }
    }
    return;
  }

  // Show app
  const loading = document.getElementById('loading-overlay');
  const app     = document.getElementById('app');
  if (loading) loading.hidden = true;
  if (app)     app.hidden     = false;

  // Initialise header quick actions
  _renderQuickActions();

  // Initialise profile DB (non-blocking — it'll be ready long before the user clicks Save)
  profileManager.init().catch(err => console.warn('[App] ProfileManager init failed:', err));

  // Populate user context card
  const nameEl  = document.getElementById('user-name');
  const emailEl = document.getElementById('user-email');
  if (nameEl)  nameEl.textContent  = account.name || account.username || account.idTokenClaims?.preferred_username || 'User';
  if (emailEl) emailEl.textContent = account.username || account.idTokenClaims?.email || account.idTokenClaims?.preferred_username || '';
  _updateTenantDisplay(account);
  // Non-blocking: fetch tenant list to resolve display name (updates the card when ready)
  armClient.getAccessibleTenants()
    .then(tenants => { _updateTenantCache(tenants); _updateTenantDisplay(account); })
    .catch(() => {});

  // ── Event wiring ──────────────────────────────────────────────────────────

  // Sign out
  document.getElementById('sign-out-btn')
    ?.addEventListener('click', () => {
      portalAuth.signOut().catch(err => {
        showToast({ title: 'Sign-out failed', description: err.message, type: 'error' });
      });
    });

  // Tenant picker
  document.getElementById('tenant-switch-btn')?.addEventListener('click', _openTenantPicker);
  document.getElementById('tenant-picker-close-btn')?.addEventListener('click', _closeTenantPicker);
  document.getElementById('tenant-picker-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeTenantPicker();
  });

  // Help menu & modal
  const helpBtn = document.getElementById('help-btn');
  const helpDropdown = document.getElementById('help-dropdown');
  const helpModal = document.getElementById('help-modal');

  const _showHelp = (target = 'guide') => {
    if (!helpModal) return;
    
    // Set title
    const titles = {
      'guide': 'Manual',
      'how-it-works': 'How it works',
      'features': 'Features',
      'faq': 'FAQ'
    };
    const titleEl = document.getElementById('help-modal-title');
    if (titleEl) titleEl.textContent = titles[target] || 'Manual';

    // Toggle content sections
    helpModal.querySelectorAll('[id^="help-content-"]').forEach(el => {
      el.hidden = (el.id !== `help-content-${target}`);
    });

    helpModal.hidden = false;
    helpModal.querySelector('.modal')?.classList.add('fade-in');
    if (helpDropdown) helpDropdown.hidden = true;
  };

  const _hideHelp = () => { if (helpModal) helpModal.hidden = true; };

  helpBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (helpDropdown) helpDropdown.hidden = !helpDropdown.hidden;
  });

  helpDropdown?.querySelectorAll('.quick-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      _showHelp(item.dataset.help);
    });
  });

  document.getElementById('help-modal-close-btn')?.addEventListener('click', _hideHelp);
  document.getElementById('help-modal-close-footer')?.addEventListener('click', _hideHelp);
  helpModal?.addEventListener('click', e => { if (e.target === e.currentTarget) _hideHelp(); });

  // Close help dropdown on outside click
  document.addEventListener('click', (e) => {
    if (helpDropdown && !helpDropdown.hidden && !e.target.closest('.quick-action-wrap')) {
      helpDropdown.hidden = true;
    }
  });

  // Refresh button
  document.getElementById('refresh-btn')
    ?.addEventListener('click', () => _refresh(true));

  // Notifications bell
  document.getElementById('notifications-btn')
    ?.addEventListener('click', () => showNotificationsModal());
  document.getElementById('notifications-modal-close-btn')
    ?.addEventListener('click', hideNotificationsModal);
  document.getElementById('notifications-modal-close-footer')
    ?.addEventListener('click', hideNotificationsModal);
  document.getElementById('notifications-modal')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) hideNotificationsModal(); });

  // Consent banner
  document.getElementById('consent-grant-btn')
    ?.addEventListener('click', _grantAzureAccess);
  document.getElementById('consent-dismiss-btn')
    ?.addEventListener('click', () => {
      const banner = document.getElementById('consent-banner');
      if (banner) banner.hidden = true;
    });

  // Profiles button (header)
  document.getElementById('profiles-btn')
    ?.addEventListener('click', () => showProfilesModal());

  // Settings button (header)
  document.getElementById('settings-btn')
    ?.addEventListener('click', () => showSettingsModal());

  document.getElementById('settings-modal-close-btn')
    ?.addEventListener('click', hideSettingsModal);
  document.getElementById('settings-modal-close-footer')
    ?.addEventListener('click', hideSettingsModal);

  document.querySelectorAll('#settings-modal .theme-card').forEach(card => {
    card.addEventListener('click', () => applyTheme(card.dataset.theme));
  });

  // PIM surface pills
  document.querySelectorAll('#settings-modal .flag-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const key    = btn.dataset.flag;
      const active = !_flags[key];
      _saveFlag(key, active);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });
  });

  // Default duration
  document.getElementById('settings-default-duration')?.addEventListener('change', e => {
    const val = Math.min(24, Math.max(0.5, parseFloat(e.target.value) || 8));
    _flags.defaultDuration = val;
    e.target.value = val;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
  });

  // Show active in eligible toggle
  document.getElementById('flag-show-active')?.addEventListener('click', () => {
    const on = !_flags.showActiveInEligible;
    _flags.showActiveInEligible = on;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    const btn = document.getElementById('flag-show-active');
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-checked', on); }
    _refresh();
  });

  // Show inactive policies toggle
  document.getElementById('flag-show-inactive')?.addEventListener('click', () => {
    const on = !_flags.showInactivePolicies;
    _flags.showInactivePolicies = on;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    const btn = document.getElementById('flag-show-inactive');
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-checked', on); }
    _applyInactivePolicies();
    const qbtn = document.getElementById('quick-labels-btn');
    if (qbtn) { qbtn.classList.toggle('active', on); qbtn.setAttribute('aria-pressed', on); }
  });

  // Swap sections toggle
  document.getElementById('flag-swap-sections')?.addEventListener('click', () => {
    const on = !_flags.swapSections;
    _flags.swapSections = on;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    const btn = document.getElementById('flag-swap-sections');
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-checked', on); }
    _applySectionOrder();
  });

  // Persist section state toggle
  document.getElementById('flag-persist-sections')?.addEventListener('click', () => {
    const on = !_flags.persistSectionState;
    _flags.persistSectionState = on;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    const btn = document.getElementById('flag-persist-sections');
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-checked', on); }
    if (!on) localStorage.removeItem(SECTION_STATE_KEY);
  });

  // Persist filter bar state toggle
  document.getElementById('flag-persist-filter-bar')?.addEventListener('click', () => {
    const on = !_flags.persistFilterBarState;
    _flags.persistFilterBarState = on;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    const btn = document.getElementById('flag-persist-filter-bar');
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-checked', on); }
    if (!on) {
      localStorage.removeItem(FILTER_BAR_STATE_KEY);
      localStorage.removeItem(ACTIVE_FILTER_BAR_STATE_KEY);
    }
  });

  // Per-tenant profiles toggle
  document.getElementById('flag-tenant-profiles')?.addEventListener('click', () => {
    const on = !_flags.tenantScopedProfiles;
    _flags.tenantScopedProfiles = on;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    const btn = document.getElementById('flag-tenant-profiles');
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-checked', on); }
  });

  // Settings group collapse toggles
  document.querySelectorAll('.settings-group-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.settings-group');
      const nowCollapsed = group.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', !nowCollapsed);
    });
  });

  // Section collapse buttons
  document.getElementById('section-active')?.querySelector('.section-collapse-btn')
    ?.addEventListener('click', () => _toggleSection('section-active'));
  document.getElementById('section-eligible')?.querySelector('.section-collapse-btn')
    ?.addEventListener('click', () => _toggleSection('section-eligible'));

  // Quick actions
  document.getElementById('flag-quick-appearance')?.addEventListener('change', e => {
    _flags.quickAppearance = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });

  document.getElementById('flag-quick-inactive')?.addEventListener('change', e => {
    _flags.quickInactivePolicies = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });

  // Reset settings to defaults
  document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
    document.getElementById('settings-reset-btn').hidden = true;
    document.getElementById('settings-reset-confirm').hidden = false;
  });
  document.getElementById('settings-reset-no')?.addEventListener('click', () => {
    document.getElementById('settings-reset-btn').removeAttribute('hidden');
    document.getElementById('settings-reset-confirm').hidden = true;
  });
  document.getElementById('settings-reset-yes')?.addEventListener('click', () => {
    // Remove all pim-portal-* keys from both storages
    [localStorage, sessionStorage].forEach(store => {
      Object.keys(store)
        .filter(k => k.startsWith('pim-portal-'))
        .forEach(k => store.removeItem(k));
    });
    location.reload();
  });

  // Activation modal profile save toggle
  document.getElementById('save-profile-checkbox')?.addEventListener('change', e => {
    document.getElementById('profile-name-row').hidden = !e.target.checked;
    if (e.target.checked) document.getElementById('profile-name-input')?.focus();
  });

  document.getElementById('schedule-toggle-btn')?.addEventListener('click', e => {
    const enabled = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    _setScheduleControls(enabled);
    if (enabled) document.getElementById('schedule-start-input')?.focus();
  });

  document.getElementById('schedule-start-input')?.addEventListener('input', () => {
    _clearFieldError('schedule-start-input', 'schedule-start-error');
  });

  // Profiles modal close
  document.getElementById('profiles-modal-close-btn')
    ?.addEventListener('click', hideProfilesModal);
  document.getElementById('profiles-modal-close-footer')
    ?.addEventListener('click', hideProfilesModal);
  document.getElementById('profiles-modal')
    ?.addEventListener('click', e => {
      if (e.target === e.currentTarget) hideProfilesModal();
    });

  // Profiles Export/Import
  document.getElementById('profiles-export-btn')
    ?.addEventListener('click', _handleExportProfiles);
  document.getElementById('profiles-import-btn')
    ?.addEventListener('click', () => document.getElementById('profiles-import-input')?.click());
  document.getElementById('profiles-import-input')
    ?.addEventListener('change', _handleImportProfiles);

  // Select all — eligible
  document.getElementById('select-all-eligible')
    ?.addEventListener('change', e => roleManager.selectAllEligible(e.target.checked));

  // Select all — active
  document.getElementById('select-all-active')
    ?.addEventListener('change', e => roleManager.selectAllActive(e.target.checked));

  
  // User context card expand toggle
  document.getElementById('uc-expand-btn')?.addEventListener('click', () => {
    const card = document.getElementById('user-context-card');
    if (card) card.classList.toggle('expanded');
    const btn = document.getElementById('uc-expand-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    }
  });

  // Filter bar toggle button
  document.getElementById('filter-toggle-btn')?.addEventListener('click', () => {
    _filterBarOpen = !_filterBarOpen;
    _applyFilterBarState();
    if (_flags.persistFilterBarState) {
      localStorage.setItem(FILTER_BAR_STATE_KEY, String(_filterBarOpen));
    }
  });

  // Eligible search — re-render + toggle Save button visibility
  const _eligSearch = document.getElementById('eligible-search');
  _eligSearch?.addEventListener('input', () => {
    roleManager.renderEligible();
    const saveBtn = document.getElementById('save-filter-btn');
    if (saveBtn) saveBtn.hidden = !_eligSearch.value.trim();
  });

  // Save current search as quick filter, activate it immediately, clear the input
  document.getElementById('save-filter-btn')?.addEventListener('click', () => {
    const q = _eligSearch?.value.trim();
    if (!q) return;
    _addQuickFilter(q);
    const newFilter = _getQuickFilters().find(f => f.query.toLowerCase() === q.toLowerCase());
    if (newFilter) roleManager._activeSavedFilterId = newFilter.id;
    if (_eligSearch) _eligSearch.value = '';
    const saveBtn = document.getElementById('save-filter-btn');
    if (saveBtn) saveBtn.hidden = true;
    roleManager.renderFilterBar();
    roleManager.renderEligible();
  });

  // Type filter pills (radio group — "All" is explicit reset)
  document.getElementById('filter-type-group')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-type-pill');
    if (!btn) return;
    const raw = btn.dataset.typeFilter;
    roleManager._typeFilter = raw === 'null' ? null : raw;
    roleManager.renderFilterBar();
    roleManager.renderEligible();
  });

  // Initial filter bar render (restores saved pills from previous session)
  roleManager.renderFilterBar();
  roleManager.renderActiveFilterBar();

  // Active filter bar toggle button
  document.getElementById('active-filter-toggle-btn')?.addEventListener('click', () => {
    _activeFilterBarOpen = !_activeFilterBarOpen;
    _applyActiveFilterBarState();
    if (_flags.persistFilterBarState) {
      localStorage.setItem(ACTIVE_FILTER_BAR_STATE_KEY, String(_activeFilterBarOpen));
    }
  });

  // Active search — re-render + toggle Save button visibility
  const _activeSearch = document.getElementById('active-search');
  _activeSearch?.addEventListener('input', () => {
    roleManager.renderActive();
    const saveBtn = document.getElementById('active-save-filter-btn');
    if (saveBtn) saveBtn.hidden = !_activeSearch.value.trim();
  });

  // Save active search as quick filter
  document.getElementById('active-save-filter-btn')?.addEventListener('click', () => {
    const q = _activeSearch?.value.trim();
    if (!q) return;
    _addActiveQuickFilter(q);
    const newFilter = _getActiveQuickFilters().find(f => f.query.toLowerCase() === q.toLowerCase());
    if (newFilter) roleManager._activeSavedId = newFilter.id;
    if (_activeSearch) _activeSearch.value = '';
    const saveBtn = document.getElementById('active-save-filter-btn');
    if (saveBtn) saveBtn.hidden = true;
    roleManager.renderActiveFilterBar();
    roleManager.renderActive();
  });

  // Active type filter pills
  document.getElementById('active-filter-type-group')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-type-pill');
    if (!btn) return;
    const raw = btn.dataset.typeFilter;
    roleManager._activeTypeFilter = raw === 'null' ? null : raw;
    roleManager.renderActiveFilterBar();
    roleManager.renderActive();
  });

  // Activate button (opens modal)
  document.getElementById('activate-btn')
    ?.addEventListener('click', () => {
      const roles = roleManager.getSelectedEligibleRoles();
      if (roles.length) showActivationModal(roles);
    });

  // Deactivate button
  document.getElementById('deactivate-btn')
    ?.addEventListener('click', handleDeactivate);

  // Modal confirm
  document.getElementById('modal-confirm-btn')
    ?.addEventListener('click', handleActivate);

  // Modal cancel / close
  document.getElementById('modal-cancel-btn')
    ?.addEventListener('click', hideActivationModal);
  document.getElementById('modal-close-btn')
    ?.addEventListener('click', hideActivationModal);
  document.getElementById('activation-modal')
    ?.addEventListener('click', e => {
      if (e.target === e.currentTarget) hideActivationModal();
    });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const actModal   = document.getElementById('activation-modal');
    const profModal  = document.getElementById('profiles-modal');
    const notifModal = document.getElementById('notifications-modal');
    const setModal   = document.getElementById('settings-modal');
    const helpModal  = document.getElementById('help-modal');
    if (actModal   && !actModal.hidden)   { hideActivationModal();    return; }
    if (profModal  && !profModal.hidden)  { hideProfilesModal();      return; }
    if (notifModal && !notifModal.hidden) { hideNotificationsModal(); return; }
    if (setModal   && !setModal.hidden)   { hideSettingsModal();      return; }
    if (helpModal  && !helpModal.hidden)  { _hideHelp?.();            return; }
  });

  // Duration preset buttons
  document.getElementById('duration-presets')?.addEventListener('click', e => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    document.getElementById('duration-hours').value = btn.dataset.h;
    document.getElementById('duration-mins').value  = btn.dataset.m;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
  // Slider ↔ inputs sync
  const slider = document.getElementById('duration-slider');
  const hrsEl  = document.getElementById('duration-hours');
  const minsEl = document.getElementById('duration-mins');
  const _syncSliderFromInputs = () => {
    if (!slider) return;
    const total = (parseInt(hrsEl?.value || '0', 10) || 0) * 60 + (parseInt(minsEl?.value || '0', 10) || 0);
    slider.value = Math.min(total, Number(slider.max));
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  };
  slider?.addEventListener('input', () => {
    const total = parseInt(slider.value, 10) || 0;
    if (hrsEl)  hrsEl.value  = Math.floor(total / 60);
    if (minsEl) minsEl.value = total % 60;
    const h = Math.floor(total / 60), m = total % 60;
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.h) === h && Number(b.dataset.m) === m);
    });
  });
  hrsEl?.addEventListener('input',  _syncSliderFromInputs);
  minsEl?.addEventListener('input', _syncSliderFromInputs);

  // Select-all text on focus so typing replaces the value
  hrsEl?.addEventListener('focus',  () => hrsEl.select());
  minsEl?.addEventListener('focus', () => minsEl.select());

  // Clear preset active state when inputs are manually changed
  const _clearPresets = () => document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('duration-hours')?.addEventListener('input', _clearPresets);
  document.getElementById('duration-mins')?.addEventListener('input', _clearPresets);

  // Clear inline validation errors on input
  document.getElementById('justification-input')
    ?.addEventListener('input', () => _clearFieldError('justification-input', 'justification-error'));
  document.getElementById('ticket-input')
    ?.addEventListener('input', () => _clearFieldError('ticket-input', 'ticket-error'));

  // Duration clamp: hours [0..999], mins [0..59]
  document.getElementById('duration-hours')?.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    if (isNaN(v) || v < 0)   e.target.value = 0;
    if (v > 999)              e.target.value = 999;
  });
  document.getElementById('duration-mins')?.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    if (isNaN(v) || v < 0)   e.target.value = 0;
    if (v > 59)               e.target.value = 59;
  });

  // ── Load roles ─────────────────────────────────────────────────────────────
  _refresh();

  // ── Resume pending activation after CA auth-context redirect ──────────────
  // If handleActivate saved activation state before an acquireTokenRedirect for
  // Conditional Access step-up, resume the activation now that we're back.
  const _savedActivation = sessionStorage.getItem(PENDING_ACTIVATION_KEY);
  if (_savedActivation) {
    sessionStorage.removeItem(PENDING_ACTIVATION_KEY);
    try {
      const saved = JSON.parse(_savedActivation);
      const { cappedRoles, justification, ticketNumber, authContextId, claims, scheduledStartDateTime, claimsChallengeRetried } = saved;
      // Reactive claims-challenge resume: replay the server-issued claims blob
      // verbatim. Falls back to authContextId for the proactive step-up path.
      if (claims) {
        portalAuth.setRawClaims(claims);
      } else if (authContextId) {
        portalAuth.setAuthContextClaims(authContextId);
      }
      await _executeActivation(cappedRoles, justification, ticketNumber, {
        scheduledStartDateTime: scheduledStartDateTime || null,
        claimsChallengeRetried: !!claimsChallengeRetried
      });
    } catch (err) {
      showToast({ title: 'Activation failed', description: 'Could not resume after authentication: ' + err.message, type: 'error', duration: 10000 });
      console.error('[App] Post-redirect activation error:', err);
    } finally {
      portalAuth.setAuthContextClaims(null);
    }
  }
}

// No-op (removed duplicate definition)

// Start
bootstrap().catch(err => {
  console.error('[App] Fatal bootstrap error:', err);
  const overlay = document.getElementById('loading-overlay');
  const msg     = document.getElementById('loading-msg');
  if (msg)     msg.textContent = 'Error: ' + err.message;
  if (overlay) {
    const btn = document.createElement('button');
    btn.textContent = 'Sign in';
    btn.className   = 'btn btn-primary';
    btn.style.marginTop = '14px';
    btn.addEventListener('click', () => portalAuth.signIn().catch(() => {}));
    overlay.appendChild(btn);
  }
});
