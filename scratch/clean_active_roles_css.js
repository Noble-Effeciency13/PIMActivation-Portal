const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const dirty = `  .roles-section { margin: 12px 8px; }
  .roles-table tbody td { padding: 8px 8px; }
  .roles-table thead th { padding: 8px 8px; }
  .expiry-abs { display: none; }
  #active-table { table-layout: fixed !important; }
  #active-table .col-cb { width: 40px !important; }
  #active-table .col-expires { width: 80px !important; }
  #active-table .col-role { width: auto; }
  .role-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .roles-section { margin: 12px 4px; }`;

const clean = `  #active-table { table-layout: fixed !important; }
  #active-table .col-cb { width: 40px !important; }
  #active-table .col-expires { width: 80px !important; }
  #active-table .col-role { width: auto; }
  .role-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .roles-section { margin: 12px 4px; }
  .roles-table tbody td { padding: 8px 6px; }
  .roles-table thead th { padding: 6px 6px; }
  .expiry-abs { display: none; }`;

if (content.includes(dirty)) {
  content = content.replace(dirty, clean);
  fs.writeFileSync(path, content);
  console.log('Cleaned up portal.css');
} else {
  console.log('Dirty block not found');
}
