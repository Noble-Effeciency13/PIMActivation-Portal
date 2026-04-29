const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const target = `@media (max-width: 640px) {
  #app { padding: 14px 12px; }
  .section-header { padding: 10px 12px; }
  .search-input   { width: 110px; }
  /* Hide policy matrix columns - user can tap the expand chevron to see them */
  .col-policy     { display: none; }
  /* Show the expand button column */
  .col-expand     { display: table-cell; }
  .col-type       { display: none; }
  .mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .mobile-policy-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .col-cb         { width: 48px; }
  .cb-wrap        { padding: 10px; }
  .expand-btn     { width: 44px; height: 44px; }
  .col-role { min-width: 140px; }
  /* Switch to auto layout on mobile - fixed layout fights with display:none
     policy columns when the colspan detail row is revealed, causing the
     entire table to expand horizontally and break the section layout. */
  .roles-table    { table-layout: auto; }
  /* Constrain the detail panel to the actual viewport width */
  .policy-detail  { max-width: calc(100vw - 32px); }`;

const replacement = `@media (max-width: 640px) {
  #app { padding: 14px 12px; }
  .section-header { padding: 10px 12px; }
  .search-input   { width: 110px; }
  /* Hide policy matrix columns - user can tap the expand chevron to see them */
  .col-policy     { display: none; }
  /* Show the expand button column */
  .col-expand     { display: table-cell; }
  .col-type       { display: none; }
  .mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .mobile-policy-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .col-cb         { width: 48px; }
  .cb-wrap        { padding: 10px; }
  .expand-btn     { width: 44px; height: 44px; }
  .col-role { min-width: 120px; }
  .col-expires { width: 90px; }
  .roles-section { margin: 12px 8px; }
  .roles-table tbody td { padding: 8px 8px; }
  .roles-table thead th { padding: 8px 8px; }
  .expiry-abs { display: none; }
  /* Switch to auto layout on mobile - fixed layout fights with display:none
     policy columns when the colspan detail row is revealed, causing the
     entire table to expand horizontally and break the section layout. */
  .roles-table    { table-layout: auto; }
  /* Constrain the detail panel to the actual viewport width */
  .policy-detail  { max-width: calc(100vw - 24px); }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content);
  console.log('Successfully updated portal.css');
} else {
  console.log('Target block not found');
}
