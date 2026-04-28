const fs = require('fs');

const indexFile = 'Portal/index.html';
let html = fs.readFileSync(indexFile, 'utf8');

if (html.indexOf('uc-expand-btn') === -1) {
  html = html.replace(
    /<div class="uc-item">\s*<svg[^>]+><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"\/><circle cx="12" cy="7" r="4"\/><\/svg>\s*<div>\s*<div class="uc-label">Signed in as<\/div>/,
    '<div class="uc-item uc-collapsible">\n        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>\n        <div>\n          <div class="uc-label">Signed in as</div>'
  );

  html = html.replace(
    /<div class="uc-item">\s*<svg[^>]+><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"\/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"\/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"\/><path d="M10 6h4"\/><path d="M10 10h4"\/><path d="M10 14h4"\/><path d="M10 18h4"\/><\/svg>\s*<div>\s*<div class="uc-label">Tenant<\/div>/,
    '<div class="uc-item uc-collapsible">\n        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>\n        <div>\n          <div class="uc-label">Tenant</div>'
  );

  html = html.replace(
    /<\/div>\s*<\/div>\s*<\/div>\s*<main class="app-main">/,
    `</div>\n      </div>\n      <button class="icon-btn uc-expand-btn" id="uc-expand-btn" aria-expanded="false" aria-label="Show more details" title="Show more details">\n        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>\n      </button>\n    </div>\n\n    <main class="app-main">`
  );

  fs.writeFileSync(indexFile, html);
  console.log("Updated HTML successfully!");
} else {
  console.log("HTML already updated!");
}
