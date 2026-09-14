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

echo [2/4] Looking for Node.js ...
set "NODEDIR="
where node >nul 2>&1
if not errorlevel 1 (
  echo       Found an installed Node.js
  goto :havenode
)
echo       Not installed - looking for a portable copy ...
call :findnode "%~dp0"
call :findnode "%USERPROFILE%\Downloads"
call :findnode "%USERPROFILE%\Desktop"
if not defined NODEDIR goto :p2
echo       Found portable Node.js at:
echo       %NODEDIR%
set "PATH=%NODEDIR%;%PATH%"

:havenode
call node -v
if errorlevel 1 goto :p2
echo       OK
echo.

echo [3/4] Signing in to clasp if needed ...
if not exist "%USERPROFILE%\.clasprc.json" (
  echo.
  echo       Not signed in yet. A browser window will open -
  echo       sign in with the Google account that owns the script.
  echo       This first step also downloads clasp, so give it a minute.
  echo.
  pause
  call npx --yes @google/clasp login
  if errorlevel 1 goto :p5
)
echo       OK
echo.

echo [4/4] Uploading the script files ...
call npx --yes @google/clasp push --force
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

rem ---- look for node.exe anywhere under the given folder ----
:findnode
if defined NODEDIR goto :eof
if not exist "%~1" goto :eof
for /f "delims=" %%F in ('dir /b /s /a-d "%~1\node.exe" 2^>nul') do if not defined NODEDIR set "NODEDIR=%%~dpF"
goto :eof

:p0
echo       RESULT: PROBLEM-0    wrong folder - .clasp.json is missing here
goto :fail
:p2
echo       RESULT: PROBLEM-2    no Node.js found, installed or portable
echo.
echo       Download "Standalone Binary (.zip)" from nodejs.org,
echo       unblock the zip, extract it into your Downloads folder,
echo       then run this file again.
goto :fail
:p5
echo       RESULT: PROBLEM-5    clasp sign-in failed
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
