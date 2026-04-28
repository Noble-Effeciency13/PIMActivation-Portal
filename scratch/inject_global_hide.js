const fs = require('fs');
const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

if (css.indexOf('.mobile-badge { display: none; }') === -1) {
  const target = ".pending-badge {";
  const idx = css.indexOf(target);
  if (idx !== -1) {
    const inject = `
.mobile-badge { display: none; }
.mobile-policy-strip { display: none; }
`;
    css = css.substring(0, idx) + inject + css.substring(idx);
    fs.writeFileSync(cssFile, css);
    console.log("Injected global hide.");
  }
}
