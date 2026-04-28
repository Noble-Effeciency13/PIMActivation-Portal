const fs = require('fs');
const file = 'Portal/css/portal.css';
let css = fs.readFileSync(file, 'utf8');

css = css.replace(
  /\.col-type\s*\{\s*display:\s*none;\s*\}/,
  `.col-type       { display: none; }
  .col-cb         { width: 48px; }
  .cb-wrap        { padding: 10px; }
  .expand-btn     { width: 44px; height: 44px; }`
);

fs.writeFileSync(file, css);
console.log("CSS updated for touch targets");
