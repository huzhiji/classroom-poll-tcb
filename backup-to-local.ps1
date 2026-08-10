# 课堂答题系统 - 本地定时备份脚本
# ------------------------------------------------------------
# 作用：定期把云端「在线答题系统」的全部数据拉取到本机指定目录，
#       并保留最近若干份，自动清理更旧的，实现「数据定期存本地」。
#
# 用法：
#   1. 把下面的 $Api 改成你的线上地址（结尾不要带斜杠）。
#   2. 把 $BackupDir 改成你想保存备份的本地目录（建议非系统盘）。
#   3. 用 Windows「任务计划程序」定期运行本脚本（例如每天 23:00）。
#      触发器 -> 新建 -> 每日；操作 -> 启动程序 -> 程序/脚本填
#      powershell.exe，参数填：-NoProfile -ExecutionPolicy Bypass -File "本脚本完整路径"
# ------------------------------------------------------------

$ErrorActionPreference = 'Stop'

# ====== 需要你修改的两处 ======
$Api      = 'https://classroom-poll-294902-10-1304972958.sh.run.tcloudbase.com'
$BackupDir = 'D:\Backup\classroom-poll'
# ==============================

$KeepCount = 30   # 保留最近 30 份，更早的自动删除

if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

$ts   = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $BackupDir "classroom-backup-$ts.json"

try {
    Invoke-WebRequest -Uri "$Api/api/backup/export" -OutFile $file -UseBasicParsing
    $size = (Get-Item $file).Length
    Write-Host "备份成功: $file ($size 字节)"

    # 保留最近 $KeepCount 份，删除更旧的
    Get-ChildItem $BackupDir -Filter 'classroom-backup-*.json' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $KeepCount |
        Remove-Item -Force

    Write-Host "已清理旧备份，保留最近 $KeepCount 份。"
} catch {
    Write-Error "备份失败: $_"
    exit 1
}
