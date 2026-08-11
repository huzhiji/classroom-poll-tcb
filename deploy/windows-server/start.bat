@echo off
REM ============================================================
REM  Classroom Poll - Windows Server start script
REM  Usage: double-click / run this script (foreground; closing
REM         the window stops the app).
REM  For production use install-service.bat (auto-start as a
REM  Windows service via NSSM).
REM  Data is persisted under DATA_DIR\store.json (survives reboot).
REM  NOTE: edit the config section below BEFORE first run.
REM ============================================================
cd /d "%~dp0..\.."

REM ---------- EDIT THIS SECTION ----------
set DATA_DIR=C:\classroom\data
set PORT=80
set APP_URL=http://YOUR_SERVER_IP
set SMTP_HOST=
set SMTP_PORT=465
set SMTP_USER=
set SMTP_PASS=
set SMTP_FROM=
set AUTO_REMINDER=0
set REMINDER_HOUR=9
REM ---------------------------------------

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
node index.js
pause
