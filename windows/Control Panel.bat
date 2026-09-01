@echo off
title Workstation Meva Control Panel
powershell -NoProfile -ExecutionPolicy Bypass -Sta -WindowStyle Hidden -File "%~dp0Control Panel.ps1"
exit /b 0