const fs = require('fs');
const file = 'Portal/css/portal.css';
let css = fs.readFileSync(file, 'utf8');

// Replace target 1
css = css.replace(
  /\.col-expand\s*\{\s*display:\s*table-cell;\s*\}/,
  ".col-expand     { display: table-cell; }\n  .col-type       { display: none; }\n  .mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }"
);

// Replace target 2
css = css.replace(
  /@media\s*\(max-width:\s*380px\)\s*\{\s*\.col-type\s*\{\s*display:\s*none;\s*\}/,
  "@media (max-width: 380px) {"
);

fs.writeFileSync(file, css);
console.log("CSS modified successfully.");
