// 课堂答题系统 - 腾讯云 CloudBase Web 函数入口
// 一个 Express 应用同时托管静态前端（teacher.html / student.html）和 /api/* 接口，
// 部署后访问该函数 URL 即可直接使用，无需分开托管、无跨域问题。

const express = require('express');
const path = require('path');
const {
  generateRoomId, createRoom, getRoom, saveRoom, deleteRoom,
  nextEventSeq, calcStats, calcStudentAccuracy,
} = require('./lib/store');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ok(data) {
  return data;
}
function fail(msg, code = 400) {
  return { _error: true, code, message: msg };
}

// ========== API 路由 ==========

// POST /api/create-room
app.post('/api/create-room', async (req, res) => {
  try {
    let roomId, room;
    for (let i = 0; i < 5; i++) {
      roomId = generateRoomId();
      room = await createRoom(roomId);
      if (room) break;
    }
    if (!room) return res.status(500).json(fail('创建房间失败，请重试', 500));
    res.json({ type: 'room-created', roomId });
  } catch (e) {
    console.error('create-room error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/join-room  body: { roomId, name }
app.post('/api/join-room', async (req, res) => {
  try {
    const { roomId, name } = req.body;
    if (!roomId || !name) return res.json(fail('缺少 roomId 或 name'));

    const room = await getRoom(roomId);
    if (!room) return res.json(fail('房间不存在或已关闭'));

    const studentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    room.students[studentId] = { name: name || '匿名同学', answers: {} };
    await nextEventSeq(room);
    await saveRoom(room);

    res.json({
      type: 'joined',
      studentId,
      roomId,
      studentCount: Object.keys(room.students).length,
      seq: room.eventSeq,
    });
  } catch (e) {
    console.error('join-room error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/close-room  body: { roomId }
app.post('/api/close-room', async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));
    await deleteRoom(roomId);
    res.json({ type: 'room-closed' });
  } catch (e) {
    console.error('close-room error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/load-questions  body: { roomId, questions: [...] }
app.post('/api/load-questions', async (req, res) => {
  try {
    const { roomId, questions } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));

    const room = await getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));

    room.questions = (questions || []).map((q, i) => ({
      id: i,
      title: q.title || '',
      options: q.options || ['A', 'B', 'C', 'D'],
      correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : 0,
      timeLimit: q.timeLimit || 0,
    }));
    room.currentQuestion = -1;
    room.state = 'waiting';
    await nextEventSeq(room);
    await saveRoom(room);

    res.json({ type: 'questions-loaded', count: room.questions.length, seq: room.eventSeq });
  } catch (e) {
    console.error('load-questions error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/publish  body: { roomId, questionIndex }
app.post('/api/publish', async (req, res) => {
  try {
    const { roomId, questionIndex } = req.body;
    if (!roomId || questionIndex === undefined) return res.json(fail('缺少参数'));

    const room = await getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    if (questionIndex < 0 || questionIndex >= room.questions.length) return res.json(fail('题目不存在'));

    Object.values(room.students).forEach((s) => {
      if (s.answers) s.answers[questionIndex] = undefined;
    });

    room.currentQuestion = questionIndex;
    room.state = 'answering';
    room.revealAnswer = false;
    const q = room.questions[questionIndex];
    await nextEventSeq(room);
    await saveRoom(room);

    res.json({
      type: 'question-published',
      questionIndex,
      data: { title: q.title, options: q.options, correctAnswer: q.correctAnswer, timeLimit: q.timeLimit },
      stats: calcStats(room),
      seq: room.eventSeq,
    });
  } catch (e) {
    console.error('publish error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/submit-answer  body: { roomId, studentId, answer }
app.post('/api/submit-answer', async (req, res) => {
  try {
    const { roomId, studentId, answer } = req.body;
    if (!roomId || !studentId || answer === undefined) return res.json(fail('缺少参数'));

    const room = await getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    if (room.state !== 'answering') return res.json(fail('当前不在答题时间'));
    if (!room.students[studentId]) return res.json(fail('学生不存在'));

    room.students[studentId].answers[room.currentQuestion] = answer;
    await nextEventSeq(room);
    await saveRoom(room);

    res.json({ type: 'answer-submitted', questionIndex: room.currentQuestion, seq: room.eventSeq });
  } catch (e) {
    console.error('submit-answer error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/end-question  body: { roomId, revealAnswer }
app.post('/api/end-question', async (req, res) => {
  try {
    const { roomId, revealAnswer } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));

    const room = await getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));

    const stats = calcStats(room);
    const reveal = revealAnswer !== false;
    room.state = 'showing';
    room.revealAnswer = reveal;
    await nextEventSeq(room);
    await saveRoom(room);

    res.json({
      type: 'question-ended',
      questionIndex: room.currentQuestion,
      correctAnswer: reveal ? room.questions[room.currentQuestion]?.correctAnswer : -1,
      revealAnswer: reveal,
      stats,
      seq: room.eventSeq,
    });
  } catch (e) {
    console.error('end-question error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// POST /api/reset-question  body: { roomId }
app.post('/api/reset-question', async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.json(fail('缺少 roomId'));

    const room = await getRoom(roomId);
    if (!room) return res.json(fail('房间不存在'));
    const idx = room.currentQuestion;
    if (idx < 0) return res.json(fail('没有正在进行的题目'));

    Object.values(room.students).forEach((s) => {
      if (s.answers) s.answers[idx] = undefined;
    });
    room.state = 'answering';
    room.revealAnswer = false;
    await nextEventSeq(room);
    await saveRoom(room);

    res.json({
      type: 'question-reset',
      questionIndex: idx,
      data: {
        title: room.questions[idx].title,
        options: room.questions[idx].options,
        timeLimit: room.questions[idx].timeLimit,
      },
      stats: calcStats(room),
      seq: room.eventSeq,
    });
  } catch (e) {
    console.error('reset-question error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// GET /api/poll?roomId=X&studentId=Y&for=teacher|student&seq=N
app.get('/api/poll', async (req, res) => {
  try {
    const roomId = req.query.roomId;
    const studentId = req.query.studentId;
    const forRole = req.query.for || 'student';
    // seq 暂未用于增量推送，保留以便扩展

    if (!roomId) return res.json(fail('缺少 roomId'));

    const room = await getRoom(roomId);
    if (!room) return res.json({ type: 'room-closed' });

    const q = room.currentQuestion >= 0 ? room.questions[room.currentQuestion] : null;
    const stats = room.state !== 'waiting' ? calcStats(room) : null;
    const studentList = Object.entries(room.students).map(([id, s]) => ({ id, name: s.name }));

    const payload = {
      type: 'poll-update',
      roomId: room.id,
      state: room.state,
      currentQuestion: room.currentQuestion,
      question: q ? {
        index: room.currentQuestion,
        title: q.title,
        options: q.options,
        correctAnswer: (forRole === 'teacher' || room.revealAnswer) ? q.correctAnswer : -1,
        timeLimit: q.timeLimit,
      } : null,
      stats,
      studentCount: Object.keys(room.students).length,
      studentList: forRole === 'teacher' ? studentList : undefined,
      seq: room.eventSeq,
    };

    res.json(payload);
  } catch (e) {
    console.error('poll error', e);
    res.status(500).json(fail('服务器错误: ' + e.message, 500));
  }
});

// ========== 启动 ==========
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`课堂答题系统 running on port ${port}`);
});
