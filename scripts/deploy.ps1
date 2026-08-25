# Deploy wrapper for aimazze-web.
#
# Use this instead of a bare `wrangler deploy`.
#
#   powershell -File scripts\deploy.ps1
#   powershell -File scripts\deploy.ps1 -AllowDirty     # ship uncommitted files on purpose
#
# It exists because a bare `wrangler deploy` has two failure modes that
# nothing else in this repo can catch, both of which have already happened:
#
#  1. downloads/ is gitignored, so a clean `git status` says nothing about
#     whether the installers are on disk. Deploying from a tree where
#     downloads/ is empty silently removes every installer from the live
#     asset manifest -- the upload replaces the manifest wholesale, it does
#     not merge with what was there before. This is what took the public
#     Windows download button offline on 2026-08-24; every other asset in
#     the same deploy served fine, so nothing looked wrong.
#
#  2. assets.directory is "." and wrangler ships whatever is on disk, so any
#     uncommitted edit in the working tree goes live alongside whatever you
#     meant to deploy. Committing does not help -- the files are on disk
#     either way. The only real guard is refusing to deploy a dirty tree
#     unless you say you mean it.
#
# Order matters: the pre-flight checks run before the deploy, the smoke
# check runs after, and a smoke failure exits non-zero so this can gate CI
# if there ever is any.

[CmdletBinding()]
param(
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host '== pre-flight ==' -ForegroundColor Cyan

# --- 1. downloads/ must not be empty ----------------------------------------
$dl = Join-Path $repo 'downloads'
$installers = @()
if (Test-Path $dl) {
    $installers = @(Get-ChildItem -Path $dl -File -ErrorAction SilentlyContinue)
}
if ($installers.Count -eq 0) {
    Write-Host 'FAIL  downloads/ is empty or missing.' -ForegroundColor Red
    Write-Host '      downloads/ is gitignored, so a fresh clone starts this way.'
    Write-Host '      Deploying now would remove every installer from production.'
    Write-Host '      Rebuild or copy the installers in first, then re-run.'
    exit 1
}
Write-Host ("ok    downloads/ has {0} file(s)" -f $installers.Count)

# --- 2. every /downloads/ link in index.html must exist on disk -------------
$html = Get-Content -Path (Join-Path $repo 'index.html') -Raw
$linked = [regex]::Matches($html, '/downloads/([A-Za-z0-9._-]+)') |
          ForEach-Object { $_.Groups[1].Value } |
          Select-Object -Unique
if (-not $linked) {
    Write-Host 'FAIL  index.html has no /downloads/ link -- is the download CTA gone?' -ForegroundColor Red
    exit 1
}
$missing = @($linked | Where-Object { -not (Test-Path (Join-Path $dl $_)) })
if ($missing.Count -gt 0) {
    Write-Host 'FAIL  index.html links installers that are not on disk:' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "        /downloads/$_" }
    exit 1
}
Write-Host ("ok    all {0} linked installer(s) present on disk" -f @($linked).Count)

# --- 3. dirty tree gate ------------------------------------------------------
$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
    if (-not $AllowDirty) {
        Write-Host 'FAIL  working tree is dirty. These files would ship as-is:' -ForegroundColor Red
        $dirty | ForEach-Object { Write-Host "        $_" }
        Write-Host ''
        Write-Host '      wrangler uploads the working tree, not git. Re-run with'
        Write-Host '      -AllowDirty if shipping these is genuinely what you want.'
        exit 1
    }
    Write-Host 'WARN  deploying a dirty tree on purpose (-AllowDirty):' -ForegroundColor Yellow
    $dirty | ForEach-Object { Write-Host "        $_" }
}
else {
    Write-Host 'ok    working tree clean'
}

# --- deploy ------------------------------------------------------------------
Write-Host ''
Write-Host '== deploy ==' -ForegroundColor Cyan
npx --yes wrangler@latest deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host 'FAIL  wrangler deploy failed -- skipping smoke check.' -ForegroundColor Red
    exit $LASTEXITCODE
}

# --- post-deploy smoke check -------------------------------------------------
Write-Host ''
Write-Host '== post-deploy smoke check ==' -ForegroundColor Cyan
node scripts/smoke-downloads.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'FAIL  deploy completed but downloads/ is not serving correctly.' -ForegroundColor Red
    Write-Host '      Production is live and wrong right now -- fix and redeploy.'
    exit $LASTEXITCODE
}

Write-Host ''
Write-Host 'Deploy complete and verified.' -ForegroundColor Green
