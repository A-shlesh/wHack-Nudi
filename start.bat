@echo off
rem Double-click this file to start the Nudi helper on Windows.
rem It runs start.ps1 (see that file for what it does). Add -Lan for phone access.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
pause
