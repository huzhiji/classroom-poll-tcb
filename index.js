// 在线答题系统 - 腾讯云托管版后端入口
// Express 同时托管静态前端（teacher.html / student.html）与 /api/* 接口。

const express = require('express');
const path = require('path');
const store = require('./lib/store');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function fail(msg, code = 400) {
  return { _error: true, code, message: msg };
}

// ========== 健康检查（云托管探活） ==========
app.get('/', (req, res) => res.json({ status: 'ok', service: 'online-quiz', time: Date.now() }));
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// ================= 题目管理 =================
app.get('/api/questions', (req, res) => {
  const { type, topic } = req.query;
  res.json(store.listQuestions({ type, topic }));
});

app.get('/api/topics', (req, res) => res.json(store.topics()));

app.post('/api/questions', (req, res) => {
  try {
    const q = store.addQuestion(req.body || {});
    if (!q.title) return res.status(400).json(fail('题目内容不能为空'));
    res.json(q);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// 批量导入：body { text } 走文本解析，或 { questions:[...] } 直接数组
app.post('/api/questions/batch', (req, res) => {
  try {
    let created = [];
    if (req.body && req.body.text) {
      const parsed = store.parseQuestionsText(req.body.text);
      created = store.addQuestionsBatch(parsed);
    } else if (req.body && Array.isArray(req.body.questions)) {
      created = store.addQuestionsBatch(req.body.questions);
    }
    res.json({ created: created.length, questions: created });
  } catch (e) { res.status(500).json(fail('导入失败: ' + e.message)); }
});

app.put('/api/questions/:id', (req, res) => {
  try {
    const q = store.updateQuestion(req.params.id, req.body || {});
    if (!q) return res.status(404).json(fail('题目不存在'));
    res.json(q);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.delete('/api/questions/:id', (req, res) => {
  try {
    const ok = store.deleteQuestion(req.params.id);
    if (!ok) return res.status(404).json(fail('题目不存在'));
    res.json({ deleted: true });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// ================= 考试 / 专题 =================
app.get('/api/exams', (req, res) => res.json(store.listExams()));

// 考试完成进度（按大类统计：已完成 / 共 / 百分比）—— 必须放在 /:id 之前，否则被 :id 捕获
app.get('/api/exams/progress', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json(fail('缺少学生标识'));
    res.json(store.getExamProgress(key));
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});

app.get('/api/exams/:id', (req, res) => {
  const data = store.getExamQuestions(req.params.id);
  if (!data) return res.status(404).json(fail('考试不存在'));
  res.json(data);
});

app.post('/api/exams', (req, res) => {
  try {
    const exam = store.createExam(req.body || {});
    if (!exam.questionIds.length) return res.status(400).json(fail('考试至少需要一道题目'));
    res.json(exam);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.delete('/api/exams/:id', (req, res) => {
  try {
    const ok = store.deleteExam(req.params.id);
    if (!ok) return res.status(404).json(fail('考试不存在'));
    res.json({ deleted: true });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// 提交考试答卷
app.post('/api/exams/:id/submit', (req, res) => {
  try {
    const { studentKey, studentName, answers, questionIds } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const result = store.submitExam({ examId: req.params.id, studentKey, studentName, answers, questionIds });
    if (result.error) return res.status(404).json(fail(result.error));
    res.json(result);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// 考试草稿（暂存 / 续作）
app.post('/api/exams/:id/draft', (req, res) => {
  try {
    const { studentKey, answers, seq, idx, count, total } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const d = store.saveDraft(studentKey, req.params.id, { answers: answers || {}, seq: seq || null, idx: idx || 0, count: count || 0, total: total || 0 });
    res.json({ ok: true, draft: d });
  } catch (e) { res.status(500).json(fail('暂存失败: ' + e.message)); }
});
app.get('/api/exams/:id/draft', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json(fail('缺少学生标识'));
    res.json({ draft: store.getDraft(key, req.params.id), answeredQids: store.getExamAnsweredQids(key, req.params.id) });
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});
app.delete('/api/exams/:id/draft', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json(fail('缺少学生标识'));
    res.json({ ok: true, cleared: store.clearDraft(key, req.params.id) });
  } catch (e) { res.status(500).json(fail('清除失败: ' + e.message)); }
});

// 某学生全部草稿摘要（考试列表批量展示「继续作答」）
app.get('/api/drafts', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json(fail('缺少学生标识'));
    res.json({ drafts: store.listDrafts(key) });
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});

// 批量写入考试答案/解析（教师导入答案键）
app.post('/api/exams/:id/answers', (req, res) => {
  try {
    const exam = store.getExam(req.params.id);
    if (!exam) return res.status(404).json(fail('考试不存在'));
    let entries = req.body && req.body.entries;
    if (!Array.isArray(entries) && req.body && req.body.raw) {
      entries = store.parseAnswersText(req.body.raw, exam.questionIds.length);
    }
    if (!Array.isArray(entries)) return res.status(400).json(fail('参数错误：需要 entries 数组或 raw 文本'));
    const r = store.setExamAnswers(req.params.id, entries);
    if (r.error) return res.status(404).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('保存失败: ' + e.message)); }
});

// ================= 学生记录 & 错题 =================
app.get('/api/students/:key/records', (req, res) => {
  res.json(store.getStudentRecords(req.params.key));
});

app.get('/api/students/:key/stats', (req, res) => {
  res.json(store.getStudentStats(req.params.key));
});

app.get('/api/students/:key/wrong', (req, res) => {
  res.json(store.getWrongQuestions(req.params.key));
});

app.post('/api/wrong/remove', (req, res) => {
  try {
    const { studentKey, qid } = req.body || {};
    const ok = store.removeWrong(studentKey, qid);
    res.json({ removed: ok });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// 一键加入错题（学生主动加入）
app.post('/api/wrong/add', (req, res) => {
  try {
    const { studentKey, qid } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const result = store.addWrong(studentKey, qid);
    if (result.error) return res.status(400).json(fail(result.error));
    res.json(result);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// 错题练习：开始（随机抽取）
app.post('/api/wrong-practice/start', (req, res) => {
  try {
    const { studentKey, count } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    res.json({ questions: store.getWrongPractice(studentKey, count) });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// 错题练习：提交
app.post('/api/wrong-practice/submit', (req, res) => {
  try {
    const { studentKey, answers } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const result = store.submitWrongPractice({ studentKey, answers });
    if (result.error) return res.status(400).json(fail(result.error));
    res.json(result);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// ================= 课堂答题模式（保留） =================
app.post('/api/create-room', async (req, res) => {
  try {
    let roomId, room;
    for (let i = 0; i < 5; i++) {
      roomId = store.generateRoomId();
      room = await store.createRoom(roomId);
      if (room) break;
    }
    if (!room) return res.status(500).json(fail('创建房间失败，请重试', 500));
    res.json({ type: 'room-created', roomId });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/join-room', async (req, res) => {
  try {
    const { roomId, name } = req.body;
    if (!roomId || !name) return res.json(fail('缺少 roomId 或 name'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json(fail('房间不存在或已关闭'));
    const studentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    room.students[studentId] = { name: name || '匿名同学', answers: {} };
    await store.nextEventSeq(room);
    await store.saveRoom(room);
    res.json({ type: 'joined', studentId, roomId, studentCount: Object.keys(room.students).length, seq: room.eventSeq });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/close-room', async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));
    await store.deleteRoom(roomId);
    res.json({ type: 'room-closed' });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/load-questions', async (req, res) => {
  try {
    const { roomId, questions } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    room.questions = (questions || []).map((q, i) => ({
      id: i, title: q.title || '', options: q.options || ['A', 'B', 'C', 'D'],
      correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : 0, timeLimit: q.timeLimit || 0,
    }));
    room.currentQuestion = -1;
    room.state = 'waiting';
    await store.nextEventSeq(room);
    await store.saveRoom(room);
    res.json({ type: 'questions-loaded', count: room.questions.length, seq: room.eventSeq });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/publish', async (req, res) => {
  try {
    const { roomId, questionIndex } = req.body;
    if (!roomId || questionIndex === undefined) return res.json(fail('缺少参数'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    if (questionIndex < 0 || questionIndex >= room.questions.length) return res.json(fail('题目不存在'));
    Object.values(room.students).forEach((s) => { if (s.answers) s.answers[questionIndex] = undefined; });
    room.currentQuestion = questionIndex;
    room.state = 'answering';
    room.revealAnswer = false;
    const q = room.questions[questionIndex];
    await store.nextEventSeq(room);
    await store.saveRoom(room);
    res.json({ type: 'question-published', questionIndex, data: { title: q.title, options: q.options, correctAnswer: q.correctAnswer, timeLimit: q.timeLimit }, stats: store.calcStats(room), seq: room.eventSeq });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/submit-answer', async (req, res) => {
  try {
    const { roomId, studentId, answer } = req.body;
    if (!roomId || !studentId || answer === undefined) return res.json(fail('缺少参数'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    if (room.state !== 'answering') return res.json(fail('当前不在答题时间'));
    if (!room.students[studentId]) return res.json(fail('学生不存在'));
    room.students[studentId].answers[room.currentQuestion] = answer;
    await store.nextEventSeq(room);
    await store.saveRoom(room);
    res.json({ type: 'answer-submitted', questionIndex: room.currentQuestion, seq: room.eventSeq });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/end-question', async (req, res) => {
  try {
    const { roomId, revealAnswer } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    const stats = store.calcStats(room);
    const reveal = revealAnswer !== false;
    room.state = 'showing';
    room.revealAnswer = reveal;
    await store.nextEventSeq(room);
    await store.saveRoom(room);
    res.json({ type: 'question-ended', questionIndex: room.currentQuestion, correctAnswer: reveal ? room.questions[room.currentQuestion]?.correctAnswer : -1, revealAnswer: reveal, stats, seq: room.eventSeq });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.post('/api/reset-question', async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    const idx = room.currentQuestion;
    if (idx < 0) return res.json(fail('没有正在进行的题目'));
    Object.values(room.students).forEach((s) => { if (s.answers) s.answers[idx] = undefined; });
    room.state = 'answering';
    room.revealAnswer = false;
    await store.nextEventSeq(room);
    await store.saveRoom(room);
    res.json({ type: 'question-reset', questionIndex: idx, data: { title: room.questions[idx].title, options: room.questions[idx].options, timeLimit: room.questions[idx].timeLimit }, stats: store.calcStats(room), seq: room.eventSeq });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

app.get('/api/poll', async (req, res) => {
  try {
    const roomId = req.query.roomId;
    const studentId = req.query.studentId;
    const forRole = req.query.for || 'student';
    if (!roomId) return res.json(fail('缺少 roomId'));
    const room = await store.getRoom(roomId);
    if (!room) return res.json({ type: 'room-closed' });
    const q = room.currentQuestion >= 0 ? room.questions[room.currentQuestion] : null;
    const stats = room.state !== 'waiting' ? store.calcStats(room) : null;
    const studentList = Object.entries(room.students).map(([id, s]) => ({ id, name: s.name }));
    res.json({
      type: 'poll-update', roomId: room.id, state: room.state, currentQuestion: room.currentQuestion,
      question: q ? { index: room.currentQuestion, title: q.title, options: q.options, correctAnswer: (forRole === 'teacher' || room.revealAnswer) ? q.correctAnswer : -1, timeLimit: q.timeLimit } : null,
      stats, studentCount: Object.keys(room.students).length,
      studentList: forRole === 'teacher' ? studentList : undefined, seq: room.eventSeq,
    });
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
});

// ================= 数据备份（数据无价） =================
// 导出完整数据：浏览器直接下载带时间戳的 JSON 文件
app.get('/api/backup/export', (req, res) => {
  try {
    const data = store.exportAll();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="classroom-backup-${ts}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (e) { res.status(500).json(fail('导出失败: ' + e.message)); }
});

// 云端创建快照（保存在持久卷 backups/，防服务器误删）
app.post('/api/backup/snapshot', (req, res) => {
  try {
    const name = store.snapshot();
    res.json({ ok: true, name });
  } catch (e) { res.status(500).json(fail('快照失败: ' + e.message)); }
});

// 列出云端快照
app.get('/api/backup/snapshots', (req, res) => {
  try { res.json(store.listSnapshots()); } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});

// 从快照恢复（覆盖当前数据，不可撤销）
app.post('/api/backup/restore', (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json(fail('缺少快照名'));
    const ok = store.restoreSnapshot(name);
    if (!ok) return res.status(404).json(fail('快照不存在'));
    res.json({ ok: true });
  } catch (e) { res.status(500).json(fail('恢复失败: ' + e.message)); }
});

// ================= 间隔记忆（SRS） =================
// 开启记忆模式：把指定题目加入该学生的记忆计划
app.post('/api/memory/enable', (req, res) => {
  try {
    const { studentKey, qids } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    if (!Array.isArray(qids) || !qids.length) return res.status(400).json(fail('请选择要加入的题目'));
    const added = store.enableMemory(studentKey, qids);
    res.json({ added, stats: store.getMemoryStats(studentKey) });
  } catch (e) { res.status(500).json(fail('开启失败: ' + e.message)); }
});

// 今日到期题目 + 统计（不含答案）
app.get('/api/memory/due', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json(fail('缺少学生标识'));
    const now = req.query.now ? Number(req.query.now) : Date.now();
    res.json({ questions: store.getMemoryDue(key, now), stats: store.getMemoryStats(key) });
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});

app.get('/api/memory/stats', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json(fail('缺少学生标识'));
    res.json(store.getMemoryStats(key));
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});

// 提交记忆复习（逐题更新间隔）
app.post('/api/memory/review', (req, res) => {
  try {
    const { studentKey, answers } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const r = store.reviewMemory(studentKey, answers);
    if (r.error) return res.status(400).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('提交失败: ' + e.message)); }
});

// ================= 注册 / 登录（邮箱 + 密码） =================
app.post('/api/register', (req, res) => {
  try {
    const r = store.registerStudent(req.body || {});
    if (r.error) return res.status(400).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('注册失败: ' + e.message)); }
});

app.post('/api/login', (req, res) => {
  try {
    const r = store.loginStudent(req.body || {});
    if (r.error) return res.status(400).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('登录失败: ' + e.message)); }
});

// 教师重置学生密码
app.post('/api/students/:email/password', (req, res) => {
  try {
    const r = store.resetStudentPassword({ email: req.params.email, password: (req.body || {}).password });
    if (r.error) return res.status(400).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('重置失败: ' + e.message)); }
});

// ================= 复习提醒（邮件） =================
// SMTP 配置通过环境变量注入（云托管控制台设置）：
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / APP_URL / REMINDER_HOUR / AUTO_REMINDER
function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function buildReminderMail(recip) {
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const titles = recip.due.slice(0, 15).map((q, i) => `${i + 1}. ${escHtml(q.title)}`).join('<br>');
  const more = recip.due.length > 15 ? `<br>…还有 ${recip.due.length - 15} 题` : '';
  const subject = `【复习提醒】${escHtml(recip.name)}，今日有 ${recip.stats.due} 道题待复习`;
  const html = `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:560px;margin:auto;color:#1e293b">
    <h2 style="color:#4f46e5">嗨 ${escHtml(recip.name)}，该复习啦</h2>
    <p>你今天有 <b>${recip.stats.due}</b> 道题到了复习时间。坚持按遗忘曲线复习，记忆更牢固。</p>
    ${appUrl ? `<p><a href="${appUrl}/student.html#memory" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600">去完成今日复习 →</a></p>` : '<p>请打开系统「记忆模式」完成今日复习。</p>'}
    <h3 style="font-size:15px;margin-top:18px">今日待复习（共 ${recip.due.length} 题）</h3>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;font-size:14px;line-height:1.8">${titles}${more}</div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
    <p style="font-size:14px;color:#334155">复习概况：学习中 <b>${recip.stats.learning}</b> 题，已掌握 <b>${recip.stats.mastered}</b> 题。还有 <b>${recip.stats.total - recip.stats.mastered}</b> 题尚未复习到（未掌握），请持续巩固。</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:14px">本邮件由课堂答题系统自动发送。若已完成复习可忽略。</p>
  </div>`;
  return { subject, html };
}

// 群发今日复习提醒邮件；未配置 SMTP 时返回 configured:false 而不报错。
async function sendReminderEmails() {
  if (!smtpConfigured()) {
    return { configured: false, sent: 0, failed: 0, message: '邮件服务未配置（请在环境变量设置 SMTP_HOST / SMTP_USER / SMTP_PASS）' };
  }
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const recipients = store.getReminderRecipients();
  let sent = 0, failed = 0;
  const errors = [];
  for (const r of recipients) {
    try {
      const mail = buildReminderMail(r);
      await transporter.sendMail({ from, to: r.email, subject: mail.subject, html: mail.html });
      sent++;
    } catch (e) { failed++; errors.push(r.email + ': ' + e.message); }
  }
  return { configured: true, sent, failed, errors: errors.slice(0, 5) };
}

// 教师端预览：返回今日需提醒的学生名单 + SMTP 是否已配置
app.get('/api/reminder/preview', (req, res) => {
  try {
    const configured = smtpConfigured();
    const recipients = store.getReminderRecipients();
    res.json({
      configured,
      count: recipients.length,
      recipients: recipients.map((r) => ({
        name: r.name, email: r.email,
        due: r.stats.due, learning: r.stats.learning, mastered: r.stats.mastered, total: r.stats.total,
      })),
    });
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});

// 教师端手动群发
app.post('/api/reminder/send', async (req, res) => {
  try {
    const r = await sendReminderEmails();
    res.json(r);
  } catch (e) { res.status(500).json(fail('发送失败: ' + e.message)); }
});

// ========== 每日自动提醒调度 ==========
// 仅当 AUTO_REMINDER=1 且 SMTP 已配置时启动；每天在 REMINDER_HOUR（默认 9 点）触发一次群发。
if (process.env.AUTO_REMINDER === '1' && smtpConfigured()) {
  const REMINDER_HOUR = parseInt(process.env.REMINDER_HOUR || '9', 10);
  let lastSentDate = '';
  setInterval(() => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    if (now.getHours() === REMINDER_HOUR && dateStr !== lastSentDate) {
      lastSentDate = dateStr;
      sendReminderEmails()
        .then((r) => console.log('[reminder] 自动发送完成', JSON.stringify(r)))
        .catch((e) => console.error('[reminder] 自动发送失败', e.message));
    }
  }, 60 * 1000);
}

// ================= 课程模块 =================
app.get('/api/courses', (req, res) => res.json(store.listCourses()));
app.get('/api/courses/:id', (req, res) => {
  const c = store.getCourse(req.params.id);
  if (!c) return res.status(404).json(fail('课程不存在'));
  res.json(c);
});
app.post('/api/courses', (req, res) => {
  try { res.json(store.createCourse(req.body || {})); } catch (e) { res.status(500).json(fail('创建失败: ' + e.message)); }
});
app.put('/api/courses/:id', (req, res) => {
  try { const c = store.updateCourse(req.params.id, req.body || {}); if (!c) return res.status(404).json(fail('课程不存在')); res.json(c); } catch (e) { res.status(500).json(fail('更新失败: ' + e.message)); }
});
app.delete('/api/courses/:id', (req, res) => {
  try { store.deleteCourse(req.params.id); res.json({ deleted: true }); } catch (e) { res.status(500).json(fail('删除失败: ' + e.message)); }
});
app.post('/api/courses/:id/chapters', (req, res) => {
  try { const ch = store.addChapter(req.params.id, req.body || {}); if (!ch) return res.status(404).json(fail('课程不存在')); res.json(ch); } catch (e) { res.status(500).json(fail('添加章节失败: ' + e.message)); }
});
app.put('/api/courses/:id/chapters/:chId', (req, res) => {
  try { const ch = store.updateChapter(req.params.id, req.params.chId, req.body || {}); if (!ch) return res.status(404).json(fail('章节不存在')); res.json(ch); } catch (e) { res.status(500).json(fail('更新失败: ' + e.message)); }
});
app.delete('/api/courses/:id/chapters/:chId', (req, res) => {
  try { const ok = store.deleteChapter(req.params.id, req.params.chId); if (!ok) return res.status(404).json(fail('章节不存在')); res.json({ deleted: true }); } catch (e) { res.status(500).json(fail('删除失败: ' + e.message)); }
});
app.post('/api/courses/:id/chapters/:chId/lessons', (req, res) => {
  try { const ls = store.addLesson(req.params.id, req.params.chId, req.body || {}); if (!ls) return res.status(404).json(fail('章节不存在')); res.json(ls); } catch (e) { res.status(500).json(fail('添加课时失败: ' + e.message)); }
});
app.put('/api/courses/:id/chapters/:chId/lessons/:lsId', (req, res) => {
  try { const ls = store.updateLesson(req.params.id, req.params.chId, req.params.lsId, req.body || {}); if (!ls) return res.status(404).json(fail('课时不存在')); res.json(ls); } catch (e) { res.status(500).json(fail('更新失败: ' + e.message)); }
});
app.delete('/api/courses/:id/chapters/:chId/lessons/:lsId', (req, res) => {
  try { const ok = store.deleteLesson(req.params.id, req.params.chId, req.params.lsId); if (!ok) return res.status(404).json(fail('课时不存在')); res.json({ deleted: true }); } catch (e) { res.status(500).json(fail('删除失败: ' + e.message)); }
});
// 学生课程进度
app.get('/api/student/courses', (req, res) => {
  const key = req.query.key; if (!key) return res.status(400).json(fail('缺少学生标识'));
  res.json(store.getStudentCourses(key));
});
app.post('/api/courses/:id/lessons/:lsId/done', (req, res) => {
  try {
    const { studentKey, done } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const r = store.setLessonDone(studentKey, req.params.id, req.params.lsId, done !== false);
    res.json(r);
  } catch (e) { res.status(500).json(fail('操作失败: ' + e.message)); }
});
// 学生单课进度（含已完成的课时 id 列表）
app.get('/api/courses/:id/progress', (req, res) => {
  const key = req.query.key; if (!key) return res.status(400).json(fail('缺少学生标识'));
  const c = store.getCourse(req.params.id); if (!c) return res.status(404).json(fail('课程不存在'));
  res.json(store.getCourseProgress(key, req.params.id));
});

// ================= 早读模块 =================
app.get('/api/morning', (req, res) => {
  const { scope, ownerKey } = req.query;
  res.json(store.listMorningReadings({ scope, ownerKey }));
});
app.post('/api/morning', (req, res) => {
  try {
    const { ownerType, ownerKey, title, content } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json(fail('请填写早读标题'));
    res.json(store.createMorningReading({ ownerType, ownerKey, title, content }));
  } catch (e) { res.status(500).json(fail('创建失败: ' + e.message)); }
});
app.put('/api/morning/:id', (req, res) => {
  try { const m = store.updateMorningReading(req.params.id, req.body || {}); if (!m) return res.status(404).json(fail('早读不存在')); res.json(m); } catch (e) { res.status(500).json(fail('更新失败: ' + e.message)); }
});
app.delete('/api/morning/:id', (req, res) => {
  try { store.deleteMorningReading(req.params.id); res.json({ deleted: true }); } catch (e) { res.status(500).json(fail('删除失败: ' + e.message)); }
});
// 老师一键推送给全体学生
app.post('/api/morning/:id/push', (req, res) => {
  try { const m = store.pushMorningReading(req.params.id); if (!m) return res.status(404).json(fail('早读不存在')); res.json(m); } catch (e) { res.status(500).json(fail('推送失败: ' + e.message)); }
});
// 学生今日早读清单 + 打卡状态
app.get('/api/morning/today', (req, res) => {
  const { key, date } = req.query; if (!key) return res.status(400).json(fail('缺少学生标识'));
  const d = date || new Date().toISOString().slice(0, 10);
  res.json(store.getTodayMorning(key, d));
});
app.post('/api/morning/checkin', (req, res) => {
  try {
    const { studentKey, date, readingIds, done } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const d = date || new Date().toISOString().slice(0, 10);
    res.json(store.checkInMorning(studentKey, d, readingIds || [], done !== false));
  } catch (e) { res.status(500).json(fail('打卡失败: ' + e.message)); }
});
// 老师打卡统计（已/未打卡名单）
app.get('/api/morning/checkin/stats', (req, res) => {
  const d = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(store.getMorningCheckinStats(d));
});
// 早读作业（老师布置）
app.post('/api/morning/homework', (req, res) => {
  try { res.json(store.createMorningHomework(req.body || {})); } catch (e) { res.status(500).json(fail('布置失败: ' + e.message)); }
});
app.get('/api/morning/homework', (req, res) => {
  const d = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(store.getMorningHomeworkByDate(d));
});
app.post('/api/morning/homework/:id/submit', (req, res) => {
  try {
    const { studentKey, studentName, answers } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const r = store.submitMorningHomework({ homeworkId: req.params.id, studentKey, studentName, answers });
    if (r.error) return res.status(404).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('提交失败: ' + e.message)); }
});

// ================= 早读间隔记忆（艾宾浩斯） =================
app.post('/api/morning/memory/enable', (req, res) => {
  try {
    const { studentKey, mrids } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    if (!Array.isArray(mrids) || !mrids.length) return res.status(400).json(fail('请选择要加入的早读'));
    const added = store.enableMrMemory(studentKey, mrids);
    res.json({ added, stats: store.getMrStats(studentKey) });
  } catch (e) { res.status(500).json(fail('开启失败: ' + e.message)); }
});
app.get('/api/morning/memory/due', (req, res) => {
  try {
    const key = req.query.key; if (!key) return res.status(400).json(fail('缺少学生标识'));
    const now = req.query.now ? Number(req.query.now) : Date.now();
    res.json({ items: store.getMrDue(key, now), stats: store.getMrStats(key) });
  } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});
app.get('/api/morning/memory/stats', (req, res) => {
  try { const key = req.query.key; if (!key) return res.status(400).json(fail('缺少学生标识')); res.json(store.getMrStats(key)); } catch (e) { res.status(500).json(fail('读取失败: ' + e.message)); }
});
// 早读记忆卡（含到期时间，用于日程表）
app.get('/api/morning/memory/cards', (req, res) => {
  const key = req.query.key; if (!key) return res.status(400).json(fail('缺少学生标识'));
  const stu = store.getStudent(key); if (!stu || !stu.mrMemory) return res.json([]);
  const out = Object.keys(stu.mrMemory).map((mrid) => {
    const c = stu.mrMemory[mrid]; const m = store.getMorningReading(mrid);
    return { itemId: mrid, title: m ? m.title : '', content: m ? m.content : '', due: c.due, level: c.level };
  });
  res.json(out);
});
app.post('/api/morning/memory/review', (req, res) => {
  try {
    const { studentKey, results } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const r = store.reviewMr(studentKey, results);
    if (r.error) return res.status(400).json(fail(r.error));
    res.json(r);
  } catch (e) { res.status(500).json(fail('提交失败: ' + e.message)); }
});

// ================= 仪表盘 =================
app.get('/api/dashboard/student', (req, res) => {
  const key = req.query.key; if (!key) return res.status(400).json(fail('缺少学生标识'));
  res.json(store.studentDashboard(key));
});
app.get('/api/dashboard/teacher', (req, res) => res.json(store.teacherDashboard()));

// ========== 启动 ==========
const port = parseInt(process.env.PORT, 10) || 80;
app.listen(port, () => console.log(`在线答题系统 running on port ${port}`));
