@echo off
title Workstation Meva - Stop Caddy
taskkill /im caddy.exe /f >nul 2>nul
echo Caddy stopped.
pause
