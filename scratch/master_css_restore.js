const fs = require('fs');

const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

// 1. Inactive policies label styles
if (css.indexOf('.pol-none-label') === -1) {
  const target1 = ".pol-none     { color: var(--text-faint); font-size: 14px; line-height: 1; }";
  const idx1 = css.indexOf(target1);
  if (idx1 !== -1) {
    const injectStr = `
.pol-none-label {
  display: none;
  font-size: 10px;
  border: 1px dashed var(--border);
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--text-faint);
  background: var(--bg-hover);
  text-transform: uppercase;
}
body.show-inactive-policies .pol-none-dash {
  display: none;
}
body.show-inactive-policies .pol-none-label {
  display: inline-block;
}
`;
    css = css.substring(0, idx1 + target1.length) + injectStr + css.substring(idx1 + target1.length);
  }
}

// 2. Global hide for mobile elements
if (css.indexOf('.mobile-badge') === -1 && css.indexOf('.mobile-policy-strip') === -1) {
  const target2 = ".badge-warning { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }";
  const idx2 = css.indexOf(target2);
  if (idx2 !== -1) {
    const injectStr2 = `
.mobile-badge { display: none; }
.mobile-policy-strip { display: none; }
`;
    css = css.substring(0, idx2 + target2.length) + injectStr2 + css.substring(idx2 + target2.length);
  }
}

// 3. Mobile CSS overrides
if (css.indexOf('.mobile-policy-strip { display: flex;') === -1) {
  const target3 = ".col-expand     { display: table-cell; }";
  const idx3 = css.indexOf(target3);
  if (idx3 !== -1) {
    const injectStr3 = `
  .col-type       { display: none; }
  .mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .mobile-policy-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .col-cb         { width: 48px; }
  .cb-wrap        { padding: 10px; }
  .expand-btn     { width: 44px; height: 44px; }`;
    css = css.substring(0, idx3 + target3.length) + injectStr3 + css.substring(idx3 + target3.length);
  }
}

// 4. Media query 380px target fix
if (css.indexOf('@media (max-width: 380px) {\\n  .col-type') !== -1) {
  css = css.replace(
    /@media\\s*\\(max-width:\\s*380px\\)\\s*\\{\\s*\\.col-type\\s*\\{\\s*display:\\s*none;\\s*\\}/,
    "@media (max-width: 380px) {"
  );
}

fs.writeFileSync(cssFile, css);
console.log("Master CSS restoration applied successfully!");
