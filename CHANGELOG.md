# Changelog

All notable changes to the PIMActivation Portal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] — 2026-08-30

### Added

#### Corporate branding
- Runtime corporate branding configuration supporting custom light/dark logos with auto-switching, custom browser favicons, corporate theme color palettes (primary, accent, nav, background per design mode), and up to 3 custom enterprise navigation links in the header.
- Automated provisioning of a private `branding` blob container in the customer-owned storage account in self-hosted Bicep / ARM deployments, syncing schema, sample, and custom uploaded assets directly into the SWA payload.

#### Table & column customization
- Column visibility toggles for the Eligible roles table (Role type, Max duration, MFA, Justification, Ticket, Approval, Custom Extension).
- Drag-and-drop handles and Up/Down move buttons in Settings to reorder columns (#10).
- Adaptive policy detail view: automatically activates the expandable policy row on desktop when policy columns are hidden, ensuring all policy metadata remains accessible.

#### Workspace settings
- Setting to toggle User & Tenant card visibility to maximize vertical table area.

#### Configuration export / import
- Settings export and import supporting all UI flags, column layouts, duration defaults, and quick actions in JSON format, with optional profile bundling.

### Changed
- Content Security Policy in `Portal/staticwebapp.config.json`: added route caching rules for `/branding/*` while maintaining strict `script-src 'self'` and `img-src 'self' data:;`.

## [1.2.0] — 2026-08-28

### Added

#### Role activation
- Multi-role Azure reduced-scope activation (#9) — select and activate multiple Azure Resource roles simultaneously with per-role reduced scope overrides (management group, subscription, resource group, or resource).

#### Security & architecture
- Self-hosted MSAL bundle (#11) — shipped MSAL.js directly in `Portal/js/lib/msal-browser.min.js`, removing the runtime CDN dependency.

### Changed
- Removed `https://cdn.jsdelivr.net` from Content Security Policy `script-src` in `Portal/staticwebapp.config.json` (#11), making all scripts 100% self-hosted with zero external script origins.

## [1.1.0] — 2026-06-28

### Added

#### Policy awareness

- Custom extension (pre-approval callout) detection — eligible roles whose PIM policy requires a custom extension now show a dedicated **Ext** column in the policy matrix, alongside a badge in the mobile policy strip and an entry in the expandable policy-detail panel.
- Custom extension display names are resolved from the Microsoft Graph beta `privilegedAccess/customExtensions` endpoint and surfaced in the column tooltip and detail panel; the portal falls back to a generic "Required" label when a name cannot be resolved (e.g. missing licence or consent).

#### Activation profiles

- Per-role reduced Azure Resource scopes are now saved with a profile and restored into the activation modal, so a narrowed scope (management group / subscription / resource group / resource) persists across sessions and is shown in the profiles overview.

#### Interface

- Sticky section headers keep the Active and Eligible toolbars visible while scrolling long role lists.
- Duration presets that exceed a role's policy maximum are hidden in the activation modal, preventing over-requests.
- The **Profiles** button changes to **Save Profile** when one or more eligible roles are selected, making the save action discoverable.

### Changed

- Entra and Group role policy lookups now prefer the Microsoft Graph beta endpoint, with automatic fallback to v1.0, so custom-extension rules are returned wherever the tenant exposes them.
- Maximum-duration parsing now understands multi-unit ISO 8601 durations (days, hours, and minutes), so policies such as `P1D` or `PT30M` are rendered and capped correctly — previously only whole hours were recognised.
- Self-hosted deployment now assigns the built-in **Contributor** role to the deployment identity on the Static Web App resource, which is required for the `listSecrets` call the SWA CLI performs during content upload.

### Fixed

- Mobile dropdown menus are no longer clipped at the screen edge.

### Security

- Added the delegated `PrivilegedAccess-CustomExt.Read.All` Microsoft Graph scope, requested solely to read PIM custom-extension definitions for display. It remains delegated and user-consented — no application permissions or stored credentials are introduced.

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
- JSON import / export to move profiles between browsers, devices, and teammates; tenant scoping preserved on import.

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
- Installable as a Progressive Web App on desktop and mobile via the shipped Web App Manifest (`Portal/manifest.json`), maskable 192 / 512 icons, `display: standalone`, theme-color, Apple touch icon, and `apple-mobile-web-app-*` meta tags. Launches in a standalone window with its own app icon — no browser chrome.

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

[Unreleased]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Noble-Effeciency13/PIMActivation-Portal/releases/tag/v1.0.0
