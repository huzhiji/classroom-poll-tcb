// 课堂答题系统 - 内存存储层（零外部依赖）
//
// 设计说明：
// - 房间数据保存在进程内存（Map）中，上课期间实时读写，性能最佳。
// - 同时定时落盘到 /data/rooms.json（腾讯云托管提供可写数据卷时自动持久化，
//   没有也照常运行，只是重启后数据清空——对一节课的场景完全可接受）。
// - 不依赖任何云数据库 SDK，Docker 构建只需安装 express，绝不会因外网/凭证卡住。
// - 部署时建议将云托管实例数固定为 1（最小=最大=1），避免多副本间内存不同步。

const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || '/data/rooms.json';
const rooms = new Map();

// ========== 启动时尝试从磁盘恢复 ==========
function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([id, room]) => rooms.set(id, room));
      console.log(`[store] 已从磁盘恢复 ${rooms.size} 个房间`);
    }
  } catch (e) {
    console.warn('[store] 磁盘恢复失败，使用空内存:', e.message);
  }
}

// 落盘（异步、容错，不阻塞主流程）
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj = {};
      rooms.forEach((v, k) => { obj[k] = v; });
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj));
    } catch (e) {
      // 忽略落盘失败（例如无可写卷），内存仍正常工作
    }
  }, 300);
}

loadFromDisk();

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
async function createRoom(roomId) {
  if (rooms.has(roomId)) return null;
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
  rooms.set(roomId, room);
  persist();
  return room;
}

async function getRoom(roomId) {
  const doc = rooms.get(roomId);
  if (!doc) return null;
  if (doc.students === undefined) doc.students = {};
  if (doc.revealAnswer === undefined) doc.revealAnswer = false;
  return doc;
}

async function saveRoom(room) {
  rooms.set(room.id, room);
  persist();
}

async function deleteRoom(roomId) {
  rooms.delete(roomId);
  persist();
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
