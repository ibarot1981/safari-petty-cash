@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if exist "runtime\server.pid" (
  set "existingPid="
  set /p existingPid=<"runtime\server.pid"
  if defined existingPid (
    echo(%existingPid%| findstr /r "^[0-9][0-9]*$" >nul
    if not errorlevel 1 (
      powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id %existingPid% -ErrorAction SilentlyContinue) { exit 0 } exit 1"
      if not errorlevel 1 (
        echo Petty Cash Web UI is already running. Open http://localhost:5177
        echo Stop it and run StartServer.bat again when you want to apply a later update.
        pause
        exit /b 0
      )
    )
  )
)

where git >nul 2>nul
if errorlevel 1 (
  echo Git was not found. Install Git for Windows, then run this file again.
  pause
  exit /b 1
)

if not exist ".git" (
  echo This folder is not a Git checkout. Clone the project again from GitHub.
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "currentBranch=%%B"
if /I not "%currentBranch%"=="main" (
  echo This launcher only starts the released main branch.
  echo Current branch: %currentBranch%
  echo Switch to main before starting the production utility.
  pause
  exit /b 1
)

for /f "delims=" %%S in ('git status --porcelain') do set "hasLocalChanges=1"
if defined hasLocalChanges (
  echo Local Git changes were found. The launcher will not overwrite them automatically.
  echo Commit, stash, or resolve the changes, then run this file again.
  git status --short
  pause
  exit /b 1
)

echo Checking GitHub for updates...
git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main
if errorlevel 1 (
  echo Could not check GitHub for updates. Check your network and GitHub authentication.
  echo The server was not started because its version could not be verified.
  pause
  exit /b 1
)

set "behind=0"
set "ahead=0"
for /f %%C in ('git rev-list --count HEAD..origin/main') do set "behind=%%C"
for /f %%C in ('git rev-list --count origin/main..HEAD') do set "ahead=%%C"
if not "%ahead%"=="0" (
  echo Local main contains commits that are not on GitHub.
  echo The launcher will not overwrite or start this unexpected version.
  pause
  exit /b 1
)

if not "%behind%"=="0" (
  echo Updating the application from GitHub...
  git pull --ff-only origin main
  if errorlevel 1 (
    echo The update could not be applied. The server was not started.
    pause
    exit /b 1
  )
  echo Update complete.
) else (
  echo The application is already up to date.
)

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

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Get-Location).Path; $runtime = Join-Path $root 'runtime'; New-Item -ItemType Directory -Force -Path $runtime | Out-Null; $process = Start-Process -FilePath 'node.exe' -ArgumentList 'server.mjs' -WorkingDirectory $root -RedirectStandardOutput (Join-Path $runtime 'server.log') -RedirectStandardError (Join-Path $runtime 'server-error.log') -PassThru; Set-Content -LiteralPath (Join-Path $runtime 'server.pid') -Value $process.Id; Start-Sleep -Milliseconds 800; if ($process.HasExited) { Write-Host 'The server could not start. See runtime\server-error.log.'; exit 1 }"
if errorlevel 1 (
  pause
  exit /b 1
)

echo Petty Cash Web UI started. Open http://localhost:5177
echo Server log: runtime\server.log
pause
