# Workstation Meva Online - auto-restart wrapper (Windows)
# Runs the node server and restarts it if it crashes (up to MAX_RESTARTS
# within RESET_WINDOW_SEC; the counter resets after the server runs stably).
#
# Used by Start Server.bat (-open / -hidden modes). Not meant to be run
# directly.

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$entry = Join-Path $root 'backend\dist\index.js'
$log = Join-Path $root 'server.log'
$MAX_RESTARTS = 5
$RESET_WINDOW_SEC = 60

# Use bundled Node.js if present (installer layout), else fall back to PATH.
$bundledNode = Join-Path $root 'node\node.exe'
if (Test-Path -LiteralPath $bundledNode) {
  $env:PATH = (Split-Path -Parent $bundledNode) + ';' + $env:PATH
}

function Write-Log($msg) {
  $line = "[{0}] [core] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  $line | Out-File -FilePath $log -Append -Encoding utf8
}

if (-not (Test-Path $entry)) {
  Write-Log "ERROR: $entry not found. Run Start Server.bat first (it builds)."
  exit 1
}

function Is-Listening($port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop) } catch { return $false }
}

# Reverse-proxy watchdog: keeps Caddy (port 80) alive in a separate hidden
# process so the site never drops silently when Caddy crashes or is killed.
# Skips cleanly if Caddy is not installed on this machine.
function Start-CaddyWatchdog {
  $caddy = Join-Path $root 'proxy\caddy\caddy.exe'
  $cfg = Join-Path $root 'proxy\caddy\Caddyfile'
  if (-not (Test-Path -LiteralPath $caddy)) { Write-Log 'Caddy watchdog skipped: caddy.exe not found.'; return }
  if (-not (Test-Path -LiteralPath $cfg)) { Write-Log 'Caddy watchdog skipped: Caddyfile not found.'; return }

  $watchdog = @'
$root = $args[0]
$caddy = Join-Path $root 'proxy\caddy\caddy.exe'
$cfg = Join-Path $root 'proxy\caddy\Caddyfile'
$log = Join-Path $root 'server.log'
function Write-Log($msg) {
  $line = "[{0}] [caddy-watchdog] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  $line | Out-File -FilePath $log -Append -Encoding utf8
}
function Is-Listening($port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop) } catch { return $false }
}
Write-Log 'Watchdog started.'
while ($true) {
  if (-not (Is-Listening 80)) {
    Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    try {
      Start-Process -FilePath $caddy -WorkingDirectory (Split-Path -Parent $caddy) -ArgumentList 'run','--config','Caddyfile' -WindowStyle Hidden
      Write-Log 'Caddy (re)started.'
    } catch {
      Write-Log "Caddy start failed: $($_.Exception.Message)"
    }
  }
  Start-Sleep -Seconds 5
}
'@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($watchdog))
  try {
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded, $root)
    Write-Log 'Caddy watchdog started.'
  } catch {
    Write-Log "Caddy watchdog start failed: $($_.Exception.Message)"
  }
}

if (Is-Listening 3002) {
  Write-Log "Port 3002 already has a server - another wrapper is handling it. Exiting."
  exit 0
}

Start-CaddyWatchdog

$restartCount = 0

while ($true) {
  Write-Log 'Starting server...'
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Push-Location (Join-Path $root 'backend')
  & node $entry 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  $exitCode = $LASTEXITCODE
  Pop-Location
  $sw.Stop()

  Write-Log "Server exited (code $exitCode)"

  if ($sw.Elapsed.TotalSeconds -ge $RESET_WINDOW_SEC) {
    $restartCount = 0
  }
  $restartCount++

  if ($restartCount -ge $MAX_RESTARTS) {
    Write-Log "Server crashed $MAX_RESTARTS times in $RESET_WINDOW_SEC s - giving up. Check server.log for the reason."
    exit 1
  }

  Write-Log "Restarting in 2s (attempt $restartCount/$MAX_RESTARTS)..."
  Start-Sleep -Seconds 2
}
