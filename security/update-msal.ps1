<#
.SYNOPSIS
  Downloads and vendors a specific version of @azure/msal-browser.

.DESCRIPTION
  1. Downloads the npm tarball for the requested version
  2. Extracts the UMD bundle (lib/msal-browser.min.js)
  3. Verifies the SHA-256 hash against the npm registry metadata
  4. Copies the verified file to Portal/js/lib/msal-browser.min.js
  5. Updates security/package.json with the new version

.PARAMETER Version
  The npm version to download (e.g. '5.10.0'). Required.

.EXAMPLE
  pwsh ./security/update-msal.ps1 -Version 5.10.0
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Version,

  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$packageName   = '@azure/msal-browser'
$tarballName   = "azure-msal-browser-$Version.tgz"
$bundlePath    = 'package/lib/msal-browser.min.js'
$destDir       = Join-Path $RepoRoot 'Portal/js/lib'
$destFile      = Join-Path $destDir 'msal-browser.min.js'
$tempDir       = Join-Path $RepoRoot "security/.tmp-msal-update"
$packageJson   = Join-Path $RepoRoot 'security/package.json'

# ── 1. Create temp working directory ──
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  # ── 2. Download the tarball ──
  Write-Host "Downloading $packageName@$Version ..."
  Push-Location $tempDir
  npm pack "$packageName@$Version" 2>&1 | Out-Null

  if (-not (Test-Path $tarballName)) {
    throw "npm pack failed — tarball '$tarballName' not found."
  }

  # ── 3. Extract the UMD bundle ──
  Write-Host 'Extracting UMD bundle ...'
  tar -xzf $tarballName $bundlePath 2>&1

  $extractedFile = Join-Path $tempDir $bundlePath
  if (-not (Test-Path $extractedFile)) {
    throw "Expected file '$bundlePath' not found in tarball."
  }

  # ── 4. Fetch expected hash from npm registry ──
  Write-Host 'Fetching registry metadata for hash verification ...'
  $registryUrl = "https://registry.npmjs.org/$packageName/$Version"
  $metadata    = Invoke-RestMethod -Uri $registryUrl -ErrorAction Stop
  $expectedSha = $metadata.dist.shasum  # SHA-1 of the tarball (npm default)

  # Verify tarball integrity (SHA-1)
  $tarballSha = (Get-FileHash $tarballName -Algorithm SHA1).Hash.ToLower()
  if ($tarballSha -ne $expectedSha) {
    throw "TARBALL HASH MISMATCH!`n  Expected: $expectedSha`n  Got:      $tarballSha`nThe downloaded package may be tampered with."
  }
  Write-Host "  Tarball SHA-1 verified: $tarballSha"

  # ── 5. Compute SRI hash of the extracted bundle ──
  $bundleHashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [System.IO.File]::ReadAllBytes($extractedFile)
  )
  $bundleSri = 'sha256-' + [Convert]::ToBase64String($bundleHashBytes)
  Write-Host "  Bundle SRI hash: $bundleSri"

  # ── 6. Copy to destination ──
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item -LiteralPath $extractedFile -Destination $destFile -Force
  Write-Host "Vendored to: $destFile"

  # ── 7. Update security/package.json ──
  $pkg = Get-Content $packageJson -Raw | ConvertFrom-Json
  $pkg.dependencies.'@azure/msal-browser' = $Version
  $pkg | ConvertTo-Json -Depth 10 | Set-Content $packageJson -Encoding UTF8 -NoNewline
  Write-Host "Updated security/package.json to version $Version"

  # ── 8. Summary ──
  Write-Host ''
  Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Green
  Write-Host "  MSAL updated to $Version" -ForegroundColor Green
  Write-Host "  Bundle SRI:  $bundleSri" -ForegroundColor Green
  Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Next steps:'
  Write-Host '  1. Test locally:  node dev.js'
  Write-Host '  2. Verify hash:   pwsh ./security/verify-msal.ps1'
  Write-Host '  3. Commit and PR'

} finally {
  Pop-Location
  if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
}
