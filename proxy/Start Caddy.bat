@echo off
title Workstation Meva - Caddy (reverse proxy)
cd /d "%~dp0caddy"
if not exist "%~dp0caddy\caddy.exe" (
  echo Caddy is not installed.
  echo Download caddy.exe from https://caddyserver.com/download and place it
  echo in proxy\caddy\ - file name must be caddy.exe - then run this again.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~dp0caddy\caddy.exe' -ArgumentList 'run','--config','Caddyfile' -WorkingDirectory '%~dp0caddy' -WindowStyle Hidden -RedirectStandardError '%~dp0caddy-err.log' -RedirectStandardOutput '%~dp0caddy-out.log'"
echo Caddy started. LAN users open http://192.168.100.156 or http://workstation.
echo To stop: double-click Stop Caddy.bat
echo Tip: windows\Start Server.bat also auto-starts Caddy when proxy\caddy\caddy.exe exists.
pause
