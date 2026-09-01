@echo off
title Workstation Meva - Add "workstation" hostname (LAN)
REM ============================================================
REM Maps the friendly name "workstation" to the server PC.
REM After running this, http://workstation opens the app.
REM
REM SERVER IP - change ONLY this line if the server's IP changes:
set "SERVER_IP=192.168.1.14"
REM ============================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "TMPFILE=%TEMP%\workstation-hosts.tmp"

REM Remove ANY previous "workstation" entries (old IPs included), then add ours.
type "%HOSTS%" | findstr /V /I /R /C:"[ ]workstation" > "%TMPFILE%"
echo %SERVER_IP% workstation>>"%TMPFILE%"
copy /Y "%TMPFILE%" "%HOSTS%" >nul
del "%TMPFILE%" >nul 2>nul
ipconfig /flushdns >nul

echo.
echo Added:   %SERVER_IP% workstation
echo Verifying name resolution...
ping -n 1 -w 2000 workstation | findstr /I /C:"Reply from" >nul
if %errorlevel%==0 (
  echo SUCCESS: "workstation" now reaches the server.
  echo You can open:  http://workstation
) else (
  echo WARNING: could not reach "workstation" yet.
  echo Check that this PC is on the same network as the server,
  echo and that the server IP above is still correct.
)
echo.
pause
