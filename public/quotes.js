// 总书记金句库（公开报道整理，用于每日学习）
// 每日按日历自动轮换，同一天所有人看到同一句。
const QUOTES = [
  { text: "幸福都是奋斗出来的。", source: "2018年新年贺词" },
  { text: "人民对美好生活的向往，就是我们的奋斗目标。", source: "2012年记者见面会" },
  { text: "绿水青山就是金山银山。", source: "生态文明重要理念" },
  { text: "撸起袖子加油干。", source: "2017年新年贺词" },
  { text: "不忘初心，牢记使命。", source: "党的十九大" },
  { text: "小康不小康，关键看老乡。", source: "扶贫重要论述" },
  { text: "扶贫开发贵在精准，重在精准，成败之举在于精准。", source: "关于精准扶贫" },
  { text: "青年兴则国家兴，青年强则国家强。", source: "党的十九大报告" },
  { text: "江山就是人民，人民就是江山。", source: "庆祝建党100周年大会" },
  { text: "征途漫漫，惟有奋斗。", source: "2021年新年贺词" },
  { text: "功成不必在我，功成必定有我。", source: "谈正确政绩观" },
  { text: "乡村振兴是一盘大棋，要把这盘大棋走好。", source: "谈乡村振兴" },
  { text: "让广大农民在乡村振兴中有更多获得感、幸福感、安全感。", source: "谈乡村振兴" },
  { text: "中国人的饭碗要牢牢端在自己手中。", source: "谈粮食安全" },
  { text: "把论文写在祖国的大地上。", source: "对科技工作者寄语" },
  { text: "空谈误国，实干兴邦。", source: "多次强调" },
  { text: "时代是出卷人，我们是答卷人，人民是阅卷人。", source: "谈赶考之路" },
  { text: "奋斗是青春最亮丽的底色。", source: "纪念五四运动100周年大会" },
  { text: "青年一代有理想、有本领、有担当，国家就有前途，民族就有希望。", source: "党的十九大报告" },
  { text: "脱贫摘帽不是终点，而是新生活、新奋斗的起点。", source: "全国脱贫攻坚总结表彰大会" },
  { text: "打铁必须自身硬。", source: "谈全面从严治党" },
  { text: "让人民群众在每一个司法案件中感受到公平正义。", source: "谈全面依法治国" },
  { text: "新时代中国青年要以实现中华民族伟大复兴为己任，增强做中国人的志气、骨气、底气。", source: "庆祝建党100周年大会" },
  { text: "我们都在努力奔跑，我们都是追梦人。", source: "2019年新年贺词" },
  { text: "只争朝夕，不负韶华。", source: "2020年新年贺词" },
  { text: "路虽远，行则将至；事虽难，做则必成。", source: "2023年新年贺词" },
  { text: "民之所忧，我必念之；民之所盼，我必行之。", source: "2022年新年贺词" },
  { text: "千头万绪的事，说到底是千家万户的事。", source: "2022年新年贺词" },
  { text: "人不负青山，青山定不负人。", source: "生态文明重要论述" },
  { text: "上面千条线，下面一根针，基层干部就是穿针引线的人。", source: "谈基层治理" }
];

// 按日历日确定性轮换：同一天返回同一句，每天不同。
function getDailyQuote(date) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(2024, 0, 1); // 固定纪元，避免跨年跳变
  const diffDays = Math.floor((d - start) / 86400000);
  const idx = ((diffDays % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[idx];
}

// 便于测试：按第 n 天取句（n 从 0 开始）
function getQuoteByDay(n) {
  const idx = ((n % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[idx];
}
