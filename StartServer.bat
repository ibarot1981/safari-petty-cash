@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Missing .env configuration file.
  echo Copy .env.example to .env and enter the Grist and Authentik settings first.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or later, then run this file again.
  pause
  exit /b 1
)

if exist "runtime\server.pid" (
  set /p existingPid=<"runtime\server.pid"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id %existingPid% -ErrorAction SilentlyContinue) { exit 0 } exit 1"
  if not errorlevel 1 (
    echo Petty Cash Web UI is already running. Open http://localhost:5177
    pause
    exit /b 0
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Get-Location).Path; $runtime = Join-Path $root 'runtime'; New-Item -ItemType Directory -Force -Path $runtime | Out-Null; $process = Start-Process -FilePath 'node.exe' -ArgumentList 'server.mjs' -WorkingDirectory $root -RedirectStandardOutput (Join-Path $runtime 'server.log') -RedirectStandardError (Join-Path $runtime 'server-error.log') -PassThru; Set-Content -LiteralPath (Join-Path $runtime 'server.pid') -Value $process.Id; Start-Sleep -Milliseconds 800; if ($process.HasExited) { Write-Host 'The server could not start. See runtime\server-error.log.'; exit 1 }"
if errorlevel 1 (
  pause
  exit /b 1
)

echo Petty Cash Web UI started. Open http://localhost:5177
echo Server log: runtime\server.log
pause
