@echo off
title Stop Workstation Meva Server
echo Stopping the Workstation Meva server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter 'Name=''powershell.exe''' | Where-Object { $_.CommandLine -match '-File\s+.*start-server-core\.ps1' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
taskkill /F /IM caddy.exe >nul 2>nul
echo Done. The server is stopped (if it was running).
pause
