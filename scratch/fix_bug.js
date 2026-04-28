const fs = require('fs');

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// Ensure _applyInactivePolicies is called on load
if (!app.includes('_applyInactivePolicies();\\n\\nfunction escapeHtml(str)')) {
  app = app.replace(
    /function escapeHtml\(str\)/,
    '_applyInactivePolicies();\\n\\nfunction escapeHtml(str)'
  );
}

// Ensure flag-quick-inactive has an event listener
if (!app.includes("document.getElementById('flag-quick-inactive')")) {
  app = app.replace(
    /document\.getElementById\('flag-quick-appearance'\)\?\.addEventListener\('change', e => \{\s*_flags\.quickAppearance = e\.target\.checked;\s*localStorage\.setItem\(FLAGS_KEY, JSON\.stringify\(_flags\)\);\s*_renderQuickActions\(\);\s*\}\);/,
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
}

fs.writeFileSync(appFile, app.replace(/\\\\n/g, '\\n'));
console.log("Successfully injected event listeners and initial load trigger.");
