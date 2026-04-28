const fs = require('fs');

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// Replace the end of _renderQuickActions to attach the event listener properly
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

fs.writeFileSync(appFile, app);
console.log("app.js fixed event listener");
