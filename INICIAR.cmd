@echo off
cd /d "%~dp0"
call npm.cmd run build
if errorlevel 1 goto end
call npm.cmd start
:end
pause
