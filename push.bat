@echo off
chcp 65001 >nul
cd /d C:\Projects\mikveh-automation

echo ============================================
echo   Push Mikveh System to Apps Script
echo ============================================
echo.
echo Direction: GitHub  --^>  Apps Script
echo (sync.bat is the OPPOSITE direction - do not use it for this)
echo.

rem Mirrors sync.bat. If clasp works without this line, delete it.
set NODE_TLS_REJECT_UNAUTHORIZED=0

echo [1/3] Getting the new files from GitHub...
call git pull
if errorlevel 1 (
  echo.
  echo !!! git pull failed - commit or stash your local changes first
  pause
  exit /b 1
)

echo.
echo [2/3] Checking nothing is left uncommitted...
git diff --quiet && git diff --cached --quiet
if errorlevel 1 (
  echo.
  echo !!! You have uncommitted local changes.
  echo !!! clasp push would upload them. Review with: git status
  pause
  exit /b 1
)

echo.
echo [3/3] Uploading the script files to Apps Script...
call clasp push
if errorlevel 1 (
  echo.
  echo !!! clasp push failed - check connection / clasp login
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Done. Now open the Apps Script editor and
echo   check that these 10 files are listed:
echo     Alerts, Api, ApiWrite, Auth, HebDate, Media,
echo     Reminders, Reports, WhatsappActions, code(Hebrew)
echo ============================================
pause
