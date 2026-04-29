const fs = require('fs');

const indexFile = 'Portal/index.html';
let html = fs.readFileSync(indexFile, 'utf8');

// Revert uc-collapsible
html = html.replace(/class="uc-item uc-collapsible"/g, 'class="uc-item"');

// Revert uc-expand-btn
html = html.replace(
  /\s*<button class="icon-btn uc-expand-btn" id="uc-expand-btn" aria-expanded="false" aria-label="Show more details" title="Show more details">\s*<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"><\/polyline><\/svg>\s*<\/button>/g,
  ''
);

fs.writeFileSync(indexFile, html);
console.log("Reverted index.html");

const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

// Remove the injected CSS
const injectedCss = `
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

css = css.replace(injectedCss, '');
fs.writeFileSync(cssFile, css);
console.log("Reverted portal.css");

const appFile = 'Portal/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

const injectedJs = `document.getElementById('uc-expand-btn')?.addEventListener('click', () => {
    const card = document.getElementById('user-context-card');
    if (card) card.classList.toggle('expanded');
    const btn = document.getElementById('uc-expand-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    }
  });

  `;

app = app.replace(injectedJs, '');
fs.writeFileSync(appFile, app);
console.log("Reverted app.js");
