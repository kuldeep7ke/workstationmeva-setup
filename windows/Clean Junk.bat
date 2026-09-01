@echo off
title Workstation Meva - Clean Junk Files
REM ==================================================
REM  Deletes temp/runtime junk older than 7 days:
REM    - runtime logs  (server.log, server-err.log, smoke2*.log, caddy-*.log)
REM    - TypeScript build cache (tsconfig.tsbuildinfo)
REM  Safe while the server is running (old files are closed, recent ones kept).
REM  Double-click to run manually; Start Server.bat calls it silently ("silent").
REM ==================================================
setlocal
set "ROOT=%~dp0.."
set "DAYS=7"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$days = %DAYS%; $pats = @('server.log','server-err.log','smoke2*.log','caddy-out.log','caddy-err.log','*.tsbuildinfo');" ^
  "$roots = @('%ROOT%','%ROOT%\backend','%ROOT%\frontend','%ROOT%\proxy','%ROOT%\proxy\caddy');" ^
  "$cut = (Get-Date).AddDays(-$days); $removed = 0;" ^
  "foreach ($r in $roots) { if (!(Test-Path -LiteralPath $r)) { continue }; Get-ChildItem -LiteralPath $r -File -ErrorAction SilentlyContinue | Where-Object { $n = $_.Name; ($pats | Where-Object { $n -like $_ }) -and $_.LastWriteTime -lt $cut } | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue; $removed++ } };" ^
  "Write-Output ('Junk cleaned: ' + $removed + ' file(s) older than ' + $days + ' days removed.')"

if not "%~1"=="silent" (
  echo.
  pause
)
exit /b 0