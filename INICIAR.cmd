@echo off
cd /d "%~dp0"
call pnpm.cmd run build
if errorlevel 1 goto end
call pnpm.cmd start
:end
pause
