@echo off
setlocal
cd /d "%~dp0"

if not exist "runtime\server.pid" (
  echo Petty Cash Web UI is not running from this folder.
  pause
  exit /b 0
)

set /p serverPid=<"runtime\server.pid"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$process = Get-CimInstance Win32_Process -Filter 'ProcessId = %serverPid%' -ErrorAction SilentlyContinue; if (-not $process) { exit 0 }; if ($process.CommandLine -notmatch 'server\.mjs') { Write-Host 'The saved process ID is no longer the Petty Cash server; it was not stopped.'; exit 2 }; Stop-Process -Id %serverPid% -Force; exit 0"
if errorlevel 2 (
  pause
  exit /b 1
)

del /q "runtime\server.pid" >nul 2>nul
echo Petty Cash Web UI stopped.
pause
