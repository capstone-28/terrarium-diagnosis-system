@echo off
py -3 "%~dp0reception_stats.py" %*
set "result=%errorlevel%"
pause
exit /b %result%
