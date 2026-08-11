#!/usr/bin/env bash
# =============================================================
# 自动同步部署：检测 GitHub main 有新提交 → 自动拉取并重建容器
# 用途：本地改代码 push 到 GitHub 后，服务器无需人工操作，自动上线。
#
# 配置方法（服务器上一次性，root 执行）：
#   1) 确保 /opt/classroom 已 clone 并部署过一次
#   2) chmod +x /opt/classroom/deploy/aliyun-ecs/auto-update.sh
#   3) echo '*/2 * * * * root /opt/classroom/deploy/aliyun-ecs/auto-update.sh' > /etc/cron.d/classroom-autodeploy
#      即每 2 分钟检查一次；把 */2 改成 */1 可缩短到 1 分钟
#
# 日志：/opt/classroom/.autodeploy.log
# =============================================================
set -u
APP_DIR=/opt/classroom
LOG="$APP_DIR/.autodeploy.log"

cd "$APP_DIR" || { echo "$(date '+%F %T') ERROR: $APP_DIR 不存在" >> "$LOG"; exit 1; }

# 拉取远端信息（失败多半是网络，跳过本次即可）
git fetch origin main -q 2>>"$LOG" || { echo "$(date '+%F %T') git fetch 失败（网络？），跳过本次" >> "$LOG"; exit 0; }

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)
if [ -z "$REMOTE" ] || [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # 无新提交
fi

echo "$(date '+%F %T') 检测到新提交 $LOCAL -> $REMOTE，开始更新..." >> "$LOG"
git pull --ff-only origin main >>"$LOG" 2>&1 || { echo "$(date '+%F %T') git pull 失败，跳过本次" >> "$LOG"; exit 0; }

if bash deploy/aliyun-ecs/deploy.sh >>"$LOG" 2>&1; then
  echo "$(date '+%F %T') 部署完成：$REMOTE" >> "$LOG"
else
  echo "$(date '+%F %T') 部署失败，请查看上方日志" >> "$LOG"
fi
