<#
.SYNOPSIS
  Verifies the vendored msal-browser.min.js against the npm registry.

.DESCRIPTION
  1. Reads the pinned version from security/package.json
  2. Downloads the official tarball from npm
  3. Extracts the UMD bundle and computes its SHA-256 hash
  4. Compares it to the hash of the locally vendored file
  5. Exits with code 0 (match) or 1 (mismatch)

  Suitable for CI/CD pipelines and local smoke tests.

.EXAMPLE
  pwsh ./security/verify-msal.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$packageJson = Join-Path $RepoRoot 'security/package.json'
$localFile   = Join-Path $RepoRoot 'Portal/js/lib/msal-browser.min.js'
$tempDir     = Join-Path $RepoRoot 'security/.tmp-msal-verify'

# ── 1. Read pinned version ──
$pkg     = Get-Content $packageJson -Raw | ConvertFrom-Json
$version = $pkg.dependencies.'@azure/msal-browser'
Write-Host "Pinned version: @azure/msal-browser@$version"

if (-not (Test-Path $localFile)) {
  Write-Error "Vendored file not found: $localFile"
  exit 1
}

# ── 2. Download and extract the official bundle ──
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  Push-Location $tempDir
  $tarballName = "azure-msal-browser-$version.tgz"
  $bundlePath  = 'package/lib/msal-browser.min.js'

  Write-Host "Downloading @azure/msal-browser@$version from npm ..."
  npm pack "@azure/msal-browser@$version" 2>&1 | Out-Null

  if (-not (Test-Path $tarballName)) {
    throw "npm pack failed — tarball not found."
  }

  tar -xzf $tarballName $bundlePath 2>&1

  $officialFile = Join-Path $tempDir $bundlePath
  if (-not (Test-Path $officialFile)) {
    throw "Bundle file not found in tarball."
  }

  # ── 3. Compare hashes ──
  $localHash    = (Get-FileHash $localFile -Algorithm SHA256).Hash
  $officialHash = (Get-FileHash $officialFile -Algorithm SHA256).Hash

  Write-Host "  Vendored file hash: $localHash"
  Write-Host "  Official npm hash:  $officialHash"

  if ($localHash -eq $officialHash) {
    Write-Host ''
    Write-Host '✅ MATCH — vendored file is authentic.' -ForegroundColor Green
    exit 0
  } else {
    Write-Host ''
    Write-Host '❌ MISMATCH — vendored file does NOT match the official npm package!' -ForegroundColor Red
    Write-Host '   The file may have been modified. Re-run update-msal.ps1 to re-vendor.' -ForegroundColor Red
    exit 1
  }

} finally {
  Pop-Location
  if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
}
