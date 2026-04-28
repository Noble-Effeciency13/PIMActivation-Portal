const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const target = ".col-role { min-width: 140px; }";
const replacement = `.col-role { min-width: 120px; }
  .col-expires { width: 90px; }
  .roles-section { margin: 12px 8px; }
  .roles-table tbody td { padding: 8px 8px; }
  .roles-table thead th { padding: 8px 8px; }
  .expiry-abs { display: none; }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  // Also update policy-detail max-width
  content = content.replace(".policy-detail  { max-width: calc(100vw - 32px); }", ".policy-detail  { max-width: calc(100vw - 24px); }");
  fs.writeFileSync(path, content);
  console.log('Successfully updated portal.css');
} else {
  console.log('Target string not found');
}
