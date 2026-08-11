# 选调生学习系统（原课堂答题系统）

一个部署在**阿里云 ECS（Docker）**的国产在线学习平台：学生邮箱注册登录 → 首页学习仪表盘 → 课程 / 答题 / 早读三大模块 → 艾宾浩斯间隔记忆 → 邮箱复习提醒 → 数据可一键/定时备份到本地。

- **线上地址**：部署于阿里云 ECS（见下文部署章节；原腾讯云托管地址已因配额耗尽停用）
- **代码仓库**：`https://github.com/huzhiji/classroom-poll-tcb`（分支 `main`）
- **AI 交接文档**：`AI-CONTEXT.md`（交给任何 AI 工具即可直接上手修改本项目）
- **部署一键脚本**：`deploy/aliyun-ecs/deploy.sh`，完整指南见 `deploy/aliyun-ecs/配置说明.md`

---

## 一、本地运行（开发/自测）

```bash
cd classroom-poll-cloudbase
npm install
DATA_DIR=./_testdata PORT=3001 node index.js
# 浏览器打开：
#   学生端  http://127.0.0.1:3001/student.html
#   教师端  http://127.0.0.1:3001/teacher.html
# 测完清理：rm -rf _testdata
```

> 本地数据落在 `./_testdata/store.json`（已被 .gitignore 忽略），不要写进 `/data` 或提交。

---

## 二、部署到阿里云（上线/更新）

> **当前实际环境：阿里云 ECS，系统 = Alibaba Cloud Linux 3（阿里云 Linux）** → 用 Docker 一键脚本 `deploy/aliyun-ecs/deploy.sh`，完整步骤（含该系统的 Docker 安装命令）见 `deploy/aliyun-ecs/配置说明.md`。
> （Windows Server 方案在 `deploy/windows-server/`，为备选。）

**前置**：一台阿里云 ECS（1 核 1G 足够），安全组放行 80/443。

### 首次部署
```bash
# 1. 上传代码到服务器（二选一）
git clone https://github.com/huzhiji/classroom-poll-tcb.git /opt/classroom   # 有 GitHub 访问时
# 或 scp 打包上传后解压

# 2. 一键部署（构建镜像 → 启动容器 → 数据挂载 /data 持久化）
cd /opt/classroom
bash deploy/aliyun-ecs/deploy.sh
```

部署完成即可访问：
- 教师端 `http://<公网IP>/teacher.html`，学生端 `http://<公网IP>/student.html`

### 每次代码更新后上线
```bash
cd /opt/classroom
git pull
bash deploy/aliyun-ecs/deploy.sh    # 重建容器，-v /data:/data 数据不丢
```

### 绑定域名 + HTTPS（推荐）
域名解析 A 记录到 ECS 公网 IP → 申请免费 SSL 证书 → 用 `deploy/aliyun-ecs/nginx.conf` 配 Nginx 反代（详见 `配置说明.md`）。

> 历史：本系统最早部署在腾讯云托管（容器 + 持久卷 + 实例数=1），因免费配额耗尽已停用；代码与 Dockerfile 完全云平台无关，可部署到任何服务器。

---

## 三、环境变量（在 `deploy/aliyun-ecs/deploy.sh` 顶部配置）

| 变量 | 说明 | 必填 |
|------|------|------|
| `PORT` | 容器端口，代码已用 `process.env.PORT \|\| 80`，**外部 80 映射，勿改** | 否（默认 80） |
| `DATA_DIR` | 数据落盘目录，默认 `/data`（脚本已挂载持久化） | 否 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | 邮件 SMTP（如 QQ/企业邮箱）。`465` 走 SSL，`587` 走 STARTTLS | 否（不配则提醒邮件功能安全禁用） |
| `SMTP_FROM` | 发件人显示名（可选） | 否 |
| `APP_URL` | 邮件中"去复习"的链接，如 `https://你的域名`；**未设置则不生成链接** | 否 |
| `AUTO_REMINDER` | `=1` 开启每日自动群发复习提醒 | 否 |
| `REMINDER_HOUR` | 自动发送时间（24 小时制，默认 9） | 否 |

> 未配 SMTP 时，教师端「复习提醒」仍可预览名单，发送按钮自动禁用，不报错。

---

## 四、功能一览

- **首页仪表盘**：学生个人（课程进度/正确率/记忆掌握/待巩固错题/今日早读/薄弱环节）；教师班级（学生数/课程数/今日打卡名单/全班正确率/薄弱专题）。
- **课程模块**：老师自建课程 → 章节 → 课时（文本/资料/内置练习），按课时完成度算进度。
- **答题模块**：考试/专题、课堂实时答题、错题练习、艾宾浩斯间隔记忆（1→2→4→7→15→30→90 天，答错明天再来）。
- **早读模块（核心）**：老师撰写并一键推送全班、学生每日打卡、艾宾浩斯自动复习、学生自建规划、14 天复习日程表、打卡后布置作业、师生双端打卡统计。
- **复习提醒邮件**：教师手动群发 +（可选）每日自动群发，内容含今日待复习清单与未复习统计。
- **数据备份**：教师端一键下载 / 云端快照恢复；`backup-to-local.ps1` 配合 Windows 任务计划每天自动备份到本机。

---

## 五、数据备份到本地（定期存档）

1. 编辑 `backup-to-local.ps1`：改 `$Api`（线上地址）、`$BackupDir`（本地目录如 `D:\Backup\classroom-poll`）。
2. 「任务计划程序」(`taskschd.msc`) → 创建基本任务 → 触发器选**每天**（如 23:00）→ 操作启动程序：
   - 程序：`powershell.exe`
   - 参数：`-NoProfile -ExecutionPolicy Bypass -File "本项目路径\backup-to-local.ps1"`
3. 之后每天自动把云端全量数据拉到本机，保留最近 30 份、清理旧档。

---

## 六、架构红线（勿破坏）

1. 端口 `process.env.PORT || 80`，不能改回 3000 并去掉 `|| 80`（否则探活失败、实例起不来）。
2. 所有数据在内存 `db`，任何增删改后必须 `persist()` 落盘。
3. 实例数固定 1；持久卷必须挂 `/data`。
4. 保持"零数据库、纯文件"极简架构，不要引入需外网/密钥的 npm 包（曾因 CloudBase SDK 构建失败）。
