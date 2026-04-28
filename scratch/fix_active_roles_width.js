const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const target = ".expiry-abs { display: none; }";
const replacement = `.expiry-abs { display: none; }
  #active-table { table-layout: fixed !important; }
  #active-table .col-cb { width: 40px !important; }
  #active-table .col-expires { width: 80px !important; }
  #active-table .col-role { width: auto; }
  .role-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .roles-section { margin: 12px 4px; }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content);
  console.log('Successfully updated portal.css for Active Roles fixes');
} else {
  console.log('Target string not found');
}
