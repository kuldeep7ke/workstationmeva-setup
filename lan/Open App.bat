@echo off
title Workstation Meva - Open App (LAN)
REM ============================================================
REM Opens the Workstation Meva app from any office PC.
REM No admin needed, nothing to install - just a browser.
REM
REM Uses the friendly http://workstation when it actually works,
REM otherwise falls back to the server IP directly.
REM
REM SERVER IP - change ONLY this line if the server's IP changes:
set "SERVER_IP=192.168.1.14"
REM ============================================================

REM Probe the friendly name for real (3s timeout) before using it -
REM a stale hosts entry pointing at an old IP would otherwise fail.
powershell -NoProfile -Command "try{ if((Invoke-WebRequest -Uri 'http://workstation' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200){exit 0}else{exit 1} }catch{exit 1}" >nul 2>&1
if not errorlevel 1 (
  start "" "http://workstation"
  exit /b 0
)

start "" "http://%SERVER_IP%:3002"
