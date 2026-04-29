const fs = require('fs');

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 1. _flags initialization
app = app.replace(
  /quickAppearance:\s*true,/,
  `quickAppearance:      true,
  showInactivePolicies: false,
  quickInactivePolicies: false,`
);

// 2. Call _applyInactivePolicies immediately after _flags init
app = app.replace(
  /const _flags = \{[\s\S]*?\};\n/,
  match => match + `\n_applyInactivePolicies();\n`
);

// 3. Define _applyInactivePolicies
app = app.replace(
  /function _applySectionOrder\(\) \{/,
  `function _applyInactivePolicies() {
  document.body.classList.toggle('show-inactive-policies', !!_flags.showInactivePolicies);
}

function _applySectionOrder() {`
);

// 4. showSettingsModal syncing
app = app.replace(
  /\['flag-show-active',\s*'showActiveInEligible'\],/,
  `['flag-show-active',   'showActiveInEligible'],
    ['flag-show-inactive', 'showInactivePolicies'],`
);

app = app.replace(
  /if \(quickAppCb\) quickAppCb\.checked = !!_flags\.quickAppearance;/,
  `if (quickAppCb) quickAppCb.checked = !!_flags.quickAppearance;

  const quickInactCb = document.getElementById('flag-quick-inactive');
  if (quickInactCb) quickInactCb.checked = !!_flags.quickInactivePolicies;`
);

// 5. _renderQuickActions UI
app = app.replace(
  /<div class="quick-action-wrap">\s*<button class="icon-btn" id="quick-theme-btn"/,
  `\${_flags.quickInactivePolicies ? \`<div class="quick-action-wrap">
      <button class="icon-btn \${_flags.showInactivePolicies ? 'active' : ''}" id="quick-labels-btn" aria-label="Toggle Inactive Labels" title="Toggle Inactive Labels" aria-pressed="\${!!_flags.showInactivePolicies}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>\` : ''}
    <div class="quick-action-wrap">
      <button class="icon-btn" id="quick-theme-btn"`
);

// 6. _renderQuickActions event listener binding
app = app.replace(
  /\/\/ Close on outside click[\s\S]*?\}\);/,
  `// Close on outside click
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
  }`
);

// 7. Event listeners at bottom of file
app = app.replace(
  /\/\/ Swap sections toggle/,
  `// Show inactive policies toggle
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

  // Swap sections toggle`
);

app = app.replace(
  /document\.getElementById\('flag-quick-appearance'\)\?\.addEventListener\('change', e => \{[\s\S]*?_renderQuickActions\(\);\n\s*\}\);/,
  `document.getElementById('flag-quick-appearance')?.addEventListener('change', e => {
    _flags.quickAppearance = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });

  document.getElementById('flag-quick-inactive')?.addEventListener('change', e => {
    _flags.quickInactivePolicies = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });`
);

fs.writeFileSync(appFile, app);
console.log("app.js correctly rewritten with inactive policies features");
