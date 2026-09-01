# stop-app.ps1 — Kill ONLY this app's processes (used by the uninstaller).
# Safe: matches node/caddy processes whose executable or command line lives
# under the install directory (or that own port 3002). Never kills other
# Node apps on the machine the way "taskkill /im node.exe" would.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File stop-app.ps1 [InstallDir]

param([string]$InstallDir = "")

$ErrorActionPreference = 'SilentlyContinue'

if (-not $InstallDir) {
  # Default: the repo/app root (two levels above this script under windows\)
  $InstallDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}
$root = [System.IO.Path]::GetFullPath($InstallDir.TrimEnd('\'))

# 1) Anything listening on the app port.
Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# 2) node.exe / caddy.exe / wrapper powershell (start-server-core.ps1) whose
#    executable OR command line references $root. The wrapper is what holds
#    server.log open, so it must die too or the uninstaller leaves a locked file.
Get-CimInstance Win32_Process |
  Where-Object {
    (($_.Name -in @('node.exe', 'caddy.exe')) -or
     ($_.Name -eq 'powershell.exe' -and $_.CommandLine -match 'start-server-core\.ps1')) -and
    (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) -or
     ($_.CommandLine -and $_.CommandLine -like "*$root*"))
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 800