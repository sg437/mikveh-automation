@echo off
chcp 65001 >nul
title Mikveh - upload script to Apps Script
setlocal EnableExtensions

rem Mirrors sync.bat. If clasp works without this line, it can be removed.
set NODE_TLS_REJECT_UNAUTHORIZED=0

set "REPO=https://github.com/sg437/mikveh-automation.git"
set "FALLBACK=C:\Projects\mikveh-automation"
set "PROJ="

echo.
echo =====================================================
echo    MIKVEH - upload the script to Apps Script
echo =====================================================
echo.

echo [1/6] Checking git ...
where git >nul 2>&1 || goto :p1
echo       OK
echo.

echo [2/6] Checking Node.js ...
where node >nul 2>&1 || goto :p2
echo       OK
echo.

echo [3/6] Looking for the project folder ...
call :find "%FALLBACK%"
call :find "%USERPROFILE%\mikveh-automation"
call :find "%USERPROFILE%\Desktop\mikveh-automation"
call :find "%USERPROFILE%\Documents\mikveh-automation"
call :find "%USERPROFILE%\Downloads\mikveh-automation"
call :find "%USERPROFILE%\source\repos\mikveh-automation"
call :find "D:\Projects\mikveh-automation"

if not defined PROJ (
  echo       Not in the usual places - searching your user folder ...
  for /f "delims=" %%F in ('dir /b /s /a-d "%USERPROFILE%\.clasp.json" 2^>nul') do if not defined PROJ set "PROJ=%%~dpF"
)

if not defined PROJ (
  echo       Not found on this computer.
  echo       Downloading a fresh copy to: %FALLBACK%
  if not exist "C:\Projects" mkdir "C:\Projects"
  call git clone "%REPO%" "%FALLBACK%"
  if errorlevel 1 goto :p3
  set "PROJ=%FALLBACK%"
)
echo       Using: %PROJ%
echo.

echo [4/6] Updating from GitHub ...
cd /d "%PROJ%" || goto :p4
call git pull
if errorlevel 1 goto :p4
echo       OK
echo.

echo [5/6] Checking clasp ...
where clasp >nul 2>&1
if errorlevel 1 (
  echo       clasp not found - installing it now, may take a minute ...
  call npm install -g @google/clasp
  where clasp >nul 2>&1 || goto :p5
)
if not exist "%USERPROFILE%\.clasprc.json" (
  echo.
  echo       You are not signed in to clasp yet.
  echo       A browser window will open - sign in with the Google
  echo       account that owns the Apps Script project.
  echo.
  pause
  call clasp login
)
echo       OK
echo.

echo [6/6] Uploading the script files ...
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

:find
if defined PROJ goto :eof
if exist "%~1\.clasp.json" set "PROJ=%~1"
goto :eof

:p1
echo       RESULT: PROBLEM-1    git is not installed
goto :fail
:p2
echo       RESULT: PROBLEM-2    Node.js is not installed
goto :fail
:p3
echo       RESULT: PROBLEM-3    could not download the project
goto :fail
:p4
echo       RESULT: PROBLEM-4    could not update from GitHub
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
