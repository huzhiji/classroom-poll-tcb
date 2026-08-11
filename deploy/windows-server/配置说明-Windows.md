# 课堂答题系统 - 阿里云 Windows Server 部署配置说明

> 你的 ECS 是 **Windows Server**。本说明针对 Windows 环境（直接跑 Node.js，不装 Docker）。
> 若你的服务器其实是 Linux，请改用 `deploy/aliyun-ecs/` 里的一键脚本（更简单）。
> 数据持久化在 `DATA_DIR`（默认配置 `C:\classroom\data\store.json`）——Windows 磁盘本身持久，重启/更新不丢。

---

## 一、部署步骤（一次性）

### 1. 安装 Node.js（LTS 版）
- 在服务器浏览器打开 https://nodejs.org/zh-cn/download → 下载 **Windows Installer (.msi) x64** → 一路下一步安装。
- 验证：打开 PowerShell 输入 `node -v` 和 `npm -v`，能打印版本号即成功。

### 2. 获取代码
方式 A（推荐，网页下载 zip，无需装 Git）：
1. 服务器浏览器打开：`https://github.com/huzhiji/classroom-poll-tcb/archive/refs/heads/main.zip`
2. 解压到 `C:\classroom`（解压后目录名是 `classroom-poll-tcb-main`，把它重命名为 `classroom`，最终路径 `C:\classroom\index.js`）。

方式 B（装 Git 后 clone）：
```powershell
git clone https://github.com/huzhiji/classroom-poll-tcb.git C:\classroom
```

### 3. 安装依赖
在 `C:\classroom` 打开 PowerShell：
```powershell
cd C:\classroom
npm install --production
```

### 4. 修改配置
用记事本编辑 `C:\classroom\deploy\windows-server\start.bat`，改这几行（**路径/域名必须改，SMTP 可选**）：
```bat
set DATA_DIR=C:\classroom\data
set APP_URL=http://你的公网IP            # 有域名就填 https://你的域名
set SMTP_HOST=smtp.qq.com               # 不配邮件就留空
set SMTP_PORT=465
set SMTP_USER=你的发信邮箱
set SMTP_PASS=邮箱授权码                # 不是登录密码
set AUTO_REMINDER=0                     # 要每日自动提醒就改 1
```

### 5. 放行端口（两步都要做）
**① 阿里云控制台安全组**：ECS 实例 → 安全组 → 入方向规则 → 放行 `80`（HTTP）和 `443`（HTTPS，可选）。

**② Windows 防火墙**：在服务器上用**管理员** PowerShell 执行：
```powershell
New-NetFirewallRule -DisplayName "Classroom 80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```
> 若服务器装了 IIS 且占用 80 端口，先停掉 IIS 默认网站（开始菜单 → 管理工具 → IIS 管理器 → 停止 Default Web Site），否则端口冲突。

### 6. 启动并验证
- **先前台试跑**：双击 `C:\classroom\deploy\windows-server\start.bat`，看到 `在线答题系统 running on port 80` 即成功。
- 服务器本机浏览器打开 `http://localhost/teacher.html`。
- 外网验证：在你自己的电脑打开 `http://公网IP/teacher.html`。

---

## 二、开机自启（重要，否则服务器重启后服务停）

推荐用 **NSSM** 把应用注册成 Windows 服务（服务器重启自动拉起、退出登录不中断）：

1. 下载 NSSM：https://nssm.cc/download → 解压 win64 → 把 `nssm.exe` 放到 `C:\nssm\`。
2. **右键以管理员身份运行** `C:\classroom\deploy\windows-server\install-service.bat`。
3. 看到 `Service classroom installed and started` 即成功。

之后管理命令：
```powershell
net start classroom        # 启动
net stop classroom         # 停止
net restart classroom      # 重启
# 查看日志：C:\classroom\data\out.log / err.log
# 卸载：C:\nssm\nssm.exe remove classroom confirm
```

> 改动配置后（如 SMTP、APP_URL）：`net stop classroom` → 编辑 `install-service.bat` 里的环境变量 → 重新运行它（会自动重建服务）。

---

## 三、环境变量说明

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATA_DIR` | `C:\classroom\data` | 数据目录（`store.json` 落盘于此，**务必改成你实际路径**） |
| `PORT` | `80` | 监听端口，防火墙 + 安全组都要放行 |
| `APP_URL` | 空 | 你的访问地址（公网 IP 或域名），邮件里的按钮链接；未设置则不生成链接 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | 空 | 发信 SMTP（465=SSL，587=STARTTLS）。不配则邮件提醒禁用，其余功能正常 |
| `SMTP_FROM` | 同 SMTP_USER | 发件人地址 |
| `AUTO_REMINDER` | `0` | `1` 开启每日自动复习提醒邮件 |
| `REMINDER_HOUR` | `9` | 每日自动发送的小时 |

---

## 四、绑定域名 + HTTPS（Windows 推荐 Caddy）

Caddy 是一个单文件程序，自动申请/续期 HTTPS 证书，Windows 上最省事：
1. 下载 https://caddyserver.com/download → Windows amd64 → 解压得 `caddy.exe`，放到 `C:\caddy\`。
2. 新建 `C:\caddy\Caddyfile`：
```
你的域名 {
    reverse_proxy 127.0.0.1:80
}
```
3. 把域名 A 记录解析到服务器公网 IP，然后运行：
```powershell
cd C:\caddy
.\caddy.exe run
```
4. 安全组 + 防火墙放行 `443`。访问 `https://你的域名` 即可。
5. 记得把 `start.bat` / `install-service.bat` 里的 `APP_URL` 改成 `https://你的域名` 并重建服务。

> 备选：用 IIS 的 URL Rewrite + ARR 做反向代理（较繁琐），或参考 `deploy/aliyun-ecs/nginx.conf` 的原理（Windows 版 Nginx 亦可，但 Caddy 更简单）。

---

## 五、数据备份（重要）

- 数据文件：`C:\classroom\data\store.json`（全部题库/学生/错题/记录都在这里）。
- 备份方式：
  - 网页端：教师端 →「数据备份」Tab →「下载完整数据到本地」（导出 JSON 存档）。
  - 直接复制文件：`copy C:\classroom\data\store.json D:\backup\store-日期.json`（可配任务计划每日自动复制）。
- 换机器/迁移：把整个 `C:\classroom\data` 复制到新机器，装好 Node 后设 `DATA_DIR` 指向它即可恢复。

---

## 六、常见问题

**Q：`node index.js` 报 `EADDRINUSE`（端口被占用）？**
多半是 IIS 占用了 80。停掉 IIS 默认网站；或把 `PORT` 改成 8080 并在防火墙/安全组放行 8080。

**Q：外网打不开？**
先服务器本机 `http://localhost/` 测；本机通、外网不通 = 安全组或防火墙没放行 80。

**Q：改完代码怎么更新？**
```powershell
cd C:\classroom
# 方式A（zip 部署）：重新下载 main.zip 覆盖
# 方式B（git 部署）：git pull
npm install --production
net restart classroom        # 服务方式
```
数据在 `DATA_DIR`，更新不丢。
