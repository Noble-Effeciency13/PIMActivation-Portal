const fs = require('fs');

const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

// 1. Add global hide for mobile-policy-strip
if (css.indexOf('.mobile-policy-strip { display: none; }') === -1) {
  css = css.replace(
    /\.mobile-badge\s*\{\s*display:\s*none;\s*\}/,
    ".mobile-badge { display: none; }\n.mobile-policy-strip { display: none; }"
  );
}

// 2. Add mobile display for mobile-policy-strip
if (css.indexOf('.mobile-policy-strip { display: flex;') === -1) {
  css = css.replace(
    /\.mobile-badge\s*\{\s*display:\s*inline-block;\s*margin-right:\s*5px;\s*vertical-align:\s*middle;\s*\}/,
    `.mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .mobile-policy-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }`
  );
}

// 3. Add pol-none-label styles
if (css.indexOf('.pol-none-label') === -1) {
  const target = `.pol-dot.pol-jti { background: var(--warning-dim); color: var(--warning); border-color: var(--warning); }`;
  const idx = css.indexOf(target);
  if (idx !== -1) {
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
    css = css.substring(0, idx + target.length) + injectStr + css.substring(idx + target.length);
  }
}

fs.writeFileSync(cssFile, css);
console.log("Reapplied all lost CSS successfully!");
