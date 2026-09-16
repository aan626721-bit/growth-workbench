/* =====================================================
 * 个人成长工作台 - v1.3
 * 新增：①考试日期可编辑 ②计划细化（时间+事项+备注） ③自定义模块 ④侧边导航
 * 数据版本：v4
 * ===================================================== */

const STORAGE_KEY = 'growth_workbench_v4';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const defaultState = {
  cet: {
    examDate: '2026-12-12',
    goalScore: null,
    customTasks: [],
    recordsA: [],
    recordsB: [],
    gradeHistory: [],
  },
  exams: [
    { id: genId(), name: '教资', date: '2027-03-15', signDate: '', note: '预计 2027 年 3 月',
      plans: [
        { id: genId(), time: '2027-01', text: '教育学基础复习', note: '重点章节：教学设计', done: false },
      ] },
    { id: genId(), name: '计算机二级', date: '2027-03-15', signDate: '', note: '预计 2027 年 3 月',
      plans: [
        { id: genId(), time: '2027-02', text: '选择题刷题', note: '', done: false },
      ] },
  ],
  weight: {
    goal: 55,
    targetDate: '2027-01-10',
    startWeight: 69.3,
    startDate: '2026-09-14',
    weeklyRecords: [],
  },
  weeklyReviews: [],
  customModules: [],
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
      exams: (parsed.exams || defaultState.exams).map(e => ({ ...e, plans: e.plans || [] })),
      weight: {
        goal: parsed.weight?.goal ?? 55,
        targetDate: parsed.weight?.targetDate || '2027-01-10',
        startWeight: parsed.weight?.startWeight ?? 69.3,
        startDate: parsed.weight?.startDate || '2026-09-14',
        weeklyRecords: parsed.weight?.weeklyRecords || [],
      },
      weeklyReviews: parsed.weeklyReviews || [],
      customModules: parsed.customModules || [],
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
function gapBadge(level) { return level === 'bad' ? '差' : level === 'good' ? '达成' : '一般'; }

/* ===== AI 分析 ===== */
function aiCetAnalysis() {
  const goal = state.cet.goalScore;
  if (!goal) return null;
  const allA = state.cet.recordsA;
  if (allA.length === 0) return { hasData: false, goal };
  let lisTotal=0, lisRight=0, readTotal=0, readRight=0;
  allA.forEach(r => {
    if (r.type === '听力') { lisTotal += r.total; lisRight += r.right; }
    if (r.type === '阅读') { readTotal += r.total; readRight += r.right; }
  });
  const lisRate = lisTotal > 0 ? Math.round(lisRight/lisTotal*100) : null;
  const readRate = readTotal > 0 ? Math.round(readRight/readTotal*100) : null;
  const targetLisRate = goal >= 600 ? 65 : goal >= 500 ? 55 : goal >= 425 ? 45 : 35;
  const targetReadRate = goal >= 600 ? 70 : goal >= 500 ? 60 : goal >= 425 ? 50 : 40;
  let writingLevel = goal >= 650 ? '高分档' : goal >= 600 ? '优秀档' : goal >= 500 ? '良好档' : goal >= 425 ? '及格档' : '基础档';
  const writePerWeek = goal >= 600 ? 2 : 1;
  const translatePerWeek = goal >= 600 ? 2 : 1;
  function gapLevel(cur, target) {
    if (cur === null) return 'ok';
    const diff = target - cur;
    if (diff <= 0) return 'good';
    if (diff <= 10) return 'ok';
    return 'bad';
  }
  return {
    hasData: true, goal,
    lisRate, readRate,
    targetLisRate, targetReadRate,
    lisGap: gapLevel(lisRate, targetLisRate),
    readGap: gapLevel(readRate, targetReadRate),
    writingLevel, writePerWeek, translatePerWeek,
  };
}

/* ===== AI 周复盘 ===== */
function aiWeeklyReview() {
  const week = getWeekRange();
  const mon = new Date(week.start + 'T00:00:00');
  const sun = new Date(week.end + 'T23:59:59');
  let lisTotal=0, lisRight=0, readTotal=0, readRight=0;
  state.cet.recordsA.forEach(r => {
    const t = new Date(r.date + 'T00:00:00');
    if (t >= mon && t <= sun) {
      if (r.type === '听力') { lisTotal += r.total; lisRight += r.right; }
      if (r.type === '阅读') { readTotal += r.total; readRight += r.right; }
    }
  });
  const lisRate = lisTotal > 0 ? Math.round(lisRight/lisTotal*100) : null;
  const readRate = readTotal > 0 ? Math.round(readRight/readTotal*100) : null;
  let essayCount=0, transCount=0;
  state.cet.recordsB.forEach(r => {
    const t = new Date(r.date + 'T00:00:00');
    if (t < mon || t > sun) return;
    if (r.type === '作文') essayCount += r.count;
    if (r.type === '翻译') transCount += r.count;
  });
  const cetBDone = essayCount + transCount;
  const wk = state.weight.weeklyRecords.find(r => r.weekLabel === week.label);
  let weightInfo = null;
  if (wk) {
    const delta = +(wk.endW - wk.startW).toFixed(1);
    const remainingDays = daysBetween(state.weight.targetDate) ?? 0;
    const remainingKg = +(wk.endW - state.weight.goal).toFixed(1);
    const targetDeltaPerWeek = remainingDays > 0 && remainingKg > 0
      ? +(remainingKg / Math.ceil(remainingDays/7)).toFixed(2) : 0.5;
    weightInfo = { startW: wk.startW, endW: wk.endW, delta, exercise: wk.exercise, rating: wk.rating, tweak: wk.tweak, remainingKg, remainingDays, targetDeltaPerWeek };
  }
  const examInfo = state.exams.filter(e => e.date).map(e => ({
    name: e.name, days: daysBetween(e.date), plans: e.plans.length, donePlans: e.plans.filter(p => p.done).length,
  }));
  const sections = [];
  const highlights = [];
  if (lisRate !== null && lisRate >= 65) highlights.push(`听力平均正确率 ${lisRate}%`);
  if (readRate !== null && readRate >= 65) highlights.push(`阅读平均正确率 ${readRate}%`);
  if (cetBDone >= 3) highlights.push(`作文+翻译共 ${cetBDone} 篇`);
  if (weightInfo && weightInfo.delta < 0) highlights.push(`体重下降 ${Math.abs(weightInfo.delta)} kg`);
  if (weightInfo && weightInfo.exercise >= 4) highlights.push(`运动 ${weightInfo.exercise} 次达标`);
  if (highlights.length === 0) highlights.push('本周数据较少');
  sections.push({ title: '✅ 本周做得好的地方', type: 'list', body: highlights });
  const issues = [];
  if (lisRate !== null && lisRate < 55) issues.push(`听力正确率仅 ${lisRate}%`);
  if (readRate !== null && readRate < 60) issues.push(`阅读正确率 ${readRate}%`);
  if (cetBDone < 2) issues.push(`作文/翻译仅 ${cetBDone} 篇`);
  if (weightInfo && weightInfo.delta > 0) issues.push(`体重 ${weightInfo.delta > 0 ? '上涨' : '下降'} ${Math.abs(weightInfo.delta)} kg`);
  if (weightInfo && weightInfo.exercise < 3) issues.push(`运动仅 ${weightInfo.exercise} 次`);
  if (issues.length === 0) issues.push('暂无明显短板');
  sections.push({ title: '⚠️ 存在的问题', type: 'list', body: issues });
  const gapLines = [];
  const cetDays = daysBetween(state.cet.examDate);
  if (cetDays !== null && cetDays > 0) gapLines.push(`距四六级还有 ${cetDays} 天`);
  if (weightInfo) gapLines.push(`距目标 ${state.weight.goal}kg 还差 ${weightInfo.remainingKg} kg`);
  if (gapLines.length === 0) gapLines.push('目标尚未设置');
  sections.push({ title: '🎯 与目标的差距', type: 'text', body: gapLines.join('\n') });
  const next = [];
  if (lisRate === null) next.push('听力：至少 2 套真题');
  else if (lisRate < 55) next.push(`听力：每天精听 1 篇，目标 ${lisRate + 10}%`);
  else next.push(`听力：保持每日 1 套，目标 ${lisRate + 5}%`);
  next.push(`作文：${state.cet.goalScore && state.cet.goalScore >= 600 ? 2 : 1} 篇`);
  next.push(`翻译：${state.cet.goalScore && state.cet.goalScore >= 600 ? 2 : 1} 篇`);
  if (weightInfo) {
    if (weightInfo.exercise < 4) next.push(`运动：每周至少 4 次`);
  } else next.push('减肥：先记录周一体重');
  sections.push({ title: '📋 下周执行建议', type: 'list', body: next });
  return { week, sections, hasData: true };
}

/* ===== AI 作文批改 ===== */
function aiGradeEssay(text, type) {
  const clean = text.trim();
  if (!clean) return null;
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = clean.match(/[a-zA-Z']+/g) || [];
  const wordCount = words.length;
  const longWords = words.filter(w => w.length >= 7);
  const longRatio = words.length > 0 ? Math.round(longWords.length / words.length * 100) : 0;
  const issues = [], suggestions = [];
  let wordScore = 100;
  if (type === '作文') {
    if (wordCount < 100) wordScore = 60;
    else if (wordCount > 200) wordScore = 75;
    else wordScore = 95;
  } else {
    const cnChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (cnChars < 100) wordScore = 65;
  }
  let vocabScore = longRatio < 10 ? 65 : longRatio < 20 ? 80 : 95;
  const templatePatterns = [/\bfirst(ly)?[\s,]/i, /\bsecond(ly)?[\s,]/i, /\b(in conclusion|to sum up)\b/i, /\bwith the development of\b/i, /\bmore and more\b/i, /\bvery\s+\w+/i, /[\u4e00-\u9fa5]/];
  const templates = templatePatterns.filter(p => p.test(clean)).length;
  let templateScore = templates >= 4 ? 55 : templates >= 2 ? 70 : templates === 1 ? 85 : 100;
  const structScore = sentences.length >= 8 && sentences.length <= 18 ? 92 : sentences.length < 5 ? 65 : 82;
  const compoundMarkers = (clean.match(/\b(which|that|because|although|however)\b/gi) || []).length;
  const compoundScore = 75 + Math.min(20, compoundMarkers * 5);
  const overall = Math.round((wordScore*0.2 + vocabScore*0.25 + templateScore*0.2 + structScore*0.15 + compoundScore*0.2));
  const goal = state.cet.goalScore;
  let gap = '未设置目标', gapLevel = 'ok';
  if (goal) {
    const targetWriting = Math.round((goal - 248) * 100 / 212);
    const diff = targetWriting - overall;
    if (diff <= 0) { gap = `已超过目标档`; gapLevel = 'good'; }
    else { gap = `距目标 ${diff} 分`; gapLevel = diff <= 8 ? 'ok' : 'bad'; }
  }
  if (issues.length === 0) issues.push('未发现明显问题');
  return { overall, issues, suggestions: ['高级词占比 ' + longRatio + '%'], gap, gapLevel, stats: { wordCount, longRatio, sentences: sentences.length } };
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
  let totalQ=0, rightQ=0; recs.forEach(r => { totalQ += r.total; rightQ += r.right; });
  const avg = totalQ > 0 ? Math.round(rightQ/totalQ*100) : 0;
  const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7);
  const prevSun = new Date(mon); prevSun.setDate(prevSun.getDate() - 1);
  const prevRecs = state.cet.recordsA.filter(r => {
    const t = new Date(r.date + 'T00:00:00');
    return t >= prevMon && t <= prevSun && r.total > 0;
  });
  let pT=0, pR=0; prevRecs.forEach(r => { pT += r.total; pR += r.right; });
  const prevAvg = pT > 0 ? Math.round(pR/pT*100) : null;
  let trend = '→';
  if (prevAvg !== null && totalQ > 0) { if (avg > prevAvg) trend = '↗'; else if (avg < prevAvg) trend = '↘'; }
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
  $('#cetGoalDisplay').textContent = cet.goalScore ? `${cet.goalScore} 分` : '-- 分';
  renderCetAI();
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
      <button class="cr-del" data-adel="${r.id}">×</button>`;
    aList.appendChild(item);
  });
  if (cet.recordsA.length === 0) aList.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:6px 2px;font-weight:600;">暂无记录</div>';
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
      <button class="cr-del" data-bdel="${r.id}">×</button>`;
    bList.appendChild(item);
  });
  if (cet.recordsB.length === 0) bList.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:6px 2px;font-weight:600;">暂无记录</div>';
  const lisTotal = state.cet.recordsA.filter(r => r.type === '听力').reduce((s,r) => s + r.total, 0);
  const lisRight = state.cet.recordsA.filter(r => r.type === '听力').reduce((s,r) => s + r.right, 0);
  const readTotal = state.cet.recordsA.filter(r => r.type === '阅读').reduce((s,r) => s + r.total, 0);
  const readRight = state.cet.recordsA.filter(r => r.type === '阅读').reduce((s,r) => s + r.right, 0);
  const allT = lisTotal + readTotal, allR = lisRight + readRight;
  const overallRate = allT > 0 ? Math.round(allR/allT*100) : null;
  $('#dashCetDays').textContent = days !== null ? `${days} 天` : '--';
  $('#dashCetProgress').textContent = overallRate !== null ? `整体 ${overallRate}% · 目标 ${state.cet.goalScore || '--'}` : '完成度 0%';
  const tList = $('#cetTaskList'); tList.innerHTML = '';
  cet.customTasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.innerHTML = `
      <button class="task-check ${task.done?'done':''}" data-id="${task.id}"></button>
      <span class="task-text ${task.done?'done':''}">${escapeHtml(task.text)}</span>
      <button class="task-delete" data-del="${task.id}">×</button>`;
    tList.appendChild(item);
  });
  renderGradeHistory();
}

function renderCetAI() {
  const el = $('#cetAIContent');
  const analysis = aiCetAnalysis();
  if (!analysis) { el.innerHTML = '<div class="ai-empty">请先在右上「设置」填写目标分数。</div>'; return; }
  if (!analysis.hasData) { el.innerHTML = `<div class="ai-empty">已设置目标 <b>${analysis.goal} 分</b>，录入听力后数据后，AI 将自动分析。</div>`; return; }
  const a = analysis;
  el.innerHTML = `
    <div class="ai-block">
      <div class="ai-block-title">听力分析</div>
      <div class="ai-row"><span class="ar-label">当前正确率</span><span><span class="ar-value">${a.lisRate === null ? '--' : a.lisRate + '%'}</span> ${a.lisRate !== null ? `<span class="ar-gap ${a.lisGap}">${gapBadge(a.lisGap)}</span>` : ''}</span></div>
      <div class="ai-row"><span class="ar-label">目标正确率</span><span class="ar-value">${a.targetLisRate}%</span></div>
      ${a.lisRate !== null ? `<div class="ai-progress"><div class="ai-progress-fill" style="width:${Math.min(100, a.lisRate/a.targetLisRate*100)}%"></div></div>` : ''}
    </div>
    <div class="ai-block">
      <div class="ai-block-title">阅读分析</div>
      <div class="ai-row"><span class="ar-label">当前正确率</span><span><span class="ar-value">${a.readRate === null ? '--' : a.readRate + '%'}</span> ${a.readRate !== null ? `<span class="ar-gap ${a.readGap}">${gapBadge(a.readGap)}</span>` : ''}</span></div>
      <div class="ai-row"><span class="ar-label">目标正确率</span><span class="ar-value">${a.targetReadRate}%</span></div>
      ${a.readRate !== null ? `<div class="ai-progress"><div class="ai-progress-fill" style="width:${Math.min(100, a.readRate/a.targetReadRate*100)}%"></div></div>` : ''}
    </div>
    <div class="ai-block">
      <div class="ai-block-title">作文 / 翻译（${a.writingLevel}）</div>
      <div class="ai-row"><span class="ar-label">建议每周</span><span class="ar-value">作文 ${a.writePerWeek} + 翻译 ${a.translatePerWeek} 篇</span></div>
    </div>`;
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
          <button data-edit="${exam.id}" title="编辑考试">✎</button>
          <button data-del="${exam.id}" class="delete" title="删除">×</button>
        </div>
      </div>
      <div class="exam-meta">
        考试：<input type="date" class="exam-date-inline" data-field="date" data-id="${exam.id}" value="${exam.date || ''}" />
        &nbsp;&nbsp;报名提醒：<input type="date" class="exam-date-inline" data-field="signDate" data-id="${exam.id}" value="${exam.signDate || ''}" />
      </div>
      ${exam.note ? `<div class="exam-note">${escapeHtml(exam.note)}</div>` : ''}
      <div class="exam-plans">
        <h4>📋 备考计划</h4>
        <div class="plans-list" data-plans="${exam.id}"></div>
        <button class="btn-add-plan" data-addplan="${exam.id}">＋ 添加计划</button>
      </div>`;
    list.appendChild(card);
    const plansEl = card.querySelector(`[data-plans="${exam.id}"]`);
    if (exam.plans.length === 0) {
      plansEl.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:4px 0;font-weight:600;">暂无计划</div>';
    } else {
      exam.plans.forEach(plan => {
        const p = document.createElement('div');
        p.className = `plan-item-rich ${plan.done ? 'done' : ''}`;
        p.innerHTML = `
          <div class="pir-head">
            <div class="pir-check ${plan.done?'done':''}" data-plan-toggle="${plan.id}" data-exam="${exam.id}">${plan.done?'✓':''}</div>
            <span class="pir-time">${escapeHtml(plan.time || '未设时间')}</span>
            <span class="pir-text">${escapeHtml(plan.text)}</span>
            <div class="pir-actions">
              <button data-plan-edit="${plan.id}" data-exam="${exam.id}" title="编辑">✎</button>
              <button class="pir-del" data-plan-del="${plan.id}" data-exam="${exam.id}" title="删除">×</button>
            </div>
          </div>
          ${plan.note ? `<div class="pir-note"><div class="pir-note-label">备注</div>${escapeHtml(plan.note)}</div>` : ''}`;
        plansEl.appendChild(p);
      });
    }
  });
  $('#examTotal').textContent = `${state.exams.length} 场`;
  $('#dashExamCount').textContent = `${state.exams.length} 场`;
  const upcoming = state.exams.filter(e => e.date).map(e => ({ name: e.name, days: daysBetween(e.date) })).filter(e => e.days >= 0).sort((a,b) => a.days - b.days)[0];
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
  if (records.length === 0) wl.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:8px 0;font-weight:600;">还没有记录</div>';
  else [...records].reverse().forEach(r => {
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
        <span>起始：<b>${r.startW} kg</b></span>
        <span>最终：<b>${r.endW} kg</b></span>
        <span style="${deltaColor}"><b>${delta > 0 ? '+' : ''}${delta} kg</b></span>
      </div>
      <div class="weekly-row"><span>运动：<b>${r.exercise} 次</b></span><span>饮食：<b>${r.rating}</b></span></div>
      <div class="weekly-text">微调：${escapeHtml(r.tweak)}</div>`;
    wl.appendChild(card);
  });
}

function drawWeightChart(records) {
  const canvas = $('#weightChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  let cssW = Math.floor(wrap.getBoundingClientRect().width);
  if (!cssW || cssW < 40) cssW = Math.min(window.innerWidth - 60, 600);
  const cssH = Math.max(180, Math.min(240, Math.round(cssW * 0.42)));
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  const padL = cssW < 320 ? 30 : 38;
  const padding = { l: padL, r: 12, t: 18, b: 28 };
  const w = cssW - padding.l - padding.r;
  const h = cssH - padding.t - padding.b;
  const points = [];
  points.push({ label: '起点', weight: state.weight.startWeight, isStart: true });
  records.forEach(r => points.push({ label: r.weekLabel, weight: r.endW }));
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
  points.forEach((p,i) => { const x = padding.l + xStep*i; const y = padding.t + ((maxW - p.weight)/range)*h; if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();
  const labelStep = Math.max(1, Math.ceil(points.length / Math.max(3, Math.floor(w / 46))));
  points.forEach((p,i) => {
    const x = padding.l + xStep*i;
    const y = padding.t + ((maxW - p.weight)/range)*h;
    ctx.fillStyle = p.isStart ? '#d4b06a' : '#6a9b8e';
    ctx.beginPath();
    ctx.arc(x, y, p.isStart ? 5 : (cssW < 340 ? 3.5 : 4), 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    if (i % labelStep === 0 || i === points.length - 1) {
      ctx.fillStyle = '#4a5c58'; ctx.textAlign = 'center';
      ctx.font = `600 ${cssW < 340 ? 9 : 10}px sans-serif`;
      ctx.fillText(p.weight.toFixed(1), x, y - 9);
      ctx.fillStyle = '#9aa8a4';
      ctx.font = `500 ${cssW < 340 ? 8 : 9}px sans-serif`;
      const label = p.isStart ? '起点' : (p.label.split(' ')[1] || '');
      ctx.fillText(label, x, cssH - 10);
    }
  });
}

/* ===== 渲染：周复盘 ===== */
function renderWeekly() {
  const week = getWeekRange();
  $('#aiWeekRange').textContent = `${week.startShort} → ${week.endShort}`;
  const list = $('#weeklyReviewList'); list.innerHTML = '';
  if (state.weeklyReviews.length === 0) list.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:8px 0;font-weight:600;">还没有 AI 复盘</div>';
  else [...state.weeklyReviews].reverse().forEach(r => {
    const card = document.createElement('div');
    card.className = 'review-card';
    const sectionsHtml = r.sections.map(s => {
      if (s.type === 'list') return `<div class="rc-section"><div class="rc-section-title">${escapeHtml(s.title)}</div><ul class="rc-list">${s.body.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
      return `<div class="rc-section"><div class="rc-section-title">${escapeHtml(s.title)}</div><div class="rc-section-content">${escapeHtml(s.body)}</div></div>`;
    }).join('');
    card.innerHTML = `
      <div class="rc-head">
        <span class="rc-title">${escapeHtml(r.weekLabel)}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="rc-date">${r.date}</span>
          <button class="delete-weekly" data-rdel="${r.id}">×</button>
        </div>
      </div>${sectionsHtml}`;
    list.appendChild(card);
  });
  $('#weeklyTotal').textContent = `${state.weeklyReviews.length} 周`;
  $('#dashWeeklyCount').textContent = `${state.weeklyReviews.length} 周`;
  const currentWeekReview = state.weeklyReviews.find(r => r.weekLabel === week.label);
  $('#dashWeeklyStatus').textContent = currentWeekReview ? '本周已生成' : '本周未生成';
}

function renderGradeHistory() {
  const el = $('#gradeHistory');
  const list = state.cet.gradeHistory;
  if (list.length === 0) { el.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:6px 0;font-weight:600;">还没有批改记录</div>'; return; }
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
        <div><b>问题：</b>${escapeHtml(g.issues.join('；'))}</div>
        <div style="margin-top:4px;"><b>差距：</b>${escapeHtml(g.gap)}</div>
      </div>`;
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

/* ===== 渲染：自定义模块 ===== */
function renderCustomModules() {
  const container = $('#customModules');
  if (!container) return;
  container.innerHTML = '';
  state.customModules.forEach(m => {
    const mod = document.createElement('section');
    mod.className = 'module custom-module';
    mod.id = `module-${m.id}`;
    const id = m.id;
    const days = m.type === 'exam' && m.data.date ? daysBetween(m.data.date) : null;
    const meta = m.type === 'exam'
      ? `<span class="countdown">${days !== null ? `${days} 天` : '未设日期'}</span>`
      : `<span class="countdown">${m.data.goalScore ? `${m.data.goalScore} 分` : '未设目标'}</span>`;
    mod.innerHTML = `
      <header class="module-header" data-collapse="${id}">
        <h2>${escapeHtml(m.icon || '🎯')} ${escapeHtml(m.name)}</h2>
        <div class="module-meta">
          ${meta}
          <button class="module-edit-btn" data-editmod="${id}" title="编辑模块">✎</button>
          <span class="collapse-icon">▾</span>
        </div>
      </header>
      <div class="module-body" id="body-${id}"></div>`;
    container.appendChild(mod);
    const body = mod.querySelector(`#body-${id}`);
    if (m.type === 'exam') {
      body.innerHTML = `
        <div class="exam-list" id="examList-${id}"></div>
        <button class="btn-add-exam" data-addcustom="${id}">+ 添加考试</button>`;
      renderCustomExamList(id);
    } else {
      body.innerHTML = `
        <div class="cet-goal-bar" id="cgoalBar-${id}">
          <div class="cgb-text"><span class="cgb-label">目标分数</span><span class="cgb-value" id="cgoalDisplay-${id}">--</span></div>
          <div class="cgb-actions"><button class="btn-mini" data-setcgoal="${id}">设置</button></div>
        </div>
        <details class="ai-panel" open>
          <summary>🤖 AI 分数分析</summary>
          <div class="ai-content" id="cAI-${id}"><div class="ai-empty">录入数据后 AI 会自动分析</div></div>
        </details>
        <div class="cet-block cet-a" style="border-left-color:var(--secondary)">
          <div class="cet-block-head"><span class="cet-tag tag-a">A 类</span><h3>听力 / 阅读</h3><span class="cet-stat" id="cAStat-${id}">--</span></div>
          <form class="cet-add" data-cetaform="${id}">
            <div class="cet-add-grid">
              <select data-ceta-type required><option>听力</option><option>阅读</option></select>
              <input type="number" data-ceta-count placeholder="题数" min="1" required />
              <input type="number" data-ceta-right placeholder="正确数" min="0" required />
              <input type="date" data-ceta-date required />
            </div>
            <button type="submit" class="btn-primary">记录</button>
          </form>
          <div class="cet-list" id="cAList-${id}"></div>
        </div>
        <div class="cet-block cet-b" style="border-left-color:var(--choco-light)">
          <div class="cet-block-head"><span class="cet-tag tag-b">B 类</span><h3>作文 / 翻译</h3><span class="cet-stat" id="cBStat-${id}">--</span></div>
          <form class="cet-add" data-cetbform="${id}">
            <div class="cet-add-grid">
              <select data-cetb-type required><option>作文</option><option>翻译</option></select>
              <input type="number" data-cetb-count placeholder="篇数" min="1" required />
              <input type="date" data-cetb-date required />
            </div>
            <button type="submit" class="btn-primary">记录</button>
          </form>
          <div class="cet-list" id="cBList-${id}"></div>
        </div>`;
      renderCustomCet(id);
    }
    if (state.collapsed[id]) mod.classList.add('collapsed');
  });
}

function renderCustomExamList(moduleId) {
  const m = state.customModules.find(x => x.id === moduleId);
  if (!m) return;
  const list = $(`#examList-${moduleId}`);
  if (!list) return;
  list.innerHTML = '';
  if (m.data.exams.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:8px 0;font-weight:600;">还没有考试，点下方添加</div>';
    return;
  }
  m.data.exams.forEach(exam => {
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
          <button data-cust-edit="${exam.id}" data-mod="${moduleId}">✎</button>
          <button data-cust-del="${exam.id}" data-mod="${moduleId}" class="delete">×</button>
        </div>
      </div>
      <div class="exam-meta">
        考试：<input type="date" class="exam-date-inline" data-cfield="date" data-eid="${exam.id}" data-mod="${moduleId}" value="${exam.date || ''}" />
        &nbsp;&nbsp;报名提醒：<input type="date" class="exam-date-inline" data-cfield="signDate" data-eid="${exam.id}" data-mod="${moduleId}" value="${exam.signDate || ''}" />
      </div>
      ${exam.note ? `<div class="exam-note">${escapeHtml(exam.note)}</div>` : ''}
      <div class="exam-plans">
        <h4>📋 备考计划</h4>
        <div class="plans-list" data-plans="${exam.id}"></div>
        <button class="btn-add-plan" data-cust-addplan="${exam.id}" data-mod="${moduleId}">＋ 添加计划</button>
      </div>`;
    list.appendChild(card);
    const plansEl = card.querySelector(`[data-plans="${exam.id}"]`);
    if (exam.plans.length === 0) {
      plansEl.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:4px 0;font-weight:600;">暂无计划</div>';
    } else {
      exam.plans.forEach(plan => {
        const p = document.createElement('div');
        p.className = `plan-item-rich ${plan.done ? 'done' : ''}`;
        p.innerHTML = `
          <div class="pir-head">
            <div class="pir-check ${plan.done?'done':''}" data-cust-toggle="${plan.id}" data-eid="${exam.id}" data-mod="${moduleId}">${plan.done?'✓':''}</div>
            <span class="pir-time">${escapeHtml(plan.time || '未设时间')}</span>
            <span class="pir-text">${escapeHtml(plan.text)}</span>
            <div class="pir-actions">
              <button data-cust-editplan="${plan.id}" data-eid="${exam.id}" data-mod="${moduleId}">✎</button>
              <button class="pir-del" data-cust-delplan="${plan.id}" data-eid="${exam.id}" data-mod="${moduleId}">×</button>
            </div>
          </div>
          ${plan.note ? `<div class="pir-note"><div class="pir-note-label">备注</div>${escapeHtml(plan.note)}</div>` : ''}`;
        plansEl.appendChild(p);
      });
    }
  });
}

function renderCustomCet(moduleId) {
  const m = state.customModules.find(x => x.id === moduleId);
  if (!m) return;
  const dEl = $(`#cgoalDisplay-${moduleId}`);
  if (dEl) dEl.textContent = m.data.goalScore ? `${m.data.goalScore} 分` : '-- 分';
  const allA = m.data.recordsA || [];
  let lisTotal=0, lisRight=0, readTotal=0, readRight=0;
  allA.forEach(r => {
    if (r.type === '听力') { lisTotal += r.total; lisRight += r.right; }
    if (r.type === '阅读') { readTotal += r.total; readRight += r.right; }
  });
  const lisRate = lisTotal > 0 ? Math.round(lisRight/lisTotal*100) : null;
  const readRate = readTotal > 0 ? Math.round(readRight/readTotal*100) : null;
  const allT = lisTotal + readTotal, allR = lisRight + readRight;
  const overall = allT > 0 ? Math.round(allR/allT*100) : null;
  const aEl = $(`#cAStat-${moduleId}`);
  if (aEl) aEl.textContent = overall !== null ? `整体 ${overall}%` : '--';
  const aList = $(`#cAList-${moduleId}`); if (aList) {
    aList.innerHTML = '';
    [...allA].reverse().slice(0, 10).forEach(r => {
      const rate = r.total > 0 ? Math.round(r.right/r.total*100) : 0;
      const item = document.createElement('div');
      item.className = 'cet-record';
      item.innerHTML = `
        <span class="cr-type">${escapeHtml(r.type)}</span>
        <span class="cr-info">${r.right}<b>/</b>${r.total}</span>
        <span class="cr-rate">${rate}%</span>
        <span class="cr-date">${r.date.slice(5)}</span>
        <button class="cr-del" data-cadel="${r.id}" data-mod="${moduleId}">×</button>`;
      aList.appendChild(item);
    });
    if (allA.length === 0) aList.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:6px 2px;font-weight:600;">暂无记录</div>';
  }
  const allB = m.data.recordsB || [];
  const bTotal = allB.reduce((s, r) => s + r.count, 0);
  const bStat = $(`#cBStat-${moduleId}`);
  if (bStat) bStat.textContent = `累计 ${bTotal} 篇`;
  const bList = $(`#cBList-${moduleId}`); if (bList) {
    bList.innerHTML = '';
    [...allB].reverse().slice(0, 10).forEach(r => {
      const item = document.createElement('div');
      item.className = 'cet-record';
      item.innerHTML = `
        <span class="cr-type" style="background:#f6efd8;color:#8a6e2a;">${escapeHtml(r.type)}</span>
        <span class="cr-info">${r.count} 篇</span>
        <span class="cr-date">${r.date.slice(5)}</span>
        <button class="cr-del" data-cbdel="${r.id}" data-mod="${moduleId}">×</button>`;
      bList.appendChild(item);
    });
    if (allB.length === 0) bList.innerHTML = '<div style="font-size:12px;color:var(--text-soft);padding:6px 2px;font-weight:600;">暂无记录</div>';
  }
  const aiEl = $(`#cAI-${moduleId}`);
  if (aiEl) {
    if (!m.data.goalScore) aiEl.innerHTML = '<div class="ai-empty">请先设置目标分数</div>';
    else if (overall === null) aiEl.innerHTML = `<div class="ai-empty">目标 ${m.data.goalScore} 分，录入数据后出分析</div>`;
    else {
      const target = m.data.goalScore >= 600 ? 65 : m.data.goalScore >= 500 ? 55 : 45;
      const diff = Math.max(0, target - overall);
      aiEl.innerHTML = `
        <div class="ai-block">
          <div class="ai-row"><span class="ar-label">当前正确率</span><span class="ar-value">${overall}%</span></div>
          <div class="ai-row"><span class="ar-label">目标正确率</span><span class="ar-value">${target}%</span></div>
          <div class="ai-progress"><div class="ai-progress-fill" style="width:${Math.min(100, overall/target*100)}%"></div></div>
          <div class="ai-tip">听力 ${lisRate ?? '--'}% · 阅读 ${readRate ?? '--'}%。距目标差 <b>${diff}%</b>。</div>
        </div>`;
    }
  }
}

function renderAll() {
  renderDate();
  renderCET();
  renderExams();
  renderWeight();
  renderWeekly();
  renderCustomModules();
  renderSidebar();
  applyCollapsed();
}

/* ===== 侧边导航 ===== */
function renderSidebar() {
  const nav = $('#sidebarNav');
  if (!nav) return;
  nav.innerHTML = '';
  const builtins = [
    { id: 'cet', icon: '📚', name: '四六级备考', subs: [
      { anchor: 'anchor-cet-goal', label: '🎯 目标分数' },
      { anchor: 'anchor-cet-ai', label: '🤖 AI 分数分析' },
      { anchor: 'anchor-cet-a', label: '👂 听力 / 阅读' },
      { anchor: 'anchor-cet-b', label: '✍️ 作文 / 翻译' },
      { anchor: 'anchor-cet-grade', label: '📝 AI 批改' },
    ]},
    { id: 'exam', icon: '📝', name: '考试准备',
      subs: state.exams.length === 0
        ? [{ label: '暂无考试' }]
        : state.exams.map(e => ({
            label: e.name,
            isGroup: true,
            groupSubs: [
              { label: '📅 日期 · 报名提醒' },
              ...e.plans.map(p => ({ label: '📌 ' + (p.text.length > 14 ? p.text.slice(0, 14) + '…' : p.text) })),
            ],
          }))
    },
    { id: 'weight', icon: '🏃‍♀️', name: '减肥计划', subs: [] },
    { id: 'weekly', icon: '🤖', name: 'AI 每周复盘', subs: [] },
  ];
  builtins.forEach(b => nav.appendChild(buildNavGroup(b)));
  state.customModules.forEach(m => {
    const group = {
      id: m.id, icon: m.icon || '🎯', name: m.name,
      subs: m.type === 'exam'
        ? (m.data.exams.length === 0
            ? [{ label: '暂无考试' }]
            : m.data.exams.map(ex => ({
                label: ex.name,
                isGroup: true,
                groupSubs: [
                  { label: '📅 日期 · 报名提醒' },
                  ...ex.plans.map(p => ({ label: '📌 ' + (p.text.length > 14 ? p.text.slice(0, 14) + '…' : p.text) })),
                ],
              })))
        : [
            { anchor: `cgoalBar-${m.id}`, label: '🎯 目标分数' },
            { anchor: `cAI-${m.id}`, label: '🤖 AI 分析' },
            { anchor: `cAList-${m.id}`, label: '👂 听力 / 阅读' },
            { anchor: `cBList-${m.id}`, label: '✍️ 作文 / 翻译' },
          ],
    };
    nav.appendChild(buildNavGroup(group));
  });
}

function buildNavGroup(group) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-group';
  wrap.dataset.groupId = group.id;
  if (group.id === 'cet') wrap.classList.add('open');
  const head = document.createElement('div');
  head.className = 'nav-group-head';
  head.innerHTML = `<span class="ng-icon">${escapeHtml(group.icon)}</span><span class="ng-title">${escapeHtml(group.name)}</span><span class="ng-arrow">▸</span>`;
  head.addEventListener('click', (e) => {
    if (e.target.classList.contains('nav-sub') || e.target.classList.contains('nav-sub-sub')) return;
    wrap.classList.toggle('open');
    if (wrap.classList.contains('open')) scrollToModule(group.id);
  });
  wrap.appendChild(head);
  const body = document.createElement('div');
  body.className = 'nav-group-body';
  if (group.subs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'nav-empty';
    empty.textContent = '点击模块名跳转';
    body.appendChild(empty);
  } else {
    group.subs.forEach(sub => {
      if (sub.isGroup) {
        const subWrap = document.createElement('div');
        subWrap.className = 'nav-sub';
        subWrap.innerHTML = '<span class="ng-arrow">▸</span> ' + escapeHtml(sub.label);
        subWrap.addEventListener('click', (e) => {
          e.stopPropagation();
          // 找到下一个 nav-group-detail
          let next = subWrap.nextElementSibling;
          while (next && !next.classList.contains('nav-group-detail')) next = next.nextElementSibling;
          if (next) {
            next.classList.toggle('open');
            // 修改自身箭头
            const arr = subWrap.querySelector('.ng-arrow');
            if (arr) arr.textContent = next.classList.contains('open') ? '▾' : '▸';
          }
        });
        body.appendChild(subWrap);
        const detail = document.createElement('div');
        detail.className = 'nav-group-detail';
        if (sub.groupSubs) {
          sub.groupSubs.forEach(g => {
            const d = document.createElement('div');
            d.className = 'nav-sub-sub';
            d.textContent = g.label;
            d.addEventListener('click', (e) => {
              e.stopPropagation();
              closeSidebar();
              scrollToModule(group.id);
            });
            detail.appendChild(d);
          });
        }
        body.appendChild(detail);
      } else {
        const s = document.createElement('div');
        s.className = 'nav-sub';
        s.textContent = sub.label;
        s.addEventListener('click', (e) => {
          e.stopPropagation();
          if (sub.anchor) scrollToAnchor(sub.anchor);
          else scrollToModule(group.id);
          closeSidebar();
        });
        body.appendChild(s);
      }
    });
  }
  wrap.appendChild(body);
  return wrap;
}

function scrollToModule(id) {
  const el = document.getElementById(`module-${id}`);
  if (!el) return;
  state.collapsed[id] = false;
  saveState(); applyCollapsed();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function scrollToAnchor(anchorId) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  let parent = el.closest('.module');
  if (parent) {
    state.collapsed[parent.id.replace('module-', '')] = false;
    saveState(); applyCollapsed();
  }
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarMask').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarMask').classList.remove('show'); }

/* ===== 事件 ===== */
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
  const ids = ['cet','exam','weight','weekly', ...state.customModules.map(m => m.id)];
  ids.forEach(m => state.collapsed[m] = !allCollapsed);
  saveState(); applyCollapsed();
  renderSidebar();
});
$('#hamburgerBtn').addEventListener('click', openSidebar);
$('#sidebarClose').addEventListener('click', closeSidebar);
$('#sidebarMask').addEventListener('click', closeSidebar);
$$('.card-mini').forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.target;
    state.collapsed[target] = false;
    saveState(); applyCollapsed();
    document.getElementById('module-' + target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ===== CET A/B 提交 + 删除 ===== */
['#cetADate', '#cetBDate'].forEach(sel => { $(sel).value = todayStr(); });
$('#cetAAddForm').addEventListener('submit', e => {
  e.preventDefault();
  const type = $('#cetAType').value;
  const total = parseInt($('#cetACount').value);
  const right = parseInt($('#cetARight').value);
  const date = $('#cetADate').value || todayStr();
  if (!total || isNaN(right) || right > total || right < 0) { toast('请检查题数'); return; }
  state.cet.recordsA.push({ id: genId(), type, total, right, date });
  saveState();
  $('#cetACount').value = ''; $('#cetARight').value = ''; $('#cetADate').value = todayStr();
  renderCET(); renderSidebar();
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
  renderCET(); renderSidebar();
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
function openGoalModal() { $('#goalInput').value = state.cet.goalScore || ''; $('#goalModal').classList.add('open'); }
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
  saveState(); renderCET(); renderSidebar(); closeGoalModal();
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
  $('#gradeResult').innerHTML = `
    <div class="grade-summary">
      <div>
        <div class="grade-score">${result.overall}<small> / 100</small></div>
        <div style="font-size:11px;color:var(--text-soft);font-weight:600;margin-top:2px;">${type}</div>
      </div>
      <span class="grade-gap-badge ${result.gapLevel}">${escapeHtml(result.gap)}</span>
    </div>
    <div class="grade-section"><div class="grade-section-title">⚠️ 主要问题</div><div class="grade-section-content">${result.issues.map(x => '• ' + escapeHtml(x)).join('\n')}</div></div>
    <div class="grade-section"><div class="grade-section-title">💡 建议</div><div class="grade-section-content">${result.suggestions.map(x => '• ' + escapeHtml(x)).join('\n')}</div></div>
    <div class="grade-section"><div class="grade-section-title">🎯 目标差距</div><div class="grade-section-content">${escapeHtml(result.gap)}</div></div>`;
  state.cet.gradeHistory.push({ id: genId(), date: todayStr(), type, text, score: result.overall, issues: result.issues, suggestions: result.suggestions, gap: result.gap });
  saveState(); renderCET();
  toast('AI 批改完成');
});
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

/* ===== OCR ===== */
let tesseractWorker = null;
let tesseractLoading = null;
async function ensureOcr() {
  if (tesseractWorker) return tesseractWorker;
  if (tesseractLoading) return tesseractLoading;
  $('#ocrLoader').style.display = 'flex';
  tesseractLoading = (async () => {
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    tesseractWorker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') $('#ocrLoaderSub').textContent = `识别中 ${Math.round(m.progress*100)}%`;
      }
    });
    $('#ocrLoader').style.display = 'none';
    return tesseractWorker;
  })();
  return tesseractLoading;
}
$('#gradeImage').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
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
  } finally { e.target.value = ''; }
});
$('#clearOcrBtn').addEventListener('click', () => {
  $('#gradeText').value = ''; $('#gradeOcrStatus').textContent = ''; $('#clearOcrBtn').style.display = 'none';
});

/* ===== 考试弹窗 + 计划细化 ===== */
$('#addExamBtn').addEventListener('click', () => openExamModal(null));
function openExamModal(ex = null, moduleId = null) {
  $('#examModalTitle').textContent = ex ? '编辑考试' : '添加考试';
  if (moduleId) {
    $('#examEditId').value = (ex ? ex.id : '') + '|' + moduleId;
  } else {
    $('#examEditId').value = ex ? ex.id : '';
  }
  $('#examName').value = ex ? ex.name : '';
  $('#examDate').value = ex ? ex.date : '';
  $('#examSignDate').value = ex ? ex.signDate : '';
  $('#examNote').value = ex ? ex.note : '';
  $('#examModal').classList.add('open');
}
function closeExamModal() { $('#examModal').classList.remove('open'); $('#examEditId').value = ''; }
$('#examModalClose').addEventListener('click', closeExamModal);
$('#examModalCancel').addEventListener('click', closeExamModal);
$('#examModal').addEventListener('click', e => { if (e.target === $('#examModal')) closeExamModal(); });
$('#examForm').addEventListener('submit', e => {
  e.preventDefault();
  const idRaw = $('#examEditId').value;
  const data = {
    name: $('#examName').value.trim(),
    date: $('#examDate').value,
    signDate: $('#examSignDate').value,
    note: $('#examNote').value.trim(),
  };
  if (!data.name) return;
  if (idRaw.includes('|')) {
    const [eid, moduleId] = idRaw.split('|');
    const m = state.customModules.find(x => x.id === moduleId);
    if (!m) return;
    if (eid) {
      const ex = m.data.exams.find(x => x.id === eid);
      if (ex) Object.assign(ex, data);
    } else {
      m.data.exams.push({ id: genId(), plans: [], ...data });
    }
    saveState(); renderCustomExamList(moduleId); renderSidebar(); closeExamModal();
    toast('已保存');
  } else {
    const id = idRaw;
    if (id) {
      const ex = state.exams.find(x => x.id === id);
      if (ex) Object.assign(ex, data);
    } else {
      state.exams.push({ id: genId(), plans: [], ...data });
    }
    saveState(); renderExams(); renderSidebar(); closeExamModal();
    toast(id ? '已更新' : '已添加');
  }
});

/* ===== 考试列表 inline 日期 + 计划事件 ===== */
function bindExamList(container, getExams, renderFn) {
  container.addEventListener('change', e => {
    const t = e.target;
    if (t.classList && t.classList.contains('exam-date-inline')) {
      const isCust = !!t.dataset.cfield;
      if (isCust) {
        const modId = t.dataset.mod;
        const eid = t.dataset.eid;
        const field = t.dataset.cfield;
        const m = state.customModules.find(x => x.id === modId);
        const ex = m?.data.exams.find(x => x.id === eid);
        if (ex) { ex[field] = t.value; saveState(); renderCustomExamList(modId); renderSidebar(); toast('已更新日期'); }
      } else {
        const ex = state.exams.find(x => x.id === t.dataset.id);
        if (ex) { ex[t.dataset.field] = t.value; saveState(); renderExams(); renderSidebar(); toast('已更新日期'); }
      }
    }
  });
  container.addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.edit) {
      const ex = state.exams.find(x => x.id === t.dataset.edit);
      if (ex) openExamModal(ex, null);
    } else if (t.dataset.del) {
      if (confirm('确定删除？')) {
        state.exams = state.exams.filter(x => x.id !== t.dataset.del);
        saveState(); renderExams(); renderSidebar(); toast('已删除');
      }
    } else if (t.dataset.planToggle) {
      const ex = state.exams.find(x => x.id === t.dataset.exam);
      const p = ex?.plans.find(p => p.id === t.dataset.planToggle);
      if (p) p.done = !p.done;
      saveState(); renderExams(); renderSidebar();
    } else if (t.dataset.planEdit) {
      const ex = state.exams.find(x => x.id === t.dataset.exam);
      const p = ex?.plans.find(p => p.id === t.dataset.planEdit);
      if (p) openPlanModal(ex.id, p);
    } else if (t.dataset.planDel) {
      const ex = state.exams.find(x => x.id === t.dataset.exam);
      if (ex) ex.plans = ex.plans.filter(p => p.id !== t.dataset.planDel);
      saveState(); renderExams(); renderSidebar();
    } else if (t.dataset.addplan) {
      openPlanModal(t.dataset.addplan, null);
    }
  });
}
bindExamList($('#examList'), () => state.exams, renderExams);

/* ===== 计划弹窗 ===== */
function openPlanModal(examId, plan) {
  $('#planModalTitle').textContent = plan ? '编辑计划' : '添加计划';
  $('#planEditId').value = plan ? plan.id : '';
  $('#planExamId').value = examId;
  $('#planTime').value = plan ? (plan.time || '') : '';
  $('#planText').value = plan ? plan.text : '';
  $('#planNote').value = plan ? (plan.note || '') : '';
  $('#planModal').classList.add('open');
}
function closePlanModal() { $('#planModal').classList.remove('open'); }
$('#planModalClose').addEventListener('click', closePlanModal);
$('#planModalCancel').addEventListener('click', closePlanModal);
$('#planModal').addEventListener('click', e => { if (e.target === $('#planModal')) closePlanModal(); });
$('#planForm').addEventListener('submit', e => {
  e.preventDefault();
  const examId = $('#planExamId').value;
  const id = $('#planEditId').value;
  const data = { time: $('#planTime').value.trim(), text: $('#planText').value.trim(), note: $('#planNote').value.trim(), done: false };
  if (!data.text) { toast('请填写需要做的事项'); return; }
  let ex = state.exams.find(x => x.id === examId);
  let modId = null;
  if (!ex) {
    for (const m of state.customModules) {
      ex = m.data.exams.find(x => x.id === examId);
      if (ex) { modId = m.id; break; }
    }
  }
  if (!ex) return;
  if (id) {
    const p = ex.plans.find(p => p.id === id);
    if (p) Object.assign(p, data);
  } else {
    ex.plans.push({ id: genId(), ...data });
  }
  saveState();
  renderExams();
  if (modId) renderCustomExamList(modId);
  renderSidebar();
  closePlanModal();
  toast(id ? '已更新' : '已添加');
});

/* ===== 减肥 ===== */
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
  if (!startW || !endW || isNaN(exercise) || !selectedRating || !tweak) { toast('请填写完整'); return; }
  const week = getWeekRange();
  const exists = state.weight.weeklyRecords.find(r => r.weekLabel === week.label);
  const data = { weekLabel: week.label, monDate: week.start, sunDate: week.end, startW, endW, exercise, rating: selectedRating, tweak };
  if (exists) { if (!confirm('覆盖本周？')) return; Object.assign(exists, data); }
  else state.weight.weeklyRecords.push({ id: genId(), ...data });
  saveState(); renderWeight(); toast('已保存');
});
$('#weeklyWeightList').addEventListener('click', e => {
  if (e.target.dataset.wdel) {
    if (!confirm('删除？')) return;
    state.weight.weeklyRecords = state.weight.weeklyRecords.filter(r => r.id !== e.target.dataset.wdel);
    saveState(); renderWeight();
  }
});

/* ===== AI 周复盘 ===== */
$('#genWeeklyBtn').addEventListener('click', () => {
  const review = aiWeeklyReview();
  const week = getWeekRange();
  const exists = state.weeklyReviews.find(r => r.weekLabel === week.label);
  const data = { weekLabel: week.label, date: todayStr(), sections: review.sections };
  if (exists) { if (!confirm('覆盖本周？')) return; Object.assign(exists, data); }
  else state.weeklyReviews.push({ id: genId(), ...data });
  saveState();
  $('#aiWeeklyResult').innerHTML = renderReviewHtml(data);
  renderWeekly();
  toast('已生成');
});
function renderReviewHtml(r) {
  const sectionsHtml = r.sections.map(s => {
    if (s.type === 'list') return `<div class="rc-section"><div class="rc-section-title">${escapeHtml(s.title)}</div><ul class="rc-list">${s.body.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
    return `<div class="rc-section"><div class="rc-section-title">${escapeHtml(s.title)}</div><div class="rc-section-content">${escapeHtml(s.body)}</div></div>`;
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

/* ===== 新建模块 ===== */
function openNewModuleModal() { $('#newModuleModal').classList.add('open'); $('#nmName').focus(); }
function closeNewModuleModal() { $('#newModuleModal').classList.remove('open'); }
$('#addModuleBtn').addEventListener('click', openNewModuleModal);
$('#newModuleModalClose').addEventListener('click', closeNewModuleModal);
$('#newModuleModalCancel').addEventListener('click', closeNewModuleModal);
$('#newModuleModal').addEventListener('click', e => { if (e.target === $('#newModuleModal')) closeNewModuleModal(); });
$('#newModuleForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#nmName').value.trim();
  const icon = $('#nmIcon').value.trim() || '🎯';
  const type = document.querySelector('input[name="nmType"]:checked').value;
  if (!name) return;
  const data = type === 'exam' ? { exams: [] } : { goalScore: null, recordsA: [], recordsB: [] };
  state.customModules.push({ id: genId(), name, icon, type, data });
  saveState(); renderCustomModules(); renderSidebar(); closeNewModuleModal();
  toast('已创建模块：' + name);
});

/* ===== 自定义模块：事件代理 ===== */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.addcustom) {
    openExamModal(null, t.dataset.addcustom);
    return;
  }
  if (t.dataset.custEdit) {
    const m = state.customModules.find(x => x.id === t.dataset.mod);
    const ex = m?.data.exams.find(x => x.id === t.dataset.custEdit);
    if (ex) openExamModal(ex, t.dataset.mod);
    return;
  }
  if (t.dataset.custDel) {
    if (!confirm('删除该考试？')) return;
    const m = state.customModules.find(x => x.id === t.dataset.mod);
    if (m) m.data.exams = m.data.exams.filter(x => x.id !== t.dataset.custDel);
    saveState(); renderCustomExamList(t.dataset.mod); renderSidebar();
    return;
  }
  if (t.dataset.custAddplan) {
    openPlanModal(t.dataset.custAddplan, null);
    return;
  }
  if (t.dataset.custToggle) {
    const m = state.customModules.find(x => x.id === t.dataset.mod);
    const ex = m?.data.exams.find(x => x.id === t.dataset.eid);
    const p = ex?.plans.find(p => p.id === t.dataset.custToggle);
    if (p) p.done = !p.done;
    saveState(); renderCustomExamList(t.dataset.mod); renderSidebar();
    return;
  }
  if (t.dataset.custEditplan) {
    let ex = null, modId = null;
    for (const m of state.customModules) {
      ex = m.data.exams.find(x => x.plans.find(p => p.id === t.dataset.custEditplan));
      if (ex) { modId = m.id; break; }
    }
    if (!ex) ex = state.exams.find(x => x.plans.find(p => p.id === t.dataset.custEditplan));
    const p = ex?.plans.find(p => p.id === t.dataset.custEditplan);
    if (ex && p) openPlanModal(ex.id, p);
    return;
  }
  if (t.dataset.custDelplan) {
    for (const m of state.customModules) {
      const ex = m.data.exams.find(x => x.id === t.dataset.eid);
      if (ex) {
        ex.plans = ex.plans.filter(p => p.id !== t.dataset.custDelplan);
        saveState(); renderCustomExamList(m.id); renderSidebar();
        toast('已删除');
        return;
      }
    }
    return;
  }
  if (t.dataset.editmod) {
    const m = state.customModules.find(x => x.id === t.dataset.editmod);
    if (m) openEditCustomModal(m);
    return;
  }
  if (t.dataset.setcgoal) {
    const m = state.customModules.find(x => x.id === t.dataset.setcgoal);
    if (m) {
      const v = prompt(`设置【${m.name}】目标分数`, m.data.goalScore || '');
      if (v !== null) {
        const n = parseInt(v);
        if (!isNaN(n) && n >= 0 && n <= 710) {
          m.data.goalScore = n;
          saveState(); renderCustomCet(m.id); renderSidebar();
          toast('已设置目标 ' + n);
        }
      }
    }
    return;
  }
  if (t.dataset.cadel) {
    const m = state.customModules.find(x => x.id === t.dataset.mod);
    if (m) m.data.recordsA = m.data.recordsA.filter(r => r.id !== t.dataset.cadel);
    saveState(); renderCustomCet(t.dataset.mod); renderSidebar();
    return;
  }
  if (t.dataset.cbdel) {
    const m = state.customModules.find(x => x.id === t.dataset.mod);
    if (m) m.data.recordsB = m.data.recordsB.filter(r => r.id !== t.dataset.cbdel);
    saveState(); renderCustomCet(t.dataset.mod); renderSidebar();
    return;
  }
});

document.addEventListener('submit', e => {
  const form = e.target;
  if (form.dataset.cetaform) {
    e.preventDefault();
    const mid = form.dataset.cetaform;
    const m = state.customModules.find(x => x.id === mid);
    if (!m) return;
    const type = form.querySelector('[data-ceta-type]').value;
    const total = parseInt(form.querySelector('[data-ceta-count]').value);
    const right = parseInt(form.querySelector('[data-ceta-right]').value);
    const date = form.querySelector('[data-ceta-date]').value || todayStr();
    if (!total || isNaN(right) || right > total || right < 0) { toast('请检查题数'); return; }
    m.data.recordsA.push({ id: genId(), type, total, right, date });
    saveState();
    form.querySelector('[data-ceta-count]').value = '';
    form.querySelector('[data-ceta-right]').value = '';
    form.querySelector('[data-ceta-date]').value = todayStr();
    renderCustomCet(mid); renderSidebar();
    toast('已记录');
    return;
  }
  if (form.dataset.cetbform) {
    e.preventDefault();
    const mid = form.dataset.cetbform;
    const m = state.customModules.find(x => x.id === mid);
    if (!m) return;
    const type = form.querySelector('[data-cetb-type]').value;
    const count = parseInt(form.querySelector('[data-cetb-count]').value);
    const date = form.querySelector('[data-cetb-date]').value || todayStr();
    if (!count || count < 1) { toast('请填写有效篇数'); return; }
    m.data.recordsB.push({ id: genId(), type, count, date });
    saveState();
    form.querySelector('[data-cetb-count]').value = '';
    form.querySelector('[data-cetb-date]').value = todayStr();
    renderCustomCet(mid); renderSidebar();
    toast('已记录');
    return;
  }
});

/* ===== 编辑自定义模块 ===== */
function openEditCustomModal(m) {
  $('#ecmId').value = m.id;
  $('#ecmName').value = m.name;
  $('#ecmIcon').value = m.icon;
  $('#editCustomModal').classList.add('open');
}
function closeEditCustomModal() { $('#editCustomModal').classList.remove('open'); }
$('#editCustomModalClose').addEventListener('click', closeEditCustomModal);
$('#editCustomModal').addEventListener('click', e => { if (e.target === $('#editCustomModal')) closeEditCustomModal(); });
$('#editCustomForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#ecmId').value;
  const m = state.customModules.find(x => x.id === id);
  if (!m) return;
  m.name = $('#ecmName').value.trim() || m.name;
  m.icon = $('#ecmIcon').value.trim() || m.icon;
  saveState();
  renderCustomModules(); renderSidebar(); closeEditCustomModal();
  toast('已保存');
});
$('#ecmDeleteBtn').addEventListener('click', () => {
  if (!confirm('删除整个模块？该模块下所有考试/记录都会丢失。')) return;
  const id = $('#ecmId').value;
  state.customModules = state.customModules.filter(m => m.id !== id);
  delete state.collapsed[id];
  saveState(); renderCustomModules(); renderSidebar(); closeEditCustomModal();
  toast('已删除');
});

/* ===== 启动 ===== */
renderAll();
window.addEventListener('resize', () => drawWeightChart(state.weight.weeklyRecords));
window.__state = state;