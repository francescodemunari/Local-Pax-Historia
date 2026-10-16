@echo off
title Pax Historia Server
cd /d "%~dp0backend"

if /i "%1"=="stop" goto :stop
if /i "%1"=="restart" goto :restart

:start
where node >nul 2>&1
if errorlevel 1 goto :missing_node
if not exist "node_modules\express\package.json" goto :missing_dependencies
echo Starting Pax Historia backend...
echo The server will print its address when ready.
echo Close this window to stop the server.
echo.
node "%~dp0backend\server.js"
if errorlevel 1 goto :failed
echo.
echo Server exited.
pause
exit /b

:failed
echo.
echo Server could not start. See the message above.
pause
exit /b 1

:missing_node
echo Node.js 20 or newer is required. Install it, then run this launcher again.
pause
exit /b 1

:missing_dependencies
echo First-time setup: backend dependencies not found. Installing now...
echo Running: npm ci --omit=dev
echo This can take a minute on first run.
echo.
where npm >nul 2>&1
if errorlevel 1 goto :missing_npm
call npm ci --omit=dev
if errorlevel 1 goto :install_failed
if not exist "node_modules\express\package.json" goto :install_failed
echo.
echo Install complete. Starting server...
echo.
goto :start

:missing_npm
echo.
echo npm was not found even though Node.js was found. Reinstall Node.js 20 or newer from https://nodejs.org/, then run this launcher again.
pause
exit /b 1

:install_failed
echo.
echo Automatic install failed. Try manually from the backend folder:
echo   npm ci --omit=dev
echo Then run server.bat again. See README.md for development setup.
pause
exit /b 1

:stop
echo Stopping Pax Historia backend...
powershell -NoProfile -File "%~dp0scripts\stop_server.ps1"
timeout /t 1 /nobreak >nul
exit /b

:restart
call "%~f0" stop
call "%~f0" start
exit /b
