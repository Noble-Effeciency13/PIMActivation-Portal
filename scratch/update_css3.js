const fs = require('fs');
const file = 'Portal/css/portal.css';
let css = fs.readFileSync(file, 'utf8');

// Add global hide
css = css.replace(
  /\.mobile-badge { display: none; }/,
  ".mobile-badge { display: none; }\n.mobile-policy-strip { display: none; }"
);

// Add mobile display
css = css.replace(
  /\.mobile-badge\s*\{\s*display:\s*inline-block;\s*margin-right:\s*5px;\s*vertical-align:\s*middle;\s*\}/,
  `.mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .mobile-policy-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }`
);

fs.writeFileSync(file, css);
console.log("CSS updated for mobile-policy-strip");
