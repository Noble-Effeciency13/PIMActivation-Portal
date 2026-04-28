const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const mobileBlockStart = "@media (max-width: 640px) {";
const footerStart = "/* Mobile footer: one-line credit strip */";

const startIndex = content.indexOf(mobileBlockStart);
const endIndex = content.indexOf(footerStart);

if (startIndex !== -1 && endIndex !== -1) {
  const newMobileBlock = `@media (max-width: 640px) {
  #app { padding: 14px 12px; }
  .section-header { padding: 10px 12px; }
  .section-controls { gap: 8px; }
  .search-input   { width: 110px; }
  
  /* Hide policy matrix columns — user can tap the expand chevron to see them */
  .col-policy     { display: none; }
  .col-type       { display: none; }
  
  /* Table layout and column constraints */
  .roles-table    { table-layout: fixed !important; }
  .col-cb         { width: 40px !important; }
  .col-expand     { display: table-cell; width: 40px !important; }
  .col-role       { width: auto; min-width: 0; }
  .col-expires    { width: 80px !important; }
  
  .roles-section  { margin: 12px 4px; }
  .roles-table tbody td { padding: 8px 6px; }
  .roles-table thead th { padding: 6px 6px; }
  
  .role-name      { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mobile-badge   { display: inline-block; margin-right: 5px; vertical-align: middle; }
  .mobile-policy-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  
  .cb-wrap        { padding: 10px; }
  .expand-btn     { width: 44px; height: 44px; }
  .expiry-abs     { display: none; }

  @media (max-width: 480px) {
    #profiles-btn .btn-text { display: none; }
    #profiles-btn { padding: 8px; }
    .section-controls { gap: 4px; }
  }

  /* Constrain the detail panel to the actual viewport width */
  .policy-detail  { max-width: calc(100vw - 24px); }
  
  `;

  content = content.substring(0, startIndex) + newMobileBlock + content.substring(endIndex);
  fs.writeFileSync(path, content);
  console.log('Master Mobile CSS rewrite successful');
} else {
  console.log('Could not find mobile block delimiters');
}
