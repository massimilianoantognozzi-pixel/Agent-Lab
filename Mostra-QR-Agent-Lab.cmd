@echo off
cd /d "%~dp0"
node "lab\scripts\workflow-pairing.mjs" qr
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "%~dp0lab\profile\workflow-pilot\data\remote-pairing-qr.html"
