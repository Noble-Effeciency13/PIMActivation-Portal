const fs = require('fs');
const file = 'Portal/js/roles.js';
let js = fs.readFileSync(file, 'utf8');

js = js.replace(
  /function _polDot\(required, letter, colorClass, tooltip\) \{\s*if \(required\) \{\s*return '<span class="pol-dot ' \+ colorClass \+ '" title="' \+ tooltip \+ '">' \+ letter \+ '<\/span>';\s*\}\s*return '<span class="pol-none" title="Not required">&ndash;<\/span>';\s*\}/,
  `function _polDot(required, letter, colorClass, tooltip) {
  if (required) {
    return '<span class="pol-dot ' + colorClass + '" title="' + tooltip + '">' + letter + '</span>';
  }
  return '<span class="pol-none" title="Not required"><span class="pol-none-dash">&ndash;</span><span class="pol-none-label">' + letter + '</span></span>';
}`
);

js = js.replace(
  /if \(parts\.length === 0\) return '<span class="pol-none" title="No MFA or auth context required">&ndash;<\/span>';/,
  `if (parts.length === 0) return '<span class="pol-none" title="No MFA or auth context required"><span class="pol-none-dash">&ndash;</span><span class="pol-none-label">MFA</span></span>';`
);

fs.writeFileSync(file, js);
console.log("roles.js updated for inactive labels");
