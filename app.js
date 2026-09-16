/* =====================================================
 * 个人成长工作台 - v1.2
 * 新增：四六级目标分数 + AI 分析 / 每周 AI 复盘 / AI 作文批改
 * AI 引擎：本地规则（零依赖、零配置）
 * OCR：按需加载 tesseract.js（首次使用图片识别时下载约 13MB）
 * ===================================================== */

const STORAGE_KEY = 'growth_workbench_v3';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const defaultState = {
  cet: {
    examDate: '2026-12-12',
    goalScore: null,         // 目标分数（425/500/600/650...）
    customTasks: [],
    recordsA: [],            // { id, date, type:'听力'|'阅读', total, right }
    recordsB: [],            // { id, date, type:'作文'|'翻译', count }
    gradeHistory: [],        // { id, date, type, text, score, issues, suggestions, gap }
  },
  exams: [
    { id: genId(), name: '教资', date: '2027-03-15', signDate: '', note: '预计 2027 年 3 月', plans: [] },
    { id: genId(), name: '计算机二级', date: '2027-03-15', signDate: '', note: '预计 2027 年 3 月', plans: [] },
  ],
  weight: {
    goal: 55,
    targetDate: '2027-01-10',
    startWeight: 69.3,
    startDate: '2026-09-14',
    weeklyRecords: [],
  },
  weeklyReviews: [],         // AI 生成的每周复盘
  collapsed: {},
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      cet: {
        examDate: parsed.cet?.examDate || defaultState.cet.examDate,
        goalScore: parsed.cet?.goalScore ?? null,
        customTasks: parsed.cet?.customTasks || [],
        recordsA: parsed.cet?.recordsA || [],
        recordsB: parsed.cet?.recordsB || [],
        gradeHistory: parsed.cet?.gradeHistory || [],
      },
      exams: parsed.exams || defaultState.exams,
      weight: {
        goal: parsed.weight?.goal ?? 55,
        targetDate: parsed.weight?.targetDate || '2027-01-10',
        startWeight: parsed.weight?.startWeight ?? 69.3,
        startDate: parsed.weight?.startDate || '2026-09-14',
        weeklyRecords: parsed.weight?.weeklyRecords || [],
      },
      weeklyReviews: parsed.weeklyReviews || [],
      collapsed: parsed.collapsed || {},
    };
  } catch (e) {
    console.warn('数据加载失败', e);
    return structuredClone(defaultState);
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('保存失败：' + e.message); }
}

let state = loadState();

/* ===== 工具 ===== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}
function daysBetween(d) {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((t - now) / 86400000);
}
function fmtDate(d) {
  if (!d) return '--';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function fmtDateShort(d) {
  const dt = new Date(d);
  return `${dt.getMonth()+1}月${dt.getDate()}日`;
}
function todayStr() { return fmtDate(new Date()); }
function getWeekRange(date = new Date()) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return {
    label: getISOWeek(date),
    start: fmtDate(mon), end: fmtDate(sun),
    startShort: fmtDateShort(mon), endShort: fmtDateShort(sun),
  };
}
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const ys = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()} W${String(Math.ceil((((d-ys)/86400000)+1)/7)).padStart(2,'0')}`;
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function gapBadge(level) {
  return level === 'bad' ? '差' : level === 'good' ? '达成' : '一般';
}

/* ===== AI 引擎：四六级分数分析 =====
 * 基于 CET-4/6 标准分换算经验模型：
 * - 总分 710，听力 249、阅读 249、作文+翻译 212（翻译 106 + 作文 106）
 * - 听力 25 题 × 7.1 分/题 ≈ 248.5
 * - 阅读 30 题（选词10×3.55 + 段落匹配10×7.1 + 仔细阅读10×14.2）
 * - 简单映射：每 1% 正确率 ≈ 听力 9.96 分、阅读 8.3 分
 */
function aiCetAnalysis() {
  const goal = state.cet.goalScore;
  if (!goal) return null;

  // 计算当前平均正确率（按权重：听力与阅读各占一半）
  const allA = state.cet.recordsA;
  if (allA.length === 0) {
    return { hasData: false, goal };
  }
  // 分别计算听力 / 阅读正确率
  let lisTotal = 0, lisRight = 0, readTotal = 0, readRight = 0;
  allA.forEach(r => {
    if (r.type === '听力') { lisTotal += r.total; lisRight += r.right; }
    if (r.type === '阅读') { readTotal += r.total; readRight += r.right; }
  });
  const lisRate = lisTotal > 0 ? Math.round(lisRight / lisTotal * 100) : null;
  const readRate = readTotal > 0 ? Math.round(readRight / readTotal * 100) : null;

  // 按总分倒推目标正确率（基于 600 分目标反推的经验区间）
  // 600 分通常需要：听力 60%、阅读 65%、作文翻译中等偏上
  const targetLisRate = goal >= 600 ? 65 : goal >= 500 ? 55 : goal >= 425 ? 45 : 35;
  const targetReadRate = goal >= 600 ? 70 : goal >= 500 ? 60 : goal >= 425 ? 50 : 40;
  // 作文翻译档位
  let writingLevel = '';
  if (goal >= 650) writingLevel = '高分档';
  else if (goal >= 600) writingLevel = '优秀档';
  else if (goal >= 500) writingLevel = '良好档';
  else if (goal >= 425) writingLevel = '及格档';
  else writingLevel = '基础档';

  // 作文篇数：按档位倒推每周训练量
  const writePerWeek = goal >= 600 ? 2 : goal >= 500 ? 1 : 1;
  const translatePerWeek = goal >= 600 ? 2 : goal >= 500 ? 1 : 1;

  // 差距判定
  function gapLevel(cur, target) {
    if (cur === null) return 'ok';
    const diff = target - cur;
    if (diff <= 0) return 'good';
    if (diff <= 10) return 'ok';
    return 'bad';
  }
  const lisGap = gapLevel(lisRate, targetLisRate);
  const readGap = gapLevel(readRate, targetReadRate);

  return {
    hasData: true,
    goal,
    lisRate, readRate,
    targetLisRate, targetReadRate,
    lisGap, readGap,
    writingLevel,
    writePerWeek, translatePerWeek,
  };
}

/* ===== AI 引擎：每周复盘 ===== */
function aiWeeklyReview() {
  const week = getWeekRange();
  // 收集本周数据
  const mon = new Date(week.start + 'T00:00:00');
  const sun = new Date(week.end + 'T23:59:59');

  // CET A
  let lisTotal = 0, lisRight = 0, readTotal = 0, readRight = 0;
  state.cet.recordsA.forEach(r => {
    const t = new Date(r.date + 'T00:00:00');
    if (t >= mon && t <= sun) {
      if (r.type === '听力') { lisTotal += r.total; lisRight += r.right; }
      if (r.type === '阅读') { readTotal += r.total; readRight += r.right; }
    }
  });
  const lisRate = lisTotal > 0 ? Math.round(lisRight/lisTotal*100) : null;
  const readRate = readTotal > 0 ? Math.round(readRight/readTotal*100) : null;

  // CET B
  let essayCount = 0, transCount = 0;
  state.cet.recordsB.forEach(r => {
    const t = new Date(r.date + 'T00:00:00');
    if (t < mon || t > sun) return;
    if (r.type === '作文') essayCount += r.count;
    if (r.type === '翻译') transCount += r.count;
  });
  const cetBDone = essayCount + transCount;

  // 减肥
  const wk = state.weight.weeklyRecords.find(r => r.weekLabel === week.label);
  let weightInfo = null;
  if (wk) {
    const delta = +(wk.endW - wk.startW).toFixed(1);
    const remainingDays = daysBetween(state.weight.targetDate) ?? 0;
    const remainingKg = +(wk.endW - state.weight.goal).toFixed(1);
    const targetDeltaPerWeek = remainingDays > 0 && remainingKg > 0
      ? +(remainingKg / Math.ceil(remainingDays/7)).toFixed(2)
      : 0.5;
    weightInfo = {
      startW: wk.startW, endW: wk.endW, delta,
      exercise: wk.exercise, rating: wk.rating,
      tweak: wk.tweak,
      remainingKg, remainingDays, targetDeltaPerWeek,
      goalReached: delta <= 0,
    };
  }

  // 考试
  const examInfo = state.exams
    .filter(e => e.date)
    .map(e => ({
      name: e.name,
      days: daysBetween(e.date),
      plans: e.plans.length,
      donePlans: e.plans.filter(p => p.done).length,
    }));

  // 拼装
  const sections = [];

  // 1) 本周亮点
  const highlights = [];
  if (lisRate !== null && lisRate >= 65) highlights.push(`听力平均正确率 ${lisRate}%，已接近 600 分目标线`);
  if (readRate !== null && readRate >= 65) highlights.push(`阅读平均正确率 ${readRate}%，发挥稳定`);
  if (cetBDone >= 3) highlights.push(`作文+翻译共完成 ${cetBDone} 篇，超额完成`);
  if (weightInfo && weightInfo.delta < 0) highlights.push(`本周体重下降 ${Math.abs(weightInfo.delta)} kg，趋势良好`);
  if (weightInfo && weightInfo.exercise >= 4) highlights.push(`运动 ${weightInfo.exercise} 次，频次达标`);
  if (examInfo.length > 0) {
    examInfo.forEach(e => {
      if (e.donePlans > 0) highlights.push(`${e.name}完成 ${e.donePlans} 项备考计划`);
    });
  }
  if (highlights.length === 0) highlights.push('本周数据较少，建议先从每天的小目标开始积累');
  sections.push({ title: '✅ 本周做得好的地方', type: 'list', body: highlights });

  // 2) 存在的问题
  const issues = [];
  if (lisRate !== null && lisRate < 55) issues.push(`听力正确率仅 ${lisRate}%，离 600 分目标（${state.cet.goalScore ? '需 65%+' : '建议 65%'}）差距较大`);
  if (readRate !== null && readRate < 60) issues.push(`阅读正确率 ${readRate}%，需重点突破长篇阅读和仔细阅读`);
  if (cetBDone < 2 && essayCount + transCount < 2) issues.push(`作文/翻译仅完成 ${cetBDone} 篇，建议每周至少 2 篇保底`);
  if (weightInfo) {
    if (weightInfo.delta > 0) issues.push(`本周体重 ${weightInfo.delta > 0 ? '上涨' : '下降'} ${Math.abs(weightInfo.delta)} kg，未达成周降目标`);
    if (weightInfo.exercise < 3) issues.push(`运动仅 ${weightInfo.exercise} 次，频次不足，建议每周 4 次以上`);
    if (weightInfo.rating === '差') issues.push('饮食自评为差，需调整饮食结构');
  }
  if (issues.length === 0) issues.push('暂无明显短板，继续保持节奏');
  sections.push({ title: '⚠️ 存在的问题', type: 'list', body: issues });

  // 3) 与目标的差距
  const gapLines = [];
  const cetDays = daysBetween(state.cet.examDate);
  if (cetDays !== null && cetDays > 0) {
    gapLines.push(`距四六级考试还有 ${cetDays} 天`);
  }
  if (state.cet.goalScore) {
    if (lisRate !== null) {
      const diff = Math.max(0, 65 - lisRate);
      gapLines.push(`听力距目标差 ${diff}% 正确率 ≈ ${Math.round(diff * 9.96)} 分`);
    }
    if (readRate !== null) {
      const diff = Math.max(0, 70 - readRate);
      gapLines.push(`阅读距目标差 ${diff}% 正确率 ≈ ${Math.round(diff * 8.3)} 分`);
    }
  }
  if (weightInfo) {
    gapLines.push(`距目标 ${state.weight.goal}kg 还差 ${weightInfo.remainingKg} kg，按剩余 ${weightInfo.remainingDays} 天计算，每周需降 ${weightInfo.targetDeltaPerWeek} kg`);
  }
  if (gapLines.length === 0) gapLines.push('目标尚未设置，建议先到顶部设定四六级目标分数与减肥目标');
  sections.push({ title: '🎯 与目标的差距', type: 'text', body: gapLines.join('\n') });

  // 4) 下周执行建议（带数字）
  const next = [];
  // CET 建议
  if (lisRate === null) next.push('听力：下周至少完成 2 套真题，目标正确率 60%');
  else if (lisRate < 55) next.push(`听力：下周每天精听 1 篇，重点精听新闻/对话，目标正确率提至 ${lisRate + 10}%`);
  else if (lisRate < 70) next.push(`听力：保持每日 1 套，目标正确率提至 ${lisRate + 5}%`);
  else next.push(`听力：稳定发挥，每周 1 次模考即可，目标 ${lisRate}%`);

  if (readRate === null) next.push('阅读：下周完成 3 篇仔细阅读 + 1 篇匹配，目标正确率 60%');
  else if (readRate < 60) next.push(`阅读：重点突破仔细阅读，下周完成 10 篇，目标正确率提至 ${readRate + 10}%`);
  else next.push(`阅读：稳定发挥，每周模考 1 套，目标正确率 ${readRate}%`);

  next.push(`作文：下周写 ${state.cet.goalScore && state.cet.goalScore >= 600 ? 2 : 1} 篇，每篇控制在 30 分钟内`);
  next.push(`翻译：下周完成 ${state.cet.goalScore && state.cet.goalScore >= 600 ? 2 : 1} 篇，重点练中国特色词汇`);

  // 减肥建议
  if (weightInfo) {
    if (weightInfo.exercise < 4) next.push(`运动：从下周起每周至少 4 次（当前 ${weightInfo.exercise} 次），可拆为 3 次有氧 + 1 次力量`);
    if (weightInfo.rating !== '好') next.push(`饮食：${weightInfo.tweak ? '执行「' + weightInfo.tweak + '」' : '减少精制糖与油炸'}，争取下周饮食自评升一档`);
    if (weightInfo.delta > 0) next.push(`体重：本周反弹 ${weightInfo.delta} kg，下周优先恢复节奏，每天称重 1 次记录趋势`);
  } else {
    next.push('减肥：本周未填写体重，先从下周一记录起始体重开始');
  }

  // 考试
  examInfo.forEach(e => {
    if (e.days !== null && e.days > 0 && e.days < 60) {
      next.push(`${e.name}：距考试 ${e.days} 天，建议每天刷 20 道选择题`);
    }
  });

  sections.push({ title: '📋 下周执行建议（带数字）', type: 'list', body: next });

  return { week, sections, hasData: true };
}

/* ===== AI 引擎：作文/翻译批改 =====
 * 纯前端规则：
 * - 词数统计
 * - 高级词汇密度（统计长度 ≥ 7 的词占比）
 * - 常见 CET 句型检测
 * - 模板句检测（首先/其次/总之 等低分信号）
 * - 拼写可疑词（大写/连续字母/超长串）
 */
function aiGradeEssay(text, type) {
  const issues = [];
  const suggestions = [];

  // 文本清洗
  const clean = text.trim();
  if (!clean) {
    return null;
  }

  // 基础统计
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = clean.match(/[a-zA-Z']+/g) || [];
  const wordCount = words.length;
  const longWords = words.filter(w => w.length >= 7);
  const longRatio = words.length > 0 ? Math.round(longWords.length / words.length * 100) : 0;

  // 1. 词数判定（CET-4 作文 120-180 词、翻译 140-160 汉字折合 80-100 词）
  let wordScore = 100;
  if (type === '作文') {
    if (wordCount < 100) { wordScore = 60; issues.push(`词数 ${wordCount} 偏少，CET-4 作文要求 120-180 词`); }
    else if (wordCount > 200) { wordScore = 75; issues.push(`词数 ${wordCount} 偏多，可能啰嗦，建议控制在 150-180 词`); }
    else { wordScore = 95; suggestions.push(`词数 ${wordCount}，符合 CET-4 作文长度要求`); }
  } else {
    // 翻译：按中文汉字数判断
    const cnChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (cnChars < 100) { wordScore = 65; issues.push(`中文 ${cnChars} 字偏少，翻译通常 140-160 字`); }
    else if (cnChars > 180) { wordScore = 80; issues.push(`中文 ${cnChars} 字偏多，可能超出范围`); }
    else { wordScore = 92; suggestions.push(`中文 ${cnChars} 字，符合翻译长度要求`); }
  }

  // 2. 高级词汇密度
  let vocabScore = 100;
  if (longRatio < 10) { vocabScore = 65; issues.push(`高级词汇（≥7 字母）占比仅 ${longRatio}%，表达偏基础`); suggestions.push('建议替换基础词：important → significant / crucial，good → excellent / favorable'); }
  else if (longRatio < 20) { vocabScore = 80; suggestions.push(`高级词汇占比 ${longRatio}%，可以再丰富一些`); }
  else { vocabScore = 95; suggestions.push(`高级词汇占比 ${longRatio}%，词汇面不错`); }

  // 3. 模板句检测
  const templatePatterns = [
    { re: /\bfirst(ly)?[\s,]/i, name: '"first/ firstly" 模板词' },
    { re: /\bsecond(ly)?[\s,]/i, name: '"second/ secondly" 模板词' },
    { re: /\b(in conclusion|to sum up|in summary|all in all)\b/i, name: '模板收束句' },
    { re: /\bwith the development of\b/i, name: '"with the development of" 老套开头' },
    { re: /\bmore and more\b/i, name: '"more and more" 基础搭配' },
    { re: /\bvery\s+\w+/i, name: '"very + adj" 弱修饰' },
    { re: /[\u4e00-\u9fa5]/, name: '中英混输' },
  ];
  const templates = [];
  templatePatterns.forEach(p => { if (p.re.test(clean)) templates.push(p.name); });
  let templateScore = 100;
  if (templates.length >= 4) { templateScore = 55; issues.push(`模板化痕迹明显（${templates.length} 处）：${templates.slice(0,3).join('、')}`); }
  else if (templates.length >= 2) { templateScore = 70; issues.push(`存在模板句：${templates.join('、')}`); }
  else if (templates.length === 1) { templateScore = 85; suggestions.push(`个别表达可优化：${templates[0]}`); }
  if (templateScore >= 85) suggestions.push('表达较为自然，未发现明显模板句');

  // 4. 结构检测（句子数 + 段落）
  const structScore = sentences.length >= 8 && sentences.length <= 18 ? 92 :
                       sentences.length < 5 ? 65 :
                       sentences.length > 25 ? 75 : 82;
  if (sentences.length < 5) issues.push(`句子仅 ${sentences.length} 句，结构过于简单`);
  if (sentences.length > 25) issues.push(`句子达 ${sentences.length} 句，每句太短，结构松散`);
  if (structScore >= 85) suggestions.push(`句式分布合理（${sentences.length} 句）`);

  // 5. 拼写/异常检测（重复字母 ≥ 4、连续大写）
  const typoRe = /(.)\1{3,}|[A-Z]{4,}/g;
  const typos = (clean.match(typoRe) || []);
  if (typos.length > 0) {
    issues.push(`疑似拼写异常：${typos.slice(0,3).join('、')}`);
    suggestions.push('请检查标红单词拼写');
  }

  // 6. 复合句标志
  const compoundMarkers = (clean.match(/\b(which|that|because|although|while|whereas|however|therefore|nevertheless)\b/gi) || []).length;
  let compoundScore = 75 + Math.min(20, compoundMarkers * 5);
  if (compoundMarkers >= 3) suggestions.push(`复合句使用 ${compoundMarkers} 处，句式多样`);
  else if (compoundMarkers === 0) suggestions.push('建议加入 1-2 个从句/连接词提升句式复杂度（although / however / which）');

  // 总分（CET 作文翻译满分 106 → 折合百分制）
  const overall = Math.round((wordScore * 0.2 + vocabScore * 0.25 + templateScore * 0.2 + structScore * 0.15 + compoundScore * 0.2));

  // 与目标差距
  const goal = state.cet.goalScore;
  let gap = '未设置目标';
  let gapLevel = 'ok';
  if (goal) {
    // 600 分对应作文翻译约 70%+ (142/212)
    const targetWriting = Math.round((goal - 248) * 100 / 212);
    const diff = targetWriting - overall;
    if (diff <= 0) { gap = `已超过目标档（${targetWriting}%）`; gapLevel = 'good'; }
    else if (diff <= 8) { gap = `距目标 ${diff} 分（目标约 ${targetWriting}%）`; gapLevel = 'ok'; }
    else { gap = `距目标 ${diff} 分（目标约 ${targetWriting}%）`; gapLevel = 'bad'; }
  }

  return {
    overall,
    issues,
    suggestions,
    gap, gapLevel,
    stats: { wordCount, longRatio, sentences: sentences.length, templates, compoundMarkers },
  };
}

/* ===== 渲染：日期 ===== */
function renderDate() {
  const d = new Date();
  const w = ['周日','周一','周二','周三','周四','周五','周六'];
  $('#todayDate').textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 · ${w[d.getDay()]}`;
}

/* ===== 渲染：四六级 ===== */
function cetStatsA() {
  const week = getWeekRange();
  const mon = new Date(week.start + 'T00:00:00');
  const sun = new Date(week.end + 'T23:59:59');
  const recs = state.cet.recordsA.filter(r => {
    const t = new Date(r.date + 'T00:00:00');
    return t >= mon && t <= sun && r.total > 0;
  });
  let totalQ = 0, rightQ = 0;
  recs.forEach(r => { totalQ += r.total; rightQ += r.right; });
  const avg = totalQ > 0 ? Math.round(rightQ/totalQ*100) : 0;

  // 趋势
  const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7);
  const prevSun = new Date(mon); prevSun.setDate(prevSun.getDate() - 1);
  const prevRecs = state.cet.recordsA.filter(r => {
    const t = new Date(r.date + 'T00:00:00');
    return t >= prevMon && t <= prevSun && r.total > 0;
  });
  let pT=0, pR=0; prevRecs.forEach(r => { pT += r.total; pR += r.right; });
  const prevAvg = pT > 0 ? Math.round(pR/pT*100) : null;
  let trend = '→';
  if (prevAvg !== null && totalQ > 0) {
    if (avg > prevAvg) trend = '↗';
    else if (avg < prevAvg) trend = '↘';
  }
  return { avg, trend, totalQ };
}
function cetStatsB() {
  const week = getWeekRange();
  const mon = new Date(week.start + 'T00:00:00');
  const sun = new Date(week.end + 'T23:59:59');
  const recs = state.cet.recordsB.filter(r => {
    const t = new Date(r.date + 'T00:00:00');
    return t >= mon && t <= sun;
  });
  return { total: recs.reduce((s,r) => s + r.count, 0) };
}

function renderCET() {
  const cet = state.cet;
  const days = daysBetween(cet.examDate);
  $('#cetCountdown').textContent = days !== null ? `${days} 天` : '-- 天';

  // 目标分数
  $('#cetGoalDisplay').textContent = cet.goalScore ? `${cet.goalScore} 分` : '-- 分';

  // AI 分析
  renderCetAI();

  // A 类
  const a = cetStatsA();
  $('#cetAStat').textContent = a.totalQ > 0 ? `本周平均 ${a.avg}% ${a.trend}` : '本周平均 --%';
  const aList = $('#cetAList'); aList.innerHTML = '';
  [...cet.recordsA].reverse().slice(0, 10).forEach(r => {
    const rate = r.total > 0 ? Math.round(r.right/r.total*100) : 0;
    const item = document.createElement('div');
    item.className = 'cet-record';
    item.innerHTML = `
      <span class="cr-type">${escapeHtml(r.type)}</span>
      <span class="cr-info">${r.right}<b>/</b>${r.total} 题</span>
      <span class="cr-rate">${rate}%</span>
      <span class="cr-date">${r.date.slice(5)}</span>
      <button class="cr-del" data-adel="${r.id}">×</button>
    `;
    aList.appendChild(item);
  });
  if (cet.recordsA.length === 0) {
    aList.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:6px 2px;font-weight:600;">暂无记录</div>';
  }

  // B 类
  const b = cetStatsB();
  $('#cetBStat').textContent = `本周 ${b.total} 篇`;
  const bList = $('#cetBList'); bList.innerHTML = '';
  [...cet.recordsB].reverse().slice(0, 10).forEach(r => {
    const item = document.createElement('div');
    item.className = 'cet-record';
    item.innerHTML = `
      <span class="cr-type" style="background:#f6efd8;color:#8a6e2a;">${escapeHtml(r.type)}</span>
      <span class="cr-info">完成 <b>${r.count}</b> 篇</span>
      <span class="cr-date">${r.date.slice(5)}</span>
      <button class="cr-del" data-bdel="${r.id}">×</button>
    `;
    bList.appendChild(item);
  });
  if (cet.recordsB.length === 0) {
    bList.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:6px 2px;font-weight:600;">暂无记录</div>';
  }

  // 仪表盘
  $('#dashCetDays').textContent = days !== null ? `${days} 天` : '--';
  const lisTotal = state.cet.recordsA.filter(r => r.type === '听力').reduce((s,r) => s + r.total, 0);
  const lisRight = state.cet.recordsA.filter(r => r.type === '听力').reduce((s,r) => s + r.right, 0);
  const readTotal = state.cet.recordsA.filter(r => r.type === '阅读').reduce((s,r) => s + r.total, 0);
  const readRight = state.cet.recordsA.filter(r => r.type === '阅读').reduce((s,r) => s + r.right, 0);
  const allT = lisTotal + readTotal, allR = lisRight + readRight;
  const overallRate = allT > 0 ? Math.round(allR/allT*100) : null;
  $('#dashCetProgress').textContent = overallRate !== null ? `整体 ${overallRate}% · 目标 ${state.cet.goalScore || '--'}` : '完成度 0%';

  // 自定义任务
  const tList = $('#cetTaskList');
  tList.innerHTML = '';
  cet.customTasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.innerHTML = `
      <button class="task-check ${task.done?'done':''}" data-id="${task.id}"></button>
      <span class="task-text ${task.done?'done':''}">${escapeHtml(task.text)}</span>
      <button class="task-delete" data-del="${task.id}">×</button>
    `;
    tList.appendChild(item);
  });

  // 批改历史
  renderGradeHistory();
}

function renderCetAI() {
  const el = $('#cetAIContent');
  const analysis = aiCetAnalysis();
  if (!analysis) {
    el.innerHTML = '<div class="ai-empty">请先在右上「设置」填写目标分数。</div>';
    return;
  }
  if (!analysis.hasData) {
    el.innerHTML = `<div class="ai-empty">已设置目标 <b>${analysis.goal} 分</b>。录入听力/阅读记录后，AI 将自动分析所需正确率。</div>`;
    return;
  }
  const a = analysis;
  el.innerHTML = `
    <div class="ai-block">
      <div class="ai-block-title">听力分析</div>
      <div class="ai-row">
        <span class="ar-label">当前正确率</span>
        <span><span class="ar-value">${a.lisRate === null ? '--' : a.lisRate + '%'}</span> ${a.lisRate !== null ? `<span class="ar-gap ${a.lisGap}">${gapBadge(a.lisGap)}</span>` : ''}</span>
      </div>
      <div class="ai-row">
        <span class="ar-label">目标正确率（${a.goal} 分）</span>
        <span class="ar-value">${a.targetLisRate}%</span>
      </div>
      ${a.lisRate !== null ? `<div class="ai-progress"><div class="ai-progress-fill" style="width:${Math.min(100, a.lisRate/a.targetLisRate*100)}%"></div></div>` : ''}
      ${a.lisRate !== null && a.lisGap !== 'good' ? `<div class="ai-tip">距目标差 <b>${a.targetLisRate - a.lisRate}%</b> 正确率，相当于 <b>${Math.round((a.targetLisRate - a.lisRate) * 9.96)}</b> 分。建议：每天精听 1 篇新闻 + 1 段对话。</div>` : ''}
    </div>

    <div class="ai-block">
      <div class="ai-block-title">阅读分析</div>
      <div class="ai-row">
        <span class="ar-label">当前正确率</span>
        <span><span class="ar-value">${a.readRate === null ? '--' : a.readRate + '%'}</span> ${a.readRate !== null ? `<span class="ar-gap ${a.readGap}">${gapBadge(a.readGap)}</span>` : ''}</span>
      </div>
      <div class="ai-row">
        <span class="ar-label">目标正确率（${a.goal} 分）</span>
        <span class="ar-value">${a.targetReadRate}%</span>
      </div>
      ${a.readRate !== null ? `<div class="ai-progress"><div class="ai-progress-fill" style="width:${Math.min(100, a.readRate/a.targetReadRate*100)}%"></div></div>` : ''}
      ${a.readRate !== null && a.readGap !== 'good' ? `<div class="ai-tip">距目标差 <b>${a.targetReadRate - a.readRate}%</b> 正确率，相当于 <b>${Math.round((a.targetReadRate - a.readRate) * 8.3)}</b> 分。建议：每天完成 1 篇仔细阅读 + 1 篇段落匹配。</div>` : ''}
    </div>

    <div class="ai-block">
      <div class="ai-block-title">作文 / 翻译（${a.writingLevel}）</div>
      <div class="ai-row"><span class="ar-label">建议每周篇数</span><span class="ar-value">作文 ${a.writePerWeek} 篇 + 翻译 ${a.translatePerWeek} 篇</span></div>
      <div class="ai-row"><span class="ar-label">要求</span><span class="ar-value">${a.goal >= 600 ? '结构清晰 + 高级词汇 + 多样句式' : a.goal >= 500 ? '结构完整 + 无语法硬伤' : '内容完整即可'}</span></div>
      <div class="ai-tip">${a.goal >= 600 ? '高档位需重点练三类句型：倒装 / 强调 / 从句套从句。可用下方「AI 批改」练习。' : '保持每周稳定输出，比一次性突击更有效。'}</div>
    </div>
  `;
}

/* ===== 渲染：考试 ===== */
function renderExams() {
  const list = $('#examList'); list.innerHTML = '';
  state.exams.forEach(exam => {
    const days = daysBetween(exam.date);
    const card = document.createElement('div');
    card.className = 'exam-card';
    card.innerHTML = `
      <div class="exam-head">
        <div>
          <span class="exam-title">${escapeHtml(exam.name)}</span>
          ${days !== null && days >= 0 ? `<span class="exam-countdown">${days} 天</span>` : ''}
        </div>
        <div class="exam-actions">
          <button data-edit="${exam.id}">✎</button>
          <button data-del="${exam.id}" class="delete">×</button>
        </div>
      </div>
      <div class="exam-meta">
        考试：${exam.date || '未设置'}<br>
        报名提醒：${exam.signDate || '未设置'}
      </div>
      ${exam.note ? `<div class="exam-note">${escapeHtml(exam.note)}</div>` : ''}
      <div class="exam-plans">
        <h4>备考计划</h4>
        <div class="plans-list" data-plans="${exam.id}"></div>
        <form class="plan-add" data-exam="${exam.id}">
          <input type="text" placeholder="添加计划条目…" maxlength="40" required />
          <button type="submit" class="btn-primary">+</button>
        </form>
      </div>
    `;
    list.appendChild(card);
    const plansEl = card.querySelector(`[data-plans="${exam.id}"]`);
    if (exam.plans.length === 0) {
      plansEl.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:4px 0;font-weight:600;">暂无计划</div>';
    } else {
      exam.plans.forEach(plan => {
        const p = document.createElement('div');
        p.className = 'plan-item';
        p.innerHTML = `
          <div class="plan-check ${plan.done?'done':''}" data-plan-toggle="${plan.id}" data-exam="${exam.id}">${plan.done?'✓':''}</div>
          <span class="plan-text ${plan.done?'done':''}">${escapeHtml(plan.text)}</span>
          <button class="plan-del" data-plan-del="${plan.id}" data-exam="${exam.id}">×</button>
        `;
        plansEl.appendChild(p);
      });
    }
  });
  $('#examTotal').textContent = `${state.exams.length} 场`;
  $('#dashExamCount').textContent = `${state.exams.length} 场`;
  const upcoming = state.exams
    .filter(e => e.date)
    .map(e => ({ name: e.name, days: daysBetween(e.date) }))
    .filter(e => e.days >= 0)
    .sort((a,b) => a.days - b.days)[0];
  $('#dashExamNearest').textContent = upcoming ? `${upcoming.name} ${upcoming.days}天` : '暂无安排';
}

/* ===== 渲染：减肥 ===== */
function renderWeight() {
  const w = state.weight;
  const records = w.weeklyRecords;
  const last = records.length > 0 ? records[records.length - 1] : null;
  const current = last ? last.endW : w.startWeight;
  $('#weightCurrent').textContent = current + ' kg';
  const remain = Math.max(0, +(current - w.goal).toFixed(1));
  $('#weightRemain').textContent = remain + ' kg';
  const days = daysBetween(w.targetDate);
  $('#weightCountdown').textContent = days !== null ? `${days} 天` : '--';
  $('#dashWeight').textContent = current + ' kg';
  $('#dashWeightGoal').textContent = `剩 ${remain}kg`;

  drawWeightChart(records);

  const week = getWeekRange();
  const existing = records.find(r => r.weekLabel === week.label);
  $('#weekCardTitle').textContent = `本周 · ${week.label}`;
  $('#weekCardDates').textContent = `${week.startShort} → ${week.endShort}`;
  $('#dwMonDate').textContent = `(${week.startShort})`;
  $('#dwSunDate').textContent = `(${week.endShort})`;
  $('#weekCardStatus').textContent = existing ? '已记录' : '待填写';
  $('#weekCardStatus').classList.toggle('done', !!existing);
  $('#wwStartWeight').value = existing?.startW ?? '';
  $('#wwEndWeight').value = existing?.endW ?? '';
  $('#wwExercise').value = existing?.exercise ?? '';
  $('#wwTweak').value = existing?.tweak ?? '';
  $$('#wwRatingGroup button').forEach(b => b.classList.toggle('active', existing && existing.rating === b.dataset.val));
  selectedRating = existing?.rating || '';

  const wl = $('#weeklyWeightList'); wl.innerHTML = '';
  if (records.length === 0) {
    wl.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:8px 0;font-weight:600;">还没有记录</div>';
  } else {
    [...records].reverse().forEach(r => {
      const delta = r.startW && r.endW ? (r.endW - r.startW).toFixed(1) : '--';
      const deltaColor = r.endW < r.startW ? 'color:#2d6e54' : (r.endW > r.startW ? 'color:#a85555' : '');
      const card = document.createElement('div');
      card.className = 'weekly-card';
      card.innerHTML = `
        <div class="weekly-head">
          <span class="week-label">${escapeHtml(r.weekLabel)}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="week-date">${r.monDate.slice(5)} → ${r.sunDate.slice(5)}</span>
            <button class="delete-weekly" data-wdel="${r.id}">×</button>
          </div>
        </div>
        <div class="weekly-row">
          <span>起始：<b>${r.startW} kg</b> (周一)</span>
          <span>最终：<b>${r.endW} kg</b> (周日)</span>
          <span style="${deltaColor}"><b>${delta > 0 ? '+' : ''}${delta} kg</b></span>
        </div>
        <div class="weekly-row">
          <span>运动：<b>${r.exercise} 次</b></span>
          <span>饮食：<b>${r.rating}</b></span>
        </div>
        <div class="weekly-text">微调：${escapeHtml(r.tweak)}</div>
      `;
      wl.appendChild(card);
    });
  }
}

function drawWeightChart(records) {
  const canvas = $('#weightChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = 220;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const padding = { l: 38, r: 14, t: 18, b: 30 };
  const w = cssW - padding.l - padding.r;
  const h = cssH - padding.t - padding.b;

  const points = [];
  const start = state.weight;
  points.push({ label: '起点', date: start.startDate, weight: start.startWeight, isStart: true });
  records.forEach(r => points.push({ label: r.weekLabel, date: r.sunDate, weight: r.endW }));
  if (points.length === 0) {
    ctx.fillStyle = '#aab8b4'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('暂无数据', cssW/2, cssH/2); return;
  }
  const weights = points.map(p => p.weight);
  const minW = Math.min(...weights, state.weight.goal) - 0.5;
  const maxW = Math.max(...weights, state.weight.startWeight) + 0.5;
  const range = maxW - minW || 1;
  const xStep = points.length > 1 ? w/(points.length-1) : 0;
  ctx.strokeStyle = '#e8eee9'; ctx.lineWidth = 1; ctx.font = '10px sans-serif'; ctx.fillStyle = '#9aa8a4'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padding.t + (h/4)*i;
    const val = (maxW - (range/4)*i).toFixed(1);
    ctx.beginPath(); ctx.moveTo(padding.l, y); ctx.lineTo(cssW-padding.r, y); ctx.stroke();
    ctx.fillText(val, padding.l-4, y+3);
  }
  const goalY = padding.t + ((maxW - state.weight.goal)/range)*h;
  ctx.strokeStyle = '#6a9b8e'; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(padding.l, goalY); ctx.lineTo(cssW-padding.r, goalY); ctx.stroke();
  ctx.setLineDash([]); ctx.fillStyle = '#6a9b8e'; ctx.textAlign = 'left';
  ctx.font = '600 10px sans-serif'; ctx.fillText('目标 ' + state.weight.goal, cssW - padding.r - 56, goalY - 4);
  ctx.strokeStyle = '#7fa1c3'; ctx.lineWidth = 2.5; ctx.beginPath();
  points.forEach((p,i) => {
    const x = padding.l + xStep*i;
    const y = padding.t + ((maxW - p.weight)/range)*h;
    if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  points.forEach((p,i) => {
    const x = padding.l + xStep*i;
    const y = padding.t + ((maxW - p.weight)/range)*h;
    ctx.fillStyle = p.isStart ? '#d4b06a' : '#6a9b8e';
    ctx.beginPath(); ctx.arc(x, y, p.isStart?5:4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#4a5c58'; ctx.textAlign = 'center'; ctx.font = '600 10px sans-serif';
    ctx.fillText(p.weight.toFixed(1), x, y-9);
    ctx.fillStyle = '#9aa8a4'; ctx.font = '500 9px sans-serif';
    const label = p.isStart ? '起点' : (p.label.split(' ')[1] || '');
    ctx.fillText(label, x, cssH-10);
  });
}

/* ===== 渲染：AI 每周复盘 ===== */
function renderWeekly() {
  const week = getWeekRange();
  $('#aiWeekRange').textContent = `${week.startShort} → ${week.endShort}`;

  const list = $('#weeklyReviewList'); list.innerHTML = '';
  if (state.weeklyReviews.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:8px 0;font-weight:600;">还没有 AI 复盘</div>';
  } else {
    [...state.weeklyReviews].reverse().forEach(r => {
      const card = document.createElement('div');
      card.className = 'review-card';
      const sectionsHtml = r.sections.map(s => {
        if (s.type === 'list') {
          return `
            <div class="rc-section">
              <div class="rc-section-title">${escapeHtml(s.title)}</div>
              <ul class="rc-list">${s.body.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
            </div>`;
        }
        return `
            <div class="rc-section">
              <div class="rc-section-title">${escapeHtml(s.title)}</div>
              <div class="rc-section-content">${escapeHtml(s.body)}</div>
            </div>`;
      }).join('');
      card.innerHTML = `
        <div class="rc-head">
          <span class="rc-title">${escapeHtml(r.weekLabel)}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="rc-date">${r.date}</span>
            <button class="delete-weekly" data-rdel="${r.id}">×</button>
          </div>
        </div>
        ${sectionsHtml}
      `;
      list.appendChild(card);
    });
  }
  $('#weeklyTotal').textContent = `${state.weeklyReviews.length} 周`;
  $('#dashWeeklyCount').textContent = `${state.weeklyReviews.length} 周`;

  // 仪表盘
  const currentWeekReview = state.weeklyReviews.find(r => r.weekLabel === week.label);
  $('#dashWeeklyStatus').textContent = currentWeekReview ? '本周已生成' : '本周未生成';
}

/* ===== 渲染：批改历史 ===== */
function renderGradeHistory() {
  const el = $('#gradeHistory');
  const list = state.cet.gradeHistory;
  if (list.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:6px 0;font-weight:600;">还没有批改记录</div>';
    return;
  }
  el.innerHTML = '';
  [...list].reverse().forEach(g => {
    const item = document.createElement('div');
    item.className = 'grade-mini';
    item.innerHTML = `
      <div class="grade-mini-head">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="gm-type">${escapeHtml(g.type)}</span>
          <span class="gm-score">${g.score} 分</span>
          <span class="gm-date">${g.date}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button class="gm-toggle">详情</button>
          <button class="gm-del" data-gdel="${g.id}">×</button>
        </div>
      </div>
      <div class="grade-mini-detail">
        <div><b>问题：</b>${escapeHtml(g.issues.join('；') || '无明显问题')}</div>
        <div style="margin-top:4px;"><b>建议：</b>${escapeHtml(g.suggestions.join('；'))}</div>
        <div style="margin-top:4px;"><b>差距：</b>${escapeHtml(g.gap)}</div>
      </div>
    `;
    el.appendChild(item);
  });
}

function applyCollapsed() {
  $$('.module').forEach(mod => {
    const id = mod.id.replace('module-', '');
    if (state.collapsed[id]) mod.classList.add('collapsed');
    else mod.classList.remove('collapsed');
  });
}

function renderAll() {
  renderDate();
  renderCET();
  renderExams();
  renderWeight();
  renderWeekly();
  applyCollapsed();
}

/* ===== 事件 ===== */

// 折叠
document.addEventListener('click', e => {
  const head = e.target.closest('.module-header');
  if (head) {
    const id = head.dataset.collapse;
    state.collapsed[id] = !state.collapsed[id];
    saveState(); applyCollapsed();
  }
});
$('#toggleAllBtn').addEventListener('click', () => {
  const allCollapsed = Object.values(state.collapsed).every(Boolean);
  ['cet','exam','weight','weekly'].forEach(m => state.collapsed[m] = !allCollapsed);
  saveState(); applyCollapsed();
});
$$('.card-mini').forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.target;
    state.collapsed[target] = false;
    saveState(); applyCollapsed();
    document.getElementById('module-' + target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ===== CET A / B 记录 ===== */
['#cetADate', '#cetBDate'].forEach(sel => { $(sel).value = todayStr(); });

$('#cetAAddForm').addEventListener('submit', e => {
  e.preventDefault();
  const type = $('#cetAType').value;
  const total = parseInt($('#cetACount').value);
  const right = parseInt($('#cetARight').value);
  const date = $('#cetADate').value || todayStr();
  if (!total || isNaN(right) || right > total || right < 0) { toast('请检查题数与正确数'); return; }
  state.cet.recordsA.push({ id: genId(), type, total, right, date });
  saveState();
  $('#cetACount').value = ''; $('#cetARight').value = ''; $('#cetADate').value = todayStr();
  renderCET();
  toast('已记录');
});
$('#cetBAddForm').addEventListener('submit', e => {
  e.preventDefault();
  const type = $('#cetBType').value;
  const count = parseInt($('#etBCount').value);
  const date = $('#cetBDate').value || todayStr();
  if (!count || count < 1) { toast('请填写有效篇数'); return; }
  state.cet.recordsB.push({ id: genId(), type, count, date });
  saveState();
  $('#etBCount').value = ''; $('#cetBDate').value = todayStr();
  renderCET();
  toast('已记录');
});
$('#cetAList').addEventListener('click', e => {
  if (e.target.dataset.adel) {
    state.cet.recordsA = state.cet.recordsA.filter(r => r.id !== e.target.dataset.adel);
    saveState(); renderCET();
  }
});
$('#cetBList').addEventListener('click', e => {
  if (e.target.dataset.bdel) {
    state.cet.recordsB = state.cet.recordsB.filter(r => r.id !== e.target.dataset.bdel);
    saveState(); renderCET();
  }
});

/* ===== 目标分数弹窗 ===== */
function openGoalModal() {
  $('#goalInput').value = state.cet.goalScore || '';
  $('#goalModal').classList.add('open');
}
function closeGoalModal() { $('#goalModal').classList.remove('open'); }
$('#editCetGoalBtn').addEventListener('click', openGoalModal);
$('#goalModalClose').addEventListener('click', closeGoalModal);
$('#goalModalCancel').addEventListener('click', closeGoalModal);
$('#goalModal').addEventListener('click', e => { if (e.target === $('#goalModal')) closeGoalModal(); });
$('#goalForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = parseInt($('#goalInput').value);
  if (!v || v < 0 || v > 710) { toast('请填 0-710 之间的分数'); return; }
  state.cet.goalScore = v;
  saveState(); renderCET(); closeGoalModal();
  toast('已设置目标 ' + v + ' 分');
});

/* ===== 自定义任务 ===== */
$('#cetAddForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#cetNewTask').value.trim();
  if (!text) return;
  state.cet.customTasks.push({ id: genId(), text, done: false });
  $('#cetNewTask').value = '';
  saveState(); renderCET();
});
$('#cetTaskList').addEventListener('click', e => {
  if (e.target.dataset.id) {
    const t = state.cet.customTasks.find(x => x.id === e.target.dataset.id);
    if (t) t.done = !t.done;
    saveState(); renderCET();
  } else if (e.target.dataset.del) {
    state.cet.customTasks = state.cet.customTasks.filter(x => x.id !== e.target.dataset.del);
    saveState(); renderCET();
  }
});

/* ===== 批改 ===== */
$('#gradeForm').addEventListener('submit', e => {
  e.preventDefault();
  const type = $('#gradeType').value;
  const text = $('#gradeText').value.trim();
  if (!text) { toast('请粘贴或上传原文'); return; }
  const result = aiGradeEssay(text, type);
  if (!result) { toast('原文为空'); return; }
  // 渲染
  $('#gradeResult').innerHTML = `
    <div class="grade-summary">
      <div>
        <div class="grade-score">${result.overall}<small> / 100</small></div>
        <div style="font-size:11px;color:var(--text-light);font-weight:600;margin-top:2px;">${type} · 词数 ${result.stats.wordCount} · 高级词 ${result.stats.longRatio}%</div>
      </div>
      <span class="grade-gap-badge ${result.gapLevel}">${escapeHtml(result.gap)}</span>
    </div>
    <div class="grade-section">
      <div class="grade-section-title">⚠️ 主要问题</div>
      <div class="grade-section-content">${result.issues.length > 0 ? result.issues.map(x => '• ' + escapeHtml(x)).join('\n') : '未发现明显问题'}</div>
    </div>
    <div class="grade-section">
      <div class="grade-section-title">💡 改进建议</div>
      <div class="grade-section-content">${result.suggestions.map(x => '• ' + escapeHtml(x)).join('\n')}</div>
    </div>
    <div class="grade-section">
      <div class="grade-section-title">🎯 与 ${state.cet.goalScore || '目标'} 分的差距</div>
      <div class="grade-section-content">${escapeHtml(result.gap)}</div>
    </div>
  `;
  // 存历史
  state.cet.gradeHistory.push({
    id: genId(), date: todayStr(), type, text,
    score: result.overall,
    issues: result.issues,
    suggestions: result.suggestions,
    gap: result.gap,
  });
  saveState(); renderCET();
  toast('AI 批改完成');
});

// 批改详情展开 / 删除
$('#gradeHistory').addEventListener('click', e => {
  if (e.target.classList.contains('gm-toggle')) {
    e.target.closest('.grade-mini').classList.toggle('open');
    e.target.textContent = e.target.closest('.grade-mini').classList.contains('open') ? '收起' : '详情';
  } else if (e.target.dataset.gdel) {
    if (!confirm('删除这条批改？')) return;
    state.cet.gradeHistory = state.cet.gradeHistory.filter(g => g.id !== e.target.dataset.gdel);
    saveState(); renderCET();
  }
});

/* ===== OCR（按需加载 tesseract.js） ===== */
let tesseractWorker = null;
let tesseractLoading = null;

async function ensureOcr() {
  if (tesseractWorker) return tesseractWorker;
  if (tesseractLoading) return tesseractLoading;
  $('#ocrLoader').style.display = 'flex';
  $('#ocrLoaderSub').textContent = '加载中…';
  tesseractLoading = (async () => {
    // 动态加载 tesseract.js
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    tesseractWorker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          $('#ocrLoaderSub').textContent = `识别中 ${Math.round(m.progress*100)}%`;
        } else if (m.status === 'loading language traineddata') {
          $('#ocrLoaderSub').textContent = '加载语言包…';
        }
      }
    });
    $('#ocrLoader').style.display = 'none';
    return tesseractWorker;
  })();
  return tesseractLoading;
}

$('#gradeImage').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('#gradeOcrStatus').textContent = '识别中…';
  try {
    const worker = await ensureOcr();
    const { data } = await worker.recognize(file);
    const prev = $('#gradeText').value;
    $('#gradeText').value = prev ? prev + '\n' + data.text : data.text;
    $('#gradeOcrStatus').textContent = `已识别 ${data.text.length} 字`;
    $('#clearOcrBtn').style.display = 'inline-block';
    toast('OCR 完成');
  } catch (err) {
    $('#gradeOcrStatus').textContent = '识别失败';
    toast('OCR 失败：' + (err.message || err));
  } finally {
    e.target.value = '';
  }
});
$('#clearOcrBtn').addEventListener('click', () => {
  $('#gradeText').value = '';
  $('#gradeOcrStatus').textContent = '';
  $('#clearOcrBtn').style.display = 'none';
});

/* ===== 考试 ===== */
$('#addExamBtn').addEventListener('click', () => openExamModal());
$('#examList').addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.edit) {
    const ex = state.exams.find(x => x.id === t.dataset.edit);
    if (ex) openExamModal(ex);
  } else if (t.dataset.del) {
    if (confirm('确定删除？')) {
      state.exams = state.exams.filter(x => x.id !== t.dataset.del);
      saveState(); renderExams(); toast('已删除');
    }
  } else if (t.dataset.planToggle) {
    const ex = state.exams.find(x => x.id === t.dataset.exam);
    const p = ex?.plans.find(p => p.id === t.dataset.planToggle);
    if (p) p.done = !p.done;
    saveState(); renderExams();
  } else if (t.dataset.planDel) {
    const ex = state.exams.find(x => x.id === t.dataset.exam);
    if (ex) ex.plans = ex.plans.filter(p => p.id !== t.dataset.planDel);
    saveState(); renderExams();
  }
});
$('#examList').addEventListener('submit', e => {
  const f = e.target;
  if (!f.classList.contains('plan-add')) return;
  e.preventDefault();
  const ex = state.exams.find(x => x.id === f.dataset.exam);
  const input = f.querySelector('input');
  if (!ex || !input.value.trim()) return;
  ex.plans.push({ id: genId(), text: input.value.trim(), done: false });
  input.value = '';
  saveState(); renderExams();
});
function openExamModal(ex = null) {
  $('#examModalTitle').textContent = ex ? '编辑考试' : '添加考试';
  $('#examEditId').value = ex ? ex.id : '';
  $('#examName').value = ex ? ex.name : '';
  $('#examDate').value = ex ? ex.date : '';
  $('#examSignDate').value = ex ? ex.signDate : '';
  $('#examNote').value = ex ? ex.note : '';
  $('#examModal').classList.add('open');
}
function closeExamModal() { $('#examModal').classList.remove('open'); }
$('#examModalClose').addEventListener('click', closeExamModal);
$('#examModalCancel').addEventListener('click', closeExamModal);
$('#examModal').addEventListener('click', e => { if (e.target === $('#examModal')) closeExamModal(); });
$('#examForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#examEditId').value;
  const data = {
    name: $('#examName').value.trim(),
    date: $('#examDate').value,
    signDate: $('#examSignDate').value,
    note: $('#examNote').value.trim(),
  };
  if (!data.name) return;
  if (id) {
    const ex = state.exams.find(x => x.id === id);
    if (ex) Object.assign(ex, data);
  } else {
    state.exams.push({ id: genId(), plans: [], ...data });
  }
  saveState(); renderExams(); closeExamModal();
});

/* ===== 减肥周记录 ===== */
let selectedRating = '';
$$('#wwRatingGroup button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#wwRatingGroup button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRating = btn.dataset.val;
  });
});
$('#wwSubmitBtn').addEventListener('click', e => {
  e.preventDefault();
  const startW = parseFloat($('#wwStartWeight').value);
  const endW = parseFloat($('#wwEndWeight').value);
  const exercise = parseInt($('#wwExercise').value);
  const tweak = $('#wwTweak').value.trim();
  if (!startW || !endW || isNaN(exercise) || !selectedRating || !tweak) {
    toast('请填写完整'); return;
  }
  const week = getWeekRange();
  const exists = state.weight.weeklyRecords.find(r => r.weekLabel === week.label);
  const data = { weekLabel: week.label, monDate: week.start, sunDate: week.end, startW, endW, exercise, rating: selectedRating, tweak };
  if (exists) {
    if (!confirm('覆盖本周？')) return;
    Object.assign(exists, data);
  } else {
    state.weight.weeklyRecords.push({ id: genId(), ...data });
  }
  saveState(); renderWeight();
  toast('已保存');
});
$('#weeklyWeightList').addEventListener('click', e => {
  if (e.target.dataset.wdel) {
    if (!confirm('删除？')) return;
    state.weight.weeklyRecords = state.weight.weeklyRecords.filter(r => r.id !== e.target.dataset.wdel);
    saveState(); renderWeight();
  }
});

/* ===== AI 周复盘生成 ===== */
$('#genWeeklyBtn').addEventListener('click', () => {
  const review = aiWeeklyReview();
  if (!review) { toast('本周数据为空'); return; }
  const week = getWeekRange();
  const exists = state.weeklyReviews.find(r => r.weekLabel === week.label);
  const data = {
    weekLabel: week.label,
    date: todayStr(),
    sections: review.sections,
  };
  if (exists) {
    if (!confirm('本周已有 AI 复盘，是否覆盖？')) return;
    Object.assign(exists, data);
  } else {
    state.weeklyReviews.push({ id: genId(), ...data });
  }
  saveState();
  // 立即渲染
  $('#aiWeeklyResult').innerHTML = renderReviewHtml(data);
  renderWeekly();
  toast('已生成本周复盘');
});

function renderReviewHtml(r) {
  const sectionsHtml = r.sections.map(s => {
    if (s.type === 'list') {
      return `<div class="rc-section">
        <div class="rc-section-title">${escapeHtml(s.title)}</div>
        <ul class="rc-list">${s.body.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      </div>`;
    }
    return `<div class="rc-section">
      <div class="rc-section-title">${escapeHtml(s.title)}</div>
      <div class="rc-section-content">${escapeHtml(s.body)}</div>
    </div>`;
  }).join('');
  return `<div class="review-card" style="margin:0;">
    <div class="rc-head">
      <span class="rc-title">${escapeHtml(r.weekLabel)} · 本周 AI 复盘</span>
      <span class="rc-date">${r.date}</span>
    </div>
    ${sectionsHtml}
  </div>`;
}

$('#weeklyReviewList').addEventListener('click', e => {
  if (e.target.dataset.rdel) {
    if (!confirm('删除？')) return;
    state.weeklyReviews = state.weeklyReviews.filter(r => r.id !== e.target.dataset.rdel);
    saveState(); renderWeekly();
  }
});

/* ===== 启动 ===== */
renderAll();
window.addEventListener('resize', () => drawWeightChart(state.weight.weeklyRecords));
window.__state = state;