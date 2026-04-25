/**
 * app.js — Bootstrap & UI orchestration
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 */

/* global msal, portalAuth, roleManager, batchClient */

// ── Globals exposed for roles.js / templates ──────────────────────────────────

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

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Progress bar ──────────────────────────────────────────────────────────────

let _progressEl   = null;
let _progressFill = null;
let _progressLbl  = null;

function showProgress(label) {
  _progressEl   = document.getElementById('progress-bar');
  _progressFill = document.getElementById('progress-fill');
  _progressLbl  = document.getElementById('progress-label');
  if (_progressEl) _progressEl.hidden = false;
  updateProgress(0, label || 'Loading…');
}

function updateProgress(pct, label) {
  if (_progressFill) _progressFill.style.width = Math.min(100, pct) + '%';
  if (_progressLbl && label !== undefined) _progressLbl.textContent = label;
}

function hideProgress() {
  updateProgress(100);
  setTimeout(() => {
    if (_progressEl) _progressEl.hidden = true;
  }, 300);
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
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  localStorage.setItem(THEME_KEY, theme);
}

// ── Activation modal ──────────────────────────────────────────────────────────

let _pendingRoles = [];

function showActivationModal(roles) {
  _pendingRoles = roles;
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

  // Duration defaults: 8h 0m, capped to lowest role max
  const hoursInput = document.getElementById('duration-hours');
  const minsInput  = document.getElementById('duration-mins');
  const hint       = document.getElementById('duration-hint');

  if (hoursInput) hoursInput.value = 8;
  if (minsInput)  minsInput.value  = 0;

  if (hint) {
    const minMax = Math.min(...roles.map(r => r.maxDurationHours || 24).filter(h => h > 0));
    if (isFinite(minMax) && minMax < 8) {
      hint.textContent = '* Lowest policy max across selected roles is ' + minMax + 'h. Duration will be capped per role.';
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }

  // Show/hide justification & ticket rows
  const needsJust   = roles.some(r => r.requiresJustification);
  const needsTicket = roles.some(r => r.requiresTicket);
  const justRow   = document.getElementById('justification-row');
  const ticketRow = document.getElementById('ticket-row');
  if (justRow)   justRow.hidden   = !needsJust;
  if (ticketRow) ticketRow.hidden = !needsTicket;

  // Clear previous values
  const justInput   = document.getElementById('justification-input');
  const ticketInput = document.getElementById('ticket-input');
  if (justInput)   justInput.value   = '';
  if (ticketInput) ticketInput.value = '';

  modal.hidden = false;
  if (justInput && needsJust) justInput.focus();
  else if (hoursInput) hoursInput.focus();
}

function hideActivationModal() {
  const modal = document.getElementById('activation-modal');
  if (modal) modal.hidden = true;
  _pendingRoles = [];
}

function _scopeDisplayForModal(role) {
  if (role.type === 'AzureResource') return role.scope || role.scopeId || '';
  if (role.type === 'Group')         return role.scope || 'Group membership';
  const s = role.scope || role.directoryScopeId || '';
  return (s === '/' || s === 'Directory') ? 'Directory' : s;
}

// ── Activation handler ────────────────────────────────────────────────────────

async function handleActivate() {
  const hoursInput = document.getElementById('duration-hours');
  const minsInput  = document.getElementById('duration-mins');
  const justInput  = document.getElementById('justification-input');
  const ticketInput= document.getElementById('ticket-input');

  const hours          = parseInt(hoursInput?.value || '8', 10)  || 0;
  const mins           = parseInt(minsInput?.value  || '0', 10)  || 0;
  const requestedTotal = hours * 60 + mins;

  if (requestedTotal < 1) {
    showToast('Duration must be at least 1 minute.', 'warning');
    return;
  }

  const justification = justInput?.value.trim()  || '';
  const ticketNumber  = ticketInput?.value.trim() || '';

  const anyNeedsJust   = _pendingRoles.some(r => r.requiresJustification);
  const anyNeedsTicket = _pendingRoles.some(r => r.requiresTicket);

  if (anyNeedsJust && !justification) {
    showToast('Justification is required.', 'warning');
    justInput?.focus();
    return;
  }
  if (anyNeedsTicket && !ticketNumber) {
    showToast('Ticket number is required.', 'warning');
    ticketInput?.focus();
    return;
  }

  // Cap per-role duration
  const cappedRoles = _pendingRoles.map(role => {
    const maxMins = (role.maxDurationHours || 24) * 60;
    return Object.assign({}, role, {
      _effectiveDurationMinutes: Math.min(requestedTotal, maxMins)
    });
  });

  hideActivationModal();
  showProgress('Activating ' + cappedRoles.length + ' role' + (cappedRoles.length !== 1 ? 's' : '') + '…');

  try {
    const results = await batchClient.bulkActivate(cappedRoles, { justification, ticketNumber });
    hideProgress();
    const ok   = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    if (fail === 0) {
      showToast('Successfully activated ' + ok + ' role' + (ok !== 1 ? 's' : '') + '.', 'success');
    } else if (ok === 0) {
      showToast('Activation failed for all ' + fail + ' role' + (fail !== 1 ? 's' : '') + '. Check console.', 'error');
    } else {
      showToast(ok + ' role' + (ok !== 1 ? 's' : '') + ' activated. ' + fail + ' failed. Check console.', 'warning');
    }
    await _refresh();
  } catch (err) {
    hideProgress();
    showToast('Activation error: ' + err.message, 'error', 10000);
    console.error('[App] Activate error:', err);
  }
}

// ── Deactivation handler ──────────────────────────────────────────────────────

async function handleDeactivate() {
  const roles = roleManager.getSelectedActiveRoles().filter(r => r.endDateTime);
  if (!roles.length) { showToast('Select at least one PIM-managed active role.', 'warning'); return; }

  showProgress('Deactivating ' + roles.length + ' role' + (roles.length !== 1 ? 's' : '') + '…');
  try {
    const results = await batchClient.bulkDeactivate(roles);
    hideProgress();
    const ok   = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    if (fail === 0) {
      showToast('Successfully deactivated ' + ok + ' role' + (ok !== 1 ? 's' : '') + '.', 'success');
    } else {
      showToast(ok + ' deactivated, ' + fail + ' failed.', 'warning');
    }
    await _refresh();
  } catch (err) {
    hideProgress();
    showToast('Deactivation error: ' + err.message, 'error', 10000);
    console.error('[App] Deactivate error:', err);
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function _refresh() {
  showProgress('Refreshing roles…');
  try {
    await roleManager.loadRoles();
    hideProgress();
  } catch (err) {
    hideProgress();
    showToast('Failed to refresh roles: ' + err.message, 'error');
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  initTheme();

  // Handle MSAL redirect promise
  try {
    await portalAuth.initAuth();
  } catch (err) {
    console.error('[App] Auth init error:', err);
  }

  const account = portalAuth.getAccount();
  if (!account) {
    // Not signed in — redirect to login
    try { await portalAuth.signIn(); } catch { /* redirect pending */ }
    return;
  }

  // Show app
  const loading = document.getElementById('loading-overlay');
  const app     = document.getElementById('app');
  if (loading) loading.hidden = true;
  if (app)     app.hidden     = false;

  // Populate user info
  const userName = document.getElementById('user-name');
  if (userName) {
    userName.textContent =
      account.name ||
      account.username ||
      account.idTokenClaims?.preferred_username ||
      'User';
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  // Theme picker
  const themeToggle = document.getElementById('theme-btn');
  const themeDropdown = document.getElementById('theme-dropdown');

  if (themeToggle && themeDropdown) {
    themeToggle.addEventListener('click', e => {
      e.stopPropagation();
      themeDropdown.hidden = !themeDropdown.hidden;
    });
    themeDropdown.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        themeDropdown.hidden = true;
      });
    });
    document.addEventListener('click', e => {
      if (!themeDropdown.contains(e.target) && e.target !== themeToggle) {
        themeDropdown.hidden = true;
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') themeDropdown.hidden = true;
    });
  }

  // Sign out
  document.getElementById('sign-out-btn')
    ?.addEventListener('click', () => portalAuth.signOut());

  // Refresh button
  document.getElementById('refresh-btn')
    ?.addEventListener('click', () => _refresh());

  // Select all — eligible
  document.getElementById('select-all-eligible')
    ?.addEventListener('change', e => roleManager.selectAllEligible(e.target.checked));

  // Select all — active
  document.getElementById('select-all-active')
    ?.addEventListener('change', e => roleManager.selectAllActive(e.target.checked));

  // Eligible search
  document.getElementById('eligible-search')
    ?.addEventListener('input', () => roleManager.renderEligible());

  // Active search
  document.getElementById('active-search')
    ?.addEventListener('input', () => roleManager.renderActive());

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
    const modal = document.getElementById('activation-modal');
    if (e.key === 'Escape' && modal && !modal.hidden) { hideActivationModal(); }
  });

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

  // ── Load roles ────────────────────────────────────────────────────────────
  showProgress('Loading roles…');
  try {
    await roleManager.loadRoles();
  } finally {
    hideProgress();
  }
}

// Start
bootstrap().catch(err => {
  console.error('[App] Fatal bootstrap error:', err);
  const loading = document.getElementById('loading-overlay');
  if (loading) loading.textContent = 'Error: ' + err.message;
});