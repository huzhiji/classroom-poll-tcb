// 课堂答题系统 - 腾讯云 CloudBase 云数据库状态管理
// 免费方案：CloudBase 基础版环境（自带文档型云数据库，无需单独付费）
//
// 注意：CloudBase 云数据库是 MongoDB 风格的文档数据库，
// 与 PostgreSQL 的 SQL 写法不同，这里用 @cloudbase/node-sdk 的文档 API。

const tcb = require('@cloudbase/node-sdk');

// 环境 ID：优先用环境变量 TCB_ENV（部署时在 CloudBase 后台配置），
// 否则用占位符——真正运行时会由 CloudBase 运行时注入，不影响本地逻辑结构。
const ENV_ID = process.env.TCB_ENV || process.env.SCF_ENV || 'your-cloudbase-env-id';
const app = tcb.init({ env: ENV_ID });
const db = app.database();

const COLLECTION = 'rooms';

// ========== 房间生成 ==========
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomId() {
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}

// ========== 房间 CRUD ==========
// 文档数据库里 _id 即房间号；我们用 doc(roomId) 直接定位文档。

async function createRoom(roomId) {
  // 查重：文档不存在时 get 返回 { data: [] }
  const existing = await db.collection(COLLECTION).doc(roomId).get();
  if (existing.data && existing.data.length > 0) return null;

  const room = {
    id: roomId,
    questions: [],
    currentQuestion: -1,
    state: 'waiting',
    students: {},
    eventSeq: 0,
    revealAnswer: false,
    createdAt: Date.now(),
  };

  // 不存在则创建（覆盖式写入，文档第一次建立）
  await db.collection(COLLECTION).doc(roomId).set(room);
  return room;
}

async function getRoom(roomId) {
  const res = await db.collection(COLLECTION).doc(roomId).get();
  if (res.data && res.data.length > 0) {
    const doc = res.data[0];
    // 兼容历史数据缺字段的情况
    if (doc.students === undefined) doc.students = {};
    if (doc.revealAnswer === undefined) doc.revealAnswer = false;
    return doc;
  }
  return null;
}

async function saveRoom(room) {
  // update 只更新顶层字段；嵌套对象（students/answers）整体替换，符合我们每次全量保存的逻辑
  await db.collection(COLLECTION).doc(room.id).update({ data: room });
}

async function deleteRoom(roomId) {
  await db.collection(COLLECTION).doc(roomId).remove();
}

// ========== 事件序列 ==========
async function nextEventSeq(room) {
  room.eventSeq++;
  return room.eventSeq;
}

// ========== 统计计算 ==========
function calcStats(room) {
  const q = room.questions[room.currentQuestion];
  if (!q) return null;
  const total = q.options.length;
  const counts = new Array(total).fill(0);
  let answered = 0;
  Object.values(room.students).forEach((s) => {
    if (s.answers && s.answers[room.currentQuestion] !== undefined) {
      const ans = s.answers[room.currentQuestion];
      if (ans >= 0 && ans < total) {
        counts[ans]++;
        answered++;
      }
    }
  });
  const percentages = counts.map((c) => (answered > 0 ? Math.round((c / answered) * 100) : 0));
  return {
    questionIndex: room.currentQuestion,
    totalStudents: Object.keys(room.students).length,
    answered,
    counts,
    percentages,
    correctAnswer: q.correctAnswer,
  };
}

// ========== 学生累计正确率 ==========
function calcStudentAccuracy(room, studentId) {
  const student = room.students[studentId];
  if (!student || !student.answers) return { correct: 0, total: 0, percent: 0 };

  let correct = 0, total = 0;
  room.questions.forEach((q, idx) => {
    if (student.answers[idx] !== undefined) {
      total++;
      if (student.answers[idx] === q.correctAnswer) correct++;
    }
  });
  return {
    correct,
    total,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
  };
}

module.exports = {
  generateRoomId,
  createRoom,
  getRoom,
  saveRoom,
  deleteRoom,
  nextEventSeq,
  calcStats,
  calcStudentAccuracy,
};
