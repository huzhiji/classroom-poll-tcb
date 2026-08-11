# 部署同步排查与上线指南

> 适用：阿里云 ECS（`120.26.30.170`）上的课堂答题系统，代码经 GitHub 自动同步。
> 编写日期：2026-08-12

## 现象
本地已把最新代码 push 到 GitHub（`HEAD = origin/main`），但生产服务器
`http://120.26.30.170` 仍是旧版本——典型表现：本地改了样式/功能，线上「没变化」。

## 原理（为什么会不同步）
服务器有一个自动部署脚本，每 2 分钟跑一次：
`git fetch → 比对 → git pull --ff-only → docker build → 重建容器`。
- 容器启动时带 `--restart=always`，ECS 重启后容器会自启（所以旧版一直在跑）。
- 但**宿主机的 cron 服务（crond）若没设开机自启**，ECS 一重启 cron 就停跑，
  之后的新提交永远不会被拉取 / 重建 → 出现「改了代码线上没变」。

## 第一步：先确认本地已推送（在本地机器）
```bash
cd classroom-poll-cloudbase
git log origin/main..HEAD --oneline     # 应为空（本地不领先远端）
git rev-parse HEAD origin/main          # 两个哈希应相同
```

## 第二步：立即把最新代码上线（SSH 到服务器 120.26.30.170 执行）
```bash
cd /opt/classroom

# 0) 看自动同步日志，定位卡在哪（很重要）
tail -20 .autodeploy.log

# 1) 拉取最新提交
git pull --ff-only origin main

# 2) 重建容器（数据目录 /data 已持久化，不会丢）
bash deploy/aliyun-ecs/deploy.sh
```
执行后刷新 `http://120.26.30.170/student.html` 即可看到最新界面。

## 第三步：根治——保证自动同步不再停（仍在服务器执行）
```bash
systemctl enable --now crond                 # 让 cron 开机自启（关键）
ls -l /etc/cron.d/classroom-autodeploy       # 确认 cron 文件存在
systemctl status crond --no-pager | head
```
若 `git pull` 报 `fatal: Not a git repository` 或 `.autodeploy.log` 显示
`git fetch 失败`/`git pull 失败`/`部署失败`，把日志贴给维护者即可定位。

## 可选：用 systemd timer 替代 cron（更稳，重启不断）
cron 偶尔会因环境缺失而不跑；systemd timer 随系统启动且失败可重试。
在服务器 `/etc/systemd/system/` 下新建两个文件并启用即可（详见仓库
`deploy/aliyun-ecs/` 内单元文件，或向维护者索取）。

## 速查
- 自动同步脚本：`/opt/classroom/deploy/aliyun-ecs/auto-update.sh`
- 一键部署脚本：`/opt/classroom/deploy/aliyun-ecs/deploy.sh`
- 同步日志：`/opt/classroom/.autodeploy.log`
- cron 配置：`/etc/cron.d/classroom-autodeploy`（内容：`*/2 * * * * root /opt/classroom/deploy/aliyun-ecs/auto-update.sh`）
- 数据目录：`/data`（store.json 持久化，重启/重建容器数据不丢）
