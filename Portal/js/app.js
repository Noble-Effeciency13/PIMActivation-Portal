/**
 * Portal bootstrap — app.js
 * Copyright © 2026 Sebastian Flæng Markdanner — MIT License
 *
 * Wires together auth, role rendering, activation modal, profiles panel,
 * and all UI event listeners.
 */

/* global portalAuth, roleManager, batchClient, profileManager, policyCache, PolicyCache */

// ── Utility helpers (used by other modules too) ───────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExpiry(isoString) {
  if (!isoString) return '–';
  const now  = Date.now();
  const end  = new Date(isoString).getTime();
  const diff = Math.max(0, end - now);
  if (diff === 0) return 'Expired';
  const h    = Math.floor(diff / 3600000);
  const m    = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function showToast(message, type = 'info', durationMs = 6000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

function showProgress(label) {
  const container = document.getElementById('progress-bar-container');
  const lbl       = document.getElementById('progress-bar-label');
  const fill      = document.getElementById('progress-bar-fill');
  if (container) container.hidden = false;
  if (lbl)       lbl.textContent  = label || '';
  if (fill)      fill.style.width = '0%';
}

function updateProgress(done, total, label) {
  const fill = document.getElementById('progress-bar-fill');
  const lbl  = document.getElementById('progress-bar-label');
  if (fill) fill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '100%';
  if (lbl && label) lbl.textContent = label;
}

function hideProgress() {
  const container = document.getElementById('progress-bar-container');
  if (container) container.hidden = true;
}

// Expose globally for roles.js and other modules
window.escapeHtml   = escapeHtml;
window.formatExpiry = formatExpiry;
window.showToast    = showToast;

// ── Activation modal ──────────────────────────────────────────────────────────

let _rolesToActivate = [];

function showActivationModal(roles) {
  _rolesToActivate = roles;
  const modal  = document.getElementById('activation-modal');
  const list   = document.getElementById('activation-role-list');
  const form   = document.getElementById('activation-form');
  const durSel = document.getElementById('duration-select');
  const jGroup = document.getElementById('justification-group');
  const tGroup = document.getElementById('ticket-group');
  const jInput = document.getElementById('justification-input');
  const tInput = document.getElementById('ticket-input');
  if (!modal) return;

  // Determine required fields from policy flags across selected roles
  const needsJustification = roles.some(r => r.requiresJustification);
  const needsTicket        = roles.some(r => r.requiresTicket);
  const minMaxHours        = Math.min(...roles.map(r => r.maxDurationHours || 8));

  // Populate duration options
  const durations = [30, 60, 120, 240, 360, 480].filter(m => m <= minMaxHours * 60);
  if (durations.length === 0) durations.push(30);
  durSel.innerHTML = durations.map(m => {
    const label = m >= 60 ? `${m / 60}h` : `${m}m`;
    return `<option value="${m}">${label}</option>`;
  }).join('');

  // Justification field
  jGroup.style.display = '';
  jInput.required = needsJustification;
  jInput.value = '';

  // Ticket field
  tGroup.style.display = needsTicket ? '' : 'none';
  tInput.required = needsTicket;
  tInput.value = '';

  // Role list
  list.innerHTML = `<ul class="activation-role-items">${roles.map(r =>
    `<li><span class="type-badge ${r.type === 'AzureResource' ? 'badge-azure' : r.type === 'Group' ? 'badge-group' : 'badge-user'}">${r.type === 'AzureResource' ? 'Azure' : r.type === 'Group' ? 'Group' : 'Entra'}</span> ${escapeHtml(r.name)}${r.scope && r.scope !== 'Directory' ? ` <span class="role-scope">(${escapeHtml(r.scope)})</span>` : ''}</li>`
  ).join('')}</ul>`;

  modal.hidden = false;
  jInput.focus();
}

function closeActivationModal() {
  const modal = document.getElementById('activation-modal');
  if (modal) modal.hidden = true;
  _rolesToActivate = [];
}

async function handleActivate() {
  const form  = document.getElementById('activation-form');
  if (!form.reportValidity()) return;

  const durSel = document.getElementById('duration-select');
  const jInput = document.getElementById('justification-input');
  const tInput = document.getElementById('ticket-input');

  const durationMinutes = parseInt(durSel.value, 10);
  const justification   = jInput.value.trim();
  const ticketNumber    = tInput.value.trim() || null;
  const roles           = [..._rolesToActivate];

  closeActivationModal();
  showProgress('Activating roles…');

  try {
    // Cap each role to its policy max
    const cappedRoles = roles.map(role => {
      const maxMin = role.maxDurationHours ? role.maxDurationHours * 60 : null;
      const eff    = maxMin && durationMinutes > maxMin ? maxMin : durationMinutes;
      return { ...role, _effectiveDuration: eff };
    });
    const minEff = Math.min(...cappedRoles.map(r => r._effectiveDuration));

    updateProgress(0, roles.length, 'Sending bulk request…');
    const result = await batchClient.bulkActivate(
      cappedRoles.map(({ _effectiveDuration, ...r }) => r),
      { durationMinutes: minEff, justification: justification || 'Activated via PIM Portal', ticketNumber }
    );

    updateProgress(roles.length, roles.length, 'Done');
    hideProgress();

    const uidToRole = Object.fromEntries(cappedRoles.map(r => [r.uid || r.id, r]));
    const succeeded = result.results.filter(r => r.success).map(r => uidToRole[r.uid]?.name || r.uid);
    const failed    = result.results.filter(r => !r.success).map(r => ({ name: uidToRole[r.uid]?.name || r.uid, error: r.error }));

    if (failed.length === 0) {
      showToast(`Activated ${succeeded.length} role(s)`, 'success');
      await new Promise(res => setTimeout(res, 3000));
      await roleManager.loadRoles();
    } else {
      const details = [
        succeeded.length > 0 ? `Activated: ${succeeded.join(', ')}` : '',
        `Failed (${failed.length}): ${failed.map(f => `${f.name}: ${f.error}`).join('; ')}`
      ].filter(Boolean).join('\n');
      showToast(details, 'error', 12000);
      if (succeeded.length > 0) {
        await new Promise(res => setTimeout(res, 5000));
        await roleManager.loadRoles();
      }
    }
  } catch (err) {
    hideProgress();
    showToast(`Activation error: ${err.message}`, 'error');
  }
}

// ── Deactivate ────────────────────────────────────────────────────────────────

async function handleDeactivate() {
  const roles = roleManager.getSelectedActiveRoles();
  if (roles.length === 0) return;
  if (!confirm(`Deactivate ${roles.length} role(s)?`)) return;

  showProgress('Deactivating…');

  try {
    updateProgress(0, roles.length, 'Sending bulk request…');
    const result = await batchClient.bulkDeactivate(roles);
    updateProgress(roles.length, roles.length, 'Done');
    hideProgress();

    const uidToRole = Object.fromEntries(roles.map(r => [r.uid || r.id, r]));
    const succeeded = result.results.filter(r => r.success).map(r => uidToRole[r.uid]?.name || r.uid);
    const failed    = result.results.filter(r => !r.success).map(r => ({ name: uidToRole[r.uid]?.name || r.uid, error: r.error }));

    if (failed.length === 0) {
      showToast(`Deactivated ${succeeded.length} role(s)`, 'success');
    } else {
      showToast(
        `${succeeded.length} deactivated, ${failed.length} failed:\n${failed.map(f => `${f.name}: ${f.error}`).join('\n')}`,
        'error', 12000
      );
    }
    await new Promise(res => setTimeout(res, 2000));
    await roleManager.loadRoles();
  } catch (err) {
    hideProgress();
    showToast(`Deactivation error: ${err.message}`, 'error');
  }
}

// ── Profiles panel ────────────────────────────────────────────────────────────

async function renderProfiles() {
  const container = document.getElementById('profiles-list');
  if (!container) return;

  const profiles = await profileManager.getProfiles();
  document.getElementById('profiles-count').textContent = `${profiles.length} profile(s)`;

  if (profiles.length === 0) {
    container.innerHTML = '<p class="empty-message">No saved profiles yet. Select eligible roles and click "Save current selection as profile".</p>';
    return;
  }

  container.innerHTML = profiles
    .sort((a, b) => (b.lastUsedAt || b.createdAt).localeCompare(a.lastUsedAt || a.createdAt))
    .map(p => `
    <div class="profile-card" data-id="${escapeHtml(p.id)}">
      <div class="profile-card-header">
        <span class="profile-name">${escapeHtml(p.name)}</span>
        <span class="profile-meta">${p.roles.length} role(s) · ${p.lastUsedAt ? 'Used ' + _relativeTime(p.lastUsedAt) : 'Never used'}</span>
      </div>
      <div class="profile-card-roles">${p.roles.map(r => escapeHtml(r.name)).join(', ')}</div>
      <div class="profile-card-actions">
        <button class="btn btn-primary btn-sm profile-activate-btn" data-id="${escapeHtml(p.id)}">Activate</button>
        <button class="btn btn-ghost btn-sm profile-delete-btn"   data-id="${escapeHtml(p.id)}">Delete</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('.profile-activate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const profile = profiles.find(p => p.id === btn.dataset.id);
      if (!profile) return;
      await profileManager.touchProfile(profile.id);
      // Select those roles in the eligible table
      profile.roles.forEach(r => roleManager.selectedEligible.add(r.uid));
      roleManager.updateButtons();
      // Switch to eligible tab and show activation modal
      switchTab('eligible');
      const selectedRoles = roleManager.getSelectedEligibleRoles();
      if (selectedRoles.length > 0) showActivationModal(selectedRoles);
    });
  });

  container.querySelectorAll('.profile-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this profile?')) return;
      await profileManager.deleteProfile(btn.dataset.id);
      await renderProfiles();
    });
  });
}

function _relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const d    = Math.floor(diff / 86400000);
  const h    = Math.floor(diff / 3600000);
  const m    = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  document.querySelectorAll('.panel').forEach(panel => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
  const eligBar  = document.getElementById('eligible-action-bar');
  const actBar   = document.getElementById('active-action-bar');
  if (eligBar) eligBar.style.display = tabName === 'eligible' && roleManager.selectedEligible.size > 0 ? 'flex' : 'none';
  if (actBar)  actBar.style.display  = tabName === 'active'   && roleManager.selectedActive.size   > 0 ? 'flex' : 'none';
  if (tabName === 'profiles') renderProfiles();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  // Show loading
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingMessage = document.getElementById('loading-message');
  const app            = document.getElementById('app');
  const signInScreen   = document.getElementById('sign-in-screen');

  if (loadingMessage) loadingMessage.textContent = 'Initializing…';

  // Initialize IndexedDB profiles store
  try {
    await profileManager.init();
  } catch (err) {
    console.warn('[App] IndexedDB init error (profiles disabled):', err);
  }

  // Handle MSAL redirect
  let account;
  try {
    account = await portalAuth.initAuth();
  } catch (err) {
    console.error('[App] MSAL init error:', err);
  }

  if (!account) {
    // No cached account — redirect immediately to Microsoft login.
    // The page will navigate away; on return handleRedirectPromise() picks up the result.
    if (loadingMessage) loadingMessage.textContent = 'Redirecting to sign-in…';
    try {
      await portalAuth.signIn();
    } catch (err) {
      // Only reached if loginRedirect itself throws before navigating (very rare).
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      if (signInScreen)   signInScreen.style.display   = '';
      const btn = document.getElementById('sign-in-btn');
      if (btn) {
        btn.textContent = 'Retry sign-in';
        btn.addEventListener('click', () => portalAuth.signIn(), { once: true });
      }
    }
    return;
  }

  // Signed in — show app
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (signInScreen)   signInScreen.style.display   = 'none';
  if (app)            app.style.display             = '';

  // Display user name
  const userName = account.name || account.username || '';
  const userNameEl = document.getElementById('user-name');
  if (userNameEl) userNameEl.textContent = userName;

  // Wire header buttons
  document.getElementById('sign-out-btn')?.addEventListener('click', () => {
    portalAuth.signOut().catch(err => showToast(`Sign-out failed: ${err.message}`, 'error'));
  });
  document.getElementById('refresh-btn')?.addEventListener('click', () => roleManager.loadRoles());

  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Wire activation modal
  document.getElementById('activate-selected-btn')?.addEventListener('click', () => {
    const roles = roleManager.getSelectedEligibleRoles();
    if (roles.length > 0) showActivationModal(roles);
  });
  document.getElementById('activate-btn')?.addEventListener('click', () => {
    const roles = roleManager.getSelectedEligibleRoles();
    if (roles.length > 0) showActivationModal(roles);
  });
  document.getElementById('activation-modal-close')?.addEventListener('click',  closeActivationModal);
  document.getElementById('activation-cancel-btn')?.addEventListener('click',   closeActivationModal);
  document.getElementById('activation-confirm-btn')?.addEventListener('click',  handleActivate);
  document.getElementById('activation-form')?.addEventListener('submit', e => { e.preventDefault(); handleActivate(); });

  // Wire deactivation
  document.getElementById('deactivate-selected-btn')?.addEventListener('click', handleDeactivate);
  document.getElementById('deactivate-btn')?.addEventListener('click',          handleDeactivate);

  // Wire search inputs
  document.getElementById('eligible-search')?.addEventListener('input', () => roleManager.renderEligibleRoles());
  document.getElementById('active-search')?.addEventListener('input',   () => roleManager.renderActiveRoles());

  // Wire select-all checkboxes
  document.getElementById('select-all-eligible')?.addEventListener('change', e => {
    document.querySelectorAll('.eligible-check').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) roleManager.selectedEligible.add(cb.dataset.uid);
      else                  roleManager.selectedEligible.delete(cb.dataset.uid);
    });
    roleManager.updateButtons();
  });
  document.getElementById('select-all-active')?.addEventListener('change', e => {
    document.querySelectorAll('.active-check').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) roleManager.selectedActive.add(cb.dataset.uid);
      else                  roleManager.selectedActive.delete(cb.dataset.uid);
    });
    roleManager.updateButtons();
  });

  // Wire profile save
  document.getElementById('save-profile-btn')?.addEventListener('click', () => {
    const roles = roleManager.getSelectedEligibleRoles();
    if (roles.length === 0) { showToast('Select eligible roles first.', 'info'); return; }
    const preview = document.getElementById('profile-roles-preview');
    if (preview) preview.textContent = `Roles: ${roles.map(r => r.name).join(', ')}`;
    document.getElementById('profile-modal').hidden     = false;
    document.getElementById('profile-name-input').value = '';
    document.getElementById('profile-name-input').focus();
  });
  document.getElementById('profile-modal-close')?.addEventListener('click', () => {
    document.getElementById('profile-modal').hidden = true;
  });
  document.getElementById('profile-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('profile-modal').hidden = true;
  });
  document.getElementById('profile-save-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('profile-name-input').value.trim();
    if (!name) { showToast('Please enter a profile name.', 'error'); return; }
    const roles = roleManager.getSelectedEligibleRoles();
    await profileManager.saveProfile(name, roles);
    document.getElementById('profile-modal').hidden = true;
    showToast(`Profile "${name}" saved.`, 'success');
    if (document.getElementById('tab-profiles')?.getAttribute('aria-selected') === 'true') {
      await renderProfiles();
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });

  // Load initial role data
  if (loadingMessage) loadingMessage.textContent = 'Loading roles…';
  await roleManager.loadRoles();
}

// Kick off after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
