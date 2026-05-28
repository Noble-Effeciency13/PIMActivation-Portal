# PIMActivation Portal — Beta

> **Private beta of the [PIMActivation Portal](https://github.com/Noble-Effeciency13/PIMActivation-Portal).**  
> Deployed at **https://beta.portal.pimactivation.com** for early-access testing of new features before they are promoted to the live repository.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Hosted on Azure Static Web Apps](https://img.shields.io/badge/hosted-Azure%20Static%20Web%20Apps-0078D4)](https://beta.portal.pimactivation.com)

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
- **Activation profiles** — save named role sets in browser IndexedDB for one-click repeat activations across sessions; Azure Resource roles with reduced scopes configured at save time are included in the profile and automatically restored when the profile is activated
- **Per-role reduced scopes for Azure Resource roles** — when activating multiple Azure Resource roles simultaneously, each role has its own independent scope picker; drill down to any management group, subscription, resource group, or individual resource independently for each selected role
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
The portal has no server component. There is nothing to breach server-side because there is no server. All tokens are stored in `sessionStorage` (never `localStorage`): they are cleared when the tab is closed and are not shared across tabs. They are readable by same-origin JavaScript, so no XSS vulnerability must exist in the portal.

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
│           └── bicepconfig.json   # Bicep compiler configuration
├── scripts/                       # Deployment and maintenance scripts
└── .github/workflows/             # CI: portal deploy + template/favicon sync
```

---

## Favicons

Favicons are sourced from `assets/favicons/` and synced into `Portal/` for the Azure Static Web App.

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

The self-hosted template provisions the Azure Static Web App, deploys the portal files, injects your tenant ID and an existing Entra ID SPA app registration client ID, and attempts to add the generated redirect URIs to the app registration.

The Bicep file at `Portal/deploy/bicep/portal-selfhosted.bicep` is the source of truth. `Portal/deploy/azuredeploy.json` is generated from it by the `Sync Deployment Templates` workflow so the Deploy to Azure template does not drift from the Bicep source.

During deployment, the Azure deployment script downloads a ZIP archive of the portal source, saves a private copy in a customer-owned storage account in the resource group, and uploads the extracted `Portal/` folder to Static Web Apps. By default it resolves the `main` branch at deployment time, so rerunning the self-hosted deployment after a push to this repository deploys the newest `main` commit. Once the portal has been deployed, the self-hosted Static Web App serves its own copy of the files and does not depend on the live GitHub repository.

Use `portalSourceBranch` to deploy from another public branch. If the repository is private, GitHub returns `404` to the unauthenticated deployment script and the Static Web App resource will be created without portal files. In that case, pass `portalSourceArchiveUrl` with a publicly reachable ZIP, a short-lived pre-signed archive URL, or another reachable package that contains `Portal/index.html`. ZIPs created with PowerShell `Compress-Archive` are supported. The deployment script uses a fresh resource name on each run to avoid Azure Files sharing violations during retries, so rerunning the template with a reachable archive URL will upload the portal into an existing empty Static Web App. If a later redeployment cannot reach the branch archive or `portalSourceArchiveUrl`, the script attempts to redeploy from the cached source archive in the customer-owned storage account.

Azure Deployment Scripts cannot complete interactive device-code sign-in reliably, and Azure Resource Manager deployments do not automatically pass your Entra administrator role to Microsoft Graph. Because of that platform boundary, `applicationClientId` is required. Create or choose a single-tenant SPA app registration before deployment, then pass its application client ID.

After the Static Web App hostname is generated, the deployment script attempts to merge the generated default hostname and optional `customDomain` URL into the app registration's SPA redirect URIs through Microsoft Graph. This succeeds only if the deployment script's managed identity can update that application, for example because it owns the app registration or has an appropriate Microsoft Graph application write permission. If the deployment log shows a Microsoft Graph permission warning, add the `redirectUris` deployment output to the app registration manually.

The app registration should use delegated permissions only. At minimum, configure the Microsoft Graph and Azure Management delegated permissions listed in the Security section above, then use the `adminConsentUrl` deployment output if your tenant requires administrator consent.

If you pass `customDomain`, the deployment also includes `https://<customDomain>` in the redirect URI update attempt. The Static Web App custom domain itself must still be added manually after deployment because Azure validates the DNS CNAME when the domain is attached. Use the generated Static Web App hostname from the deployment output, create the CNAME, then add and validate the custom domain on the Static Web App.

---

## Beta deployment (this repo)

This repository is a **private beta** of the live [PIMActivation-Portal](https://github.com/Noble-Effeciency13/PIMActivation-Portal). It is deployed to a separate Azure Static Web App at **https://beta.portal.pimactivation.com** for early-access testing of new features before they ship to the live repo.

### Azure Static Web App configuration

The beta SWA is provisioned with **Deployment source = Other**, meaning the Azure portal does not create or manage a GitHub Actions workflow. CI/CD is driven entirely by [`.github/workflows/deploy-portal.yml`](.github/workflows/deploy-portal.yml), which uses the [`Azure/static-web-apps-deploy@v1`](https://github.com/marketplace/actions/azure-static-web-apps-deploy) action with the SWA deployment token.

**Required GitHub secrets** on this beta repo:

| Secret | Source | Purpose |
|---|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Beta SWA → Overview → *Manage deployment token* | Lets the workflow upload the portal to the beta SWA |
| `PORTAL_CLIENT_ID` | Entra app registration for the beta portal | Injected into `Portal/js/msal-config.js` at deploy time |

**One-time Azure setup:**

1. Create a single-tenant SPA app registration for the beta portal (or reuse an existing one).
2. Add `https://beta.portal.pimactivation.com` (and the generated `*.azurestaticapps.net` hostname) as SPA redirect URIs.
3. Grant the delegated permissions listed in the Security section above and admin-consent them.
4. Create the Azure Static Web App (Free tier is fine) with deployment source set to **Other**.
5. Add the SWA custom domain `beta.portal.pimactivation.com` and the matching CNAME in DNS.
6. Copy the SWA deployment token and the Entra client ID into this repo's GitHub secrets.

After that, every push to `main` that touches `Portal/**` deploys to the beta SWA automatically.

### Promoting beta changes to the live repo

There are two practical ways to move a validated change from this beta repo into [`PIMActivation-Portal`](https://github.com/Noble-Effeciency13/PIMActivation-Portal). Pick whichever matches how you already work locally.

| Path | Best for | Tooling |
|---|---|---|
| **Single-folder, two remotes** | Anyone comfortable in a terminal. Cleanest history, supports `git cherry-pick`. | Git CLI (PowerShell, Git Bash). Works alongside GitHub Desktop. |
| **Two folders, file copy** | GitHub Desktop users who already have separate clones for beta and live and prefer not to use the terminal. | GitHub Desktop + File Explorer + VS Code. |

Both paths end the same way: a Pull Request on the **live** repo that goes through review before deploying to `portal.pimactivation.com`.

Whichever path you choose, the same guardrails apply:

- **Keep `Portal/` source-compatible** with the live repo. Anything beta-only (this README's beta section, `scratch/`, experimental tweaks) should never end up in the live PR.
- **Never force-push to live.** If you make a mistake, fix it with a new commit.
- **Each repo has its own GitHub secrets.** The live repo has its own `AZURE_STATIC_WEB_APPS_API_TOKEN`, its own `PORTAL_CLIENT_ID`, and its own Entra app registration with `portal.pimactivation.com` redirect URIs. Never copy the beta token into the live repo or vice versa.

---

#### Path A — single folder, two remotes (cherry-pick)

This is the more powerful workflow. You have one local folder that knows about both GitHub repos through two named remotes (`origin` = beta, `live` = live). You move individual commits between branches with `git cherry-pick`.

**One-time setup on a fresh clone:**

```powershell
# Clone the beta repo (this sets origin = beta)
git clone https://github.com/Noble-Effeciency13/Beta-PIMActivation-Portal.git
cd Beta-PIMActivation-Portal

# Add the live repo as a second remote called "live"
git remote add live https://github.com/Noble-Effeciency13/PIMActivation-Portal.git
git fetch live

# Verify both remotes are configured
git remote -v
```

You should see `origin` pointing at the beta repo and `live` pointing at the live repo, each with `(fetch)` and `(push)` lines.

**Daily development on beta** is identical to a normal repo:

```powershell
git checkout main
git pull
git checkout -b fix/<topic>
# ... edit files, commit ...
git push -u origin fix/<topic>
```

Then open and merge a PR on the beta repo on github.com. The merge to `main` auto-deploys to `https://beta.portal.pimactivation.com`.

**Promoting one or more commits to live:**

```powershell
# 1. Find the commit hashes you want to promote (look at recent beta history)
git fetch origin
git log --oneline origin/main -10

# 2. Make sure your view of live is fresh, then branch off live/main
git fetch live
git checkout -B release/<topic> live/main

# 3. Cherry-pick the validated commits in chronological order
git cherry-pick <oldest-sha> <next-sha> <newest-sha>
#    For a larger feature branch already in beta:
#    git merge --no-ff origin/<feature-branch>

# 4. Push the new branch to the live repo
git push live release/<topic>
```

If `git cherry-pick` reports a conflict, edit the marked files in VS Code, then:

```powershell
git add .
git cherry-pick --continue
```

After the push, open github.com → **the live repo** (`PIMActivation-Portal`) → it will offer to open a PR from `release/<topic>` into `main`. Review the diff, merge, and the live repo's own deploy workflow will publish to `portal.pimactivation.com`.

Clean up locally once the PR is merged:

```powershell
git checkout main
git branch -D release/<topic>
```

> **Tip:** `git push` defaults to `origin`. To push to live you must always say `git push live <branch>` explicitly. That makes it very hard to push to live by accident.

---

#### Path B — two folders, file copy (GitHub Desktop friendly)

If you already have separate local clones — one for beta and one for live — and you'd rather not use the terminal, you can promote changes by copying the modified files between folders. GitHub Desktop handles all the git operations.

```
C:\path\to\Beta-PIMActivation-Portal\   ← Current repository: Beta
C:\path\to\PIMActivation-Portal\        ← Current repository: Live
```

**Daily development on the beta folder:**

1. In GitHub Desktop, *Current repository* → **Beta-PIMActivation-Portal**.
2. **Fetch origin** → **Pull origin** to make sure `main` is up to date.
3. *Current branch* → **New branch** → name it `fix/<topic>` from `main`.
4. Edit files in VS Code.
5. In GitHub Desktop, type a commit summary at the bottom-left → **Commit to fix/<topic>**.
6. **Publish branch** (first time) or **Push origin** (subsequent commits).
7. **Create Pull Request** → opens github.com → review and merge on the beta repo.

The merge auto-deploys to `https://beta.portal.pimactivation.com`. Iterate as needed — beta is allowed to be messy.

**Promoting a validated change to the live folder:**

1. **Identify what changed.** In GitHub Desktop with the beta repo selected, click the **History** tab and select the commit(s) you want to ship. The right pane lists every file each commit touched. Keep this open as your reference.
2. **Switch to the live folder.** *Current repository* → **PIMActivation-Portal**. **Fetch origin** → **Pull origin** so `main` is up to date.
3. **Make a release branch off live's `main`.** *Current branch* → **New branch** → `release/<topic>` from `main`.
4. **Copy the changed files across.** In File Explorer, copy each file the beta commit changed from the beta folder over the same path in the live folder. Skip beta-only files (`scratch/**`, the beta section of this README, beta-specific workflow paths, `.env`, `.git/`).
5. **Review every diff in GitHub Desktop.** With the live repo selected, the **Changes** tab will list the copied files. Click each one and confirm the diff matches what you intended to ship — nothing more, nothing less.
6. **Commit, push, open the PR.** Type a clear commit summary → **Commit to release/<topic>** → **Publish branch** → **Create Pull Request**. This opens the **live** repo on github.com.
7. **Merge the PR on the live repo.** Confirm the *Files changed* tab one final time, then merge. The live repo's deploy workflow publishes to `portal.pimactivation.com`.
8. **Clean up.** Back in GitHub Desktop, switch the live repo's *Current branch* to `main`, **Pull origin**, then delete the release branch.

**Quick way to find which files differ between the two folders:**

```powershell
# /L = list only, don't actually copy. Edit the paths to match your machine.
robocopy "C:\path\to\PIMActivation-Portal" "C:\path\to\Beta-PIMActivation-Portal" `
  /L /E /NJH /NJS /XD .git node_modules scratch /XF .env
```

This prints the files that differ without touching anything. Use it to know which files to copy across (in either direction).

> **Tip:** If you ever want the cherry-pick option from this two-folder setup, you can add a second remote to either folder. In GitHub Desktop, *Repository menu → Repository settings → Remote → Add remote*, then open a terminal from *Repository menu → Open in Command Prompt* and follow Path A from there.

---

## The PIMActivation ecosystem

| Repository | Description |
|---|---|
| [Noble-Effeciency13/PIMActivation](https://github.com/Noble-Effeciency13/PIMActivation) | PowerShell module — the original, available on PSGallery |
| [Noble-Effeciency13/PIMActivation-Portal](https://github.com/Noble-Effeciency13/PIMActivation-Portal) | Browser portal — the live repo |
| [Noble-Effeciency13/Beta-PIMActivation-Portal](https://github.com/Noble-Effeciency13/Beta-PIMActivation-Portal) | Private beta of the browser portal — this repo |

---

## License

MIT © 2026 Sebastian Flæng Markdanner
