@echo off
setlocal
py -3 "%~dp0broker_tools.py" record %*
set "result=%errorlevel%"
pause
exit /b %result%
