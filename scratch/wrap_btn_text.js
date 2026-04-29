const fs = require('fs');

const indexFile = 'Portal/index.html';
let html = fs.readFileSync(indexFile, 'utf8');

if (html.indexOf('<span class="btn-text">Profiles</span>') === -1) {
  html = html.replace(
    /<button class="btn btn-ghost btn-sm" id="profiles-btn" aria-label="Activation profiles">\s*<svg[^>]+>[\s\S]*?<\/svg>\s*Profiles\s*<\/button>/,
    `<button class="btn btn-ghost btn-sm" id="profiles-btn" aria-label="Activation profiles">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
              <span class="btn-text">Profiles</span>
            </button>`
  );
  fs.writeFileSync(indexFile, html);
  console.log("Updated HTML with Profiles span");
}
