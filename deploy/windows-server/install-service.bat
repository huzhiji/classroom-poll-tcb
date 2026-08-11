@echo off
REM ============================================================
REM  Classroom Poll - register as a Windows service via NSSM
REM  (auto start on boot, survives logout/reboot).
REM
REM  Prerequisites:
REM    1. Node.js installed (default path assumed below)
REM    2. NSSM downloaded to C:\nssm\nssm.exe
REM         download: https://nssm.cc/download  (win64 zip)
REM
REM  Run this file AS ADMINISTRATOR.
REM  Then manage the service with:
REM      net start classroom / net stop classroom / net restart classroom
REM      nssm remove classroom confirm   (uninstall)
REM ============================================================
set SERVICE_NAME=classroom
set NSSM=C:\nssm\nssm.exe
set NODE_EXE=C:\Program Files\nodejs\node.exe
set APP_DIR=%~dp0..\..
set DATA_DIR=C:\classroom\data

if not exist "%NSSM%" (
  echo [ERROR] NSSM not found at %NSSM%. Download from https://nssm.cc/download and place it at C:\nssm\nssm.exe
  pause
  exit /b 1
)
if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js not found at %NODE_EXE%. Install from https://nodejs.org and adjust NODE_EXE above if needed.
  pause
  exit /b 1
)

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

REM ---------- stop/remove old instance (if any) ----------
"%NSSM%" stop %SERVICE_NAME% >nul 2>&1
"%NSSM%" remove %SERVICE_NAME% confirm >nul 2>&1

REM ---------- install ----------
"%NSSM%" install %SERVICE_NAME% "%NODE_EXE%" "index.js"
"%NSSM%" set %SERVICE_NAME% AppDirectory "%APP_DIR%"
REM EDIT the values below to match your SMTP / domain config:
"%NSSM%" set %SERVICE_NAME% AppEnvironmentExtra DATA_DIR=%DATA_DIR% PORT=80 APP_URL=http://YOUR_SERVER_IP SMTP_HOST= SMTP_PORT=465 SMTP_USER= SMTP_PASS= SMTP_FROM= AUTO_REMINDER=0 REMINDER_HOUR=9
"%NSSM%" set %SERVICE_NAME% AppStdout "%DATA_DIR%\out.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%DATA_DIR%\err.log"
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" start %SERVICE_NAME%

echo.
echo [OK] Service %SERVICE_NAME% installed and started.
echo      Check logs: %DATA_DIR%\out.log / err.log
echo      Admin:      net start/stop/restart classroom
echo      Uninstall:  nssm remove classroom confirm
pause
