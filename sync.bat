@echo off
chcp 65001 >nul
cd /d C:\Projects\mikveh-automation

echo ============================================
echo   Sync Mikveh System to GitHub
echo ============================================
echo.

set NODE_TLS_REJECT_UNAUTHORIZED=0

echo [1/4] Pulling latest code from Apps Script...
call clasp pull
if errorlevel 1 (
  echo.
  echo !!! Pull from Apps Script failed - check connection/clasp login
  pause
  exit /b 1
)

echo.
echo [2/4] Adding changes...
git add -A

echo [3/4] Creating commit...
git commit -m "Update %date% %time:~0,5%"
if errorlevel 1 (
  echo.
  echo No new changes since last sync - everything up to date.
  pause
  exit /b 0
)

echo.
echo [4/4] Pushing to GitHub...
git push
if errorlevel 1 (
  echo.
  echo !!! Push to GitHub failed - check connection/login
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Sync completed successfully!
echo ============================================
pause