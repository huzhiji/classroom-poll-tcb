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
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// ========== 内存数据库 ==========
let db = {
  questions: [], // {id, type:'choice'|'judge', title, options:[], correctAnswer:int, analysis, topic, createdAt}
  exams: [],     // {id, title, mode:'exam'|'topic', questionIds:[], createdAt}
  students: {},  // key -> {name, wrong:[qid...], history:[...], memory:{}, mrMemory:{}, morningHomeworkDone:{}}
  rooms: {},     // 课堂房间（保留原有逻辑）
  courses: [],   // {id, title, description, cover, chapters:[{id,title,order,lessons:[{id,title,type,content,materials:[],practiceExamId,order}]}], createdAt, updatedAt}
  courseProgress: {}, // {studentKey: {courseId: {completedLessons:[], lastAccess, startedAt}}}
  morningReadings: [], // {id, ownerType:'teacher'|'student', ownerKey, title, content, createdAt, push:{mode,pushedAt,pushDate}, active}
  morningCheckins: {}, // {`studentKey::date`: {studentKey, date, readingIds:[], done, homeworkDone, ts}}
  morningHomework: [], // {id, date, title, questionIds:[], examId, dueDate, createdAt}
  drafts: {},      // {studentKey: {examId: {answers, seq, idx, count, total, createdAt, updatedAt}}}
  spWords: [],     // 规范词库 {id, cat, scene, word}（seed 自 data/spwords.json）
  lawQuestions: [], // 法律常识题库 {id,cat,section,type,title,options,correctAnswer,analysis}（seed 自 data/law_questions.json）
  lawPush: { active: false, section: '', showAnswer: true, showAnalysis: true, pushedAt: 0 },
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
      db.courses = obj.courses || [];
      db.courseProgress = obj.courseProgress || {};
      db.morningReadings = obj.morningReadings || [];
      db.morningCheckins = obj.morningCheckins || {};
      db.morningHomework = obj.morningHomework || [];
      db.drafts = obj.drafts || {};
      db.spWords = obj.spWords || [];
      db.lawQuestions = obj.lawQuestions || [];
      db.lawPush = obj.lawPush || { active: false, section: '', showAnswer: true, showAnalysis: true, pushedAt: 0 };
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
seedSpWords();
seedLawQuestions();

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

// 多项选择答案 → 索引数组（如 "ABD" → [0,1,3]）
function normalizeMultiAnswer(raw) {
  if (Array.isArray(raw)) {
    return raw.map((r) => normalizeAnswer('choice', r)).filter((i) => i >= 0);
  }
  const s = String(raw || '').trim().toUpperCase();
  const letters = s.replace(/[^A-H]/g, '');
  if (letters.length) return [...letters].map((c) => c.charCodeAt(0) - 65);
  return [];
}

// 统一判分(支持单选/多选/判断;未设答案一律判错)
function isAnswerCorrect(q, selected) {
  const has = Array.isArray(q.correctAnswer) ? q.correctAnswer.length > 0 : q.correctAnswer >= 0;
  if (!has) return false;
  if (Array.isArray(q.correctAnswer)) {
    return Array.isArray(selected) && selected.length === q.correctAnswer.length &&
      q.correctAnswer.every((i) => selected.includes(i));
  }
  return selected !== undefined && Number(selected) === q.correctAnswer;
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
  const type = input.type === 'judge' ? 'judge' : (input.type === 'multi' ? 'multi' : 'choice');
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
    correctAnswer: type === 'multi' ? normalizeMultiAnswer(input.correctAnswer) : normalizeAnswer(type, input.correctAnswer),
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
  if (patch.correctAnswer !== undefined) {
    q.correctAnswer = q.type === 'multi' ? normalizeMultiAnswer(patch.correctAnswer) : normalizeAnswer(q.type, patch.correctAnswer);
  }
  if (patch.type !== undefined) {
    q.type = patch.type === 'judge' ? 'judge' : (patch.type === 'multi' ? 'multi' : 'choice');
    if (q.type === 'multi' && !Array.isArray(q.correctAnswer)) {
      q.correctAnswer = (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0) ? [q.correctAnswer] : [];
    }
  }
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
// 题目/考试分类（按标题自动识别，保证与前端一致）
// 分类规则：
//  - 标题含「常识」→ 常识判断（含专项常识章节与常识判断真题试卷，无论 mode）
//  - 专项(topic) 其余章节 → 公共基础（宪法/刑法/行政法/民法/经济学/马原/党史等）
//  - 真题类按 选调/国考/省考 细分，其余真题归入 国省考真题
function examCategory(e) {
  const t = String((e && e.title) || '').trim();
  const mode = (e && e.mode) || '';
  // 专项题库:独立列表
  if (mode === 'topic' || t.includes('专项')) return '专项';
  // 政治理论:单独成组(已过时,仅作参考)
  if (t.includes('政治理论')) return '政治理论';
  // 常识真题:归入国省考真题下的「常识真题」子组
  if (t.includes('常识')) return '常识判断';
  if (t.includes('选调')) return '选调真题';
  if (t.includes('国家公务员') || t.includes('国考')) return '国考真题';
  if (t.includes('省考') || t.includes('公务员') || t.includes('真题')) return '省考真题';
  return '国省考真题';
}
// 顶层大类:专项 / 公共基础 各自独立;常识判断/政治理论/国考/省考/选调 统一归入 国省考真题
function examTop(cat) {
  if (cat === '专项' || cat === '公共基础') return cat;
  return '国省考真题';
}

function listExams() {
  return db.exams.slice().sort((a, b) => b.createdAt - a.createdAt)
    .map((e) => ({ ...e, category: examCategory(e) }));
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
// questionIds 可选：传入则只对这批题评分（用于「练几题」部分作答），否则对整套题评分
function submitExam({ examId, studentKey, studentName, answers, questionIds }) {
  const exam = getExam(examId);
  if (!exam) return { error: '考试不存在' };
  let qids = Array.isArray(questionIds) && questionIds.length ? questionIds : exam.questionIds;
  const qs = qids.map((qid) => getQuestion(qid)).filter(Boolean);
  const ansMap = answers || {};
  let correct = 0;
  const details = qs.map((q) => {
    const selected = ansMap[q.id];
    const isCorrect = isAnswerCorrect(q, selected);
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
  clearDraft(studentKey, examId); // 交卷后清除暂存草稿
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

// ========== 考试草稿（暂存 / 续作） ==========
function saveDraft(studentKey, examId, draft) {
  studentKey = String(studentKey || '').trim();
  examId = String(examId || '');
  if (!studentKey || !examId) return null;
  if (!db.drafts[studentKey]) db.drafts[studentKey] = {};
  db.drafts[studentKey][examId] = Object.assign({}, draft, {
    studentKey, examId, createdAt: db.drafts[studentKey][examId] ? db.drafts[studentKey][examId].createdAt : Date.now(),
    updatedAt: Date.now(),
  });
  persist();
  return db.drafts[studentKey][examId];
}
function getDraft(studentKey, examId) {
  studentKey = String(studentKey || '').trim();
  examId = String(examId || '');
  if (!db.drafts[studentKey]) return null;
  return db.drafts[studentKey][examId] || null;
}
function clearDraft(studentKey, examId) {
  studentKey = String(studentKey || '').trim();
  examId = String(examId || '');
  if (db.drafts[studentKey] && db.drafts[studentKey][examId]) {
    delete db.drafts[studentKey][examId];
    persist();
    return true;
  }
  return false;
}
// 列出某学生的全部草稿（摘要），供考试列表批量展示「继续作答」
function listDrafts(studentKey) {
  studentKey = String(studentKey || '').trim();
  const m = db.drafts[studentKey] || {};
  const out = {};
  Object.keys(m).forEach((examId) => {
    const d = m[examId];
    out[examId] = {
      count: d.count,
      total: d.total,
      answered: Object.keys(d.answers || {}).length,
      updatedAt: d.updatedAt,
    };
  });
  return out;
}

// 某学生某考试已作答的题目集合（跨多次练习合并，供"接着做"使用）
function getExamAnsweredQids(studentKey, examId) {
  const stu = getStudent(studentKey);
  const set = new Set();
  (stu ? stu.history || [] : []).forEach((h) => {
    if (h.refType === 'exam' && String(h.refId) === String(examId)) {
      (h.details || []).forEach((d) => {
        if (d && d.qid && d.selected !== undefined && !(Array.isArray(d.selected) && !d.selected.length)) {
          set.add(String(d.qid));
        }
      });
    }
  });
  return [...set];
}

// 某学生的考试完成进度（按顶层大类统计）—— 仅当该考试全部题目均已作答才算"已完成"
function getExamProgress(studentKey) {
  const stu = getStudent(studentKey);
  const answeredByExam = {};
  (stu ? stu.history || [] : []).forEach((h) => {
    if (h.refType === 'exam' && h.refId) {
      const s = answeredByExam[String(h.refId)] || (answeredByExam[String(h.refId)] = new Set());
      (h.details || []).forEach((d) => {
        if (d && d.qid && d.selected !== undefined && !(Array.isArray(d.selected) && !d.selected.length)) {
          s.add(String(d.qid));
        }
      });
    }
  });
  const doneSet = new Set();
  const byTop = {};
  db.exams.forEach((e) => {
    const top = examTop(examCategory(e));
    byTop[top] = byTop[top] || { done: 0, total: 0 };
    byTop[top].total++;
    const s = answeredByExam[String(e.id)];
    if (s && s.size >= (e.questionIds || []).length) {
      doneSet.add(String(e.id));
      byTop[top].done++;
    }
  });
  Object.keys(byTop).forEach((k) => {
    const b = byTop[k];
    b.percent = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
  });
  const answeredCounts = {};
  Object.keys(answeredByExam).forEach((k) => { answeredCounts[k] = answeredByExam[k].size; });
  return { doneExamIds: [...doneSet], byTop, answeredCounts };
}

// 解析答案文本为 [{index, answer, analysis}]；index 从 0 开始（对应套题内题号-1）
// 支持:行式 "1 A" / "1.A 解析：xxx"；区间式 "1-5 ACDBA"；纯序列 "ACDBA..."；内联 "1A 2B 3C"；独立 "解析：xxx" 附加到上一题
function parseAnswersText(text, count) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let m = line.match(/^(\d+)\s*[-~—]\s*(\d+)\s+([A-H对错√×]+)\s*(?:解析[:：]\s*(.*))?$/i);
    if (m) {
      const s = parseInt(m[1], 10), e = Math.min(parseInt(m[2], 10), count);
      const letters = [...m[3].toUpperCase()], ana = m[4] || '';
      for (let i = s; i <= e; i++) {
        out.push({ index: i - 1, answer: letters[i - s] || letters[letters.length - 1], analysis: ana });
      }
      continue;
    }
    m = line.match(/^(\d+)\s*[.、．]?\s*([A-H对错√×]+)\s*(?:解析[:：]\s*(.*))?$/i);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < count) out.push({ index: idx, answer: m[2].toUpperCase(), analysis: m[3] || '' });
      continue;
    }
    m = line.match(/^解析[:：]\s*(.*)$/);
    if (m && out.length) { out[out.length - 1].analysis = m[1]; continue; }
    const seq = line.replace(/[\s,，、;；]/g, '');
    if (/^[A-H对错√×]+$/.test(seq) && seq.length >= 2 && seq.length <= count) {
      [...seq].forEach((c, i) => { if (i < count) out.push({ index: i, answer: c.toUpperCase(), analysis: '' }); });
      continue;
    }
    const inline = line.match(/(?:^|\s)(\d+)\s*[.、．]?\s*([A-H对错√×]+)(?=\s|$)/gi);
    if (inline) {
      inline.forEach((tok) => {
        const mm = tok.trim().match(/^(\d+)\s*[.、．]?\s*([A-H对错√×]+)$/i);
        if (mm) {
          const idx = parseInt(mm[1], 10) - 1;
          if (idx >= 0 && idx < count) out.push({ index: idx, answer: mm[2].toUpperCase(), analysis: '' });
        }
      });
    }
  }
  const map = new Map();
  out.forEach((en) => { if (en.index >= 0 && en.index < count) map.set(en.index, en); });
  return [...map.values()].sort((a, b) => a.index - b.index);
}

// 给考试的题目批量写入答案/解析（按题号顺序）
function setExamAnswers(examId, entries) {
  const exam = getExam(examId);
  if (!exam) return { error: '考试不存在' };
  const qs = (exam.questionIds || []).map((qid) => getQuestion(qid)).filter(Boolean);
  const updated = { answers: 0, analyses: 0 };
  (entries || []).forEach((en) => {
    const idx = Number(en.index);
    if (isNaN(idx) || idx < 0 || idx >= qs.length) return;
    const q = qs[idx];
    if (en.answer !== undefined && en.answer !== null && String(en.answer).trim() !== '') {
      const ansStr = String(en.answer).trim().toUpperCase().replace(/[\s,，、;；]/g, '');
      const letters = [...ansStr].filter((c) => /[A-H对错√×]/.test(c));
      if (letters.length > 1 && letters.every((c) => /[A-H]/.test(c))) {
        // 多字母答案 → 多项选择题
        q.type = 'multi';
        q.correctAnswer = letters.map((c) => c.charCodeAt(0) - 65);
        updated.answers++;
      } else if (letters.length === 1) {
        const na = normalizeAnswer(q.type, ansStr);
        if (na >= 0) { q.correctAnswer = na; updated.answers++; }
      }
    }
    if (en.analysis && String(en.analysis).trim()) {
      q.analysis = String(en.analysis).trim();
      updated.analyses++;
    }
  });
  persist();
  return { ok: true, updated };
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
  if (!stu) return { overall: { total: 0, correct: 0, percent: 0 }, byTopic: {}, examCount: 0, attemptCount: 0, wrongCount: 0 };
  let total = 0, correct = 0, examCount = 0, attemptCount = 0;
  const byTopic = {};
  // 考试与早读作业都属于"真实作答"，计入总体正确率与专题正确率；
  // 错题练习是复习巩固，不计入正确率（避免虚高），仅保留在错题库。
  (stu.history || []).forEach((h) => {
    if (h.refType === 'exam' || h.refType === 'homework') {
      attemptCount++;
      if (h.refType === 'exam') examCount++;
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
    examCount,
    attemptCount,
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

// 一键加入错题：学生主动把不会的题加入错题库（去重）
function addWrong(key, qid) {
  const stu = getStudent(key);
  if (!stu) return { error: '学生不存在' };
  if (!qid) return { error: '缺少题目' };
  const q = getQuestion(qid);
  if (!q) return { error: '题目不存在' };
  const list = stu.wrong || (stu.wrong = []);
  if (list.includes(qid)) return { ok: true, already: true, wrongCount: list.length };
  list.push(qid);
  persist();
  return { ok: true, already: false, wrongCount: list.length };
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
    const isCorrect = isAnswerCorrect(q, selected);
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

// ========== 艾宾浩斯 / Anki 式间隔记忆（SRS） ==========
// 各级复习间隔（天）。最后一级视为"已掌握/毕业"，之后仍按最长间隔循环巩固。
const SRS_INTERVALS = [1, 2, 4, 7, 15, 30, 90];
const DAY = 86400000;

function endOfToday(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// 把题目加入某学生的记忆计划（已存在则跳过），返回新增卡片数
function enableMemory(studentKey, qids) {
  const stu = ensureStudent(studentKey, studentKey);
  if (!stu.memory) stu.memory = {};
  const now = Date.now();
  let added = 0;
  (qids || []).forEach((qid) => {
    if (!getQuestion(qid)) return; // 题目不存在则跳过
    if (!stu.memory[qid]) {
      // 新卡：立即可复习，首次答对后进入第 1 级（1 天）
      stu.memory[qid] = { level: 0, due: now, reps: 0, lapses: 0, createdAt: now };
      added++;
    }
  });
  if (added) persist();
  return added;
}

// 今日到期（含逾期）的记忆卡对应题目，按紧急度升序，不含答案
function getMemoryDue(studentKey, nowTs) {
  const stu = getStudent(studentKey);
  if (!stu || !stu.memory) return [];
  const cutoff = endOfToday(nowTs || Date.now());
  const due = [];
  Object.keys(stu.memory).forEach((qid) => {
    const card = stu.memory[qid];
    if (card.due <= cutoff) {
      const q = getQuestion(qid);
      if (q) due.push({
        qid, due: card.due, level: card.level,
        type: q.type, title: q.title, options: q.options, topic: q.topic,
      });
    }
  });
  due.sort((a, b) => a.due - b.due);
  return due;
}

function getMemoryStats(studentKey) {
  const stu = getStudent(studentKey);
  if (!stu || !stu.memory) return { total: 0, due: 0, learning: 0, mastered: 0 };
  const now = Date.now();
  let total = 0, due = 0, learning = 0, mastered = 0;
  Object.values(stu.memory).forEach((c) => {
    total++;
    if (c.due <= endOfToday(now)) due++;
    if (c.level >= SRS_INTERVALS.length - 1) mastered++;
    else if (c.level > 0 || c.reps > 0) learning++;
  });
  return { total, due, learning, mastered };
}

// 提交记忆复习：逐题判定并更新间隔。answers: {qid: selectedIndex}
function reviewMemory(studentKey, answers) {
  const stu = getStudent(studentKey);
  if (!stu || !stu.memory) return { error: '尚未开启记忆模式' };
  const ansMap = answers || {};
  const results = [];
  const now = Date.now();
  Object.keys(ansMap).forEach((qid) => {
    const card = stu.memory[qid];
    const q = getQuestion(qid);
    if (!card || !q) return;
    const selected = ansMap[qid];
    const isCorrect = isAnswerCorrect(q, selected);
    if (isCorrect) {
      // 记住：升级一级，间隔按序列拉长（level1=1天，逐级 2/4/7/15/30/90 天）
      card.level = Math.min(card.level + 1, SRS_INTERVALS.length - 1);
      card.due = now + SRS_INTERVALS[Math.max(0, card.level - 1)] * DAY;
      card.reps += 1;
    } else {
      // 没记住：重置到第 0 级，明天再来
      card.level = 0;
      card.due = now + SRS_INTERVALS[0] * DAY;
      card.reps = 0;
      card.lapses += 1;
    }
    card.lastReviewed = now;
    results.push({
      qid, isCorrect, correctAnswer: q.correctAnswer,
      title: q.title, options: q.options, type: q.type, analysis: q.analysis,
      nextIntervalDays: SRS_INTERVALS[Math.max(0, card.level - 1)], level: card.level,
    });
  });
  persist();
  return { results, stats: getMemoryStats(studentKey) };
}

// ========== 规范词记忆卡（Anki 式，记得/模糊/不记得三选） ==========
const SP_NEW_PER_DAY = 10; // 每天新词上限

// 启动时若词库为空，从 data/spwords.json 载入（防止持久卷被清空后词库丢失）
function seedSpWords() {
  if (db.spWords && db.spWords.length) return;
  try {
    const file = path.join(__dirname, '..', 'data', 'spwords.json');
    if (fs.existsSync(file)) {
      const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(arr) && arr.length) {
        db.spWords = arr.map((w, i) => ({
          id: 'sw' + (i + 1), cat: w.cat || '未分类',
          scene: w.scene || '', word: w.word || '',
        }));
        console.log('[store] 已加载规范词库 ' + db.spWords.length + ' 条');
      }
    }
  } catch (e) { console.warn('[store] 规范词库加载失败:', e.message); }
}

function todayStr(ts) {
  const d = new Date(ts || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getSpWord(id) { return (db.spWords || []).find(w => w.id === id) || null; }
function getSpProg(studentKey) {
  const stu = ensureStudent(studentKey, studentKey);
  if (!stu.spProgress) stu.spProgress = {};
  return stu.spProgress;
}
function listSpWords() { return db.spWords; }

// 今日任务：待复习旧词 + 每天最多10个新词
function getSpDaily(studentKey) {
  const prog = getSpProg(studentKey);
  const now = Date.now(), cutoff = endOfToday(now), today = todayStr(now);
  const dueCards = [];
  let todayNew = 0;
  Object.keys(prog).forEach(wid => {
    const c = prog[wid], w = getSpWord(wid);
    if (!w) return;
    if (c.firstLearnedAt === today) todayNew++;
    if (c.due <= cutoff) dueCards.push({ id: w.id, cat: w.cat, word: w.word, scene: w.scene, due: c.due, level: c.level });
  });
  dueCards.sort((a, b) => a.due - b.due);
  const newLimit = Math.max(0, SP_NEW_PER_DAY - todayNew);
  const newCards = [];
  if (newLimit > 0) {
    for (const w of db.spWords) {
      if (newCards.length >= newLimit) break;
      if (!prog[w.id]) newCards.push({ id: w.id, cat: w.cat, word: w.word, scene: w.scene });
    }
  }
  const stats = getSpStats(studentKey, prog);
  stats.todayNew = todayNew;
  return { dueCards, newCards, todayNew, newLimit: SP_NEW_PER_DAY, stats };
}

function getSpStats(studentKey, prog) {
  const p = prog || (() => { const stu = getStudent(studentKey); return (stu && stu.spProgress) || {}; })();
  const now = Date.now(), cutoff = endOfToday(now);
  let learned = 0, due = 0, mastered = 0;
  Object.keys(p).forEach(wid => {
    const c = p[wid]; if (!getSpWord(wid)) return;
    learned++;
    if (c.due <= cutoff) due++;
    if (c.level >= SRS_INTERVALS.length - 1) mastered++;
  });
  return { total: db.spWords.length, learned, due, mastered, todayNew: 0 };
}

// 提交某词的掌握程度：remember(记得，间隔拉长) / fuzzy(模糊，1天后) / forgot(不记得，重置明天)
function reviewSpWord(studentKey, wordId, grade) {
  const prog = getSpProg(studentKey);
  const w = getSpWord(wordId);
  if (!w) return { error: '词条不存在' };
  if (!['remember', 'fuzzy', 'forgot'].includes(grade)) return { error: '无效的掌握程度' };
  const now = Date.now(), today = todayStr(now);
  const card = prog[wordId] || { level: 0, due: now, reps: 0, lapses: 0, firstLearnedAt: today, createdAt: now };
  prog[wordId] = card;
  if (grade === 'remember') {
    card.level = Math.min(card.level + 1, SRS_INTERVALS.length - 1);
    card.due = now + SRS_INTERVALS[Math.max(0, card.level - 1)] * DAY;
    card.reps += 1;
  } else if (grade === 'fuzzy') {
    card.due = now + SRS_INTERVALS[0] * DAY; // 1 天后
    card.reps += 1;
  } else { // forgot：重置，明天再来
    card.level = 0;
    card.due = now + SRS_INTERVALS[0] * DAY;
    card.reps = 0;
    card.lapses += 1;
  }
  card.updatedAt = now;
  persist();
  return { ok: true, level: card.level, due: card.due, nextIntervalDays: Math.max(1, Math.round((card.due - now) / DAY)) };
}

// ========== 法律常识课堂练习（老师推送某部分，控制答案/解析可见性） ==========
function seedLawQuestions() {
  if (db.lawQuestions && db.lawQuestions.length) return;
  try {
    const file = path.join(__dirname, '..', 'data', 'law_questions.json');
    if (fs.existsSync(file)) {
      const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(arr) && arr.length) {
        db.lawQuestions = arr;
        console.log('[store] 已加载法律常识题库 ' + db.lawQuestions.length + ' 题');
      }
    }
  } catch (e) { console.warn('[store] 法律题库加载失败:', e.message); }
}

// 课程 → 部分 → 题数（树结构）
function getLawSections() {
  const cats = {};
  db.lawQuestions.forEach((q) => {
    if (!cats[q.cat]) cats[q.cat] = {};
    cats[q.cat][q.section] = (cats[q.cat][q.section] || 0) + 1;
  });
  return Object.keys(cats).map((cat) => ({
    cat,
    sections: Object.keys(cats[cat]).map((s) => ({ name: s, count: cats[cat][s] })),
  }));
}

function getLawPush() {
  return db.lawPush || { active: false, cat: '', section: '', showAnswer: true, showAnalysis: true, pushedAt: 0 };
}
function setLawPush(cfg) {
  db.lawPush = {
    active: !!cfg.active,
    cat: String(cfg.cat || ''),
    section: String(cfg.section || ''),
    showAnswer: cfg.showAnswer !== false,
    showAnalysis: cfg.showAnalysis !== false,
    pushedAt: Date.now(),
  };
  persist();
  return db.lawPush;
}

// 学生取题：按当前推送配置决定是否带正确答案/解析
function getLawQuestions(cat, section) {
  const push = getLawPush();
  return db.lawQuestions.filter((q) => (!cat || q.cat === cat) && q.section === section).map((q) => {
    const o = { id: q.id, type: q.type, title: q.title, options: q.options };
    if (push.showAnswer) o.correctAnswer = q.correctAnswer;
    if (push.showAnalysis) o.analysis = q.analysis;
    return o;
  });
}

// 判分：按推送配置决定结果里是否带答案/解析
function submitLaw(studentKey, cat, section, answers) {
  const qs = db.lawQuestions.filter((q) => (!cat || q.cat === cat) && q.section === section);
  const push = getLawPush();
  let correct = 0;
  const details = [];
  qs.forEach((q) => {
    const sel = answers && answers[q.id];
    const ok = isAnswerCorrect(q, sel);
    if (ok) correct++;
    const d = { id: q.id, title: q.title, options: q.options, type: q.type, isCorrect: ok, selected: sel };
    if (push.showAnswer) d.correctAnswer = q.correctAnswer;
    if (push.showAnalysis) d.analysis = q.analysis;
    details.push(d);
  });
  const stu = ensureStudent(studentKey, studentKey);
  if (!stu.lawHistory) stu.lawHistory = [];
  stu.lawHistory.push({ cat, section, correct, total: qs.length, ts: Date.now() });
  persist();
  return { correct, total: qs.length, score: qs.length ? Math.round((correct / qs.length) * 100) : 0, details };
}

// ========== 注册 / 登录（邮箱 + 密码） ==========
// 密码使用 scrypt + 随机盐，存储为 "salt$hash"（均为 hex），零外部依赖。
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + '$' + hash;
}
function verifyPassword(pw, stored) {
  if (!stored || stored.indexOf('$') < 0) return false;
  const [salt, hash] = stored.split('$');
  const calc = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  if (calc.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}
function registerStudent({ email, name, password }) {
  email = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: '邮箱格式不正确' };
  if (!name || !name.trim()) return { error: '请填写姓名' };
  if (!password || String(password).length < 4) return { error: '密码至少 4 位' };
  if (db.students[email]) return { error: '该邮箱已注册，请直接登录' };
  db.students[email] = {
    name: String(name).trim(),
    email,
    password: hashPassword(password),
    wrong: [], history: [], memory: {},
    createdAt: Date.now(),
  };
  persist();
  return { studentKey: email, name: db.students[email].name, ok: true };
}
function loginStudent({ email, password }) {
  email = normalizeEmail(email);
  const stu = db.students[email];
  if (!stu || !stu.password) return { error: '该邮箱尚未注册' };
  if (!verifyPassword(password, stu.password)) return { error: '密码错误' };
  return { studentKey: email, name: stu.name, ok: true };
}
// 教师重置学生密码（学习记录/错题/记忆均保留）
function resetStudentPassword({ email, password }) {
  email = normalizeEmail(email);
  const stu = db.students[email];
  if (!stu) return { error: '该邮箱尚未注册' };
  if (!password || String(password).length < 4) return { error: '密码至少 4 位' };
  stu.password = hashPassword(String(password));
  persist();
  return { ok: true, name: stu.name };
}

// ========== 复习提醒收件人 ==========
// 返回「已注册（有邮箱 + 密码）且今日有到期复习题」的学生，供教师预览 / 群发邮件。
function getReminderRecipients() {
  const now = Date.now();
  const list = [];
  Object.keys(db.students).forEach((key) => {
    const stu = db.students[key];
    if (!stu.email || !stu.password) return; // 仅提醒已注册学生
    const stats = getMemoryStats(key);
    if (stats.due > 0) {
      const due = getMemoryDue(key, now);
      list.push({ key, name: stu.name, email: stu.email, stats, due });
    }
  });
  return list;
}

// ========== 课程模块（老师自建：章节 + 资料 + 内置练习） ==========
function rid(prefix) { return prefix + crypto.randomBytes(4).toString('hex'); }

function listCourses() { return db.courses.slice().sort((a, b) => b.updatedAt - a.updatedAt); }
function getCourse(id) { return db.courses.find((c) => c.id === id) || null; }

function createCourse(input) {
  const course = {
    id: rid('c'),
    title: String(input.title || '未命名课程').trim(),
    description: String(input.description || '').trim(),
    cover: String(input.cover || '').trim(),
    chapters: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.courses.push(course); persist(); return course;
}
function updateCourse(id, patch) {
  const c = getCourse(id); if (!c) return null;
  if (patch.title !== undefined) c.title = String(patch.title).trim();
  if (patch.description !== undefined) c.description = String(patch.description).trim();
  if (patch.cover !== undefined) c.cover = String(patch.cover).trim();
  c.updatedAt = Date.now(); persist(); return c;
}
function deleteCourse(id) {
  db.courses = db.courses.filter((c) => c.id !== id);
  Object.keys(db.courseProgress).forEach((k) => { delete db.courseProgress[k][id]; });
  persist(); return true;
}
function addChapter(courseId, input) {
  const c = getCourse(courseId); if (!c) return null;
  const ch = { id: rid('ch'), title: String(input.title || '新章节').trim(), order: c.chapters.length, lessons: [] };
  c.chapters.push(ch); c.updatedAt = Date.now(); persist(); return ch;
}
function updateChapter(courseId, chId, patch) {
  const c = getCourse(courseId); if (!c) return null;
  const ch = c.chapters.find((x) => x.id === chId); if (!ch) return null;
  if (patch.title !== undefined) ch.title = String(patch.title).trim();
  if (patch.order !== undefined) ch.order = patch.order;
  c.updatedAt = Date.now(); persist(); return ch;
}
function deleteChapter(courseId, chId) {
  const c = getCourse(courseId); if (!c) return false;
  c.chapters = c.chapters.filter((x) => x.id !== chId); c.updatedAt = Date.now(); persist(); return true;
}
function totalLessons(course) { return course.chapters.reduce((n, ch) => n + ch.lessons.length, 0); }
function findLesson(courseId, lessonId) {
  const c = getCourse(courseId); if (!c) return null;
  for (const ch of c.chapters) { const ls = ch.lessons.find((l) => l.id === lessonId); if (ls) return { course: c, chapter: ch, lesson: ls }; }
  return null;
}
function addLesson(courseId, chId, input) {
  const c = getCourse(courseId); if (!c) return null;
  const ch = c.chapters.find((x) => x.id === chId); if (!ch) return null;
  const ls = {
    id: rid('ls'),
    title: String(input.title || '新课时').trim(),
    type: input.type === 'material' ? 'material' : 'text',
    content: String(input.content || '').trim(),
    materials: Array.isArray(input.materials) ? input.materials.map((m) => ({ type: String(m.type || 'link'), title: String(m.title || ''), url: String(m.url || '') })) : [],
    practiceExamId: input.practiceExamId || null,
    order: ch.lessons.length,
  };
  ch.lessons.push(ls); c.updatedAt = Date.now(); persist(); return ls;
}
function updateLesson(courseId, chId, lessonId, patch) {
  const f = findLesson(courseId, lessonId); if (!f) return null;
  const ls = f.lesson;
  if (patch.title !== undefined) ls.title = String(patch.title).trim();
  if (patch.type !== undefined) ls.type = patch.type === 'material' ? 'material' : 'text';
  if (patch.content !== undefined) ls.content = String(patch.content).trim();
  if (patch.practiceExamId !== undefined) ls.practiceExamId = patch.practiceExamId || null;
  if (patch.materials !== undefined && Array.isArray(patch.materials)) ls.materials = patch.materials.map((m) => ({ type: String(m.type || 'link'), title: String(m.title || ''), url: String(m.url || '') }));
  f.course.updatedAt = Date.now(); persist(); return ls;
}
function deleteLesson(courseId, chId, lessonId) {
  const c = getCourse(courseId); if (!c) return false;
  const ch = c.chapters.find((x) => x.id === chId); if (!ch) return false;
  ch.lessons = ch.lessons.filter((l) => l.id !== lessonId); c.updatedAt = Date.now(); persist(); return true;
}
function ensureCourseProgress(studentKey, courseId) {
  if (!db.courseProgress[studentKey]) db.courseProgress[studentKey] = {};
  if (!db.courseProgress[studentKey][courseId]) db.courseProgress[studentKey][courseId] = { completedLessons: [], lastAccess: Date.now(), startedAt: Date.now() };
  return db.courseProgress[studentKey][courseId];
}
function setLessonDone(studentKey, courseId, lessonId, done) {
  const p = ensureCourseProgress(studentKey, courseId);
  const has = p.completedLessons.includes(lessonId);
  if (done && !has) p.completedLessons.push(lessonId);
  if (!done && has) p.completedLessons = p.completedLessons.filter((x) => x !== lessonId);
  p.lastAccess = Date.now(); persist();
  const c = getCourse(courseId); const total = c ? totalLessons(c) : 0;
  return { completed: p.completedLessons.length, total, percent: total ? Math.round((p.completedLessons.length / total) * 100) : 0 };
}
function getCourseProgress(studentKey, courseId) {
  const p = (db.courseProgress[studentKey] || {})[courseId];
  const c = getCourse(courseId); const total = c ? totalLessons(c) : 0;
  const completed = p ? p.completedLessons.length : 0;
  return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0, completedLessons: p ? p.completedLessons : [] };
}
function getStudentCourses(studentKey) {
  return db.courses.map((c) => {
    const pr = getCourseProgress(studentKey, c.id);
    return { id: c.id, title: c.title, description: c.description, cover: c.cover, total: pr.total, completed: pr.completed, percent: pr.percent, chapterCount: c.chapters.length, lessonCount: pr.total };
  });
}

// ========== 早读模块 ==========
function listMorningReadings(filter) {
  let list = db.morningReadings.slice();
  if (filter && filter.scope === 'teacher') list = list.filter((m) => m.ownerType === 'teacher');
  if (filter && filter.ownerKey) list = list.filter((m) => m.ownerKey === filter.ownerKey);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
function getMorningReading(id) { return db.morningReadings.find((m) => m.id === id) || null; }
function createMorningReading(input) {
  const m = {
    id: rid('mr'),
    ownerType: input.ownerType === 'student' ? 'student' : 'teacher',
    ownerKey: String(input.ownerKey || '').trim(),
    title: String(input.title || '').trim(),
    content: String(input.content || '').trim(),
    createdAt: Date.now(),
    push: { mode: 'none', pushedAt: null, pushDate: null },
    active: true,
  };
  db.morningReadings.push(m); persist(); return m;
}
function updateMorningReading(id, patch) {
  const m = getMorningReading(id); if (!m) return null;
  if (patch.title !== undefined) m.title = String(patch.title).trim();
  if (patch.content !== undefined) m.content = String(patch.content).trim();
  if (patch.active !== undefined) m.active = !!patch.active;
  persist(); return m;
}
function deleteMorningReading(id) { db.morningReadings = db.morningReadings.filter((m) => m.id !== id); persist(); return true; }
function pushMorningReading(id) {
  const m = getMorningReading(id); if (!m) return null;
  const today = new Date().toISOString().slice(0, 10);
  m.push = { mode: 'all', pushedAt: Date.now(), pushDate: today };
  persist(); return m;
}
// 学生今日早读清单：老师已推送(active) + 学生自己建的
function getTodayMorning(studentKey, dateStr) {
  const teacherOnes = db.morningReadings.filter((m) => m.ownerType === 'teacher' && m.active && m.push.mode === 'all');
  const ownOnes = db.morningReadings.filter((m) => m.ownerType === 'student' && m.ownerKey === studentKey && m.active);
  const items = teacherOnes.concat(ownOnes).map((m) => ({ id: m.id, title: m.title, content: m.content, ownerType: m.ownerType, pushDate: m.push.pushDate }));
  const ci = db.morningCheckins[studentKey + '::' + dateStr] || null;
  return { date: dateStr, items, checkin: ci ? { done: ci.done, readingIds: ci.readingIds, homeworkDone: !!ci.homeworkDone } : { done: false, readingIds: [], homeworkDone: false } };
}
function checkInMorning(studentKey, dateStr, readingIds, done) {
  const key = studentKey + '::' + dateStr;
  const ci = db.morningCheckins[key] || { studentKey, date: dateStr, readingIds: [], done: false, homeworkDone: false, ts: Date.now() };
  ci.readingIds = readingIds || ci.readingIds || [];
  ci.done = done !== false;
  ci.ts = Date.now();
  db.morningCheckins[key] = ci; persist(); return ci;
}
function getMorningCheckin(studentKey, dateStr) { return db.morningCheckins[studentKey + '::' + dateStr] || null; }
// 老师端打卡统计：注册学生中已/未打卡
function getMorningCheckinStats(dateStr) {
  const students = Object.keys(db.students).filter((k) => db.students[k].email);
  const checked = [], unchecked = [];
  students.forEach((k) => {
    const ci = db.morningCheckins[k + '::' + dateStr];
    if (ci && ci.done) checked.push({ key: k, name: db.students[k].name });
    else unchecked.push({ key: k, name: db.students[k].name });
  });
  return { date: dateStr, total: students.length, checkedCount: checked.length, uncheckedCount: unchecked.length, checked, unchecked };
}
// 早读作业（老师打卡后布置）
function createMorningHomework(input) {
  const h = {
    id: rid('h'),
    date: String(input.date || new Date().toISOString().slice(0, 10)),
    title: String(input.title || '早读作业').trim(),
    questionIds: Array.isArray(input.questionIds) ? input.questionIds : [],
    examId: input.examId || null,
    dueDate: input.dueDate || null,
    createdAt: Date.now(),
  };
  db.morningHomework.push(h); persist(); return h;
}
function getMorningHomeworkByDate(dateStr) { return db.morningHomework.filter((h) => h.date === dateStr).sort((a, b) => b.createdAt - a.createdAt); }
function getMorningHomework(id) { return db.morningHomework.find((h) => h.id === id) || null; }
function submitMorningHomework({ homeworkId, studentKey, studentName, answers }) {
  const h = getMorningHomework(homeworkId); if (!h) return { error: '作业不存在' };
  let questionIds = h.questionIds;
  if (!questionIds.length && h.examId) { const e = getExam(h.examId); if (e) questionIds = e.questionIds; }
  const qs = questionIds.map((qid) => getQuestion(qid)).filter(Boolean);
  const ansMap = answers || {}; let correct = 0;
  const details = qs.map((q) => { const sel = ansMap[q.id]; const isC = sel !== undefined && Number(sel) === q.correctAnswer; if (isC) correct++; return { qid: q.id, selected: sel, correctAnswer: q.correctAnswer, isCorrect: isC }; });
  const stu = ensureStudent(studentKey, studentName);
  stu.history.push({ refType: 'homework', refId: h.id, refTitle: h.title, date: Date.now(), total: qs.length, correct, details });
  if (!stu.morningHomeworkDone) stu.morningHomeworkDone = {};
  stu.morningHomeworkDone[h.id] = { date: Date.now(), score: qs.length ? Math.round((correct / qs.length) * 100) : 0 };
  persist();
  return { total: qs.length, correct, score: qs.length ? Math.round((correct / qs.length) * 100) : 0, details: qs.map((q, i) => ({ id: q.id, title: q.title, options: q.options, selected: details[i].selected, correctAnswer: q.correctAnswer, isCorrect: details[i].isCorrect, analysis: q.analysis })) };
}

// ========== 早读间隔记忆（艾宾浩斯，复用 SRS 引擎） ==========
function enableMrMemory(studentKey, mrids) {
  const stu = ensureStudent(studentKey, studentKey);
  if (!stu.mrMemory) stu.mrMemory = {};
  const now = Date.now(); let added = 0;
  (mrids || []).forEach((mrid) => {
    if (!getMorningReading(mrid)) return;
    if (!stu.mrMemory[mrid]) { stu.mrMemory[mrid] = { level: 0, due: now, reps: 0, lapses: 0, createdAt: now }; added++; }
  });
  if (added) persist();
  return added;
}
function getMrDue(studentKey, nowTs) {
  const stu = getStudent(studentKey); if (!stu || !stu.mrMemory) return [];
  const cutoff = endOfToday(nowTs || Date.now());
  const due = [];
  Object.keys(stu.mrMemory).forEach((mrid) => {
    const card = stu.mrMemory[mrid];
    if (card.due <= cutoff) { const m = getMorningReading(mrid); if (m) due.push({ itemId: mrid, kind: 'mr', due: card.due, level: card.level, title: m.title, content: m.content }); }
  });
  due.sort((a, b) => a.due - b.due);
  return due;
}
function getMrStats(studentKey) {
  const stu = getStudent(studentKey); if (!stu || !stu.mrMemory) return { total: 0, due: 0, learning: 0, mastered: 0 };
  const now = Date.now(); let total = 0, due = 0, learning = 0, mastered = 0;
  Object.values(stu.mrMemory).forEach((c) => {
    total++;
    if (c.due <= endOfToday(now)) due++;
    if (c.level >= SRS_INTERVALS.length - 1) mastered++;
    else if (c.level > 0 || c.reps > 0) learning++;
  });
  return { total, due, learning, mastered };
}
// results: { mrid: 0(记住)|1(没记住) }
function reviewMr(studentKey, results) {
  const stu = getStudent(studentKey); if (!stu || !stu.mrMemory) return { error: '尚未加入早读记忆' };
  const now = Date.now(); const out = [];
  Object.keys(results || {}).forEach((mrid) => {
    const card = stu.mrMemory[mrid]; if (!card) return;
    const forgot = Number(results[mrid]) === 1;
    if (!forgot) { card.level = Math.min(card.level + 1, SRS_INTERVALS.length - 1); card.due = now + SRS_INTERVALS[Math.max(0, card.level - 1)] * DAY; card.reps += 1; }
    else { card.level = 0; card.due = now + SRS_INTERVALS[0] * DAY; card.reps = 0; card.lapses += 1; }
    card.lastReviewed = now;
    out.push({ itemId: mrid, isCorrect: !forgot, nextIntervalDays: SRS_INTERVALS[Math.max(0, card.level - 1)], level: card.level });
  });
  persist();
  return { results: out, stats: getMrStats(studentKey) };
}
function getLearningMastery(studentKey) {
  const q = getMemoryStats(studentKey);
  const m = getMrStats(studentKey);
  return { total: q.total + m.total, due: q.due + m.due, learning: q.learning + m.learning, mastered: q.mastered + m.mastered };
}

// ========== 仪表盘聚合 ==========
function studentDashboard(studentKey) {
  const courses = getStudentCourses(studentKey);
  const quiz = getStudentStats(studentKey);
  const stu = getStudent(studentKey) || {};
  const wrong = (stu.wrong || []).length;
  const mastery = getLearningMastery(studentKey);
  const today = new Date().toISOString().slice(0, 10);
  const morning = getTodayMorning(studentKey, today);
  const pendingMorning = (morning.items.length && !morning.checkin.done) ? morning.items.length : 0;
  const weak = Object.entries(quiz.byTopic || {}).map(([t, v]) => ({ topic: t, percent: v.percent, total: v.total })).filter((x) => x.total >= 2).sort((a, b) => a.percent - b.percent).slice(0, 5);
  return {
    courses: { list: courses, avgPercent: courses.length ? Math.round(courses.reduce((s, c) => s + c.percent, 0) / courses.length) : 0, totalLessons: courses.reduce((s, c) => s + c.total, 0), completedLessons: courses.reduce((s, c) => s + c.completed, 0) },
    quiz: { examCount: quiz.examCount, percent: quiz.overall.percent, total: quiz.overall.total, correct: quiz.overall.correct },
    wrong, mastery,
    morning: { pending: pendingMorning, total: morning.items.length, done: morning.checkin.done, items: morning.items },
    weak,
  };
}
function teacherDashboard() {
  const students = Object.keys(db.students).filter((k) => db.students[k].email);
  const today = new Date().toISOString().slice(0, 10);
  const checkin = getMorningCheckinStats(today);
  let total = 0, correct = 0; const topicAgg = {};
  students.forEach((k) => {
    const s = db.students[k];
    (s.history || []).forEach((h) => {
      if (h.refType === 'exam' || h.refType === 'homework') {
        total += h.total; correct += h.correct;
        (h.details || []).forEach((d) => { const q = getQuestion(d.qid); const t = q ? q.topic : '未知'; if (!topicAgg[t]) topicAgg[t] = { total: 0, correct: 0 }; topicAgg[t].total++; if (d.isCorrect) topicAgg[t].correct++; });
      }
    });
  });
  const weakTopics = Object.entries(topicAgg).map(([t, v]) => ({ topic: t, percent: v.total ? Math.round((v.correct / v.total) * 100) : 0, total: v.total })).filter((x) => x.total >= 2).sort((a, b) => a.percent - b.percent).slice(0, 8);
  return {
    studentCount: students.length,
    courseCount: db.courses.length,
    morningReadingCount: db.morningReadings.filter((m) => m.ownerType === 'teacher' && m.active).length,
    todayCheckin: { checked: checkin.checkedCount, unchecked: checkin.uncheckedCount, total: checkin.total, checkedList: checkin.checked, uncheckedList: checkin.unchecked },
    overall: { total, correct, percent: total ? Math.round((correct / total) * 100) : 0 },
    weakTopics,
    masteryOverview: { studentsWithMemory: students.filter((k) => (db.students[k].memory && Object.keys(db.students[k].memory).length) || (db.students[k].mrMemory && Object.keys(db.students[k].mrMemory).length)).length },
  };
}

// ========== 复习提醒收件人（含早读记忆） ==========
function getReminderRecipients() {
  const now = Date.now();
  const list = [];
  Object.keys(db.students).forEach((key) => {
    const stu = db.students[key];
    if (!stu.email || !stu.password) return;
    const qStats = getMemoryStats(key);
    const mStats = getMrStats(key);
    const dueQ = getMemoryDue(key, now);
    const dueM = getMrDue(key, now);
    const dueCount = qStats.due + mStats.due;
    if (dueCount > 0) {
      list.push({ key, name: stu.name, email: stu.email, stats: { due: dueCount, learning: qStats.learning + mStats.learning, mastered: qStats.mastered + mStats.mastered, total: qStats.total + mStats.total }, due: dueQ.concat(dueM) });
    }
  });
  return list;
}

module.exports = {
  // 题目
  listQuestions, getQuestion, addQuestion, addQuestionsBatch, parseQuestionsText,
  updateQuestion, deleteQuestion, topics,
  // 考试
  listExams, getExam, getExamQuestions, createExam, deleteExam, submitExam,
  parseAnswersText, setExamAnswers,
  saveDraft, getDraft, clearDraft, listDrafts, getExamProgress, getExamAnsweredQids, examCategory, examTop,
  // 学生/错题
  ensureStudent, getStudent, getStudentRecords, getStudentStats,
  getWrongQuestions, removeWrong, addWrong, getWrongPractice, submitWrongPractice,
  // 房间
  generateRoomId, createRoom, getRoom, saveRoom, deleteRoom, nextEventSeq,
  recordRoomAnswer, calcStats, calcStudentAccuracy,
  // 备份
  exportAll, snapshot, listSnapshots, restoreSnapshot,
  // 间隔记忆
  enableMemory, getMemoryDue, getMemoryStats, reviewMemory,
  // 规范词记忆卡
  listSpWords, getSpDaily, getSpStats, reviewSpWord,
  // 法律常识课堂练习
  getLawSections, getLawPush, setLawPush, getLawQuestions, submitLaw,
  // 注册 / 登录 / 提醒
  registerStudent, loginStudent, resetStudentPassword, getReminderRecipients,
  // 课程
  listCourses, getCourse, createCourse, updateCourse, deleteCourse,
  addChapter, updateChapter, deleteChapter,
  addLesson, updateLesson, deleteLesson, totalLessons,
  setLessonDone, getCourseProgress, getStudentCourses,
  // 早读
  listMorningReadings, getMorningReading, createMorningReading, updateMorningReading,
  deleteMorningReading, pushMorningReading, getTodayMorning, checkInMorning,
  getMorningCheckin, getMorningCheckinStats, createMorningHomework, getMorningHomeworkByDate,
  getMorningHomework, submitMorningHomework,
  // 早读记忆
  enableMrMemory, getMrDue, getMrStats, reviewMr, getLearningMastery,
  // 仪表盘
  studentDashboard, teacherDashboard,
};
