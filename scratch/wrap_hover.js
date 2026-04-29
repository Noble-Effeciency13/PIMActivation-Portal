const fs = require('fs');
const file = 'Portal/css/portal.css';
let css = fs.readFileSync(file, 'utf8');

// A simple regex to wrap single-line hover rules
css = css.replace(/^(\s*)([^\{\n]+:hover[^\{\n]*)\s*\{\s*([^\}]+)\s*\}/gm, (match, indent, selector, content) => {
    // If it's inside a media query already, be careful, but our CSS is simple enough
    return `${indent}@media (hover: hover) and (pointer: fine) {\n${indent}  ${selector.trim()} { ${content.trim()} }\n${indent}}`;
});

// For multi-line hover rules
// .header-quick-actions .icon-btn:hover {
//   color: var(--primary);
//   background: var(--bg-hover);
// }
css = css.replace(/^(\s*)([^{\n]+:hover[^{\n]*)\s*\{\n([\s\S]*?)\n\1\}/gm, (match, indent, selector, content) => {
    // Check if it's already wrapped (avoid double wrapping if run multiple times)
    if (selector.includes('@media')) return match;
    
    const indentedContent = content.split('\n').map(line => '  ' + line).join('\n');
    return `${indent}@media (hover: hover) and (pointer: fine) {\n${indent}  ${selector.trim()} {\n${indentedContent}\n${indent}  }\n${indent}}`;
});

// Write back
fs.writeFileSync(file, css);
console.log("Hover styles wrapped in media queries.");
