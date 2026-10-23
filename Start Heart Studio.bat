@echo off
rem Heart Studio: double-click to run the studio offline (Windows). Keep the window that opens; close it to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\serve.ps1"
if errorlevel 1 pause
