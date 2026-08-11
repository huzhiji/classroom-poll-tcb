# 在线答题系统 · AI 上手上下文（AI-CONTEXT）

> 本文件是为 **AI 编程工具**（Claude / ChatGPT / Gemini / CodeBuddy / Codex / Cursor 等）准备的项目全景说明书。
> 把本仓库 + 本文件交给任何一个 AI，它就能像原开发者一样直接读懂、修改、扩展本项目。
> 若你用的工具会自动读取项目说明文件，请把本文件复制/软链为 `CLAUDE.md`、`AGENTS.md` 或 `.github/copilot-instructions.md`。

---

## 0. 这是什么

一个**国产云端「选调生学习系统」**（由在线答题平台升级而来）：学生用**邮箱 + 密码**注册登录 → 首页**学习仪表盘**展示各模块掌握概览（进度条/完成率/薄弱环节）→ 三大核心模块：**课程**（老师自建章节+资料+内置练习，按课时完成度算进度）、**答题**（考试/专题/课堂/错题练习/记忆模式）、**早读**（老师一键推送、学生每日打卡、艾宾浩斯自动复习、打卡后布置作业、师生双端日程/统计）→ 教师可**按邮箱群发复习提醒邮件**。数据可一键/定时备份到本地。

**部署现状**：原腾讯云托管地址 `https://classroom-poll-294902-10-1304972958.sh.run.tcloudbase.com` **因配额耗尽已停用**；现部署在**阿里云 ECS**（Docker 方式，见 §3 与 §12.4，一键脚本 `deploy/aliyun-ecs/`）。
**仓库**：`https://github.com/huzhiji/classroom-poll-tcb`（分支 `main`）
**注意**：另一个仓库 `huzhiji/classroom-poll`（Vercel 旧版）已弃用，请勿混淆。

---

## 1. 技术栈（刻意保持极简）

| 维度 | 选择 | 原因 |
|------|------|------|
| 运行时 | Node.js 18（`node:18-alpine`） | 云托管容器环境 |
| 框架 | Express 4（生产依赖）+ **nodemailer**（邮件） | 同进程托管前端与 API |
| 前端 | 原生 HTML/CSS/JS（无构建步骤） | 直接放 `public/`，浏览器打开即用 |
| 存储 | **进程内存 + JSON 文件落盘**（`/data/store.json`） | 零数据库依赖，绝不因外网/凭证卡构建 |
| 部署 | 阿里云 ECS + Docker（通用 Dockerfile；一键脚本 `deploy/aliyun-ecs/deploy.sh`）。曾用腾讯云托管，配额已耗尽停用 | 云平台无关、磁盘持久化、国内访问快 |

---

## 2. 目录结构与各文件职责

```
classroom-poll-cloudbase/
├── index.js              # Express 入口：静态托管 + 全部 /api/* 路由 + 邮件发送 + 每日定时调度
├── lib/store.js          # 统一存储层（内存 db + 落盘 + 题目/考试/学生/错题/房间/SRS/注册登录/提醒）
├── package.json          # 仅 express + nodemailer
├── Dockerfile            # 通用容器构建（FROM node:18-alpine，EXPOSE 80；阿里云 ECS 等任意环境可用）
├── .dockerignore         # 排除 node_modules 等
├── .gitignore            # 排除 node_modules / _testdata / 日志
├── backup-to-local.ps1   # 本地 Windows 定时备份脚本（定期拉云端数据存本机）
├── check-student-robustness.js  # 学生端健壮性回归检查（NORMAL+BROKEN 双模式 mock 全部 loader，断言零 undefined 崩溃；改 student.html 后必跑）
├── deploy/
│   └── aliyun-ecs/       # 阿里云 ECS 部署：deploy.sh（一键构建+运行）、配置说明.md（完整指南）、nginx.conf（HTTPS 反代示例）
├── AI-CONTEXT.md         # 本文件
└── public/
    ├── teacher.html      # 教师端（10 个 Tab：班级仪表盘/课程管理/早读管理/题库/考试/课堂/学生记录/错题导出/数据备份/复习提醒）
    └── student.html      # 学生端（8 个 Tab：学习仪表盘/课程/考试/早读/课堂/错题/记忆/我的记录 + 邮箱登录注册弹窗）
```

**修改任何数据逻辑只动 `lib/store.js` + `index.js` 两个文件**；改界面只动 `public/*.html`。

---

## 3. 部署架构（务必遵守）

- **当前部署目标：阿里云 ECS**（腾讯云托管配额已耗尽、停用）。ECS 磁盘本身持久：`DATA_DIR=/data` 直接落盘，**无需额外挂载云盘/持久卷**；容器 `-p 80:80` 映射、`--restart=always`；安全组放行 80/443。一键脚本 `deploy/aliyun-ecs/deploy.sh`，完整指南 `deploy/aliyun-ecs/配置说明.md`。
- **容器端口**：应用监听 `process.env.PORT || 80`。**绝对不能改回 3000 并去掉 `|| 80`**，否则外部 80 映射探活失败。
- **持久化卷**：所有数据落盘到 `/data/store.json`（可用环境变量 `DATA_DIR` 覆盖）。Docker 部署用 `-v /data:/data` 挂宿主机目录；**容器删了数据仍在**。
- **实例数**：固定为 1。多副本会导致内存数据不一致、相互覆盖。
- **不要引入 CloudBase SDK 或其他需外网/凭证的包**——当初因此构建失败，已彻底改为纯文件存储。
- **自动部署**：GitHub push 到 `main` 后，在 ECS 上 `git pull && bash deploy/aliyun-ecs/deploy.sh` 即可更新（数据不丢）。
- **邮件环境变量**：`SMTP_HOST` / `SMTP_PORT`（465 走 SSL，587 走 STARTTLS）/ `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`（可选）/ `APP_URL`（邮件里"去复习"链接；**未设置则邮件不生成链接**）/ `AUTO_REMINDER`（`=1` 开启每日自动群发）/ `REMINDER_HOUR`（默认 9，24 小时制）。未配 SMTP 时，提醒预览仍可看名单，发送接口安全返回 `configured:false` 不报错。

---

## 4. 不可破坏的约定（给 AI 的红线）

1. 端口 `process.env.PORT || 80`，勿改。
2. 所有数据在内存 `db` 中；任何增删改后**必须调用 `persist()`**（防抖 300ms 落盘），漏写会丢数据（新函数尤其注意）。
3. 学生标识 `studentKey` = **邮箱（小写）**，作为 `db.students` 的键。注册时写入 `email` + `password`（scrypt 哈希）。非邮箱的旧数据（姓名/学号）是遗留键，不会收到邮件提醒。
4. 实例数固定 1；任何写操作都假设单进程。
5. 前端用 `fetch` 调 API，错误响应形如 `{_error:true, code, message}`，`api()` 助手会自动 throw `message`——前端 catch 后 `toast(e.message)`。判断成功看 `r.ok` 或具体字段，**不要**用 `r.error`（那是笔误字段，实际是 `_error`）。
6. 备份/注册/提醒等接口当前**无鉴权**（与系统整体一致，teacher 页面公开）。若加管理员口令，记得同步保护 `/api/reminder/send`、`/api/backup/*`、`/api/questions/*` 等写接口。
7. `express.json({limit:'5mb'})` 已设，批量导入大文本不受影响。

---

## 5. 数据模型（`/data/store.json` 的 `db`）

```js
db = {
  questions: [ { id, type:'choice'|'judge', title, options:[], correctAnswer:int(选项索引),
                analysis, topic, createdAt } ],
  exams:     [ { id, title, mode:'exam'|'topic', questionIds:[], createdAt } ],
  students:  {                              // 键 = 邮箱(小写)
    "a@b.com": {
      name, email, password,               // password: "salt$scryptHex"
      wrong: [qid...],                     // 错题库
      history: [ { refType:'exam'|'wrong', refId, refTitle, date, total, correct,
                   details:[ {qid, selected, correctAnswer, isCorrect} ] } ],
      memory: {                             // 间隔记忆卡（SRS）
        [qid]: { level, due(ms时间戳), reps, lapses, createdAt, lastReviewed }
      },
      createdAt
    }
  },
  rooms:     { [roomId]: { id, questions:[], currentQuestion, state, students:{}, eventSeq, revealAnswer, createdAt } },
  courses:   [ { id, title, description, cover, chapters:[
                 { id, title, order, lessons:[
                   { id, title, type:'text'|'material', content,
                     materials:[{type,title,url}], practiceExamId, order } ] } ],
               createdAt, updatedAt } ],
  courseProgress: { [studentKey]: { [courseId]: { completedLessons:[lessonId], lastAccess, startedAt } } },
  morningReadings: [ { id, ownerType:'teacher'|'student', ownerKey, title, content,
                       push:{mode:'none'|'all', pushedAt, pushDate}, active, createdAt } ],
  morningCheckins: { [studentKey+'::'+date]: { studentKey, date, readingIds:[], done, homeworkDone, ts } },
  morningHomework: [ { id, date, title, questionIds:[], examId, dueDate, createdAt } ],
  meta:      { qSeq, eSeq }
}
```
> 注：学生早读记忆卡复用 `students[email].mrMemory`（`{mrid:{level,due,reps,lapses,createdAt}}`），与答题记忆 `memory` 并列。

---

## 6. API 端点清单（按模块）

**题目**：`GET /api/questions?type=&topic=` · `GET /api/topics` · `POST /api/questions` · `POST /api/questions/batch`（`{text}` 文本解析或 `{questions:[...]}`）· `PUT /api/questions/:id` · `DELETE /api/questions/:id`

**考试/专题**：`GET /api/exams`（每个考试返回 `category` 字段，由标题自动识别：国考真题/省考真题/选调真题/专题/国省考真题）· `GET /api/exams/:id`（隐藏答案）· `POST /api/exams`（`{title,questionIds}` 或 `{title,questions}` 直接带题）· `DELETE /api/exams/:id` · `POST /api/exams/:id/submit`（`{studentKey,studentName,answers,questionIds}` — `questionIds` 可选，传入则只对该子集评分，用于「练几题」部分作答）
- **考试进度 / 草稿（新增）**：`GET /api/exams/progress?key=` → `{doneExamIds:[], byTop:{'国省考真题':{done,total,percent},'专题':{...}}}`（注意：此路由必须放在 `/api/exams/:id` 之前，否则会被 `:id` 捕获）· `GET /api/drafts?key=` → `{drafts:{examId:{count,total,answered,updatedAt}}}` · `POST /api/exams/:id/draft`（`{studentKey,answers,seq,idx,count,total}` 暂存）· `GET /api/exams/:id/draft?key=` · `DELETE /api/exams/:id/draft?key=`（交卷时后端自动 clearDraft）

**学生/错题**：`GET /api/students/:key/records` · `GET /api/students/:key/stats` · `GET /api/students/:key/wrong` · `POST /api/wrong/remove` · `POST /api/wrong-practice/start` · `POST /api/wrong-practice/submit`

**课堂模式（保留）**：`POST /api/create-room` · `POST /api/join-room` · `POST /api/close-room` · `POST /api/load-questions` · `POST /api/publish` · `POST /api/submit-answer` · `POST /api/end-question` · `POST /api/reset-question` · `GET /api/poll`

**注册/登录**：`POST /api/register`（`{email,name,password}`）→ `{studentKey, name, ok}` · `POST /api/login`（`{email,password}`）→ `{studentKey, name, ok}`

**间隔记忆（SRS）**：`POST /api/memory/enable`（`{studentKey,qids}`）· `GET /api/memory/due?key=&now=` · `GET /api/memory/stats?key=` · `POST /api/memory/review`（`{studentKey,answers}`）

**复习提醒（邮件）**：`GET /api/reminder/preview` → `{configured, count, recipients[]}` · `POST /api/reminder/send` → `{configured, sent, failed, errors[]}`

**课程模块**：`GET /api/courses` · `GET /api/courses/:id` · `POST /api/courses`（`{title,description}`）· `PUT /api/courses/:id` · `DELETE /api/courses/:id` · `POST /api/courses/:id/chapters` · `PUT/DELETE /api/courses/:id/chapters/:chId` · `POST /api/courses/:id/chapters/:chId/lessons` · `PUT/DELETE /api/courses/:id/chapters/:chId/lessons/:lsId` · `GET /api/student/courses?key=` · `POST /api/courses/:id/lessons/:lsId/done`（`{studentKey,done}`）· `GET /api/courses/:id/progress?key=`（返回 `{total,completed,percent,completedLessons}`）

**早读模块**：`GET /api/morning?scope=teacher|&ownerKey=` · `POST /api/morning`（`{ownerType,ownerKey,title,content}`）· `PUT/DELETE /api/morning/:id` · `POST /api/morning/:id/push`（一键推送全班）· `GET /api/morning/today?key=&date=`（`{date,items[],checkin:{done,readingIds,homeworkDone}}`）· `POST /api/morning/checkin`（`{studentKey,date,readingIds,done}`）· `GET /api/morning/checkin/stats?date=`（已/未打卡名单）· `POST /api/morning/homework`（`{title,date,questionIds,examId}`）· `GET /api/morning/homework?date=` · `POST /api/morning/homework/:id/submit`（`{studentKey,studentName,answers}`）

**早读记忆（SRS，独立于答题记忆）**：`POST /api/morning/memory/enable`（`{studentKey,mrids}`）· `GET /api/morning/memory/due?key=` · `GET /api/morning/memory/stats?key=` · `GET /api/morning/memory/cards?key=`（含 `due` 时间戳，用于日程表）· `POST /api/morning/memory/review`（`{studentKey,results:{mrid:0记住|1没记住}}`）

**仪表盘**：`GET /api/dashboard/student?key=`（课程进度/答题正确率/记忆掌握/待巩固错题/今日早读/薄弱环节）· `GET /api/dashboard/teacher`（学生数/课程数/今日打卡/全班正确率/薄弱专题）

**数据备份**：`GET /api/backup/export`（浏览器下载带时间戳 JSON）· `POST /api/backup/snapshot` · `GET /api/backup/snapshots` · `POST /api/backup/restore`（`{name}`）

**健康检查**：`GET /` · `GET /healthz`

---

## 7. 前端页面（已重命名为「选调生学习系统」）

**teacher.html**（顶部 10 个 Tab，首页=班级仪表盘）：📊 班级仪表盘 / 📚 课程管理 / 🌅 早读管理 / 题库管理 / 考试管理 / 课堂模式 / 学生记录 / 错题导出 / 数据备份 / 复习提醒。
- 班级仪表盘 Tab：`loadTeacherDashboard()` 聚合学生数、课程数、今日早读打卡（已/未打卡名单）、全班正确率、薄弱专题。
- 课程管理 Tab：`loadCourseList / createCourseT / editCourse / addChapter / addLesson / saveCourse`，支持章节+课时 CRUD。
- 早读管理 Tab：`loadMorningList / createMorningT / pushMorning`（一键推送）、`assignHomework / loadHomeworkList`（布置作业）、`loadCheckinStats`（打卡统计）。
- 复习提醒 Tab：`预览今日提醒名单` + `立即群发提醒邮件`（未配 SMTP 时按钮禁用并提示）。

**student.html**（顶部 8 个 Tab，首页=学习仪表盘 + 登录弹窗）：📊 学习仪表盘 / 📚 课程 / 📝 考试答题 / 🌅 早读 / 👥 课堂练习 / ❌ 错题练习 / 🧠 记忆模式 / 📈 我的记录。
- 学习仪表盘 `loadDashboard()`：课程总进度、答题正确率、答题次数、记忆掌握、待巩固错题、今日早读、薄弱环节进度条。**注意**：`getStudentStats`（store.js）的「总体正确率/专题正确率」同时计入 `exam` 与 `homework`（早读作业）两种真实作答；错题练习仅存在于错题库、不计入正确率。新增 `attemptCount`（考试+作业次数）。前端已对 `d`/`prog`/`stats` 做防御性取值，兼容后端不同版本（progress 缺 `byTop` 也不会崩）。
- 课程 `loadCourses / openCourse / toggleLesson`：课程卡片网格 → 章节/课时详情 → 标记完成（进度实时）。
- 早读 `loadMorning`：今日打卡（老师推送+自建）、早读记忆复习（艾宾浩斯）、我的早读规划（自建）、复习日程表（14 天）、早读作业提交。
- 首次打开若未登录，自动弹出**注册/登录**弹窗（注册=邮箱+姓名+密码；登录=邮箱+密码）。登录态存 `localStorage.quiz_student_key`（邮箱）与 `quiz_student_name`。
- 身份相关函数：`showWho / openAuth / switchAuth / doRegister / doLogin`。
- 考试答题模块（重点·最新改造）：`loadExamList` 按 `category` 归并为**两大可折叠块「📘 国省考真题 / 📚 专题训练」**，块头显示「已完成 X / 共 Y (Z%)」进度条；**默认全部折叠**（大类与国考/省考/选调/其他真题子块均 `display:none` + caret ▸，点击 `tg()` 展开）。国省考真题块内按 国考/省考/选调/其他真题 折叠、省考按省份折叠；`category` 兜底为「其他真题」也会显示（不再漏题）。卡片带「草稿·已答 N/M」「✓ 已完成」徽标。`enterExam` 先弹「本次练习几题」面板（全部/10/20/30/50/自定义，支持部分作答），有草稿时显示「继续上次作答/重新开始」。`renderExamQuestions` 顶部 sticky 工具栏（交卷/暂存进度/返回列表）+ 题号导航；`saveDraftNow` 暂存、`backToExams` 返回前自动暂存防丢、`submitExam` 支持 `questionIds` 只交练习子集。
- 我的记录 `loadMine`：顶部统计卡（总体正确率/答对/总题/答题次数/待巩固错题），下方「📊 按专题正确率」与「🕓 历史记录」均为**可折叠块（默认折叠）**，点击 `tg('mine-topic')` / `tg('mine-hist')` 展开。

---

## 8. 艾宾浩斯间隔记忆（SRS）算法

间隔序列 `SRS_INTERVALS = [1,2,4,7,15,30,90]`（天）。每张卡 `level 0..6`：
- **新卡**：创建即 `due=now`，首次答对进入第 1 级。
- **答对**：`level = min(level+1, 6)`，`due = now + SRS_INTERVALS[max(0,level-1)] 天`（`level` 从 1 起对应 1 天，逐级 2/4/7/15/30/90 天）。
- **答错**：`level=0`，`due=now+1天`，`lapses+1`（不删卡，缩短间隔反复巩固）。
- `level===6` 视为「已掌握」。
- 学生每天打开「记忆模式」自动看到 `due <= 当天23:59:59` 的到期题（含逾期，按紧急度升序）。

---

## 9. 本地运行 / 测试

```bash
cd classroom-poll-cloudbase
npm install                      # 装 express + nodemailer
DATA_DIR=./_testdata PORT=3001 node index.js   # 本地起服务，数据落 ./_testdata/store.json
# 浏览器开 http://127.0.0.1:3001/student.html 与 /teacher.html
# 测试后删：rm -rf _testdata
```
临时测试数据务必放 `./_testdata`（已被 .gitignore 忽略），**不要**写进 `/data` 或提交。

---

## 10. 常见修改任务（给 AI 的速查）

- **加新题目字段**：改 `store.addQuestion` 默认对象 + `parseQuestionsText` 解析 + `getExamQuestions`/`getWrongQuestions` 返回映射 + 前端渲染。
- **改邮件文案/样式**：`index.js` 的 `buildReminderMail()`。
- **换邮件服务商**：只改云托管 `SMTP_*` 环境变量，代码不用动（端口 465 自动走 SSL）。
- **开启每日自动提醒**：云托管设 `AUTO_REMINDER=1` 并配好 SMTP 即可，调度已在 `index.js` 内置（每天 `REMINDER_HOUR` 触发一次）。
- **加管理员鉴权**：在 `index.js` 路由前加中间件校验 token，并保护写接口（见第 4 节第 6 条）。
- **数据迁移/回滚**：教师端「数据备份」Tab 可创建云端快照并恢复；或本地用 `backup-to-local.ps1` 拉取的 JSON 经 `/api/backup/restore` 还原。

---

## 11. Git 信息

- 远程：`huzhiji/classroom-poll-tcb`（main）。
- 提交规范：feat/fix 前缀中文简述。
- 部署：push 到 main → 若自动部署未触发，去云托管手动「新建版本」。
- **每次部署后务必确认**：① 已挂持久卷 `/data`；② 实例数=1。

---

## 12. 开发与部署完整流程（给 AI 的标准工作流）

> 这份"流程"是整个项目的核心交接物：任何 AI 按这套动作改代码，都能复现当前可上线的结果。

### 12.1 改代码的分工（别乱动文件）
- **数据/业务逻辑** → 只改 `lib/store.js`（内存 db + 落盘）+ `index.js`（路由）。
- **界面/交互** → 只改 `public/teacher.html`、`public/student.html` 里的 `<style>` 与 `<script>`。
- 新增数据字段：在 `store.js` 的 db 默认结构、`add* / get*` 函数里加，并同步 `exportAll()` 合并默认值，否则旧数据解析会丢字段。

### 12.2 本地验证（必须做，防线上炸）
```bash
cd classroom-poll-cloudbase
npm install                                  # 装 express + nodemailer
# 1) 语法快检（不依赖网络）
node -e "require('./lib/store'); require('./index'); console.log('require ok')"   # 注意：会真的 listen 80，端口占用报错属正常，只要前面无 SyntaxError 即可
# 2) 前端 JS 语法快检
node -e "const fs=require('fs');const s=fs.readFileSync('public/student.html','utf8');new Function(s.match(/<script>([\s\S]*?)<\/script>/)[1]);"
# 2.5) 前端健壮性回归（NORMAL+BROKEN 双模式 mock 全部 loader，断言零 undefined 崩溃；改 student.html 后必跑）
node check-student-robustness.js
# 3) 起服务 + 端到端测试（务必用临时 DATA_DIR，绝不写 /data）
export DATA_DIR="$PWD/_testdata"; export PORT=3011
(node index.js > /tmp/srv.log 2>&1 &) ; sleep 2
node _t_e2e.mjs                             # 用 fetch 串起注册→课程→早读→记忆→仪表盘
pkill -f "node index.js"; rm -f _t_e2e.mjs; rm -rf _testdata
```
> 后台起服务用 `(node ... &)` 包一层，避免被 bash 工具的前台超时逻辑误杀；测试脚本一律放临时 `.mjs`，测完删。

### 12.3 提交与推送
```bash
git add -A
git commit -m "feat: 中文简述本次改动"
git push origin main
```
推送后 `main` 即最新代码。**但线上不会自动变**——见 12.4。

### 12.4 让线上生效（最容易被忽略的一步）
**当前线上环境 = 阿里云 ECS（Docker）**，更新流程：
1. 本地 `git push origin main` 推送代码。
2. 登录 ECS，`cd /opt/classroom && git pull && bash deploy/aliyun-ecs/deploy.sh`（脚本自动构建新镜像、重建容器，`-v /data:/data` 挂载保证数据不丢）。
3. 若改过域名/邮件配置，编辑 `deploy/aliyun-ecs/deploy.sh` 顶部配置区后再跑。
4. 验证：浏览器访问 `/teacher.html`、`/student.html`；SSH 内 `curl localhost/` 确认探活。

> 历史：腾讯云托管阶段需手动「新建版本」+ 挂持久卷 + 实例数=1；该方案因配额耗尽已弃用。

### 12.5 回滚与备份
- 云端：教师端「数据备份」Tab → 创建快照 → 可一键恢复。
- 本地：运行 `backup-to-local.ps1`（配好 `$Api`/`$BackupDir` + 任务计划），每天自动拉全量 JSON 到本机，保留 30 份。
- 代码回滚：`git revert <commit>` 或 `git push origin <旧commit>:main --force`（谨慎）。

---

## 13. 关键历史里程碑与踩坑（避免重蹈覆辙）

| 阶段 | 结论 / 坑 | 当前状态 |
|------|-----------|----------|
| Vercel 部署 | 仓库错位、环境变量失效、ESM 误编译、提交邮箱被 Block，最终放弃 | 旧仓库 `huzhiji/classroom-poll` 已弃用 |
| 云托管无 Dockerfile | 构建 404，补 Dockerfile+.dockerignore | 已解决 |
| 引入 CloudBase SDK | 容器内无凭证、安装易失败、构建炸 | 已彻底改为纯文件存储 |
| 探活 connection refused | 代码监听 3000，云托管探活 80 | 改 `PORT\|\|80`，红线 |
| 内存存储丢数据 | 重部署清空 | 改文件落盘 `/data/store.json` + 持久卷 |
| 自动部署不触发 | Webhook/分支不匹配 | 一律手动新建版本兜底 |
| 多副本写冲突 | 内存相互覆盖 | 实例数固定 1 |
| 注册接口笔误 | `register` 返回 `studentKey` 而非 `email` | 前端按 `studentKey=email` 处理 |
| 前端错误字段 | 实际是 `_error` 不是 `error` | 统一判 `r.ok` / `r._error` |
| student.html 交卷行缺 `}` | 防御性加固时把 `examSeq})` 误写成 `examSeq)`，括号不配平，整个内联脚本解析失败 → 线上全部 `Cannot read properties of undefined` | 已修复；新增 `check-student-robustness.js` 回归 |
| 腾讯云托管配额耗尽 | 免费配额用完无法访问 | 已迁移阿里云 ECS（Docker），`deploy/aliyun-ecs/` |

**最重要的三条红线（改任何东西都别碰）**：
1. 端口 `process.env.PORT || 80`，永远别改。
2. 任何写操作后必须 `persist()`（防抖 300ms），漏写真丢数据。
3. 实例数固定 1；持久卷必须挂 `/data`，否则一切努力随重部署归零。

---

## 14. 改动后自检清单（提交前逐项过）

- [ ] `node -e "require('./lib/store'); require('./index')"` 无 SyntaxError。
- [ ] 两个 `public/*.html` 的 `<script>` 用 `new Function` 校验无语法错。
- [ ] 新增 API 在 `index.js` 注册、在 `store.js` 有对应函数且 `export`。
- [ ] 新增写操作都调了 `persist()`。
- [ ] 新增 db 字段在 `exportAll()` 合并里给了默认值（旧数据兼容）。
- [ ] 用临时 `DATA_DIR=./_testdata` 跑过端到端，没把测试数据写进仓库或 `/data`。
- [ ] 前端错误用 `r._error` / `r.ok` 判断，没用 `r.error`。
- [ ] 端口仍是 `process.env.PORT || 80`。
- [ ] 提交信息中文 `feat/fix` 前缀；push 到 `main`。
- [ ] 提醒用户：线上需手动**新建版本** + 确认**持久卷 `/data`** + **实例数=1**。

---

## 15. 给其他 AI 工具的移交提示

- 本文件即项目"说明书"。若目标工具支持自动读取，请复制/软链为：
  - Claude → `CLAUDE.md`
  - Codex / Cursor → `AGENTS.md`
  - GitHub Copilot → `.github/copilot-instructions.md`
  - 通用 → 直接把本文件内容贴进对话首条。
- 首要动作：先 `git pull` 拿到最新 `main`，再 `npm install`，按第 12 节本地验证后再改。
- 不要引入需要外网/密钥的 npm 包（曾因 CloudBase SDK 构建失败）；保持"零数据库、纯文件"的极简架构。
