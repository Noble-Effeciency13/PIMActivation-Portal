const fs = require('fs');

const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

const injectCss = `
/* Mobile User Context Card Toggle */
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

if (css.indexOf('.uc-expand-btn') === -1) {
  css += injectCss;
  fs.writeFileSync(cssFile, css);
  console.log("Updated CSS successfully!");
} else {
  console.log("CSS already updated!");
}
