const fs = require('fs');

const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

const injectCss = `
.uc-expand-btn {
  display: none;
  margin-left: auto;
  align-self: center;
  transition: transform 0.2s;
  color: var(--text-muted);
}
.uc-expand-btn:hover {
  color: var(--text);
  background: transparent;
}
@media (max-width: 640px) {
  .user-context-card {
    position: relative;
    padding-right: 48px;
    align-items: center;
  }
  .uc-collapsible {
    display: none;
  }
  .user-context-card.expanded .uc-collapsible {
    display: flex;
    width: 100%;
  }
  .uc-expand-btn {
    display: inline-flex;
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }
  .user-context-card.expanded .uc-expand-btn {
    transform: translateY(-50%) rotate(180deg);
  }
}
`;

const target1 = "/*  Help modal  */";
const idx1 = css.indexOf(target1);
if (idx1 !== -1 && css.indexOf('.uc-expand-btn') === -1) {
  css = css.substring(0, idx1) + injectCss + "\n" + css.substring(idx1);
  fs.writeFileSync(cssFile, css);
  console.log("Injected CSS perfectly.");
}

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

const target2 = `document.getElementById('uc-expand-btn')?.addEventListener('click', () => {`;
if (app.indexOf(target2) === -1) {
  const target3 = "// Eligible search";
  const idx2 = app.indexOf(target3);
  if (idx2 !== -1) {
    const injectJs = `document.getElementById('uc-expand-btn')?.addEventListener('click', () => {
    const card = document.getElementById('user-context-card');
    if (card) card.classList.toggle('expanded');
    const btn = document.getElementById('uc-expand-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    }
  });

  `;
    app = app.substring(0, idx2) + injectJs + app.substring(idx2);
    fs.writeFileSync(appFile, app);
    console.log("Injected JS perfectly.");
  }
}
