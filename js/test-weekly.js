// test-weekly.js — 家长周报单元测试
// 运行：node js/test-weekly.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'weekly.js'));
const W = globalThis.MusicWeekly;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

/** 固定“今天”为 2026-10-22（周四） */
const NOW = new Date(2026, 9, 22);

function historyWith(entries) {
  return entries;
}

/* ---------- 周范围 ---------- */
t('一周是 7 天且以今天结尾', () => {
  const keys = W.weekKeys(NOW);
  assert.strictEqual(keys.length, 7);
  assert.strictEqual(keys[6], '2026-10-22');
  assert.strictEqual(keys[0], '2026-10-16');
});
t('跨月边界正确', () => {
  const keys = W.weekKeys(new Date(2026, 10, 2));
  assert.strictEqual(keys[6], '2026-11-02');
  assert.strictEqual(keys[0], '2026-10-27');
});

/* ---------- 汇总 ---------- */
t('空数据：全零且不给星级', () => {
  const r = W.build({}, { now: NOW });
  assert.strictEqual(r.totalCount, 0);
  assert.strictEqual(r.activeDays, 0);
  assert.strictEqual(r.rate, null);
  assert.strictEqual(r.level, 'none');
  assert.ok(r.advice[0].includes('还没有练习'));
});
t('统计练习天数与总次数', () => {
  const r = W.build({
    history: historyWith({
      '2026-10-20': { practice: 5, correct: 4, total: 5 },
      '2026-10-21': { practice: 3, theory: 2, correct: 5, total: 5 },
      '2026-10-22': { follow: 1, correct: 10, total: 12 }
    })
  }, { now: NOW });
  assert.strictEqual(r.activeDays, 3);
  assert.strictEqual(r.totalCount, 11);
  assert.strictEqual(r.answered, 22);
  assert.strictEqual(r.correct, 19);
  assert.strictEqual(r.rate, 86);
});
t('只统计本周，窗口外的记录忽略', () => {
  const r = W.build({
    history: {
      '2026-10-15': { practice: 99 },   // 上周
      '2026-10-16': { practice: 2 }     // 本周第一天
    }
  }, { now: NOW });
  assert.strictEqual(r.totalCount, 2);
});
t('分类统计按次数排序', () => {
  const r = W.build({
    history: {
      '2026-10-21': { practice: 5, theory: 1, rhythm: 3 }
    }
  }, { now: NOW });
  assert.deepStrictEqual(r.byKind.map(k => k.key), ['practice', 'rhythm', 'theory']);
  assert.strictEqual(r.byKind[0].name, '识谱练习');
});
t('找出练习最多的一天', () => {
  const r = W.build({
    history: {
      '2026-10-18': { practice: 2 },
      '2026-10-19': { practice: 9 }
    }
  }, { now: NOW });
  assert.strictEqual(r.bestDay.date, '2026-10-19');
  assert.strictEqual(r.bestDay.count, 9);
});
t('无练习时 bestDay 为空', () => {
  const r = W.build({}, { now: NOW });
  assert.strictEqual(r.bestDay, null);
});
t('每天记录带星期与分类明细', () => {
  const r = W.build({ history: { '2026-10-22': { practice: 2, follow: 1 } } }, { now: NOW });
  const day = r.days[6];
  assert.strictEqual(day.weekday, '四');
  assert.strictEqual(day.kinds.practice, 2);
  assert.strictEqual(day.kinds.follow, 1);
  assert.strictEqual(day.count, 3);
});

/* ---------- 薄弱音 ---------- */
t('薄弱音按错误次数排序并给出名称', () => {
  const r = W.build({
    mistakes: {
      0: { wrong: 5, total: 6 },
      7: { wrong: 2, total: 3 },
      1: { wrong: 1, total: 2 }
    }
  }, { now: NOW });
  assert.strictEqual(r.weak.length, 3);
  assert.strictEqual(r.weak[0].pitchClass, 0);
  assert.strictEqual(r.weak[0].name, 'C · Do');
  assert.ok(r.weak.some(w => w.name.includes('♯')), '黑键带升号');
});
t('薄弱音最多取 3 个', () => {
  const m = {};
  [0, 2, 4, 5, 7, 9].forEach((pc, i) => { m[pc] = { wrong: 6 - i, total: 6 }; });
  const r = W.build({ mistakes: m }, { now: NOW });
  assert.strictEqual(r.weak.length, 3);
});
t('没有错题时薄弱音为空', () => {
  assert.deepStrictEqual(W.build({ mistakes: {} }, { now: NOW }).weak, []);
});

/* ---------- 评级 ---------- */
t('坚持 + 高正确率 + 足量 → star', () => {
  const h = {};
  W.weekKeys(NOW).forEach(k => { h[k] = { practice: 10, correct: 9, total: 10 }; });
  const r = W.build({ history: h }, { now: NOW });
  assert.strictEqual(r.level, 'star');
});
t('只练一天 → low 或 ok', () => {
  const r = W.build({ history: { '2026-10-22': { practice: 2, correct: 2, total: 2 } } }, { now: NOW });
  assert.ok(['low', 'ok'].includes(r.level), '实际：' + r.level);
});

/* ---------- 建议 ---------- */
t('练得少时建议固定时间', () => {
  const r = W.build({ history: { '2026-10-22': { practice: 1, correct: 1, total: 1 } } }, { now: NOW });
  assert.ok(r.advice.some(a => a.includes('固定一个时间段')));
});
t('坚持得好时给予肯定', () => {
  const h = {};
  W.weekKeys(NOW).forEach(k => { h[k] = { practice: 3, correct: 3, total: 3 }; });
  const r = W.build({ history: h }, { now: NOW });
  assert.ok(r.advice.some(a => a.includes('坚持得很好')));
});
t('正确率低时建议放慢', () => {
  const r = W.build({
    history: { '2026-10-20': { practice: 5, correct: 2, total: 5 }, '2026-10-21': { practice: 5, correct: 2, total: 5 } }
  }, { now: NOW });
  assert.ok(r.advice.some(a => a.includes('放慢')));
});
t('正确率高时建议加难度', () => {
  const r = W.build({
    history: { '2026-10-20': { practice: 5, correct: 5, total: 5 }, '2026-10-21': { practice: 5, correct: 5, total: 5 } }
  }, { now: NOW });
  assert.ok(r.advice.some(a => a.includes('更高难度')));
});
t('有薄弱音时建议专项练习', () => {
  const r = W.build({
    history: { '2026-10-21': { practice: 5, correct: 4, total: 5 } },
    mistakes: { 0: { wrong: 4, total: 5 } }
  }, { now: NOW });
  assert.ok(r.advice.some(a => a.includes('错题本')));
});
t('练习量够但没跟练时给出提示', () => {
  const r = W.build({
    history: { '2026-10-21': { practice: 15, correct: 12, total: 15 } }
  }, { now: NOW });
  assert.ok(r.advice.some(a => a.includes('跟练')));
});
t('建议最多 3 条', () => {
  const r = W.build({
    history: { '2026-10-21': { practice: 15, correct: 5, total: 15 } },
    mistakes: { 0: { wrong: 9, total: 10 } }
  }, { now: NOW });
  assert.ok(r.advice.length <= 3);
});

/* ---------- 文本导出 ---------- */
t('文本版包含关键信息', () => {
  const r = W.build({
    history: { '2026-10-21': { practice: 5, correct: 4, total: 5 } },
    courses: { 'baier-01': { done: true, stars: 3 } },
    gamify: { dayStreak: 4, xp: 60, badges: { first: 1 } },
    mistakes: { 0: { wrong: 3, total: 4 } }
  }, { now: NOW, name: '小明' });
  const text = W.toText(r);
  assert.ok(text.includes('小明'));
  assert.ok(text.includes('2026-10-16'));
  assert.ok(text.includes('练习天数'));
  assert.ok(text.includes('一次答对率'));
  assert.ok(text.includes('C · Do'));
  assert.ok(text.includes('建议'));
});
t('文本版对空数据也完整', () => {
  const text = W.toText(W.build({}, { now: NOW }));
  assert.ok(text.includes('练习天数：0 / 7'));
  assert.ok(text.includes('建议'));
});

/* ---------- 课程与游戏化 ---------- */
t('课程进度与游戏化数据汇总', () => {
  const r = W.build({
    courses: { 'baier-01': { done: true, stars: 3 }, 'baier-02': { done: true, stars: 2 }, 'x': { done: false } },
    gamify: { dayStreak: 5, xp: 88, badges: { a: 1, b: 2 } }
  }, { now: NOW });
  assert.strictEqual(r.courses.done, 2);
  assert.strictEqual(r.courses.stars, 5);
  assert.strictEqual(r.streak, 5);
  assert.strictEqual(r.xp, 88);
  assert.strictEqual(r.badges, 2);
});

console.log('\ntest-weekly.js: ' + n + ' 项全部通过 ✓');
