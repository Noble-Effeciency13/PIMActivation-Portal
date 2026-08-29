# Security Tooling

This directory contains supply chain verification scripts and a Dependabot anchor for monitoring `@azure/msal-browser` updates. These files are **not part of the deployed web application** — they are maintenance tools for the development team.

## Why This Exists

The portal vendors `@azure/msal-browser` locally in `Portal/js/lib/` instead of loading it from a CDN. This eliminates external script dependencies, tightens the Content Security Policy, and removes the availability dependency on jsDelivr. The trade-off is that we must actively manage updates. This directory provides the tooling for that.

## Scripts

All scripts are PowerShell (cross-platform via `pwsh`), consistent with the project's existing scripting convention.

### `update-msal.ps1`

Downloads, verifies, and vendors a new MSAL version.

```powershell
pwsh ./security/update-msal.ps1 -Version 5.10.0
```

**What it does:**
1. Downloads the npm tarball for the requested version
2. Verifies the tarball SHA-1 against the npm registry metadata
3. Extracts the UMD bundle (`lib/msal-browser.min.js`)
4. Computes the SRI hash of the extracted file
5. Copies the verified file to `Portal/js/lib/msal-browser.min.js`
6. Updates `security/package.json` to the new version

**Prerequisites:** `npm` (Node.js)

### `verify-msal.ps1`

Verifies the currently vendored MSAL file matches the official npm package.

```powershell
pwsh ./security/verify-msal.ps1
```

**What it does:**
1. Reads the pinned version from `security/package.json`
2. Downloads the official tarball and extracts the bundle
3. Compares SHA-256 hashes of the local vs. official file
4. Exits with code `0` (match) or `1` (mismatch)

**Use in CI:** The `verify-msal.yml` GitHub Actions workflow runs automatically on PRs touching `security/` or `Portal/js/lib/`. If Dependabot opens a PR bumping the version in `package.json`, CI automatically runs `update-msal.ps1`, verifies the hash with `verify-msal.ps1`, and commits the updated vendored bundle directly to the PR branch.

**Prerequisites:** `npm` (Node.js)

## Other Files

### `package.json`

A minimal `package.json` that lists `@azure/msal-browser` as a dependency. It exists **solely for Dependabot** to monitor for new versions. When a new version is published on npm, Dependabot automatically opens a PR updating this file.

This file is not used at build time, deploy time, or runtime.

### `.tmp-msal-*` directories

Temporary directories created and cleaned up by the scripts above. They are excluded via `.gitignore` but if one persists after a script failure, it can be safely deleted.

## Version Update Workflow

1. **Dependabot opens a PR** updating `security/package.json` to a new MSAL version.
2. **CI automatically vendors & verifies:** The `verify-msal.yml` workflow runs `update-msal.ps1`, verifies SHA-256 integrity, and commits the updated `Portal/js/lib/msal-browser.min.js` to the PR branch.
3. **Review the changelog:** Check the [MSAL changelog](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/CHANGELOG.md) in the PR for any breaking changes or deprecations.
4. **Approve and Merge:** Review the diff and approve/merge the pull request when satisfied.

