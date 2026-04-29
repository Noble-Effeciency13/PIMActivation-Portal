const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const regex = /\.col-role\s*\{\s*min-width:\s*140px;\s*\}\s*\/\*\s*Switch to auto layout on mobile - fixed layout fights with display:none\s*policy columns when the colspan detail row is revealed, causing the\s*entire table to expand horizontally and break the section layout\. \*\/\s*\.roles-table\s*\{\s*table-layout:\s*auto;\s*\}\s*\/\*\s*Constrain the detail panel to the actual viewport width \*\/\s*\.policy-detail\s*\{\s*max-width:\s*calc\(100vw - 32px\);\s*\}/;

const replacement = `.col-role { min-width: 120px; }
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

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(path, content);
  console.log('Successfully updated portal.css');
} else {
  console.log('Regex match failed');
}
