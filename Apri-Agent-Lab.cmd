@echo off
if not exist "%~dp0lab\profile\general-gui-v3.json" (
    call "%~dp0Apri-Agent-Lab-Completo.cmd"
    exit /b
)
node "%~dp0lab\scripts\launch.mjs"
