// 将 Desktop/党史与科学常识_题目库.js 转换为 classroom_questions.json 格式并追加
// 支持：单选(choice) 与 多选(multi)；topic = '课堂习题·' + source
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/Administrator/Desktop/党史与科学常识_题目库.js';
const TARGET = path.join(__dirname, '..', 'data', 'classroom_questions.json');

const src = fs.readFileSync(SRC, 'utf8');
const m = src.match(/const\s+QUESTION_BANK\s*=\s*(\[[\s\S]*?\]);/);
if (!m) { console.error('未找到 QUESTION_BANK 数组'); process.exit(1); }
const arr = eval(m[1]);

const existing = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
const existingTitles = new Set(existing.map((q) => String(q.title || '').trim()));
const converted = [];
const dup = [];

for (const q of arr) {
  const title = String(q.stem || '').trim();
  if (!title) continue;
  if (existingTitles.has(title)) { dup.push(title.slice(0, 24)); continue; }

  // 选项 key -> 索引映射
  const keyToIdx = {};
  (q.options || []).forEach((o, i) => { keyToIdx[o.key] = i; });

  const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
  const isMulti = answers.length > 1;
  let correctAnswer;
  if (isMulti) {
    correctAnswer = answers.map((k) => keyToIdx[k]).filter((i) => i !== undefined);
  } else {
    correctAnswer = keyToIdx[answers[0]];
  }
  if (correctAnswer === undefined || (Array.isArray(correctAnswer) && !correctAnswer.length)) {
    console.warn('跳过(答案无法映射):', title.slice(0, 30), 'answer=', JSON.stringify(q.answer));
    continue;
  }

  converted.push({
    type: isMulti ? 'multi' : 'choice',
    title,
    options: (q.options || []).map((o) => String(o.text)),
    correctAnswer,
    analysis: String(q.analysis || '').trim(),
    topic: '课堂习题·' + String(q.source || '未分类'),
  });
  existingTitles.add(title);
}

const out = existing.concat(converted);
fs.writeFileSync(TARGET, JSON.stringify(out, null, 2), 'utf8');

// 统计
const byTopic = {};
out.forEach((q) => { byTopic[q.topic] = (byTopic[q.topic] || 0) + 1; });
const multi = converted.filter((q) => q.type === 'multi').length;
console.log('新增题目:', converted.length, '(其中多选', multi, '道)');
console.log('总题目:', out.length);
if (dup.length) console.log('跳过重复标题:', dup.length, dup);
console.log('--- 全部分专题统计 ---');
Object.keys(byTopic).sort().forEach((t) => console.log('  ' + t + ': ' + byTopic[t]));
