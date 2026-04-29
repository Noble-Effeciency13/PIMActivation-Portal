[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$sourceRootDir = Join-Path $RepoRoot 'assets/favicons'
$nestedSourceDir = Join-Path $sourceRootDir 'favicon'
$portalRoot = Join-Path $RepoRoot 'Portal'
$websiteRoot = Join-Path $RepoRoot 'website'
$portalFaviconsDir = Join-Path $portalRoot 'favicons'
$websiteFaviconsDir = Join-Path $websiteRoot 'favicons'
$legacyPortalFaviconsDir = Join-Path $portalRoot 'images/favicons'
$legacyWebsiteFaviconsDir = Join-Path $websiteRoot 'images/favicons'

$ignoredFileNames = @('README.md', '.gitkeep')
$expectedFileNames = @(
  'favicon.ico',
  'favicon.svg',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'web-app-manifest-192x192.png',
  'web-app-manifest-512x512.png',
  'site.webmanifest'
)

if (-not (Test-Path -LiteralPath $sourceRootDir)) {
  throw "Favicon source folder not found: $sourceRootDir"
}

function Get-DeployableFaviconFiles {
  param([string]$CandidateDir)

  if (-not (Test-Path -LiteralPath $CandidateDir)) {
    return @()
  }

  return @(Get-ChildItem -LiteralPath $CandidateDir -File |
    Where-Object { $ignoredFileNames -notcontains $_.Name })
}

$sourceDir = $sourceRootDir
$sourceFiles = Get-DeployableFaviconFiles -CandidateDir $sourceDir

if (-not $sourceFiles) {
  $sourceDir = $nestedSourceDir
  $sourceFiles = Get-DeployableFaviconFiles -CandidateDir $sourceDir
}

if (-not $sourceFiles) {
  Write-Host 'No favicon files found in assets/favicons or assets/favicons/favicon. Add the favicon set, then run this script again.'
  exit 0
}

Write-Host "Using favicon source folder: $sourceDir"

$sourceFileNames = $sourceFiles | ForEach-Object { $_.Name }
$missingExpectedFileNames = $expectedFileNames | Where-Object { $sourceFileNames -notcontains $_ }

foreach ($missingFileName in $missingExpectedFileNames) {
  Write-Warning "Expected favicon file is missing from assets/favicons: $missingFileName"
}

foreach ($targetDir in @($portalFaviconsDir, $websiteFaviconsDir)) {
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

  Get-ChildItem -LiteralPath $targetDir -File |
    Where-Object { $ignoredFileNames -notcontains $_.Name -and $sourceFileNames -notcontains $_.Name } |
    Remove-Item -Force

  foreach ($sourceFile in $sourceFiles) {
    Copy-Item -LiteralPath $sourceFile.FullName -Destination (Join-Path $targetDir $sourceFile.Name) -Force
  }
}

foreach ($legacyTargetDir in @($legacyPortalFaviconsDir, $legacyWebsiteFaviconsDir)) {
  if (Test-Path -LiteralPath $legacyTargetDir) {
    Remove-Item -LiteralPath $legacyTargetDir -Recurse -Force
  }
}

$sourceRootIcon = Join-Path $sourceDir 'favicon.ico'
if (Test-Path -LiteralPath $sourceRootIcon) {
  Copy-Item -LiteralPath $sourceRootIcon -Destination (Join-Path $portalRoot 'favicon.ico') -Force
  Copy-Item -LiteralPath $sourceRootIcon -Destination (Join-Path $websiteRoot 'favicon.ico') -Force
} else {
  Write-Warning 'favicon.ico is missing, so /favicon.ico was not synced for either deployed site root.'
}

Write-Host 'Favicons synced to Portal/favicons and website/favicons.'