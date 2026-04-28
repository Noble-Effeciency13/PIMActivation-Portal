const fs = require('fs');

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

const target1 = "document.getElementById('flag-quick-appearance')?.addEventListener('change', e => {\\r\\n    _flags.quickAppearance = e.target.checked;\\r\\n    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));\\r\\n    _renderQuickActions();\\r\\n  });";
const replacement1 = `document.getElementById('flag-quick-appearance')?.addEventListener('change', e => {
    _flags.quickAppearance = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });

  document.getElementById('flag-quick-inactive')?.addEventListener('change', e => {
    _flags.quickInactivePolicies = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });`;

if (app.indexOf("document.getElementById('flag-quick-inactive')?.addEventListener") === -1) {
  // Find the quick appearance block
  const idx = app.indexOf("document.getElementById('flag-quick-appearance')");
  if (idx !== -1) {
    const endIdx = app.indexOf("});", idx) + 3;
    app = app.substring(0, idx) + replacement1 + app.substring(endIdx);
  } else {
    console.log("Could not find flag-quick-appearance");
  }
}

// Also ensure _applyInactivePolicies() is called on load
const target2 = `...JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}')\\r\\n};\\r\\n\\r\\nfunction escapeHtml(str) {`;
const idx2 = app.indexOf("function escapeHtml(str) {");
if (idx2 !== -1 && app.indexOf("_applyInactivePolicies();", idx2 - 50) === -1) {
  app = app.substring(0, idx2) + "_applyInactivePolicies();\\n\\n" + app.substring(idx2);
}


fs.writeFileSync(appFile, app);
console.log("Forced injection via indexOf");
