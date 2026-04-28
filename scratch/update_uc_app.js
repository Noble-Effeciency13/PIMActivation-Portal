const fs = require('fs');

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

const targetStr = `document.getElementById('uc-expand-btn')?.addEventListener('click', () => {
    const card = document.getElementById('user-context-card');
    if (card) card.classList.toggle('expanded');
    const btn = document.getElementById('uc-expand-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    }
  });

  // Eligible search`;

if (app.indexOf("uc-expand-btn") === -1) {
  app = app.replace(/\/\/ Eligible search/, targetStr);
  fs.writeFileSync(appFile, app);
  console.log("Updated app.js with uc-expand-btn logic");
} else {
  console.log("app.js already contains uc-expand-btn logic");
}
