# PIMActivation Portal

> **Browser-based companion to the [PIMActivation PowerShell module](https://github.com/Noble-Effeciency13/PIMActivation).**  
> Brings the same bulk-activation workflow — Entra ID roles, Azure Resource roles, and PIM for Groups — to any browser without requiring PowerShell or a server. Authentication is handled entirely by MSAL in your browser; no credentials are ever sent to a backend.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Hosted on Azure Static Web Apps](https://img.shields.io/badge/hosted-Azure%20Static%20Web%20Apps-0078D4)](https://pimactivation.com/portal)

---

## Features

- **Bulk activation** — activate multiple PIM eligible roles in one click
- **All three PIM planes** — Entra ID roles, Azure Resource roles, and PIM for Groups
- **Saved profiles** — store named role sets in browser IndexedDB for one-click repeat activations
- **Zero backend** — no server, no API keys, nothing leaves your browser
- **MSAL public-client** — standard OAuth 2.0 authorization code + PKCE via Microsoft identity platform
- **Delegated permissions only** — activates roles as you, using your own token
- **Progressive rendering** — roles render as API responses arrive; no full-page spinner

---

## Repository structure

```
PIMActivation-Portal/
├── Portal/                        # Browser SPA
│   ├── index.html
│   ├── css/portal.css
│   ├── js/
│   │   ├── app.js                 # Bootstrap & event wiring
│   │   ├── auth.js                # MSAL wrapper
│   │   ├── msal-config.js         # Client ID placeholder (injected by CI)
│   │   ├── policy-cache.js        # 30-min in-memory policy cache
│   │   ├── profiles.js            # IndexedDB profile manager
│   │   ├── roles.js               # Progressive rendering & expiry timers
│   │   └── api/
│   │       ├── arm-client.js      # ARM activate/deactivate
│   │       ├── batch-client.js    # Bulk engine, concurrency-limited
│   │       └── graph-client.js    # Graph + $batch with 429 retry
│   ├── staticwebapp.config.json   # SPA routing, CSP, security headers
│   └── deploy/
│       └── bicep/
│           └── portal.bicep       # Azure Static Web Apps + Front Door
├── website/                       # GitHub Pages landing site (pimactivation.com)
│   ├── index.html
│   └── CNAME                      # Custom domain for GitHub Pages
└── .github/
    └── workflows/
        ├── deploy-portal.yml      # CI → Azure Static Web Apps
        └── deploy-pages.yml       # CI → GitHub Pages
```

---

## Deploy the portal

### 1. Deploy Azure Static Web Apps

```bash
az deployment group create \
  --resource-group <rg> \
  --template-file Portal/deploy/bicep/portal.bicep \
  --parameters appName=pimactivation-portal
```

Note the `staticWebAppUrl` output — e.g. `happy-rock-abc123.azurestaticapps.net`.

### 2. Register an Entra ID application

1. **Entra ID → App registrations → New registration**
2. Name: `PIMActivation Portal`
3. Supported account types: **Accounts in this organizational directory only**
4. Redirect URI: **Single-page application** → `https://<staticWebAppUrl>`
5. Add **API permissions** (all delegated):

| Permission | Purpose |
|---|---|
| `User.Read` | Read signed-in user profile |
| `RoleEligibilitySchedule.Read.Directory` | List eligible Entra ID roles |
| `RoleAssignmentSchedule.ReadWrite.Directory` | Activate/deactivate Entra ID roles |
| `PrivilegedEligibilitySchedule.ReadWrite.AzureResources` | Activate/deactivate Azure Resource roles |
| `PrivilegedAccess.ReadWrite.AzureADGroup` | Activate/deactivate PIM for Groups |

6. Copy the **Application (client) ID**

### 3. Configure GitHub secrets

**Settings → Secrets and variables → Actions:**

| Secret | Value |
|---|---|
| `PORTAL_CLIENT_ID` | Application (client) ID from step 2 |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token from the Static Web App resource |

Push to `main` touching any file under `Portal/` — CI deploys automatically.

### 4. Custom domain (optional)

1. Configure the custom domain in **Azure → Static Web App → Custom domains**
2. Add the custom domain as an **additional** redirect URI in the Entra app — keep the `azurestaticapps.net` URI too. MSAL uses whichever matches the current browser origin.

---

## Local development

```bash
# Serve the portal locally — any static file server works
npx serve Portal

# Then add http://localhost:3000 as an additional redirect URI in your Entra app
```

---

## The PIMActivation ecosystem

| Repository | Description |
|---|---|
| [Noble-Effeciency13/PIMActivation](https://github.com/Noble-Effeciency13/PIMActivation) | PowerShell module — the original, available on PSGallery |
| [Noble-Effeciency13/PIMActivation-Web](https://github.com/Noble-Effeciency13/PIMActivation-Web) | Self-hosted web app — PowerShell Pode server in Docker |
| [Noble-Effeciency13/PIMActivation-Portal](https://github.com/Noble-Effeciency13/PIMActivation-Portal) | Browser portal — this repo |

---

## License

MIT © 2026 Sebastian Flæng Markdanner
