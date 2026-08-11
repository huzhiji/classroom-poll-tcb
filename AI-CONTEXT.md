# 在线答题系统 · AI 上手上下文（AI-CONTEXT）

> 本文件是为 **AI 编程工具**（Claude / ChatGPT / Gemini / CodeBuddy / Codex / Cursor 等）准备的项目全景说明书。
> 把本仓库 + 本文件交给任何一个 AI，它就能像原开发者一样直接读懂、修改、扩展本项目。
> 若你用的工具会自动读取项目说明文件，请把本文件复制/软链为 `CLAUDE.md`、`AGENTS.md` 或 `.github/copilot-instructions.md`。

---

## 0. 这是什么

一个**国产云端「选调生学习系统」**（由在线答题平台升级而来）：学生用**邮箱 + 密码**注册登录 → 首页**学习仪表盘**展示各模块掌握概览（进度条/完成率/薄弱环节）→ 三大核心模块：**课程**（老师自建章节+资料+内置练习，按课时完成度算进度）、**答题**（考试/专题/课堂/错题练习/记忆模式）、**早读**（老师一键推送、学生每日打卡、艾宾浩斯自动复习、打卡后布置作业、师生双端日程/统计）→ 教师可**按邮箱群发复习提醒邮件**。数据可一键/定时备份到本地。

**已上线地址**：`https://classroom-poll-294902-10-1304972958.sh.run.tcloudbase.com`
**仓库**：`https://github.com/huzhiji/classroom-poll-tcb`（分支 `main`，已开启 GitHub 自动部署到腾讯云托管）
**注意**：另一个仓库 `huzhiji/classroom-poll`（Vercel 旧版）已弃用，请勿混淆。

---

## 1. 技术栈（刻意保持极简）

| 维度 | 选择 | 原因 |
|------|------|------|
| 运行时 | Node.js 18（`node:18-alpine`） | 云托管容器环境 |
| 框架 | Express 4（生产依赖）+ **nodemailer**（邮件） | 同进程托管前端与 API |
| 前端 | 原生 HTML/CSS/JS（无构建步骤） | 直接放 `public/`，浏览器打开即用 |
| 存储 | **进程内存 + JSON 文件落盘**（`/data/store.json`） | 零数据库依赖，绝不因外网/凭证卡构建 |
| 部署 | 腾讯云托管（容器，Dockerfile），GitHub 自动部署 | 国内访问快、可挂持久卷、可跑定时任务 |

---

## 2. 目录结构与各文件职责

```
classroom-poll-cloudbase/
├── index.js              # Express 入口：静态托管 + 全部 /api/* 路由 + 邮件发送 + 每日定时调度
├── lib/store.js          # 统一存储层（内存 db + 落盘 + 题目/考试/学生/错题/房间/SRS/注册登录/提醒）
├── package.json          # 仅 express + nodemailer
├── Dockerfile            # 腾讯云托管构建（FROM node:18-alpine，EXPOSE 80）
├── .dockerignore         # 排除 node_modules 等
├── .gitignore            # 排除 node_modules / _testdata / 日志
├── backup-to-local.ps1   # 本地 Windows 定时备份脚本（定期拉云端数据存本机）
├── AI-CONTEXT.md         # 本文件
└── public/
    ├── teacher.html      # 教师端（题库/考试/课堂/记录/导出/备份/复习提醒 7 个 Tab）
    └── student.html      # 学生端（考试/课堂/错题/记忆/记录 5 个 Tab + 邮箱登录注册弹窗）
```

**修改任何数据逻辑只动 `lib/store.js` + `index.js` 两个文件**；改界面只动 `public/*.html`。

---

## 3. 部署架构（务必遵守）

- **容器端口**：应用监听 `process.env.PORT || 80`。云托管探活固定 `:80`，**绝对不能改回 3000 并去掉 `|| 80`**，否则探活 connection refused、实例起不来。
- **持久化卷**：所有数据落盘到 `/data/store.json`（可用环境变量 `DATA_DIR` 覆盖）。**云托管必须挂载持久卷到 `/data`**，否则每次"新建版本"重新部署数据清空。挂载与部署是两个独立动作，都要做。
- **实例数**：固定为 1（最小=最大=1）。多副本会导致内存数据不一致、相互覆盖。
- **不要引入 CloudBase SDK 或其他需外网/凭证的包**——当初因此构建失败，已彻底改为纯文件存储。
- **自动部署**：GitHub push 到 `main` 触发（前提是云托管里配置的触发分支=main 且 Webhook 正常）。若没触发，去云托管「部署管理 → 新建版本」手动拉一次。
- **邮件环境变量**（在云托管控制台设置）：`SMTP_HOST` / `SMTP_PORT`（465 走 SSL，587 走 STARTTLS）/ `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`（可选）/ `APP_URL`（邮件里"去复习"链接，默认线上地址）/ `AUTO_REMINDER`（`=1` 开启每日自动群发）/ `REMINDER_HOUR`（默认 9，24 小时制）。未配 SMTP 时，提醒预览仍可看名单，发送接口安全返回 `configured:false` 不报错。

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

**考试/专题**：`GET /api/exams` · `GET /api/exams/:id`（隐藏答案）· `POST /api/exams`（`{title,questionIds}` 或 `{title,questions}` 直接带题）· `DELETE /api/exams/:id` · `POST /api/exams/:id/submit`（`{studentKey,studentName,answers}`）

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
- 学习仪表盘 `loadDashboard()`：课程总进度、答题正确率、记忆掌握、待巩固错题、今日早读、薄弱环节进度条。
- 课程 `loadCourses / openCourse / toggleLesson`：课程卡片网格 → 章节/课时详情 → 标记完成（进度实时）。
- 早读 `loadMorning`：今日打卡（老师推送+自建）、早读记忆复习（艾宾浩斯）、我的早读规划（自建）、复习日程表（14 天）、早读作业提交。
- 首次打开若未登录，自动弹出**注册/登录**弹窗（注册=邮箱+姓名+密码；登录=邮箱+密码）。登录态存 `localStorage.quiz_student_key`（邮箱）与 `quiz_student_name`。
- 身份相关函数：`showWho / openAuth / switchAuth / doRegister / doLogin`。

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
