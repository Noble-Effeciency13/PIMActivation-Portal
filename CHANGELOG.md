# Changelog

All notable changes to the PIMActivation Portal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — open a [discussion](https://github.com/Noble-Effeciency13/PIMActivation-Portal/discussions) or [feature request](https://github.com/Noble-Effeciency13/PIMActivation-Portal/issues/new?template=feature_request.yml) if you have an idea._

## [1.0.0] — 2026-05-07

First public release. The portal is live at <https://portal.pimactivation.com> and the self-hosted Bicep / ARM template is published.

### Added

#### Role management

- Bulk activation across Microsoft Entra ID roles, Azure Resource roles, and PIM for Groups in a single operation.
- Bulk deactivation of multiple active roles with optimistic UI updates.
- Tenant switcher for home, guest, and member directories without signing out.
- Pending-approval tracking with inline indicators and surfacing in activity history.
- Optional scheduled-activation start time, capped to the policy maximum.

#### Policy awareness

- Per-role policy matrix (justification, ticket, MFA, Conditional Access auth context, approval, max duration) detected and rendered for every eligible role.
- Client-side enforcement of required justification and ticket fields before submit.
- Automatic capping of requested duration to the policy maximum.
- Conditional Access auth-context step-up: claims challenges (`acrs`) decoded, re-auth performed, and acquired claims threaded into every subsequent token request for the operation.

#### Activation profiles

- Named role sets persisted in browser-local IndexedDB.
- Per-profile pre-filled justification, ticket number, and duration override.
- Opt-in tenant scoping for profiles (useful for guest scenarios).
- Last-used sorting so frequent rotations stay at the top.

#### Active role management

- Live expiry countdowns ticking every 30 seconds.
- Colour-coded urgency (green → yellow → red) as expiry approaches.
- "Select All" on active roles only checks PIM-activated roles, leaving permanent assignments untouched.
- Inline bulk deactivation with per-role status feedback.

#### Notifications and activity history

- Typed toast notifications (success / warning / error / info) with optional descriptions.
- Persistent in-session notification panel with unread badge.
- Activity-details modal showing per-role outcome, status code, error message, submission time, scheduled start, duration, justification, and ticket number used.

#### Interface

- Three themes: dark (default), light, and high-contrast.
- System auto-detect of light / dark preference until the user picks one explicitly.
- Inline search and filter on both the eligible and active tables.
- Filter pills with quick role-type toggles and saveable named filters.
- Help and settings menus surfaced from the header (in-app guide, FAQ, feature flags).
- Responsive layout from phone-width up to ultra-wide displays.

#### Architecture and engine

- Single-page app, vanilla JavaScript, no build step, no framework.
- Microsoft Graph `$batch` requests chunked at 20 with exponential backoff on `429`.
- Azure Resource Manager calls executed concurrently with a small concurrency limit and `Promise.allSettled` so one failure does not abort the batch.
- Tenant-root policy enrichment (`asTarget()`-style queries) to avoid per-Administrative-Unit permission issues.
- 30-minute in-memory policy cache; per-tenant role cache in `localStorage`; activation profiles in IndexedDB.

#### Security

- Strict Content Security Policy in [`Portal/staticwebapp.config.json`](Portal/staticwebapp.config.json):
  `default-src 'self'`; `script-src 'self' https://cdn.jsdelivr.net`; `connect-src` limited to `login.microsoftonline.com`, `graph.microsoft.com`, `management.azure.com`; `frame-ancestors 'none'`; `upgrade-insecure-requests`.
- Global security headers: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- MSAL.js v5 with PKCE, redirect flow for sign-in / sign-out, tokens cached in `sessionStorage` only.
- Delegated Microsoft Graph and ARM permissions only — no app permissions, no client secrets, no service-principal credentials anywhere.

#### Hosting and deployment

- Managed deployment at <https://portal.pimactivation.com> on Azure Static Web Apps (multi-tenant `organizations` authority).
- Self-hosted Bicep template ([`Portal/deploy/bicep/portal-selfhosted.bicep`](Portal/deploy/bicep/portal-selfhosted.bicep)) and generated ARM template ([`Portal/deploy/azuredeploy.json`](Portal/deploy/azuredeploy.json)) with one-click **Deploy to Azure** support.
- Deployment script that downloads a verified portal source archive, caches it in a customer-owned storage account for fallback redeploys, injects `clientId` and `tenantId`, deploys via the SWA CLI, and attempts to merge SPA redirect URIs into the app registration through Microsoft Graph.
- Optional `customDomain` parameter and admin-consent URL output.

#### Landing site

- Companion marketing / discovery site at <https://pimactivation.com>, served from [`website/`](website) on GitHub Pages.
- Plain HTML / CSS, no framework, no tracking, no third-party requests.
- Cross-links to the live portal at `portal.pimactivation.com`, the GitHub repository, the Wiki, and the PIMActivation PowerShell module.
- Shared favicon set kept in sync with the portal via the **Sync Favicons** workflow.
- Responsive layout with the same dark / light theming language as the portal.

#### CI / CD

- **Deploy Portal** — pushes to `main` touching `Portal/**` deploy to Azure Static Web Apps.
- **Deploy GitHub Pages** — pushes touching `website/**` publish the landing site.
- **Sync Deployment Templates** — Bicep → ARM is regenerated on `main`; PRs that drift fail the check.
- **Sync Favicons** — keeps `Portal/favicons/` and `website/favicons/` aligned with `assets/favicons/`.

#### Documentation

- Comprehensive `README.md` with badges, feature reference, security model, deployment walkthrough, and architecture overview.
- `CONTRIBUTING.md` with project ground rules and PR checklist.
- GitHub issue forms (bug, feature, documentation) and pull-request template under [`.github/`](.github).
- Wiki content authored under [`docs/wiki/`](docs/wiki) for upload to the GitHub Wiki.

[Unreleased]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/releases/tag/v1.0.0
