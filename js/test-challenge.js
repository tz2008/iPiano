// test-challenge.js — 每日挑战单元测试
// 运行：node js/test-challenge.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'sight.js'));
require(path.join(__dirname, 'challenge.js'));
const C = globalThis.MusicChallenge;
const Core = globalThis.MusicCore;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

const OPTS = { dateKey: '2026-10-22', profileId: 'p1', difficulty: 'standard', naming: 'solfege' };

/* ---------- 种子 ---------- */
t('同一日期 + 档案 → 同一套题', () => {
  const a = C.build(OPTS);
  const b = C.build(OPTS);
  assert.deepStrictEqual(a.questions.map(q => q.answer), b.questions.map(q => q.answer));
});
t('不同档案 → 不同题目', () => {
  const a = C.build(OPTS);
  const b = C.build({ ...OPTS, profileId: 'p2' });
  const same = JSON.stringify(a.questions.map(q => q.type === 'note' ? q.midi : q.q)) ===
    JSON.stringify(b.questions.map(q => q.type === 'note' ? q.midi : q.q));
  assert.ok(!same, '不同档案应得到不同题目');
});
t('不同日期 → 不同题目', () => {
  const a = C.build(OPTS);
  const b = C.build({ ...OPTS, dateKey: '2026-10-23' });
  const same = JSON.stringify(a.questions.map(q => q.type === 'note' ? q.midi : q.q)) ===
    JSON.stringify(b.questions.map(q => q.type === 'note' ? q.midi : q.q));
  assert.ok(!same);
});
t('种子是稳定正整数', () => {
  const s1 = C.seedFor('2026-10-22', 'p1');
  const s2 = C.seedFor('2026-10-22', 'p1');
  assert.strictEqual(s1, s2);
  assert.ok(s1 > 0);
  assert.notStrictEqual(s1, C.seedFor('2026-10-23', 'p1'));
});

/* ---------- 题目 ---------- */
t('题目数量与限时', () => {
  const c = C.build(OPTS);
  assert.strictEqual(c.total, 8);
  assert.strictEqual(c.seconds, 60);
  assert.strictEqual(c.questions.length, 8);
});
t('包含音符题与乐理题', () => {
  const c = C.build(OPTS);
  const notes = c.questions.filter(q => q.type === 'note');
  const theory = c.questions.filter(q => q.type === 'theory');
  assert.strictEqual(notes.length, 6);
  assert.strictEqual(theory.length, 2);
});
t('音符题答案与选项数量合法', () => {
  const c = C.build(OPTS);
  c.questions.filter(q => q.type === 'note').forEach(q => {
    assert.ok(q.answer >= 0 && q.answer < q.optionCount, '答案下标合法');
    assert.strictEqual(q.names.length, q.optionCount, '选项名数量匹配');
    assert.ok(['treble', 'bass'].includes(q.clef), '谱号合法');
    assert.ok(q.midi >= 21 && q.midi <= 108, '音高合法');
  });
});
t('音符题的答案索引与练习页一致', () => {
  const c = C.build(OPTS);
  c.questions.filter(q => q.type === 'note').forEach(q => {
    const dia = Core.midiToDia(q.midi);
    assert.strictEqual(q.answer, ((dia % 7) + 7) % 7, '白键按音级');
  });
});
t('88 键难度：12 个选项且含黑键题', () => {
  const c = C.build({ ...OPTS, difficulty: 'full', naming: 'letter' });
  const notes = c.questions.filter(q => q.type === 'note');
  notes.forEach(q => {
    assert.strictEqual(q.optionCount, 12);
    assert.strictEqual(q.names.length, 12);
    assert.strictEqual(q.answer, Core.SEMI_INDEX[((q.midi % 12) + 12) % 12]);
  });
});
t('乐理题结构完整', () => {
  const c = C.build(OPTS);
  c.questions.filter(q => q.type === 'theory').forEach(q => {
    assert.strictEqual(q.options.length, 4);
    assert.ok(q.answer >= 0 && q.answer < 4);
    assert.ok(q.q && q.explain);
  });
});
t('音名写法切换生效', () => {
  const a = C.build({ ...OPTS, naming: 'letter' });
  const note = a.questions.find(q => q.type === 'note');
  assert.deepStrictEqual(note.names, Core.LETTERS);
});

/* ---------- 判分 ---------- */
t('全对判定', () => {
  const c = C.build(OPTS);
  const answers = c.questions.map(q => q.answer);
  const r = C.score(c, answers);
  assert.strictEqual(r.correct, 8);
  assert.ok(r.perfect);
  assert.strictEqual(r.rate, 100);
});
t('部分正确', () => {
  const c = C.build(OPTS);
  const answers = c.questions.map((q, i) => (i < 5 ? q.answer : (q.answer + 1) % 4));
  const r = C.score(c, answers);
  assert.strictEqual(r.correct, 5);
  assert.ok(!r.perfect);
  assert.strictEqual(r.rate, 63);
});
t('未作答按错误计', () => {
  const c = C.build(OPTS);
  const r = C.score(c, []);
  assert.strictEqual(r.correct, 0);
  assert.strictEqual(r.rate, 0);
});

/* ---------- 状态记录 ---------- */
t('记录一次挑战', () => {
  const st = C.record({}, '2026-10-22', { correct: 6, total: 8, perfect: false });
  assert.strictEqual(st.lastDate, '2026-10-22');
  assert.strictEqual(st.attempts, 1);
  assert.strictEqual(st.best, 6);
  assert.strictEqual(st.perfectDays || 0, 0);
  assert.ok(st.history['2026-10-22']);
});
t('同一天重复挑战不重复计全对天数', () => {
  let st = C.record({}, '2026-10-22', { correct: 8, total: 8, perfect: true });
  assert.strictEqual(st.perfectDays, 1);
  st = C.record(st, '2026-10-22', { correct: 8, total: 8, perfect: true });
  assert.strictEqual(st.perfectDays, 1, '同一天只算一次');
  assert.strictEqual(st.attempts, 2);
});
t('不同日期全对累计天数', () => {
  let st = {};
  st = C.record(st, '2026-10-20', { correct: 8, total: 8, perfect: true });
  st = C.record(st, '2026-10-21', { correct: 8, total: 8, perfect: true });
  assert.strictEqual(st.perfectDays, 2);
  assert.ok(!C.perfectBadgeUnlocked(st));
  st = C.record(st, '2026-10-22', { correct: 8, total: 8, perfect: true });
  assert.strictEqual(st.perfectDays, 3);
  assert.ok(C.perfectBadgeUnlocked(st), '3 天全对解锁限定徽章');
});
t('最佳成绩取历史最好', () => {
  let st = C.record({}, '2026-10-20', { correct: 7, total: 8, perfect: false });
  st = C.record(st, '2026-10-21', { correct: 4, total: 8, perfect: false });
  assert.strictEqual(st.best, 7);
});
t('今天是否完成：需满分', () => {
  let st = C.record({}, '2026-10-22', { correct: 6, total: 8, perfect: false });
  assert.ok(!C.isDoneToday(st, '2026-10-22'), '未满分不算完成');
  st = C.record(st, '2026-10-22', { correct: 8, total: 8, perfect: true });
  assert.ok(C.isDoneToday(st, '2026-10-22'));
  assert.ok(!C.isDoneToday(st, '2026-10-23'));
});
t('历史只保留最近 60 天', () => {
  let st = {};
  for (let i = 0; i < 70; i++) {
    const d = new Date(2026, 0, 1 + i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    st = C.record(st, k, { correct: 5, total: 8, perfect: false });
  }
  assert.strictEqual(Object.keys(st.history).length, 60);
});
t('空状态安全', () => {
  assert.ok(!C.isDoneToday(null, '2026-10-22'));
  assert.ok(!C.perfectBadgeUnlocked(null));
  assert.strictEqual(C.record({}, '2026-10-22', { correct: 0, total: 8 }).attempts, 1);
});

/* ---------- 倒计时 ---------- */
t('距明天倒计时在 0–24 小时内', () => {
  const ms = C.msUntilTomorrow(new Date(2026, 9, 22, 23, 0));
  assert.ok(ms > 0 && ms <= 24 * 3600 * 1000, '实际：' + ms);
  assert.strictEqual(ms, 3600 * 1000, '23:00 距明天 1 小时');
});

console.log('\ntest-challenge.js: ' + n + ' 项全部通过 ✓');
