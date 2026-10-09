@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 22+ is required.&pause&exit /b 1)
node -e "process.exit(Number(process.versions.node.split('.')[0])<22?1:0)" || (echo Node.js 22+ is required.&pause&exit /b 1)
if not exist android\gradlew.bat (
  echo Android project is not initialized.
  echo Run android-setup.bat first.
  pause
  exit /b 1
)
npx cap sync android || (echo Capacitor sync failed.&pause&exit /b 1)
cd android
gradlew.bat assembleDebug || (echo Android build failed.&pause&exit /b 1)
echo.
echo APK created under:
for /r %%F in (*.apk) do echo %%F
pause
