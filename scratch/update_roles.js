const fs = require('fs');
const file = 'Portal/js/roles.js';
let js = fs.readFileSync(file, 'utf8');

js = js.replace(
  /'<span class="role-scope"><span class="mobile-badge">' \+ badge \+ '<\/span>' \+ escapeHtml\(this\.getScopeDisplay\(role\)\) \+ '<\/span>' \+/,
  `'<span class="role-scope"><span class="mobile-badge">' + badge + '</span>' + escapeHtml(this.getScopeDisplay(role)) + '</span>' +
            '<div class="mobile-policy-strip">' +
              '<span class="pol-max">' + maxDisp + '</span>' +
              _polMfa(role) +
              _polDot(role.requiresJustification, 'Just.',  'pol-warning', 'Justification required') +
              _polDot(role.requiresTicket,        'Ticket', 'pol-warning', 'Ticket required') +
              _polDot(role.requiresApproval,      'Apprv.', 'pol-purple',  'Approval required') +
            '</div>' +`
);

fs.writeFileSync(file, js);
console.log("roles.js updated");
