const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'student.html');
const html = fs.readFileSync(FILE, 'utf8');
const marker = 'const $=(s)=>document.querySelector(s);';
const mi = html.indexOf(marker);
const end = html.lastIndexOf('</script>');
const code = html.slice(mi, end);

// ---------- mock DOM ----------
function makeEl() {
  return {
    _html: '', textContent: '', value: '', className: '', _cls: new Set(),
    style: {}, dataset: {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; }
    },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    closest() { return makeEl(); },
    addEventListener() {}, click() {}, scrollIntoView() {},
    parentElement: null,
  };
}
const elements = {};
const documentMock = {
  querySelector(sel) { if (!elements[sel]) elements[sel] = makeEl(); return elements[sel]; },
  getElementById(id) { const s = '#' + id; if (!elements[s]) elements[s] = makeEl(); return elements[s]; },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
};
const storageMap = { quiz_student_key: 'test@x.com', quiz_student_name: '测试' };
const localStorageMock = {
  getItem(k) { return k in storageMap ? storageMap[k] : null; },
  setItem(k, v) { storageMap[k] = v; },
  removeItem(k) { delete storageMap[k]; },
};

let apiReturn = null; // function(url, opts) -> data
function fetchMock(url, opts) {
  const data = apiReturn ? apiReturn(url, opts) : {};
  return Promise.resolve({ json: () => Promise.resolve(data) });
}

const toasts = [];
const realSetTimeout = setTimeout;

const sandbox = {
  document: documentMock,
  localStorage: localStorageMock,
  location: { hash: '' },
  window: { scrollTo() {} },
  fetch: fetchMock,
  setTimeout: (fn) => realSetTimeout(fn, 0),
  setInterval: () => 0,
  clearInterval: () => {},
  console,
  Math, Date, JSON, Object, Array, Promise, String, Number, Boolean, RegExp, encodeURIComponent, parseInt, parseFloat, isNaN,
  getDailyQuote: () => ({ text: '金句', source: '来源' }),
};
vm.createContext(sandbox);
vm.runInNewContext(code, sandbox);

// override toast to record
sandbox.toast = (m, t) => { toasts.push({ m, t }); };

const sleep = (ms) => new Promise(r => realSetTimeout(r, ms));

// ---------- api response builders ----------
function normalApi(url, opts) {
  const u = String(url);
  if (u.startsWith('/api/dashboard/student')) return { courses: { list: [{ id: 'c1', title: '课', chapterCount: 1, total: 2, completed: 1, percent: 50 }], avgPercent: 50, totalLessons: 2, completedLessons: 1 }, quiz: { examCount: 1, percent: 80, total: 10, correct: 8, attemptCount: 3 }, mastery: { mastered: 2 }, morning: { done: false, pending: 1, total: 1, items: [{ id: 'm1', title: '早读', content: '内容' }] }, weak: [{ topic: 'x', percent: 40, total: 3 }], wrong: 1 };
  if (u.startsWith('/api/exams/progress')) return { byTop: { '国省考真题': { done: 1, total: 2, percent: 50 }, '专题': { done: 0, total: 1, percent: 0 } }, doneExamIds: ['e1'] };
  if (u === '/api/exams') return [{ id: 'e1', title: '2024国考真题', category: '国考真题', questionIds: ['q1', 'q2'], createdAt: Date.now() }, { id: 'e2', title: '广东真题', category: '省考真题', questionIds: ['q3'], createdAt: Date.now() }, { id: 'e3', title: '言语专题', category: '专题', questionIds: ['q1'], createdAt: Date.now() }];
  if (u.startsWith('/api/drafts')) return { drafts: { e3: { answered: 1, total: 1, seq: ['q1'] } } };
  if (u.startsWith('/api/students/') && u.includes('/stats')) return { overall: { percent: 80, correct: 8, total: 10 }, byTopic: { x: { percent: 70, correct: 7, total: 10 } }, examCount: 1, attemptCount: 3, wrongCount: 1 };
  if (u.startsWith('/api/students/') && u.includes('/records')) return [{ refTitle: '2024国考真题', date: Date.now(), correct: 8, total: 10 }];
  if (u.startsWith('/api/students/') && u.includes('/wrong')) return [{ id: 'q2', title: '错', type: 'choice', options: ['A', 'B'] }];
  if (u.startsWith('/api/memory/due')) return { questions: [{ qid: 'q1', type: 'choice', title: '记忆题', options: ['A', 'B'] }], stats: { due: 1, learning: 1, mastered: 2, total: 4 } };
  if (u.startsWith('/api/memory/stats')) return { due: 1, learning: 1, mastered: 2, total: 4 };
  if (u.startsWith('/api/memory/review')) return { results: [{ title: 't', isCorrect: true, nextIntervalDays: 2 }] };
  if (u.startsWith('/api/student/courses')) return [{ id: 'c1', title: '课', chapterCount: 1, total: 2, completed: 1, percent: 50 }];
  if (u.startsWith('/api/courses/c1/progress')) return { completedLessons: ['l1'], percent: 50, completed: 1, total: 2 };
  if (u.startsWith('/api/courses/c1')) return { id: 'c1', title: '课', description: 'd', chapters: [{ id: 'ch1', title: '章', lessons: [{ id: 'l1', title: '课1', type: 'lesson', content: 'c', materials: [], practiceExamId: 'e1' }] }] };
  if (u.startsWith('/api/morning/today')) return { date: '2026-08-11', items: [{ id: 'm1', title: '早读', content: '内容' }], checkin: { done: false, readingIds: [] } };
  if (u.startsWith('/api/morning?')) return [{ id: 'm2', title: '我的早读', content: 'c' }];
  if (u.startsWith('/api/morning/memory/stats')) return { due: 0, learning: 1, mastered: 2, total: 4 };
  if (u.startsWith('/api/morning/memory/due')) return { items: [{ itemId: 'm1', title: '早读', content: 'c' }] };
  if (u.startsWith('/api/morning/memory/cards')) return [{ itemId: 'm1', title: '早读', due: Date.now() }];
  if (u.startsWith('/api/morning/memory/review')) return { results: [{ title: '早读', isCorrect: true, nextIntervalDays: 3 }] };
  if (u.startsWith('/api/morning/homework')) return [{ id: 'hid', title: '作业', questionIds: ['q1'], examId: null }];
  if (u.startsWith('/api/morning/homework/hid/submit')) return { score: 100, correct: 1, total: 1, details: [{ title: '作业题', isCorrect: true, type: 'choice', options: ['A'], correctAnswer: 0 }] };
  if (u.startsWith('/api/exams/e1')) return { id: 'e1', title: '2024国考真题', questions: [{ id: 'q1', type: 'choice', title: '题1', options: ['A', 'B'] }, { id: 'q2', type: 'choice', title: '题2', options: ['A', 'B'] }] };
  if (u.startsWith('/api/exams/e1/draft')) return { draft: { answered: 1, total: 2, seq: ['q1', 'q2'], answers: { q1: 0 } } };
  if (u.startsWith('/api/exams/e1/submit')) return { score: 50, correct: 1, total: 2, wrongAdded: ['q2'], details: [{ title: '题1', isCorrect: true, type: 'choice', options: ['A'], correctAnswer: 0 }, { title: '题2', isCorrect: false, type: 'choice', options: ['A'], correctAnswer: 0 }] };
  if (u.startsWith('/api/questions')) return [{ id: 'q1', type: 'choice', title: '题1', options: ['A', 'B'] }];
  if (u.startsWith('/api/wrong-practice/start')) return { questions: [{ id: 'q2', type: 'choice', title: '错', options: ['A', 'B'] }] };
  if (u.startsWith('/api/wrong-practice/submit')) return { correct: 1, total: 1, removed: ['q2'], details: [{ title: '错', isCorrect: true, type: 'choice', options: ['A'], correctAnswer: 0 }] };
  return {};
}

function brokenApi(url, opts) {
  const u = String(url);
  // 模拟旧后端/畸形 store.json：大部分接口返回 null / 空 / 缺字段
  if (u.startsWith('/api/dashboard/student')) return null;
  if (u.startsWith('/api/exams/progress')) return {};
  if (u === '/api/exams') return null;
  if (u.startsWith('/api/drafts')) return null;
  if (u.startsWith('/api/students/') && u.includes('/stats')) return null;
  if (u.startsWith('/api/students/') && u.includes('/records')) return null;
  if (u.startsWith('/api/students/') && u.includes('/wrong')) return null;
  if (u.startsWith('/api/memory/due')) return { questions: null, stats: null };
  if (u.startsWith('/api/memory/stats')) return null;
  if (u.startsWith('/api/memory/review')) return null;
  if (u.startsWith('/api/student/courses')) return null;
  if (u.startsWith('/api/courses/c1/progress')) return null;
  if (u.startsWith('/api/courses/c1')) return { chapters: null };
  if (u.startsWith('/api/morning/today')) return { items: null, checkin: null };
  if (u.startsWith('/api/morning?')) return null;
  if (u.startsWith('/api/morning/memory/stats')) return null;
  if (u.startsWith('/api/morning/memory/due')) return { items: null };
  if (u.startsWith('/api/morning/memory/cards')) return null;
  if (u.startsWith('/api/morning/memory/review')) return null;
  if (u.startsWith('/api/morning/homework')) return null;
  if (u.startsWith('/api/morning/homework/hid/submit')) return null;
  if (u.startsWith('/api/exams/e1')) return null;
  if (u.startsWith('/api/exams/e1/draft')) return { draft: null };
  if (u.startsWith('/api/exams/e1/submit')) return { details: null, wrongAdded: null };
  if (u.startsWith('/api/questions')) return null;
  if (u.startsWith('/api/wrong-practice/start')) return { questions: null };
  if (u.startsWith('/api/wrong-practice/submit')) return { details: null };
  return null;
}

async function runAll(label, builder) {
  apiReturn = builder;
  toasts.length = 0;
  // 重置状态
  sandbox.examSeq = ['q1'];
  sandbox.examAnswers = { q1: 0 };
  sandbox.examIdCurrent = 'e1';
  sandbox.memAnswers = { q1: 0 };
  sandbox.wrongAnswers = { q2: 0 };
  sandbox.mrAnswers = { m1: 0 };
  sandbox.hwState = { id: 'hid', answers: { q1: 0 } };

  const calls = [
    ['loadDashboard', () => sandbox.loadDashboard()],
    ['loadExamList', () => sandbox.loadExamList()],
    ['loadMine', () => sandbox.loadMine()],
    ['loadMemory', () => sandbox.loadMemory()],
    ['loadCourses', () => sandbox.loadCourses()],
    ['openCourse', () => sandbox.openCourse('c1')],
    ['loadMorning', () => sandbox.loadMorning()],
    ['startMemory', () => sandbox.startMemory()],
    ['startMr', () => sandbox.startMr()],
    ['renderSchedule', () => sandbox.renderSchedule()],
    ['doHomework', () => sandbox.doHomework('hid')],
    ['submitHw', () => sandbox.submitHw()],
    ['startPractice', () => sandbox.startPractice(5)],
    ['submitPractice', () => sandbox.submitPractice()],
    ['submitExam', () => sandbox.submitExam('e1')],
    ['submitMemory', () => sandbox.submitMemory()],
    ['submitMr', () => sandbox.submitMr()],
  ];
  const bad = [];
  for (const [name, fn] of calls) {
    try {
      await fn();
      await sleep(5);
      // 只把真正的崩溃特征判为失败（业务提示如「作业不存在」是合理行为，不算）
      const undef = toasts.filter(t => t.t === 'err' && /Cannot read properties of undefined|is not a function|Cannot destructure/i.test(t.m));
      if (undef.length) {
        bad.push({ name, errs: undef.map(e => e.m) });
      }
      toasts.length = 0;
    } catch (e) {
      bad.push({ name, thrown: e.message });
    }
  }
  console.log(`[${label}] ${bad.length === 0 ? 'PASS ✅ 零 undefined 崩溃' : 'FAIL ❌'}`);
  if (bad.length) bad.forEach(b => console.log('   -', b.name, '::', b.thrown || b.errs.join(' | ')));
  return bad.length === 0;
}

(async () => {
  let ok = true;
  ok = (await runAll('NORMAL', normalApi)) && ok;
  ok = (await runAll('BROKEN', brokenApi)) && ok;
  console.log(ok ? '\nALL PASS 🎉' : '\nHAS FAILURES');
  process.exit(ok ? 0 : 1);
})();
