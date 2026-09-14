@echo off
chcp 65001 >nul
title Mikveh - upload to Apps Script
setlocal EnableExtensions
cd /d "%~dp0"

rem Mirrors sync.bat. If clasp works without this line, it can be removed.
set NODE_TLS_REJECT_UNAUTHORIZED=0

echo.
echo =====================================================
echo    MIKVEH - upload the script to Apps Script
echo =====================================================
echo.
echo    Folder: %CD%
echo.

echo [1/4] Checking this folder ...
if not exist ".clasp.json"     goto :p0
if not exist "appsscript.json" goto :p0
echo       OK
echo.

echo [2/4] Checking Node.js ...
where node >nul 2>&1 || goto :p2
echo       OK
echo.

echo [3/4] Checking clasp ...
where clasp >nul 2>&1
if errorlevel 1 (
  echo       clasp not found - installing it now, may take a minute ...
  call npm install -g @google/clasp
  where clasp >nul 2>&1 || goto :p5
)
if not exist "%USERPROFILE%\.clasprc.json" (
  echo.
  echo       Not signed in to clasp yet. A browser window will open -
  echo       sign in with the Google account that owns the script.
  echo.
  pause
  call clasp login
)
echo       OK
echo.

echo [4/4] Uploading the script files ...
call clasp push --force
if errorlevel 1 goto :p6
echo.
echo =====================================================
echo    RESULT: SUCCESS
echo.
echo    Open the Apps Script editor and check that these
echo    10 files are listed:
echo      Alerts  Api  ApiWrite  Auth  HebDate  Media
echo      Reminders  Reports  WhatsappActions
echo      + the Hebrew-named file
echo =====================================================
echo.
pause
exit /b 0

:p0
echo       RESULT: PROBLEM-0    wrong folder - .clasp.json is missing here
goto :fail
:p2
echo       RESULT: PROBLEM-2    Node.js is not installed
goto :fail
:p5
echo       RESULT: PROBLEM-5    could not install clasp
goto :fail
:p6
echo       RESULT: PROBLEM-6    upload to Apps Script failed
goto :fail

:fail
echo.
echo    Take a screenshot of this whole window and send it.
echo.
pause
exit /b 1
