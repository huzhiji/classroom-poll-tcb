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
    const { studentKey, studentName, answers } = req.body || {};
    if (!studentKey) return res.status(400).json(fail('缺少学生标识'));
    const result = store.submitExam({ examId: req.params.id, studentKey, studentName, answers });
    if (result.error) return res.status(404).json(fail(result.error));
    res.json(result);
  } catch (e) { res.status(500).json(fail('服务器错误: ' + e.message)); }
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

// ========== 启动 ==========
const port = parseInt(process.env.PORT, 10) || 80;
app.listen(port, () => console.log(`在线答题系统 running on port ${port}`));
