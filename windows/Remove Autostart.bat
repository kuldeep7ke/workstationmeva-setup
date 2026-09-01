@echo off
title Remove Workstation Meva Autostart
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo Autostart removed.
) else (
  echo No autostart entry found.
)
pause
