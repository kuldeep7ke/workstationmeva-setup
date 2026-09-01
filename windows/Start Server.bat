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
