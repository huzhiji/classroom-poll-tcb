#!/usr/bin/env bash
# =============================================================
# 课堂答题系统 - 阿里云 ECS 一键部署脚本（Docker 版）
# 用法：在项目根目录执行  bash deploy/aliyun-ecs/deploy.sh
# 前置：ECS 已安装 Docker，安全组已放行 80（或你改的端口）
# =============================================================
set -e

# ---------- 可改配置 ----------
IMAGE_NAME="classroom-poll"          # 镜像名
CONTAINER_NAME="classroom"           # 容器名
HOST_PORT="${PORT:-80}"              # 宿主机映射端口（默认 80）
DATA_DIR="${DATA_DIR:-/data}"        # 数据目录（store.json 持久化在此）
APP_URL="${APP_URL:-}"               # 你的域名，如 https://exam.example.com（邮件里的链接）
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="${SMTP_FROM:-}"
AUTO_REMINDER="${AUTO_REMINDER:-0}"  # 设为 1 启用每日自动复习提醒
REMINDER_HOUR="${REMINDER_HOUR:-9}"
# ------------------------------

echo "==> [1/3] 构建镜像 ${IMAGE_NAME} ..."
docker build -t "${IMAGE_NAME}" .

echo "==> [2/3] 停掉并删除旧容器（如有）..."
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

echo "==> [3/3] 启动容器 ..."
docker run -d --name "${CONTAINER_NAME}" \
  --restart=always \
  -p "${HOST_PORT}:80" \
  -v "${DATA_DIR}:/data" \
  -e PORT=80 \
  -e DATA_DIR=/data \
  -e "APP_URL=${APP_URL}" \
  -e "SMTP_HOST=${SMTP_HOST}" \
  -e "SMTP_PORT=${SMTP_PORT}" \
  -e "SMTP_USER=${SMTP_USER}" \
  -e "SMTP_PASS=${SMTP_PASS}" \
  -e "SMTP_FROM=${SMTP_FROM}" \
  -e "AUTO_REMINDER=${AUTO_REMINDER}" \
  -e "REMINDER_HOUR=${REMINDER_HOUR}" \
  "${IMAGE_NAME}"

echo ""
echo "✅ 部署完成！"
echo "   访问地址：http://<ECS公网IP>:${HOST_PORT}/teacher.html （教师端）"
echo "   学生端：  http://<ECS公网IP>:${HOST_PORT}/student.html"
echo "   数据目录：${DATA_DIR}（已持久化，重启/重建容器数据不丢）"
if [ -z "${APP_URL}" ]; then
  echo "   ⚠️ 未设置 APP_URL：邮件提醒将不生成链接。配置后重跑本脚本即可。"
fi
if [ -z "${SMTP_HOST}" ]; then
  echo "   ⚠️ 未配置 SMTP：邮件提醒功能不可用（不影响其他功能）。"
fi
