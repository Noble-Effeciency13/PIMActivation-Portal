/**
 * Local dev server for PIM Activation Portal
 *
 * Serves Portal/ with __PORTAL_CLIENT_ID__ and __PORTAL_TENANT_ID__
 * replaced on-the-fly in msal-config.js. No npm install required.
 *
 * Setup:
 *   1. Copy .env.example to .env and fill in your values
 *   2. node dev.js
 *   3. Open http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Load .env ────────────────────────────────────────────────────────────────

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const CLIENT_ID = process.env.PORTAL_CLIENT_ID || '';
const TENANT_ID = process.env.PORTAL_TENANT_ID || '';

if (!CLIENT_ID || !TENANT_ID) {
  console.error('\nError: PORTAL_CLIENT_ID and PORTAL_TENANT_ID must be set.');
  console.error('Copy .env.example to .env and fill in your values.\n');
  process.exit(1);
}

// ── Static file server ───────────────────────────────────────────────────────

const PORTAL_DIR = path.join(__dirname, 'Portal');
const requestedPort = Number.parseInt(process.env.PORT || '3000', 10);
const PORT = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535
  ? requestedPort
  : 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.resolve(path.join(PORTAL_DIR, urlPath));

  // Guard against path traversal
  if (!filePath.startsWith(PORTAL_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // SPA fallback — serve index.html for unknown paths
  const target = fs.existsSync(filePath) ? filePath : path.join(PORTAL_DIR, 'index.html');
  serveFile(target, res);
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }

    let body = data;
    if (path.basename(filePath) === 'msal-config.js') {
      body = data.toString('utf8')
        .replace(/__PORTAL_CLIENT_ID__/g, CLIENT_ID)
        .replace(/__PORTAL_TENANT_ID__/g, TENANT_ID);
    }

    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(body);
  });
}

let triedFallbackPort = false;

server.on('error', err => {
  if (err.code === 'EADDRINUSE' && !triedFallbackPort) {
    triedFallbackPort = true;
    console.warn(`\nPort ${PORT} is already in use. Finding an available port...`);
    server.listen(0, '127.0.0.1');
    return;
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`\nPIM Activation Portal`);
  console.log(`  Local:  http://localhost:${activePort}`);
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  App:    ${CLIENT_ID}\n`);
});
