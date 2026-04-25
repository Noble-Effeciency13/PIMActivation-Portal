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

  // Proactive auth context step-up — collect unique acrs values from selected roles
  // and acquire tokens with those claims before activation. Uses popup so the user
  // can satisfy Conditional Access (MFA, compliant device, …) without navigating away.
  const authContextIds = [...new Set(
    cappedRoles
      .filter(r => r.requiresAuthContext && r.authContextId)
      .map(r => r.authContextId)
  )];
  if (authContextIds.length > 0) {
    try {
      showProgress('Completing authentication requirements\u2026');
      await portalAuth.stepUpForAuthContexts(authContextIds, cappedRoles);
      // Thread the auth context claims into every subsequent token acquisition
      // so both ARM and Graph tokens carry the required acrs claim.
      portalAuth.setAuthContextClaims(authContextIds[0]);
    } catch (err) {
      hideProgress();
      showToast('Authentication step-up failed: ' + err.message, 'error', 10000);
      console.error('[App] Auth context step-up error:', err);
      return;
    }
  }

  showProgress('Activating ' + cappedRoles.length + ' role' + (cappedRoles.length !== 1 ? 's' : '') + '…');

  try {
    const outcome = await batchClient.bulkActivate(cappedRoles, { justification, ticketNumber });
    hideProgress();
    const ok   = outcome.summary?.succeeded ?? outcome.results?.filter(r => r.success).length ?? 0;
    const fail = outcome.summary?.failed    ?? outcome.results?.filter(r => !r.success).length ?? 0;
    const pendingApproval = (outcome.results || []).filter(r => r.pendingApproval).length;
    if (fail === 0 && pendingApproval === 0) {
      showToast('Successfully activated ' + ok + ' role' + (ok !== 1 ? 's' : '') + '.', 'success');
    } else if (pendingApproval > 0 && fail === 0) {
      showToast(ok + ' activated. ' + pendingApproval + ' awaiting approval.', 'info', 8000);
    } else if (ok === 0 && pendingApproval === 0) {
      showToast('Activation failed for all ' + fail + ' role' + (fail !== 1 ? 's' : '') + '. Check console.', 'error');
    } else {
      showToast(ok + ' role' + (ok !== 1 ? 's' : '') + ' activated. ' + fail + ' failed. Check console.', 'warning');
    }
    await _refresh();
  } catch (err) {
    hideProgress();
    showToast('Activation error: ' + err.message, 'error', 10000);
    console.error('[App] Activate error:', err);
  } finally {
    portalAuth.setAuthContextClaims(null);
  }
}

// ── Deactivation handler ──────────────────────────────────────────────────────

async function handleDeactivate() {
  const roles = roleManager.getSelectedActiveRoles().filter(r => r.endDateTime);
  if (!roles.length) { showToast('Select at least one PIM-managed active role.', 'warning'); return; }

  showProgress('Deactivating ' + roles.length + ' role' + (roles.length !== 1 ? 's' : '') + '…');
  try {
    const outcome = await batchClient.bulkDeactivate(roles);
    hideProgress();
    const ok   = outcome.summary?.succeeded ?? outcome.results?.filter(r => r.success).length ?? 0;
    const fail = outcome.summary?.failed    ?? outcome.results?.filter(r => !r.success).length ?? 0;
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
  try {
    await roleManager.loadRoles();
  } catch (err) {
    showToast('Failed to refresh roles: ' + err.message, 'error');
  }
}

// ── Activation profiles ────────────────────────────────────────────────────

function showProfilesModal(focusSave = false) {
  const modal = document.getElementById('profiles-modal');
  if (!modal) return;
  _renderProfilesList();
  modal.hidden = false;
  if (focusSave) setTimeout(() => document.getElementById('profile-name-input')?.focus(), 50);
}

function hideProfilesModal() {
  const modal = document.getElementById('profiles-modal');
  if (modal) modal.hidden = true;
}

async function _renderProfilesList() {
  const body = document.getElementById('profiles-modal-body');
  if (!body) return;

  const profiles = await profileManager.getProfiles().catch(() => []);
  const selected = roleManager.getSelectedEligibleRoles();

  let html = '';

  // Save-new-profile row
  html += '<div class="form-row profile-save-row">' +
    '<input type="text" id="profile-name-input" class="form-input" placeholder="Profile name…" maxlength="60" style="flex:1">' +
    '<button class="btn btn-primary btn-sm" id="profile-save-confirm-btn"' +
      (selected.length === 0 ? ' disabled title="Select eligible roles first"' : '') + '>' +
      'Save (' + selected.length + ' role' + (selected.length !== 1 ? 's' : '') + ')' +
    '</button>' +
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
      html +=
        '<div class="profile-item">' +
          '<div class="profile-info">' +
            '<div class="profile-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="profile-meta">' + p.roles.length + ' role' + (p.roles.length !== 1 ? 's' : '') + ' · ' + lastUsed + '</div>' +
          '</div>' +
          '<div class="profile-actions">' +
            '<button class="btn btn-primary btn-sm profile-activate-btn" data-profile-id="' + escapeHtml(p.id) + '">Activate</button>' +
            '<button class="btn btn-danger btn-sm profile-delete-btn" data-profile-id="' + escapeHtml(p.id) + '" aria-label="Delete profile">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
                '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>';
    }
    html += '</div>';
  }

  body.innerHTML = html;

  // Wire save
  const saveBtn = document.getElementById('profile-save-confirm-btn');
  const nameInput = document.getElementById('profile-name-input');
  saveBtn?.addEventListener('click', _handleSaveProfile);
  nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleSaveProfile(); });

  // Wire activate
  body.querySelectorAll('.profile-activate-btn').forEach(btn => {
    btn.addEventListener('click', () => _handleActivateProfile(btn.dataset.profileId));
  });

  // Wire delete
  body.querySelectorAll('.profile-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this profile?')) return;
      await profileManager.deleteProfile(btn.dataset.profileId).catch(() => {});
      _renderProfilesList();
    });
  });
}

async function _handleSaveProfile() {
  const nameInput = document.getElementById('profile-name-input');
  const name = nameInput?.value.trim();
  if (!name) { nameInput?.focus(); showToast('Enter a profile name.', 'warning'); return; }
  const roles = roleManager.getSelectedEligibleRoles();
  if (!roles.length) { showToast('Select eligible roles first.', 'warning'); return; }
  try {
    await profileManager.saveProfile(name, roles);
    showToast('Profile "' + name + '" saved.', 'success');
    _renderProfilesList();
  } catch (err) {
    showToast('Failed to save profile: ' + err.message, 'error');
  }
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
    showToast('No matching eligible roles found. Try refreshing roles first.', 'warning', 8000);
    return;
  }
  const skipped = profile.roles.length - resolved.length;
  if (skipped > 0) showToast(skipped + ' role(s) are no longer eligible and were skipped.', 'warning', 6000);

  await profileManager.touchProfile(profileId).catch(() => {});
  hideProfilesModal();
  showActivationModal(resolved);
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

  // Initialise profile DB (non-blocking — it'll be ready long before the user clicks Save)
  profileManager.init().catch(err => console.warn('[App] ProfileManager init failed:', err));

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

  // Profiles button (header)
  document.getElementById('profiles-btn')
    ?.addEventListener('click', () => showProfilesModal());

  // Save as profile (eligible action bar)
  document.getElementById('save-profile-btn')
    ?.addEventListener('click', () => showProfilesModal(true));

  // Profiles modal close
  document.getElementById('profiles-modal-close-btn')
    ?.addEventListener('click', hideProfilesModal);
  document.getElementById('profiles-modal-close-footer')
    ?.addEventListener('click', hideProfilesModal);
  document.getElementById('profiles-modal')
    ?.addEventListener('click', e => {
      if (e.target === e.currentTarget) hideProfilesModal();
    });

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
    if (e.key !== 'Escape') return;
    const actModal  = document.getElementById('activation-modal');
    const profModal = document.getElementById('profiles-modal');
    if (actModal  && !actModal.hidden)  { hideActivationModal();  return; }
    if (profModal && !profModal.hidden) { hideProfilesModal();    return; }
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

  // ── Load roles (renders progressively; Azure appended when ready) ─────────
  roleManager.loadRoles().catch(err => {
    console.error('[App] loadRoles error:', err);
    showToast('Failed to load roles: ' + err.message, 'error', 10000);
  });
}

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