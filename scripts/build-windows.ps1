# Jotta Edit v1.1.2 — Portable single-file Windows x64 executable (Node 24 LTS recommended)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Run([string]$command, [string[]]$arguments) {
  & $command @arguments
  if ($LASTEXITCODE -ne 0) { throw "$command failed with code $LASTEXITCODE" }
}
# Node 22.11.0 cannot require() the ESM-based @electron/get dependency.
# Preflight MUST happen before npm install or Electron's postinstall crashes.
Run 'node.exe' @('scripts/check-node-version.cjs')
Run 'npm.cmd' @('install','--no-audit','--no-fund')
if (-not (Test-Path 'node_modules/electron/dist/electron.exe')) {
  Run 'npx.cmd' @('--yes','install-electron','--no')
}
Run 'npm.cmd' @('run','install:check')
Run 'npm.cmd' @('run','check')
Run 'npm.cmd' @('test')
Run 'npm.cmd' @('run','dist:windows')
$Version = (& node.exe -p 'require("./package.json").version').Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine Jotta Edit version from package.json' }
$Artifact = Join-Path 'release' "Jotta-Edit-$Version-Windows-x64-Portable.exe"
if (-not (Test-Path $Artifact)) { throw "Portable executable not found: $Artifact" }
Write-Host "Portable executable ready: $Artifact"
Write-Host 'No installation required: copy this .exe anywhere on Windows and run it.'

