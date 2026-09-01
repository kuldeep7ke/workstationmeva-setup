@echo off
title Workstation Meva - Create .env (one-time setup)
REM One-time setup for a fresh download. Creates backend\.env with:
REM   - an auto-generated JWT_SECRET
REM   - DATABASE_URL empty (fill it later: app Backups page -> Database tab, or edit backend\.env)
REM Safe to run again - if backend\.env already exists it does nothing.

set "ENVFILE=%~dp0..\backend\.env"

if exist "%ENVFILE%" (
  echo backend\.env already exists - nothing to do.
  echo This is a one-time setup; re-running it never overwrites anything.
  echo.
  if /I not "%~1"=="silent" pause
  exit /b 0
)

echo Creating backend\.env ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N'); (Get-Content '%ENVFILE%.example') -replace '^JWT_SECRET=.*$', ('JWT_SECRET='+$s) | Set-Content -Path '%ENVFILE%' -Encoding ascii"

if not exist "%ENVFILE%" (
  echo.
  echo ERROR: could not create .env. Run this from the repo folder.
  if /I not "%~1"=="silent" pause
  exit /b 1
)

echo Done. Created:
echo   %ENVFILE%
echo.
echo   JWT_SECRET: auto-generated
echo   DATABASE_URL: empty - to use Supabase, open the app and go to
echo                 Backups page - Database tab, or edit backend\.env.
echo.
echo Next: double-click windows\Start Server.bat
if /I not "%~1"=="silent" pause
