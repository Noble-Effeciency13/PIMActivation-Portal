const fs = require('fs');

// 1. Update portal.css
const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');
css = css.replace(
  /\.mobile-policy-strip \{ display: none; \}/,
  `.mobile-policy-strip { display: none; }
.pol-none-label { display: none; }
body.show-inactive-policies .pol-none-dash { display: none; }
body.show-inactive-policies .pol-none-label {
  display: inline-block;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
  border: 1px solid var(--border-strong);
  color: var(--text-faint);
  background: var(--bg-surface);
}`
);
fs.writeFileSync(cssFile, css);


// 2. Update app.js
const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// Add to default _flags
app = app.replace(
  /quickAppearance:\s*true,/,
  `quickAppearance:      true,
  showInactivePolicies: false,`
);

// Apply body class on load
app = app.replace(
  /function _applySectionOrder\(\) \{/,
  `function _applyInactivePolicies() {
  document.body.classList.toggle('show-inactive-policies', !!_flags.showInactivePolicies);
}

function _applySectionOrder() {`
);

// We need to call _applyInactivePolicies() right after initializing
app = app.replace(
  /const _flags = \{[\s\S]*?\};\n/,
  match => match + `\n_applyInactivePolicies();\n`
);

// Update _renderQuickActions
app = app.replace(
  /<div class="quick-action-wrap">/,
  `<div class="quick-action-wrap">
      <button class="icon-btn \${_flags.showInactivePolicies ? 'active' : ''}" id="quick-labels-btn" aria-label="Toggle Inactive Labels" title="Toggle Inactive Labels" aria-pressed="\${!!_flags.showInactivePolicies}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>
    <div class="quick-action-wrap">`
);

// Add event listener in _renderQuickActions
app = app.replace(
  /dropdown\.hidden = true;\n\s*\};\n\s*\}\);\n/,
  match => match + `
  const labelsBtn = document.getElementById('quick-labels-btn');
  labelsBtn?.addEventListener('click', () => {
    _flags.showInactivePolicies = !_flags.showInactivePolicies;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _applyInactivePolicies();
    labelsBtn.classList.toggle('active', _flags.showInactivePolicies);
    labelsBtn.setAttribute('aria-pressed', _flags.showInactivePolicies);
  });
`
);

fs.writeFileSync(appFile, app);
console.log("portal.css and app.js updated for inactive labels toggle");
