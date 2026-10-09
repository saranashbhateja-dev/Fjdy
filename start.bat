@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22+ is required. Install Node.js 22+ and run this again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0])<22?1:0)"
if errorlevel 1 (
  echo Node.js 22+ is required for the Technical Builder OS.
  pause
  exit /b 1
)
echo Starting Technical Builder OS on http://localhost:3001 ...
set "PORT=3001"

rem Run the server in its own minimized window so the server stays alive independently.
start "Technical Builder OS Server" /min cmd /c "set PORT=3001&&node server.js"

rem Wait for the server to answer before launching the browser.
set "READY="
for /l %%I in (1,1,20) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; try {$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 1; if ($r.StatusCode -eq 200) {$ok=$true}} catch {}; if ($ok) {exit 0} else {exit 1}" >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto browser
  )
  timeout /t 1 /nobreak >nul
)

:browser
rem Open the app through Windows' default HTTP browser handler.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'http://127.0.0.1:3001'"
if not defined READY echo Server did not answer the health check within 20 seconds; the browser was opened anyway.
echo Technical Builder OS: http://localhost:3001
echo The server is running in a minimized window.
pause
