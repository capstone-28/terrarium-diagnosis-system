@echo off
setlocal
py -3 "%~dp0broker_tools.py" check %*
set "result=%errorlevel%"
pause
exit /b %result%
