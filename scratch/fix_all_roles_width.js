const fs = require('fs');
const path = 'Portal/css/portal.css';
let content = fs.readFileSync(path, 'utf8');

const target = ".expiry-abs { display: none; }";
const replacement = `.expiry-abs { display: none; }
  .roles-table { table-layout: fixed !important; }
  .col-cb { width: 40px !important; }
  .col-expand { width: 40px !important; }
  .col-role { width: auto; }
  @media (max-width: 480px) {
    #profiles-btn .btn-text { display: none; }
    #profiles-btn { padding: 6px; }
    .section-controls { gap: 4px; }
  }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  // Remove the active-table specific ones if they exist to keep it clean
  content = content.replace(/#active-table \{ table-layout: fixed !important; \}\s*#active-table \.col-cb \{ width: 40px !important; \}\s*#active-table \.col-expires \{ width: 80px !important; \}\s*#active-table \.col-role \{ width: auto; \}/, "");
  
  fs.writeFileSync(path, content);
  console.log('Successfully updated portal.css for both tables');
} else {
  console.log('Target string not found');
}
