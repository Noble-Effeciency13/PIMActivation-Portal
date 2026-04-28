const fs = require('fs');

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

if (!app.includes("document.getElementById('flag-quick-inactive')")) {
  app = app.replace(
    /(\/\/ Activation modal profile save toggle)/,
    `document.getElementById('flag-quick-inactive')?.addEventListener('change', e => {
    _flags.quickInactivePolicies = e.target.checked;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(_flags));
    _renderQuickActions();
  });

  $1`
  );
}

fs.writeFileSync(appFile, app);
console.log("Forced injection via simpler regex");
