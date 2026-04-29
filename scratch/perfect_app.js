const fs = require('fs');
const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 1. Init flags
if (app.indexOf('showInactivePolicies: false,') === -1) {
  app = app.replace(
    /quickAppearance:\s*true,/,
    `quickAppearance:      true,
  showInactivePolicies: false,
  quickInactivePolicies: false,`
  );
}

// 2. Call _applyInactivePolicies on load
if (app.indexOf('_applyInactivePolicies();\\n\\nfunction escapeHtml') === -1 && app.indexOf('_applyInactivePolicies();\n\nfunction escapeHtml') === -1) {
  const escapeIdx = app.indexOf('function escapeHtml(str) {');
  if (escapeIdx !== -1) {
    app = app.substring(0, escapeIdx) + '_applyInactivePolicies();\n\n' + app.substring(escapeIdx);
  }
}

// 3. Define _applyInactivePolicies
if (app.indexOf('function _applyInactivePolicies() {') === -1) {
  const sectionIdx = app.indexOf('function _applySectionOrder() {');
  if (sectionIdx !== -1) {
    app = app.substring(0, sectionIdx) + `function _applyInactivePolicies() {
  document.body.classList.toggle('show-inactive-policies', !!_flags.showInactivePolicies);
}

` + app.substring(sectionIdx);
  }
}

// 4. showSettingsModal syncing - toggles
if (app.indexOf("['flag-show-inactive'") === -1) {
  app = app.replace(
    /\['flag-show-active',\s*'showActiveInEligible'\],/,
    `['flag-show-active',   'showActiveInEligible'],
    ['flag-show-inactive', 'showInactivePolicies'],`
  );
}

// 5. showSettingsModal syncing - checkboxes
if (app.indexOf('quickInactCb.checked') === -1) {
  app = app.replace(
    /if \(quickAppCb\) quickAppCb\.checked = !!_flags\.quickAppearance;/,
    `if (quickAppCb) quickAppCb.checked = !!_flags.quickAppearance;

  const quickInactCb = document.getElementById('flag-quick-inactive');
  if (quickInactCb) quickInactCb.checked = !!_flags.quickInactivePolicies;`
  );
}

// 6. _renderQuickActions UI injection
if (app.indexOf('id="quick-labels-btn"') === -1) {
  const themeBtnIdx = app.indexOf('<div class="quick-action-wrap">\\n      <button class="icon-btn" id="quick-theme-btn"');
  if (themeBtnIdx !== -1) {
    const injectStr = `\${_flags.quickInactivePolicies ? \`<div class="quick-action-wrap">
      <button class="icon-btn \${_flags.showInactivePolicies ? 'active' : ''}" id="quick-labels-btn" aria-label="Toggle Inactive Labels" title="Toggle Inactive Labels" aria-pressed="\${!!_flags.showInactivePolicies}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>\` : ''}
    `;
    app = app.substring(0, themeBtnIdx) + injectStr + app.substring(themeBtnIdx);
  } else {
    // try exact match with different line endings
    const fallbackIdx = app.indexOf('<button class="icon-btn" id="quick-theme-btn"');
    if (fallbackIdx !== -1) {
        // find previous div
        const divIdx = app.lastIndexOf('<div class="quick-action-wrap">', fallbackIdx);
        const injectStr = `\${_flags.quickInactivePolicies ? \`<div class="quick-action-wrap">
      <button class="icon-btn \${_flags.showInactivePolicies ? 'active' : ''}" id="quick-labels-btn" aria-label="Toggle Inactive Labels" title="Toggle Inactive Labels" aria-pressed="\${!!_flags.showInactivePolicies}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>\` : ''}
    `;
        app = app.substring(0, divIdx) + injectStr + app.substring(divIdx);
    }
  }
}

// 7. _renderQuickActions click listener
if (app.indexOf("labelsBtn.addEventListener('click'") === -1) {
  // find end of _renderQuickActions
  const endRenderIdx = app.indexOf('function _saveFlag(key, checked) {');
  if (endRenderIdx !== -1) {
    // go back to the closing brace of _renderQuickActions
    const closingBraceIdx = app.lastIndexOf('}', endRenderIdx - 1);
    
    const listenerStr = `
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
`;
    app = app.substring(0, closingBraceIdx) + listenerStr + app.substring(closingBraceIdx);
  }
}

// 8. Event listeners at bottom
if (app.indexOf("document.getElementById('flag-show-inactive')?.addEventListener('click'") === -1) {
  const swapIdx = app.indexOf("// Swap sections toggle");
  if (swapIdx !== -1) {
    const showStr = `// Show inactive policies toggle
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

  `;
    app = app.substring(0, swapIdx) + showStr + app.substring(swapIdx);
  }
}

if (app.indexOf("document.getElementById('flag-quick-inactive')?.addEventListener('change'") === -1) {
  const profIdx = app.indexOf("// Activation modal profile save toggle");
  if (profIdx !== -1) {
    const quickStr = `document.getElementById('flag-quick-inactive')?.addEventListener('change', e => {
    _flags.quickInactivePolicies = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });

  `;
    app = app.substring(0, profIdx) + quickStr + app.substring(profIdx);
  }
}

fs.writeFileSync(appFile, app);
console.log("Safe perfect app.js reconstruction completed.");
