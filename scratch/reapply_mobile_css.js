const fs = require('fs');

const cssFile = 'Portal/css/portal.css';
let css = fs.readFileSync(cssFile, 'utf8');

// Touch targets & column hiding
if (css.indexOf('.col-type       { display: none; }') === -1) {
  css = css.replace(
    /\.col-expand\s*\{\s*display:\s*table-cell;\s*\}/,
    `.col-expand     { display: table-cell; }
  .col-type       { display: none; }
  .mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .col-cb         { width: 48px; }
  .cb-wrap        { padding: 10px; }
  .expand-btn     { width: 44px; height: 44px; }`
  );
}

// Media query 380px target fix
if (css.indexOf('@media (max-width: 380px) {\n  .col-type') !== -1) {
  css = css.replace(
    /@media\s*\(max-width:\s*380px\)\s*\{\s*\.col-type\s*\{\s*display:\s*none;\s*\}/,
    "@media (max-width: 380px) {"
  );
}

fs.writeFileSync(cssFile, css);
console.log("Reapplied touch targets and column hiding CSS");
