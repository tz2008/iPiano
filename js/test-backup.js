// test-backup.js — 数据备份：导出格式、校验、合并导入
// 运行：node js/test-backup.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'backup.js'));
const B = globalThis.MusicBackup;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

function sampleState() {
  return {
    clef: 'treble', difficulty: 'easy', naming: 'solfege', mode: 'name',
    sound: true, theme: 'light',
    stats: { attempts: 20, correct: 15, firstTry: 12, stars: 18, currentStreak: 2, bestStreak: 5, fullCorrect: 1 },
    courses: { 'baier-01': { done: true, stars: 2 } },
    mistakes: { 0: { wrong: 3, total: 4, last: 100, clef: 'treble' } },
    history: { '2026-10-20': { practice: 5, correct: 4, total: 5 } },
    trainBest: { sight: 2 },
    gamify: { xp: 30, dayStreak: 4, lastDay: '2026-10-20', freezes: 1, taskDate: '', tasks: [], prog: {}, badges: { first: 1 } }
  };
}

/* ---------- 导出 ---------- */
t('导出包结构', () => {
  const pack = B.build(sampleState());
  assert.strictEqual(pack.format, B.FORMAT);
  assert.strictEqual(pack.version, B.VERSION);
  assert.ok(pack.exportedAt);
  assert.ok(pack.data.stats);
});
t('序列化后可解析回同样内容', () => {
  const st = sampleState();
  const text = B.serialize(st);
  const back = JSON.parse(text);
  assert.deepStrictEqual(back.data, st);
});
t('导出可带 meta（档案名）并原样读回', () => {
  const r = B.parse(B.serialize(sampleState(), { profileName: '小明' }));
  assert.ok(r.ok);
  assert.strictEqual(r.meta.profileName, '小明');
});
t('文件名含日期与时间', () => {
  const name = B.fileName(new Date(2026, 9, 21, 9, 5));
  assert.ok(name.includes('20261021-0905'), name);
  assert.ok(name.endsWith('.json'));
});

/* ---------- 校验 ---------- */
t('拒绝空文件', () => {
  assert.strictEqual(B.parse('').ok, false);
  assert.strictEqual(B.parse('   ').ok, false);
});
t('拒绝非 JSON', () => {
  const r = B.parse('not json {');
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('JSON'));
});
t('拒绝无关 JSON', () => {
  const r = B.parse(JSON.stringify({ foo: 1, bar: 2 }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('不是本应用'));
});
t('拒绝更新版本的备份', () => {
  const r = B.parse(JSON.stringify({ format: B.FORMAT, version: 99, data: { stats: {} } }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('更新版本'));
});
t('接受标准备份包', () => {
  const r = B.parse(B.serialize(sampleState()));
  assert.ok(r.ok);
  assert.strictEqual(r.data.stats.attempts, 20);
  assert.ok(r.exportedAt);
});
t('兼容裸 state（没有 format 字段）', () => {
  const r = B.parse(JSON.stringify(sampleState()));
  assert.ok(r.ok);
  assert.strictEqual(r.data.courses['baier-01'].stars, 2);
});
t('拒绝数组', () => {
  assert.strictEqual(B.parse('[1,2,3]').ok, false);
});

/* ---------- 合并 ---------- */
t('合并统计：取较大值', () => {
  const cur = { stats: { attempts: 10, correct: 8, stars: 9 } };
  const inc = { stats: { attempts: 5, correct: 12, stars: 9 } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.stats.attempts, 10, '尝试取大');
  assert.strictEqual(out.stats.correct, 12, '答对取大');
});
t('合并课程：取更高星级', () => {
  const cur = { courses: { 'baier-01': { done: true, stars: 3 }, 'baier-02': { done: true, stars: 1 } } };
  const inc = { courses: { 'baier-01': { done: true, stars: 1 }, 'baier-03': { done: true, stars: 2 } } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.courses['baier-01'].stars, 3, '保留高星');
  assert.strictEqual(out.courses['baier-02'].stars, 1, '保留本机独有');
  assert.strictEqual(out.courses['baier-03'].stars, 2, '导入独有');
});
t('合并错题本：次数累加、时间取新', () => {
  const cur = { mistakes: { 0: { wrong: 2, total: 3, last: 100, clef: 'treble' } } };
  const inc = { mistakes: { 0: { wrong: 5, total: 6, last: 200, clef: 'bass' }, 7: { wrong: 1, total: 1, last: 50 } } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.mistakes[0].wrong, 7);
  assert.strictEqual(out.mistakes[0].total, 9);
  assert.strictEqual(out.mistakes[0].last, 200);
  assert.strictEqual(out.mistakes[0].clef, 'bass');
  assert.strictEqual(out.mistakes[7].wrong, 1);
});
t('合并历史：同日相加', () => {
  const cur = { history: { '2026-10-20': { practice: 5, correct: 4, total: 5 } } };
  const inc = { history: { '2026-10-20': { practice: 2, correct: 2, total: 2 }, '2026-10-19': { practice: 1 } } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.history['2026-10-20'].practice, 7);
  assert.strictEqual(out.history['2026-10-20'].correct, 6);
  assert.strictEqual(out.history['2026-10-19'].practice, 1);
});
t('合并游戏化：XP/天数取大、徽章取并集', () => {
  const cur = { gamify: { xp: 30, dayStreak: 4, freezes: 1, lastDay: '2026-10-19', badges: { first: 1 } } };
  const inc = { gamify: { xp: 50, dayStreak: 2, freezes: 3, lastDay: '2026-10-21', badges: { streak10: 2 } } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.gamify.xp, 50);
  assert.strictEqual(out.gamify.dayStreak, 4);
  assert.strictEqual(out.gamify.freezes, 3);
  assert.strictEqual(out.gamify.lastDay, '2026-10-21');
  assert.deepStrictEqual(Object.keys(out.gamify.badges).sort(), ['first', 'streak10']);
});
t('合并挑战进度：全对天数取大、次数相加', () => {
  const cur = { challenge: { attempts: 1, best: 5, perfectDays: 1, lastDate: '2026-10-20',
    history: { '2026-10-20': { correct: 5, total: 8, perfect: false } } } };
  const inc = { challenge: { attempts: 2, best: 8, perfectDays: 3, lastDate: '2026-10-22',
    history: { '2026-10-21': { correct: 8, total: 8, perfect: true } } } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.challenge.attempts, 3, '次数相加');
  assert.strictEqual(out.challenge.best, 8, '最佳取大');
  assert.strictEqual(out.challenge.perfectDays, 3, '全对天数取大');
  assert.strictEqual(out.challenge.lastDate, '2026-10-22', '最近日期取新');
  assert.strictEqual(Object.keys(out.challenge.history).length, 2, '历史合并');
});
t('合并不修改原对象', () => {
  const cur = sampleState();
  const snapshot = JSON.stringify(cur);
  B.mergeState(cur, sampleState());
  assert.strictEqual(JSON.stringify(cur), snapshot, '原状态未被改动');
});
t('合并保留本机偏好设置', () => {
  const cur = { clef: 'bass', difficulty: 'full', stats: {} };
  const inc = { clef: 'treble', difficulty: 'easy', stats: { attempts: 5 } };
  const out = B.mergeState(cur, inc);
  assert.strictEqual(out.clef, 'bass', '本机谱号不被覆盖');
  assert.strictEqual(out.difficulty, 'full');
});
t('覆盖导入直接采用备份', () => {
  const inc = sampleState();
  const out = B.replaceState(inc);
  assert.deepStrictEqual(out, inc);
  assert.notStrictEqual(out, inc, '是拷贝不是引用');
});
t('合并缺失字段不报错', () => {
  assert.doesNotThrow(() => B.mergeState({ stats: {} }, {}));
  assert.doesNotThrow(() => B.mergeState({}, { stats: { attempts: 3 } }));
});

/* ---------- 概览 ---------- */
t('概览统计正确', () => {
  const ov = B.overview(sampleState());
  assert.strictEqual(ov.courses, 1);
  assert.strictEqual(ov.attempts, 20);
  assert.strictEqual(ov.badges, 1);
  assert.strictEqual(ov.historyDays, 1);
});
t('概览对空数据安全', () => {
  const ov = B.overview({});
  assert.strictEqual(ov.courses, 0);
  assert.strictEqual(ov.attempts, 0);
});

console.log('\ntest-backup.js: ' + n + ' 项全部通过 ✓');
