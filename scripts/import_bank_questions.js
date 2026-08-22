/**
 * 把两个课堂讲义题库导入为系统 lawQuestions 格式
 *  - exam_questions.js   （刑法 · 丹丹老师 33 题） → data/xingfa_questions.json
 *  - 宪法专题题库.js      （宪法四讲 10 题）        → data/xianfa_questions.json
 *
 * 字段：{ id, cat, section, type:'choice'|'multi'|'judge', title, options:[], correctAnswer:int|int[], analysis, topic }
 * 用法：node scripts/import_bank_questions.js
 * 可用环境变量覆盖源文件路径：XINGFA、XIANFA
 */
const fs = require('fs');
const path = require('path');

const XINGFA = process.env.XINGFA || 'C:/Users/Administrator/WorkBuddy/2026-08-20-23-27-06/exam_questions.js';
const XIANFA = process.env.XIANFA || 'C:/Users/Administrator/WorkBuddy/2026-08-22-10-13-50/宪法专题题库.js';
const OUT_DIR = path.join(__dirname, '..', 'data');

const L = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

function letterIdx(ans) {
  const s = String(ans).trim().toUpperCase();
  if (s === '正确') return 0;
  if (s === '错误') return 1;
  return L[s] !== undefined ? L[s] : -1;
}
function multiIdx(ans) {
  return String(ans).trim().toUpperCase().split('').filter((c) => L[c] !== undefined).map((c) => L[c]);
}
const TYPE_NAME = { choice: '单选', multi: '多选', judge: '判断' };

// ============ 刑法（exam_questions.js） ============
const xfSection = {
  第二讲: '第二讲 犯罪',
  第三讲: '第三讲 犯罪（续）',
  第四讲: '第四讲 犯罪（下）',
  第五讲: '第五讲 刑罚',
  第六讲: '第六讲 分则罪名',
};

function convertXingfa(raw) {
  return raw.map((q, i) => {
    let type = q.type === '多选' ? 'multi' : (q.type === '判断' ? 'judge' : 'choice');
    let correctAnswer;
    if (type === 'multi') correctAnswer = multiIdx(q.answer);
    else if (type === 'judge') correctAnswer = letterIdx(q.answer); // 正确=0 错误=1
    else correctAnswer = letterIdx(q.answer);
    let analysis = String(q.analysis || '');
    // 修正源卷错误题：刑法 Q2 刑事责任年龄，正确项应为 C（已满14不满18周岁犯罪应当从轻或减轻处罚）
    if (q.id === 2) {
      type = 'choice';
      correctAnswer = 2; // C
      analysis = 'C对：已满十四周岁不满十八周岁的人犯罪，应当从轻或者减轻处罚（《刑法》第17条第4款），故17周岁犯抢劫罪应从轻或减轻。A错：已满14不满16周岁的人仅对故意杀人、故意伤害致人重伤或死亡、强奸、抢劫、贩卖毒品、放火、爆炸、投放危险物质8种犯罪负刑事责任，并非一切犯罪。B错：15周岁生日当天仍算14周岁，盗窃不在8种之列，不负刑责。D错：16周岁生日前一天仍算15周岁（14-16档），放火在8种之列，应当负刑责。生日细节：生日当日算实岁-1，次日才算满。注意：源卷答案误标为D（其解析自相矛盾），本题正确答案为C。';
    }
    return {
      id: 'xf' + (i + 1),
      cat: '刑法·课堂讲义',
      section: xfSection[q.lecture] || q.lecture,
      type,
      title: String(q.question || '').replace(/\s+/g, ' ').trim(),
      options: type === 'judge' ? ['正确', '错误'] : (q.options || []).map((o) => String(o)),
      correctAnswer,
      analysis,
      topic: q.topic || '',
    };
  });
}

// ============ 宪法（宪法专题题库.js） ============
function convertXianfa(raw) {
  const out = [];
  raw.forEach((q, i) => {
    const id = 'xa' + (i + 1);
    const base = {
      id,
      cat: '宪法·专题四讲',
      section: String(q.lecture || ''),
      topic: q.topic || '',
      analysis: String(q.explanation || q.analysis || ''),
    };
    if (q.type === 'fill' || !q.options) {
      // 填空/无选项题转单选题（保留原考点与知识点）
      if (q.id === 2) {
        out.push(Object.assign({}, base, {
          type: 'choice',
          title: '我国现行宪法公布实施40年来，全国人大先后五次对宪法内容作出必要的修正。下列关于历次修宪内容的对应关系，表述正确的是（　）。',
          options: [
            '1988年修宪增加「国家允许私营经济在法律规定的范围内存在和发展」',
            '1993年修宪将「依法治国，建设社会主义法治国家」写入宪法',
            '1999年修宪将「社会主义初级阶段」和「建设有中国特色社会主义理论」写入宪法',
            '2004年修宪将国家建设目标修改为「富强民主文明和谐美丽的社会主义现代化强国」',
          ],
          correctAnswer: 0,
          analysis: 'A正确：1988年首次修宪，允许私营经济存在和发展。B错误：「依法治国，建设社会主义法治国家」于1999年修宪写入（1993年修宪内容是写入「社会主义初级阶段」和「建设有中国特色社会主义理论」）。C错误：1993年修宪写入「社会主义初级阶段」（1999年修宪将邓小平理论写入宪法）。D错误：2018年修宪将国家建设目标修改为「富强民主文明和谐美丽」（2004年修宪写入「国家尊重和保障人权」）。',
        }));
      } else if (q.id === 10) {
        out.push(Object.assign({}, base, {
          type: 'choice',
          title: '2020年疫情期间，我国授予钟南山「共和国勋章」。下列关于这一国家荣誉授予程序的表述，正确的是（　）。',
          options: [
            '由全国人大常委会决定，由国家主席授予',
            '由国家主席直接决定并授予',
            '由全国人大决定，由国家主席授予',
            '由全国人大常委会决定并直接授予',
          ],
          correctAnswer: 0,
          analysis: '授予共和国勋章属于国家荣誉制度：决定权在全国人大常委会（2020年授予钟南山共和国勋章即由全国人大常委会决定），由国家主席授予。注意区分「决定机关」（全国人大常委会）与「授予机关」（国家主席）。',
        }));
      }
      return;
    }
    const optsObj = q.options && typeof q.options === 'object' ? q.options : {};
    const opts = ['A', 'B', 'C', 'D', 'E', 'F'].filter((k) => optsObj[k] !== undefined).map((k) => String(optsObj[k]));
    let answer = letterIdx(q.answer);
    let analysis = base.analysis;
    // 修正源卷错误题：宪法 Q4，正确答案应为 D（2004年修正案写入「国家尊重和保障人权」）
    if (q.id === 4) {
      answer = 3; // D
      analysis = 'D正确：2004年《宪法修正案》增加「国家尊重和保障人权」（第33条第3款）。A错误：「依法服兵役」是公民的基本义务而非权利，宪法中劳动、受教育才是既属权利又属义务；源卷答案误标为A。B错误：休息权的主体是劳动者，不是全体公民。C错误：「尚未丧失劳动能力」应为「丧失劳动能力」（年老、疾病或者丧失劳动能力时才有物质帮助权）。';
    }
    out.push(Object.assign({}, base, {
      type: 'choice',
      title: String(q.question || '').replace(/\s+/g, ' ').trim(),
      options: opts,
      correctAnswer: answer,
    }));
  });
  return out;
}

// ============ 执行 ============
const xfRaw = require(XINGFA);
const xaRaw = require(XIANFA);
const xf = convertXingfa(xfRaw);
const xa = convertXianfa(xaRaw);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'xingfa_questions.json'), JSON.stringify(xf, null, 1), 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'xianfa_questions.json'), JSON.stringify(xa, null, 1), 'utf8');

console.log('刑法（课堂讲义）:', xf.length, '题 →', path.join(OUT_DIR, 'xingfa_questions.json'));
console.log('宪法（专题四讲）:', xa.length, '题 →', path.join(OUT_DIR, 'xianfa_questions.json'));
const bySec = (arr) => arr.reduce((m, q) => (m[q.section] = (m[q.section] || 0) + 1, m), {});
console.log('刑法分节:', JSON.stringify(bySec(xf)));
console.log('宪法分节:', JSON.stringify(bySec(xa)));
console.log('题型分布(刑):', JSON.stringify(xf.reduce((m, q) => (m[TYPE_NAME[q.type]] = (m[TYPE_NAME[q.type]] || 0) + 1, m), {})));
console.log('题型分布(宪):', JSON.stringify(xa.reduce((m, q) => (m[TYPE_NAME[q.type]] = (m[TYPE_NAME[q.type]] || 0) + 1, m), {})));
