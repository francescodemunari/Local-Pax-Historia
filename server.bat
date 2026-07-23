@echo off
title Pax Historia Server
cd /d "%~dp0backend"

if /i "%1"=="stop" goto :stop
if /i "%1"=="restart" goto :restart

:start
echo Starting Pax Historia backend...
echo Server will run at http://localhost:3000
echo Close this window to stop the server.
echo.
node server.js
echo.
echo Server exited.
pause
exit /b

:stop
echo Stopping Pax Historia backend...
powershell -Command "netstat -ano | Select-String ':3000 ' | ForEach-Object { $pid = $_ -replace '.*\s+',''; if ($pid -ne '0') { taskkill /pid $pid /f 2>$null } }; Write-Output 'Done.'"
timeout /t 1 /nobreak >nul
exit /b

:restart
call "%~f0" stop
call "%~f0" start
exit /b
