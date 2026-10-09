@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 22+ is required.&pause&exit /b 1)
node -e "process.exit(Number(process.versions.node.split('.')[0])<22?1:0)" || (echo Node.js 22+ is required.&pause&exit /b 1)
if not exist package-lock.json (
  echo Installing Capacitor dependencies...
  npm install --no-audit --no-fund || (echo npm install failed.&pause&exit /b 1)
) else (
  echo Installing locked dependencies...
  npm ci --no-audit --no-fund || (echo npm ci failed.&pause&exit /b 1)
)
if not exist android\ (
  echo Creating Android project...
  npx cap add android || (echo Could not create Android project. Install Android Studio/SDK (Capacitor 8 requires Android Studio 2025.2.1+).&pause&exit /b 1)
)
npx cap sync android || (echo Capacitor sync failed.&pause&exit /b 1)
echo Android project ready.
pause
