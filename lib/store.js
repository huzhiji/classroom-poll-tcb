// 在线答题系统 - 统一持久化存储层（零外部依赖）
//
// 设计说明：
// - 所有数据（题目库 / 考试 / 学生记录与错题 / 课堂房间）保存在内存对象 db 中，
//   并防抖落盘到 /data/store.json（腾讯云托管挂载持久卷到 /data 时自动持久化；
//   没挂载也照常运行，只是容器重启/重新部署后数据清空）。
// - 不依赖任何云数据库 SDK，Docker 构建只需安装 express，绝不会因外网/凭证卡住。
// - 部署时务必将云托管实例数固定为 1（最小=最大=1），避免多副本间数据不一致。

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// ========== 内存数据库 ==========
let db = {
  questions: [], // {id, type:'choice'|'judge', title, options:[], correctAnswer:int, analysis, topic, createdAt}
  exams: [],     // {id, title, mode:'exam'|'topic', questionIds:[], createdAt}
  students: {},  // key -> {name, wrong:[qid...], history:[{refType,refId,refTitle,date,total,correct,details:[{qid,selected,correctAnswer,isCorrect}]}]}
  rooms: {},     // 课堂房间（保留原有逻辑）
  meta: { qSeq: 0, eSeq: 0 },
};

// ========== 磁盘持久化 ==========
function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const obj = JSON.parse(raw);
      // 合并，保证新增字段有默认值
      db.questions = obj.questions || [];
      db.exams = obj.exams || [];
      db.students = obj.students || {};
      db.rooms = obj.rooms || {};
      db.meta = obj.meta || { qSeq: 0, eSeq: 0 };
      console.log(`[store] 已从磁盘恢复：题目${db.questions.length} 考试${db.exams.length} 学生${Object.keys(db.students).length} 房间${Object.keys(db.rooms).length}`);
    }
  } catch (e) {
    console.warn('[store] 磁盘恢复失败，使用空库:', e.message);
  }
}

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(db));
    } catch (e) {
      // 忽略落盘失败（例如无可写卷），内存仍正常工作
    }
  }, 300);
}

loadFromDisk();

// ========== 工具 ==========
function nowId(prefix, seqKey) {
  db.meta[seqKey] = (db.meta[seqKey] || 0) + 1;
  persist();
  return prefix + db.meta[seqKey];
}

function normalizeAnswer(type, raw) {
  // 把各种答案写法归一为选项索引
  if (raw === undefined || raw === null || raw === '') return -1;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().toUpperCase();
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  // A/B/C/D
  const letter = s.replace(/[^A-Z]/g, '');
  if (letter.length === 1) return letter.charCodeAt(0) - 65;
  // 判断题 对/错
  if (s.includes('对') || s === 'T' || s === 'TRUE' || s === '√') return 0;
  if (s.includes('错') || s === 'F' || s === 'FALSE' || s === '×') return 1;
  return -1;
}

// ========== 题目管理 ==========
function listQuestions(filter = {}) {
  let list = db.questions.slice();
  if (filter.type) list = list.filter((q) => q.type === filter.type);
  if (filter.topic) list = list.filter((q) => q.topic === filter.topic);
  return list;
}

function getQuestion(id) {
  return db.questions.find((q) => q.id === id) || null;
}

function addQuestion(input) {
  const type = input.type === 'judge' ? 'judge' : 'choice';
  let options;
  if (Array.isArray(input.options) && input.options.length) {
    options = input.options.map((o) => String(o));
  } else if (type === 'judge') {
    options = ['对', '错'];
  } else {
    options = ['A', 'B', 'C', 'D'];
  }
  const q = {
    id: nowId('q', 'qSeq'),
    type,
    title: String(input.title || '').trim(),
    options,
    correctAnswer: normalizeAnswer(type, input.correctAnswer),
    analysis: String(input.analysis || '').trim(),
    topic: String(input.topic || '未分类').trim(),
    createdAt: Date.now(),
  };
  db.questions.push(q);
  persist();
  return q;
}

function addQuestionsBatch(arr) {
  const created = [];
  (arr || []).forEach((it) => {
    const q = addQuestion(it);
    if (q.title) created.push(q);
  });
  return created;
}

// 简易文本批量导入：题与题之间用空行分隔，每行 "字段：内容"
// 支持字段：题目 / 选项 / 答案 / 解析 / 专题 ；选择题答案支持 A/B/C/D，判断题支持 对/错
function parseQuestionsText(text) {
  if (!text) return [];
  let items = [];
  try {
    const asJson = JSON.parse(text);
    if (Array.isArray(asJson)) return asJson; // 直接是 JSON 数组
  } catch (e) { /* 不是 JSON，按文本解析 */ }

  const blocks = text.split(/\n\s*\n|(?:\r?\n)-{3,}(?:\r?\n)/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const item = { type: 'choice', title: '', options: [], correctAnswer: -1, analysis: '', topic: '未分类' };
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*(题目|题干|选项|答案|解析|专题|类型)\s*[:：]\s*(.*)$/);
      if (!m) continue;
      const field = m[1];
      const val = m[2].trim();
      if (field === '题目' || field === '题干') item.title = val;
      else if (field === '解析') item.analysis = val;
      else if (field === '专题') item.topic = val || '未分类';
      else if (field === '类型') item.type = val.includes('判断') ? 'judge' : 'choice';
      else if (field === '答案') {
        // 判断题
        if (/对|错|√|×|T|F/.test(val) && !/[A-D]/.test(val)) {
          item.type = 'judge';
          item.correctAnswer = normalizeAnswer('judge', val);
        } else {
          item.correctAnswer = normalizeAnswer('choice', val);
        }
      } else if (field === '选项') {
        // 支持 "A.xxx B.yyy" 或 "A、xxx B、yyy" 或 "xxx|yzz"
        let opts = [];
        const seg1 = val.split(/\s+(?=[A-D][.．、])/); // 按 "A." 切分
        if (seg1.length > 1) {
          opts = seg1.map((s) => s.replace(/^[A-D][.．、]\s*/, '').trim()).filter(Boolean);
        } else if (val.includes('|')) {
          opts = val.split('|').map((s) => s.trim()).filter(Boolean);
        } else {
          opts = [val];
        }
        if (opts.length) {
          item.options = opts;
          item.type = opts.length === 2 ? 'judge' : 'choice';
        }
      }
    }
    if (item.title) items.push(item);
  }
  return items;
}

function updateQuestion(id, patch) {
  const q = getQuestion(id);
  if (!q) return null;
  if (patch.title !== undefined) q.title = String(patch.title).trim();
  if (patch.analysis !== undefined) q.analysis = String(patch.analysis).trim();
  if (patch.topic !== undefined) q.topic = String(patch.topic).trim();
  if (patch.options !== undefined && Array.isArray(patch.options) && patch.options.length) {
    q.options = patch.options.map((o) => String(o));
  }
  if (patch.correctAnswer !== undefined) q.correctAnswer = normalizeAnswer(q.type, patch.correctAnswer);
  if (patch.type !== undefined) q.type = patch.type === 'judge' ? 'judge' : 'choice';
  persist();
  return q;
}

function deleteQuestion(id) {
  const before = db.questions.length;
  db.questions = db.questions.filter((q) => q.id !== id);
  // 从考试中移除引用
  db.exams.forEach((e) => { e.questionIds = (e.questionIds || []).filter((qid) => qid !== id); });
  persist();
  return db.questions.length < before;
}

function topics() {
  const set = new Set(db.questions.map((q) => q.topic).filter(Boolean));
  return Array.from(set);
}

// ========== 考试 / 专题 ==========
function listExams() {
  return db.exams.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function getExam(id) {
  return db.exams.find((e) => e.id === id) || null;
}

// 返回考试题目（学生答题用，含题目但隐藏答案与解析）
function getExamQuestions(id) {
  const exam = getExam(id);
  if (!exam) return null;
  const qs = (exam.questionIds || []).map((qid) => getQuestion(qid)).filter(Boolean);
  return { id: exam.id, title: exam.title, mode: exam.mode, questions: qs.map((q) => ({
    id: q.id, type: q.type, title: q.title, options: q.options,
  })) };
}

function createExam(input) {
  let questionIds = (input.questionIds || []).filter((qid) => getQuestion(qid));
  if (!questionIds.length && Array.isArray(input.questions)) {
    // 允许直接带题创建（自动入库）
    const created = addQuestionsBatch(input.questions);
    questionIds = created.map((q) => q.id);
  }
  const exam = {
    id: nowId('e', 'eSeq'),
    title: String(input.title || '未命名考试').trim(),
    mode: input.mode === 'topic' ? 'topic' : 'exam',
    questionIds,
    createdAt: Date.now(),
  };
  db.exams.push(exam);
  persist();
  return exam;
}

function deleteExam(id) {
  const before = db.exams.length;
  db.exams = db.exams.filter((e) => e.id !== id);
  persist();
  return db.exams.length < before;
}

// 提交考试答卷：评分 + 记录 + 收集错题
function submitExam({ examId, studentKey, studentName, answers }) {
  const exam = getExam(examId);
  if (!exam) return { error: '考试不存在' };
  const qs = (exam.questionIds || []).map((qid) => getQuestion(qid)).filter(Boolean);
  const ansMap = answers || {};
  let correct = 0;
  const details = qs.map((q) => {
    const selected = ansMap[q.id];
    const isCorrect = selected !== undefined && Number(selected) === q.correctAnswer;
    if (isCorrect) correct++;
    return { qid: q.id, selected, correctAnswer: q.correctAnswer, isCorrect };
  });
  const total = qs.length;
  const stu = ensureStudent(studentKey, studentName);
  // 收集错题（答错的题加入错题库，去重）
  const wrongAdded = [];
  details.forEach((d) => {
    if (!d.isCorrect && !stu.wrong.includes(d.qid)) {
      stu.wrong.push(d.qid);
      wrongAdded.push(d.qid);
    }
  });
  stu.history.push({
    refType: 'exam',
    refId: exam.id,
    refTitle: exam.title,
    date: Date.now(),
    total,
    correct,
    details,
  });
  persist();
  // 返回结果（含正确答案与解析供学生查看）
  return {
    examId,
    total,
    correct,
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    wrongAdded,
    details: qs.map((q, i) => ({
      id: q.id,
      type: q.type,
      title: q.title,
      options: q.options,
      selected: details[i].selected,
      correctAnswer: q.correctAnswer,
      isCorrect: details[i].isCorrect,
      analysis: q.analysis,
    })),
  };
}

// ========== 学生 & 错题 ==========
function ensureStudent(key, name) {
  key = String(key || '').trim();
  if (!key) key = '匿名';
  if (!db.students[key]) {
    db.students[key] = { name: name || key, wrong: [], history: [] };
  } else if (name && db.students[key].name !== name) {
    db.students[key].name = name;
  }
  return db.students[key];
}

function getStudent(key) {
  return db.students[String(key)] || null;
}

function getStudentRecords(key) {
  const stu = getStudent(key);
  if (!stu) return [];
  return (stu.history || []).slice().sort((a, b) => b.date - a.date);
}

function getStudentStats(key) {
  const stu = getStudent(key);
  if (!stu) return { overall: { total: 0, correct: 0, percent: 0 }, byTopic: {}, examCount: 0, wrongCount: 0 };
  let total = 0, correct = 0;
  const byTopic = {};
  (stu.history || []).forEach((h) => {
    if (h.refType === 'exam') {
      total += h.total;
      correct += h.correct;
      (h.details || []).forEach((d) => {
        const q = getQuestion(d.qid);
        const topic = q ? q.topic : '未知';
        if (!byTopic[topic]) byTopic[topic] = { total: 0, correct: 0 };
        byTopic[topic].total++;
        if (d.isCorrect) byTopic[topic].correct++;
      });
    }
  });
  Object.keys(byTopic).forEach((t) => {
    const b = byTopic[t];
    b.percent = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
  });
  return {
    overall: { total, correct, percent: total > 0 ? Math.round((correct / total) * 100) : 0 },
    byTopic,
    examCount: (stu.history || []).filter((h) => h.refType === 'exam').length,
    wrongCount: (stu.wrong || []).length,
  };
}

function getWrongQuestions(key) {
  const stu = getStudent(key);
  if (!stu) return [];
  return (stu.wrong || [])
    .map((qid) => getQuestion(qid))
    .filter(Boolean)
    .map((q) => ({
      id: q.id, type: q.type, title: q.title, options: q.options,
      correctAnswer: q.correctAnswer, analysis: q.analysis, topic: q.topic,
    }));
}

function removeWrong(key, qid) {
  const stu = getStudent(key);
  if (!stu) return false;
  const before = stu.wrong.length;
  stu.wrong = stu.wrong.filter((x) => x !== qid);
  persist();
  return stu.wrong.length < before;
}

// 错题练习：从错题库随机抽取 count 题（默认全部）
function getWrongPractice(key, count) {
  const wrong = getWrongQuestions(key);
  if (!wrong.length) return [];
  const pool = wrong.slice();
  // 洗牌
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = count > 0 ? Math.min(count, pool.length) : pool.length;
  // 返回不含答案
  return pool.slice(0, n).map((q) => ({ id: q.id, type: q.type, title: q.title, options: q.options, topic: q.topic }));
}

// 提交错题练习：答对的题从错题库移除（视为已掌握）
function submitWrongPractice({ studentKey, answers }) {
  const stu = getStudent(studentKey);
  if (!stu) return { error: '学生不存在' };
  const ansMap = answers || {};
  const results = (stu.wrong || []).map((qid) => {
    const q = getQuestion(qid);
    if (!q) return { qid, removed: true };
    const selected = ansMap[qid];
    const isCorrect = selected !== undefined && Number(selected) === q.correctAnswer;
    return { qid, isCorrect, removed: isCorrect };
  });
  const removed = results.filter((r) => r.removed).map((r) => r.qid);
  stu.wrong = stu.wrong.filter((qid) => !removed.includes(qid));
  // 也记录一次练习历史
  stu.history.push({
    refType: 'wrong',
    refId: 'wrong-' + Date.now(),
    refTitle: '错题练习',
    date: Date.now(),
    total: results.length,
    correct: results.filter((r) => r.isCorrect).length,
    details: removed.map((qid) => ({ qid, isCorrect: true, correctAnswer: getQuestion(qid) ? getQuestion(qid).correctAnswer : -1, selected: getQuestion(qid) ? getQuestion(qid).correctAnswer : -1 })),
  });
  persist();
  return {
    total: results.length,
    correct: results.filter((r) => r.isCorrect).length,
    removed,
    details: results.map((r) => {
      const q = getQuestion(r.qid);
      return { id: r.qid, title: q ? q.title : '', isCorrect: r.isCorrect, correctAnswer: q ? q.correctAnswer : -1, options: q ? q.options : [] };
    }),
  };
}

// ========== 课堂房间（保留并接入统一存储） ==========
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomId() {
  let id = '';
  for (let i = 0; i < 4; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)];
  return id;
}
async function createRoom(roomId) {
  if (db.rooms[roomId]) return null;
  const room = {
    id: roomId, questions: [], currentQuestion: -1, state: 'waiting',
    students: {}, eventSeq: 0, revealAnswer: false, createdAt: Date.now(),
  };
  db.rooms[roomId] = room;
  persist();
  return room;
}
async function getRoom(roomId) {
  const doc = db.rooms[roomId];
  if (!doc) return null;
  if (doc.students === undefined) doc.students = {};
  if (doc.revealAnswer === undefined) doc.revealAnswer = false;
  return doc;
}
async function saveRoom(room) {
  db.rooms[room.id] = room;
  persist();
}
async function deleteRoom(roomId) {
  delete db.rooms[roomId];
  persist();
}
async function nextEventSeq(room) {
  room.eventSeq++;
  return room.eventSeq;
}

// 课堂答题也记入学生记录（可选累积正确率）
function recordRoomAnswer(room, studentId, questionIndex, isCorrect) {
  const stu = room.students[studentId];
  if (!stu) return;
  const key = 'room_' + room.id;
  if (!stu.records) stu.records = {};
  if (!stu.records[key]) stu.records[key] = { total: 0, correct: 0 };
  stu.records[key].total++;
  if (isCorrect) stu.records[key].correct++;
}

function calcStats(room) {
  const q = room.questions[room.currentQuestion];
  if (!q) return null;
  const total = q.options.length;
  const counts = new Array(total).fill(0);
  let answered = 0;
  Object.values(room.students).forEach((s) => {
    if (s.answers && s.answers[room.currentQuestion] !== undefined) {
      const ans = s.answers[room.currentQuestion];
      if (ans >= 0 && ans < total) { counts[ans]++; answered++; }
    }
  });
  const percentages = counts.map((c) => (answered > 0 ? Math.round((c / answered) * 100) : 0));
  return { questionIndex: room.currentQuestion, totalStudents: Object.keys(room.students).length, answered, counts, percentages, correctAnswer: q.correctAnswer };
}
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
  return { correct, total, percent: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

// ========== 数据备份 / 快照（数据无价） ==========
// 返回完整数据的可序列化副本
function exportAll() {
  return JSON.parse(JSON.stringify(db));
}

function snapshotDir() {
  return path.join(DATA_DIR, 'backups');
}

// 在持久卷创建带时间戳的完整快照，返回快照文件名
function snapshot() {
  const dir = snapshotDir();
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const name = `store-${ts}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify(db));
  return name;
}

// 列出已有快照（按时间倒序）
function listSnapshots() {
  try {
    const dir = snapshotDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.startsWith('store-') && f.endsWith('.json'))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    return [];
  }
}

// 从指定快照恢复数据（覆盖当前内存与落盘）
function restoreSnapshot(name) {
  try {
    const file = path.join(snapshotDir(), name);
    if (!fs.existsSync(file)) return false;
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.questions = obj.questions || [];
    db.exams = obj.exams || [];
    db.students = obj.students || {};
    db.rooms = obj.rooms || {};
    db.meta = obj.meta || { qSeq: 0, eSeq: 0 };
    persist();
    return true;
  } catch (e) {
    console.warn('[store] 恢复失败:', e.message);
    return false;
  }
}

module.exports = {
  // 题目
  listQuestions, getQuestion, addQuestion, addQuestionsBatch, parseQuestionsText,
  updateQuestion, deleteQuestion, topics,
  // 考试
  listExams, getExam, getExamQuestions, createExam, deleteExam, submitExam,
  // 学生/错题
  ensureStudent, getStudent, getStudentRecords, getStudentStats,
  getWrongQuestions, removeWrong, getWrongPractice, submitWrongPractice,
  // 房间
  generateRoomId, createRoom, getRoom, saveRoom, deleteRoom, nextEventSeq,
  recordRoomAnswer, calcStats, calcStudentAccuracy,
  // 备份
  exportAll, snapshot, listSnapshots, restoreSnapshot,
};
