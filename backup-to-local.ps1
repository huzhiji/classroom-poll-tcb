# Classroom Poll - local scheduled backup script
# ------------------------------------------------------------
# Pulls ALL cloud data to a local folder periodically and keeps
# the latest N copies. Register with Windows Task Scheduler:
#   schtasks /Create /TN "ClassroomPollBackup" /SC DAILY /ST 22:30 /F ^
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"D:\Backup\classroom-poll\backup-to-local.ps1\""
# ------------------------------------------------------------

$ErrorActionPreference = 'Stop'

# ====== EDIT THESE ======
$Api       = 'http://120.26.30.170'      # your server address (no trailing slash)
$BackupDir = 'D:\Backup\classroom-poll'  # local backup folder (non-system disk recommended)
# ========================

$KeepCount = 30   # keep latest 30 copies, delete older ones

if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

$ts   = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $BackupDir "classroom-backup-$ts.json"

try {
    Invoke-WebRequest -Uri "$Api/api/backup/export" -OutFile $file -UseBasicParsing
    $size = (Get-Item $file).Length
    Write-Host "Backup OK: $file ($size bytes)"

    Get-ChildItem $BackupDir -Filter 'classroom-backup-*.json' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $KeepCount |
        Remove-Item -Force

    Write-Host "Cleaned old backups, keeping latest $KeepCount."
} catch {
    Write-Error "Backup failed: $_"
    exit 1
}
