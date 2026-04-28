const fs = require('fs');
const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

if (css.indexOf('.pol-none-label') === -1) {
  const target = ".pol-none     { color: var(--text-faint); font-size: 14px; line-height: 1; }";
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
    fs.writeFileSync(cssFile, css);
    console.log("Injected pol-none-label CSS");
  } else {
    console.log("Target not found!");
  }
} else {
  console.log("Already has pol-none-label");
}
