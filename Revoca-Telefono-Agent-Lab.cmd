@echo off
cd /d "%~dp0"
node "lab\scripts\workflow-pairing.mjs" revoke
pause
