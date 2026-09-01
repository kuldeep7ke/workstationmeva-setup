@echo off
title Workstation Meva - Repair Launcher
echo Checking and repairing the launcher files...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" -Mode repair
if errorlevel 1 goto fail
echo.
echo Launcher files verified. Try Start Server.bat again.
goto end
:fail
echo.
echo Repair failed. See server.log next to the repo folder.
:end
pause
