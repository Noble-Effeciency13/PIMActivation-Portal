# PIMActivation Portal

> **Browser-based companion to the [PIMActivation PowerShell module](https://github.com/Noble-Effeciency13/PIMActivation).**  
> Brings bulk PIM activation — Entra ID roles, Azure Resource roles, and PIM for Groups — to any browser without requiring PowerShell, a server, or any backend infrastructure.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Hosted on Azure Static Web Apps](https://img.shields.io/badge/hosted-Azure%20Static%20Web%20Apps-0078D4)](https://pimactivation.com/portal)

---

## The idea

Managing PIM activations across three separate planes (Entra ID, Azure Resources, and PIM for Groups) usually means context-switching between the Azure portal, Entra admin center, and multiple approval workflows. The PIMActivation ecosystem started as a PowerShell module to collapse that into a single command. The portal extends that to the browser — same bulk-activation model, no PowerShell required.

The portal is a fully static single-page application. There is no backend, no proxy, and no server-side session. Every API call goes directly from your browser to Microsoft's own endpoints (Microsoft Graph and Azure Resource Manager). The application never touches your credentials — MSAL handles authentication entirely in-browser using the OAuth 2.0 authorization code flow with PKCE.

---

## Features

### Role management
- **Bulk activation** — select any combination of eligible roles and activate them all in a single operation
- **All three PIM planes** — Entra ID roles, Azure Resource roles, and PIM for Groups in one unified table
- **Bulk deactivation** — deactivate multiple active roles at once with optimistic UI updates
- **Pending approval tracking** — roles awaiting approval are shown inline with an indicator tag

### Policy awareness
- **Per-role policy matrix** — each eligible role displays which requirements apply: justification, ticket number, MFA, Conditional Access auth context, or approval
- **Duration capping** — the requested duration is automatically capped to the policy maximum; no failed requests from over-requesting
- **Auth context step-up** — if a role requires a Conditional Access auth context, a targeted popup prompts for the required claims before activation; the acquired claims are threaded into all subsequent token acquisitions for that operation

### Activation experience
- **Activation profiles** — save named role sets in browser IndexedDB for one-click repeat activations across sessions
- **Justification & ticket fields** — pre-fill per-profile or enter at activation time; required fields are enforced per policy
- **Expiry countdowns** — active roles show a live countdown (30 s tick) colour-coded when nearing expiry
- **Progressive rendering** — roles render as API responses arrive; Entra/Group roles appear first while Azure ARM calls complete in the background

### Interface
- **Three themes** — light, dark, and system-follows
- **Inline search / filter** — filter both the eligible and active tables by role name or scope
- **Scope display** — management group, subscription, resource group, or AU shown beneath each role name

---

## Security

### No backend, no data retention
The portal has no server component. There is nothing to breach server-side because there is no server. All tokens stay in browser memory (never `localStorage`); MSAL's default token cache is used.

### Delegated permissions only
The application uses delegated Microsoft Graph and ARM permissions exclusively. It can only do what the signed-in user is permitted to do. There is no application permission, no service principal secret, and no stored credential anywhere in the codebase.

### Required permissions

| Permission | Plane | Purpose |
|---|---|---|
| `User.Read` | Graph | Read signed-in user profile and ID |
| `RoleEligibilitySchedule.Read.Directory` | Graph | List eligible Entra ID roles |
| `RoleAssignmentSchedule.ReadWrite.Directory` | Graph | Activate / deactivate Entra ID roles |
| `PrivilegedEligibilitySchedule.ReadWrite.AzureResources` | ARM | Activate / deactivate Azure Resource roles |
| `PrivilegedAccess.ReadWrite.AzureADGroup` | Graph | Activate / deactivate PIM for Groups |
| `RoleManagementPolicy.Read.AzureADGroup` | Graph | Read PIM for Groups policy settings |

### Content Security Policy
`staticwebapp.config.json` enforces a strict CSP header on every response:

```
default-src 'self'
script-src  'self' https://cdn.jsdelivr.net        (MSAL only)
connect-src 'self' https://login.microsoftonline.com
            https://graph.microsoft.com
            https://management.azure.com
frame-ancestors 'none'
upgrade-insecure-requests
```

No inline scripts, no `eval`, no third-party tracking, no CDN beyond the single MSAL bundle.

Additional headers set globally: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`.

### Conditional Access compatibility
If a role's PIM policy requires a Conditional Access auth context (`acrs` claim), the portal detects this from the policy and triggers `acquireTokenPopup` with the required claims challenge before any activation request is made. The claims are then threaded into every token acquisition for the duration of the bulk operation so all ARM and Graph calls satisfy the requirement.

---

## Repository structure

```
PIMActivation-Portal/
├── assets/favicons/              # Source favicon set synced into both web roots
├── Portal/                        # Browser SPA
│   ├── index.html
│   ├── css/portal.css
│   ├── js/
│   │   ├── app.js                 # Bootstrap & event wiring
│   │   ├── auth.js                # MSAL wrapper (popup step-up, claims threading)
│   │   ├── msal-config.js         # Client ID (injected by CI)
│   │   ├── policy-cache.js        # 30-min in-memory policy cache
│   │   ├── profiles.js            # IndexedDB profile manager
│   │   ├── roles.js               # Progressive rendering & expiry timers
│   │   └── api/
│   │       ├── arm-client.js      # ARM activate/deactivate
│   │       ├── batch-client.js    # Bulk engine (Graph $batch + ARM concurrency limit)
│   │       └── graph-client.js    # Graph + $batch with 429 retry
│   ├── staticwebapp.config.json   # SPA routing, CSP, security headers
│   └── deploy/
│       ├── azuredeploy.json       # Generated ARM template for Deploy to Azure
│       └── bicep/
│           ├── portal.bicep       # Hosted Static Web App IaC
│           ├── portal-selfhosted.bicep
│           └── bicepconfig.json   # Microsoft Graph Bicep extension
├── scripts/                       # Maintenance scripts
├── website/                       # GitHub Pages landing site (pimactivation.com)
└── .github/workflows/             # CI: portal/pages deploy + template/favicon sync
```

---

## Favicons

Favicons are sourced from `assets/favicons/` and synced into both deployed web roots: `Portal/` for the Azure Static Web App and `website/` for the landing page.

The page head advertises `favicon.svg` for modern light-mode sessions and `favicon.ico` for dark-mode sessions plus legacy `/favicon.ico` probes. Browser favicon caches are sticky, so use an incognito window or clear site data when validating a changed favicon.

After adding or replacing favicon files, run:

```powershell
pwsh ./scripts/sync-favicons.ps1
```

The `Sync Favicons` workflow checks pull requests for drift and commits synced favicon copies back to `main` after direct source updates.

---

## Local mobile testing

Run the local dev server, then use Chrome or Edge DevTools device emulation for the first mobile pass:

```powershell
$env:PORT='0'
node dev.js
```

Open the printed localhost URL, press `F12`, toggle device emulation with `Ctrl+Shift+M`, and test common widths such as 390, 375, 360, and 320 pixels. This keeps MSAL on a localhost redirect URI, so no extra app registration redirect URI is needed.

For a real phone, expose the local server through an HTTPS tunnel such as VS Code port forwarding, Microsoft dev tunnels, or ngrok, then add that temporary HTTPS origin as a SPA redirect URI in the Entra app registration before signing in from the phone.

---

## Self-hosted Azure deployment

The self-hosted template provisions the Azure Static Web App, creates a single-tenant Entra ID app registration, configures the SPA redirect URI, adds the required delegated API permissions, deploys the portal files, and outputs the generated client ID.

The Bicep file at `Portal/deploy/bicep/portal-selfhosted.bicep` is the source of truth. `Portal/deploy/azuredeploy.json` is generated from it by the `Sync Deployment Templates` workflow so the Deploy to Azure template does not drift from the Bicep source.

Deploying Microsoft Graph resources from Bicep requires the deploying identity to have permission to create application registrations, such as `Application.ReadWrite.All`. After deployment, use the `adminConsentUrl` output if your tenant requires administrator consent for the configured delegated permissions.

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
