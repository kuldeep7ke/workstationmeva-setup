# Workstation Meva - robust launcher (single source of truth)
# ============================================================
# Replaces the fragile cmd.bat logic with PowerShell so launcher
# failures (cmd paren/escape parse errors) cannot happen again.
#
# Modes (argument -Mode):
#   visible  - double-click: shows messages, pauses on error, opens browser
#   open     - hidden, then opens the browser when the server is up
#   hidden   - silent (login autostart); logs to server.log
#   repair   - only repair the launcher files, then exit
#
# Every start:
#   1. self-repairs the launcher .bat/.vbs files (restores canonical content)
#   2. checks port 3002, starts/verifies everything, opens the app

param([string]$Mode = 'visible')

$ErrorActionPreference = 'Continue'

$root    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$winDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'backend'
$front   = Join-Path $root 'frontend'
$log     = Join-Path $root 'server.log'
$PORT    = 3002

function Write-Log($msg) {
  $line = "[{0}] [launcher] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  try { $line | Out-File -FilePath $log -Append -Encoding utf8 } catch {}
  if ($Mode -in @('visible','open')) { Write-Host $msg }
}

# Bundled runtime + layout detection.
# - If the portable Node.js ships with the app (installer layout), put it on
#   PATH so every node/npm call below works even without a system install.
# - `app.installed` marks a packaged (installer) layout: pre-built files and
#   backend node_modules are already bundled, so install/build steps are skipped.
$bundled = Join-Path $root 'node'
if (Test-Path -LiteralPath (Join-Path $bundled 'node.exe')) {
  $env:PATH = $bundled + ';' + $env:PATH
  Write-Log "Bundled Node.js on PATH: $bundled"
}
$installed = Test-Path -LiteralPath (Join-Path $root 'app.installed')
if ($installed) { Write-Log "Packaged (installer) layout detected - app.installed found." }

function Fail($msg) {
  Write-Log "ERROR: $msg"
  if ($Mode -eq 'visible') {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host "   ERROR: $msg" -ForegroundColor Red
    Write-Host "   Details are in server.log" -ForegroundColor Red
    Write-Host "   (or double-click windows\Repair Launcher.bat)" -ForegroundColor Red
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to close..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') 2>$null
  }
  exit 1
}

function IsListening($port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop) } catch { return $false }
}

# ============================================================
# 1. SELF-REPAIR: canonical content of every launcher file.
#    If a file is missing, corrupted, or was edited into a broken
#    state, it is restored here automatically and the fix is logged.
#    Only the server-lifecycle files are protected below - Clean Junk.bat,
#    Create .env.bat, Remove Autostart.bat and Repair Launcher.bat are
#    one-off utilities and intentionally NOT in the map.
# ============================================================

$canonical = @{
  'Start Server.bat' = @'
@echo off
title Workstation Meva Server
cd /d "%~dp0..\backend"
if "%~1"=="-open" goto open
if "%~1"=="-hidden" goto hidden
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" -Mode visible
goto end
:open
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" -Mode open
goto end
:hidden
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" -Mode hidden
:end
exit /b 0
'@

  'Stop Server.bat' = @'
@echo off
title Stop Workstation Meva Server
echo Stopping the Workstation Meva server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter 'Name=''powershell.exe''' | Where-Object { $_.CommandLine -match '-File\s+.*start-server-core\.ps1' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
taskkill /F /IM caddy.exe >nul 2>nul
echo Done. The server is stopped (if it was running).
pause
'@

  'Start Server Hidden.vbs' = @'
' Starts the Workstation Meva server silently (no console window).
' Calls start-server.ps1 directly (the .bat files are repaired by it,
' so even a broken Start Server.bat cannot break the autostart).
' Run with "-open" to also open the app in the default browser when ready.
' Run with no arguments (scheduled autostart) to start silently without a browser.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
If WScript.Arguments.Count > 0 Then
  mode = " open"
Else
  mode = " hidden"
End If
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\start-server.ps1"" -Mode" & mode, 0, False
'@

  'firewall-heal.bat' = @'
@echo off
REM Elevated helper: adds/repairs the Workstation Meva inbound firewall rule.
REM Called from start-server.ps1 when the rule is missing. Covers ALL network
REM profiles (Domain/Private/Public) so LAN access keeps working even if
REM Windows reclassifies the network type.
netsh advfirewall firewall add rule name="Workstation Meva 3002" dir=in action=allow protocol=TCP localport=3002 profile=any
netsh advfirewall firewall show rule name="Workstation Meva 3002"
'@

  'Install Autostart.bat' = @'
@echo off
title Install Workstation Meva Autostart
cd /d "%~dp0"

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP_DIR%\Workstation Meva.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%LNK%'); $sc.TargetPath = 'wscript.exe'; $q = [char]34; $sc.Arguments = $q + '%~dp0Start Server Hidden.vbs' + $q; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Workstation Meva server'; $sc.Save()"

if errorlevel 1 (
  echo.
  echo FAILED to install autostart.
) else (
  echo.
  echo Autostart installed. The server will start silently at every login.
  echo It starts on http://localhost:3002 and is also reachable over LAN.
)
pause
'@
}

function Normalize-Content($text) {
  return (($text -replace "`r`n", "`n") -replace "`r", "`n").Trim()
}

function Repair-LauncherFiles {
  foreach ($name in $canonical.Keys) {
    $target = Join-Path $winDir $name
    $wanted = Normalize-Content $canonical[$name]
    try {
      $exists = Test-Path -LiteralPath $target
      if (-not $exists) {
        Set-Content -LiteralPath $target -Value $canonical[$name] -Encoding ASCII
        Write-Log "REPAIR: $name was missing - recreated"
      } elseif ((Normalize-Content (Get-Content -LiteralPath $target -Raw)) -ne $wanted) {
        Set-Content -LiteralPath $target -Value $canonical[$name] -Encoding ASCII
        Write-Log "REPAIR: $name differed from the working version - restored"
      }
    } catch {
      Write-Log "REPAIR: could not verify $name : $($_.Exception.Message)"
    }
  }
}

Repair-LauncherFiles
if ($Mode -eq 'repair') {
  Write-Log "Launcher files verified. Nothing to do or repairs applied above."
  exit 0
}

# ============================================================
# 2. ALREADY RUNNING? (verify by HTTP - a port can briefly show
#    LISTENING while a process is still shutting down)
# ============================================================

function Test-Http($port) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2
    return $true
  } catch { return $false }
}

$alreadyUp = $false
if (IsListening $PORT) {
  for ($i = 0; $i -lt 5; $i++) {
    if (Test-Http $PORT) { $alreadyUp = $true; break }
    Start-Sleep -Seconds 1
  }
}
if ($alreadyUp) {
  Write-Log "Server already running on port $PORT - nothing to start."
  if ($Mode -in @('visible','open')) {
    Start-Sleep -Milliseconds 800
    try { Start-Process "http://localhost:$PORT" } catch {}
  }
  exit 0
} elseif (IsListening $PORT) {
  $stale = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  Write-Log "WARNING: port $PORT is listening but not answering HTTP (stale listener PID $($stale.OwningProcess)) - removing it and starting fresh."
  if ($stale) { Stop-Process -Id $stale.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

# ============================================================
# 3. JUNK CLEANUP (logs / tsbuildinfo older than 7 days)
# ============================================================

try {
  $days = 7
  $pats = @('server.log','server-err.log','smoke2*.log','caddy-out.log','caddy-err.log','*.tsbuildinfo')
  $roots = @($root, $backend, $front, (Join-Path $root 'proxy'), (Join-Path $root 'proxy\caddy'))
  $cut = (Get-Date).AddDays(-$days)
  $removed = 0
  foreach ($r in $roots) {
    if (-not (Test-Path -LiteralPath $r)) { continue }
    Get-ChildItem -LiteralPath $r -File -ErrorAction SilentlyContinue | Where-Object {
      $n = $_.Name
      ($pats | Where-Object { $n -like $_ }) -and $_.LastWriteTime -lt $cut
    } | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      $removed++
    }
  }
  if ($removed -gt 0) { Write-Log "Junk cleanup removed $removed old file(s)." }
} catch {
  Write-Log "Junk cleanup skipped: $($_.Exception.Message)"
}

# ============================================================
# 4. FIREWALL SELF-HEAL (LAN access)
# ============================================================

try {
  $hasRule = netsh advfirewall firewall show rule name="Workstation Meva 3002" 2>&1 | Select-String '^Rule Name:'
  if (-not $hasRule) {
    Write-Log "Firewall rule 'Workstation Meva 3002' missing - healing."
    Start-Process -FilePath (Join-Path $winDir 'firewall-heal.bat') -Verb RunAs 2>$null
  }
} catch {
  Write-Log "Firewall check skipped: $($_.Exception.Message)"
}

# ============================================================
# 5. REVERSE PROXY (Caddy) - optional
# ============================================================

try {
  $caddy = Join-Path $root 'proxy\caddy\caddy.exe'
  if (Test-Path -LiteralPath $caddy) {
    if (-not (Get-Process caddy -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath $caddy -WorkingDirectory (Split-Path -Parent $caddy) -ArgumentList 'run','--config','Caddyfile' -WindowStyle Minimized
      Write-Log "Reverse proxy (Caddy) started."
    }
  }
} catch {
  Write-Log "Caddy start skipped: $($_.Exception.Message)"
}

# ============================================================
# 6. .ENV (one-time setup)
# ============================================================

$envFile = Join-Path $backend '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  $example = Join-Path $backend '.env.example'
  if (Test-Path -LiteralPath $example) {
    try {
      $secret = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
      $content = (Get-Content -LiteralPath $example -Raw) -replace '^JWT_SECRET=.*$', ('JWT_SECRET=' + $secret)
      Set-Content -LiteralPath $envFile -Value $content -Encoding ascii
      Write-Log ".env created with an auto-generated JWT_SECRET."
    } catch {
      Fail "Could not create backend\.env : $($_.Exception.Message)"
    }
  } else {
    Fail "backend\.env and backend\.env.example are both missing."
  }
}

# ============================================================
# 7. DEPENDENCIES + BUILD
#    Packaged (installer) layout skips this entirely - the .exe
#    already ships built dist + backend node_modules, and running
#    `npm ci` there would fail offline (frontend/node_modules is
#    intentionally NOT bundled). Marker file: app.installed.
# ============================================================

function Ensure-Built($dir, $label) {
  if (-not (Test-Path -LiteralPath (Join-Path $dir 'node_modules'))) {
    Write-Log "Installing $label dependencies (first time)..."
    Push-Location $dir
    try {
      & npm ci 2>&1 | Out-Null
      if (-not (Test-Path -LiteralPath (Join-Path $dir 'node_modules'))) { & npm install 2>&1 | Out-Null }
    } finally { Pop-Location }
    if (-not (Test-Path -LiteralPath (Join-Path $dir 'node_modules'))) {
      Fail "$label dependency install failed. Install Node.js LTS first."
    }
  }
}

if (-not $installed) {
  Ensure-Built $backend 'backend'
  Ensure-Built $front   'frontend'
} else {
  Write-Log "Packaged layout: skipping dependency install."
}

if (-not $installed) {
  if (-not (Test-Path -LiteralPath (Join-Path $backend 'dist\index.js'))) {
    Write-Log "Building backend..."
    Push-Location $backend
    try {
      & npm run build 2>&1 | Tee-Object -FilePath $log -Append
      if ($LASTEXITCODE -ne 0) { Fail "Backend build failed (see server.log)." }
    } finally { Pop-Location }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $front 'dist\index.html'))) {
    Write-Log "Building frontend..."
    Push-Location $front
    try {
      & npm run build 2>&1 | Tee-Object -FilePath $log -Append
      if ($LASTEXITCODE -ne 0) { Fail "Frontend build failed (see server.log)." }
    } finally { Pop-Location }
  }
} else {
  if (-not (Test-Path -LiteralPath (Join-Path $backend 'dist\index.js')) -or
      -not (Test-Path -LiteralPath (Join-Path $front 'dist\index.html'))) {
    Fail "Packaged layout is missing pre-built files. Reinstall the app."
  }
  Write-Log "Packaged layout: builds not needed (pre-built dist present)."
  if (-not (Test-Path -LiteralPath (Join-Path $backend 'node_modules'))) {
    Fail "Packaged layout is missing backend\node_modules. Reinstall the app."
  }
}

# ============================================================
# 8. START THE SERVER (watchdog wrapper)
# ============================================================

$wrapper = Join-Path $winDir 'start-server-core.ps1'
if (-not (Test-Path -LiteralPath $wrapper)) {
  Fail "start-server-core.ps1 is missing in windows\."
}

try {
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',("`"$wrapper`"")
} catch {
  Fail "Could not start the server wrapper: $($_.Exception.Message)"
}
Write-Log "Server wrapper started. Waiting for the server on port $PORT..."

# ============================================================
# 9. WAIT + OPEN BROWSER (visible / open modes)
# ============================================================

if ($Mode -in @('visible','open')) {
  $up = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if (IsListening $PORT) { $up = $true; break }
  }
  if ($up) {
    Write-Log "Server is up on port $PORT."
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1).IPAddress
    Write-Host ""
    Write-Host "  This PC:    http://localhost:$PORT"
    if ($lanIp) {
      Write-Host "  LAN users:  http://${lanIp}:$PORT"
      Write-Host "              http://$lanIp        (when the bundled Caddy proxy is running)"
      Write-Host "              http://$env:COMPUTERNAME   (computer name - resolves from most LAN machines)"
    }
    Write-Host ""
    try { Start-Process "http://localhost:$PORT" } catch {}
  } else {
    Write-Log "Server did not answer on port $PORT within 60s - check server.log."
    if ($Mode -eq 'visible') {
      Write-Host ""
      Write-Host "  The server did not start in time." -ForegroundColor Yellow
      Write-Host "  Check server.log next to this folder for the reason."
      Write-Host ""
      Write-Host "Press any key to close..."
      $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') 2>$null
    }
  }
}

Write-Log "Launcher finished (mode $Mode)."
exit 0
