// test-stats.js — 错题本 / 练习历史 单元测试
// 运行：node js/test-stats.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'stats.js'));
require(path.join(__dirname, 'midi.js'));
const St = globalThis.MusicStats;
const Midi = globalThis.MidiInput;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

/* ---------- 错题本 ---------- */
t('记录错题：按音级聚合', () => {
  const book = {};
  St.recordMistake(book, 61, 'treble');   // C♯4
  St.recordMistake(book, 73, 'treble');   // C♯5 —— 同一音级
  assert.strictEqual(book[1].wrong, 2, '同音级合并');
  assert.strictEqual(Object.keys(book).length, 1);
});
t('记录错题：保留谱号', () => {
  const book = {};
  St.recordMistake(book, 43, 'bass');
  assert.strictEqual(book[7].clef, 'bass');
});
t('记录答对：只增加总数', () => {
  const book = {};
  St.recordMistake(book, 60, 'treble');
  St.recordCorrect(book, 60);
  assert.strictEqual(book[0].wrong, 1);
  assert.strictEqual(book[0].total, 2);
});
t('记录答对：未出错过的音不创建条目', () => {
  const book = {};
  St.recordCorrect(book, 64);
  assert.strictEqual(Object.keys(book).length, 0);
});
t('弱项排序：错得多、错误率高优先', () => {
  const book = {};
  for (let i = 0; i < 3; i++) St.recordMistake(book, 62, 'treble');
  St.recordMistake(book, 64, 'treble');
  St.recordCorrect(book, 64);
  St.recordCorrect(book, 64);
  St.recordCorrect(book, 64);
  const spots = St.weakSpots(book);
  assert.strictEqual(spots[0].pitchClass, 2, '错 3 次的排第一');
  assert.strictEqual(spots.length, 2);
});
t('弱项排序：limit 生效', () => {
  const book = {};
  [60, 62, 64, 65, 67].forEach(m => St.recordMistake(book, m, 'treble'));
  assert.strictEqual(St.weakSpots(book, 2).length, 2);
});
t('空判断与清空', () => {
  const book = {};
  assert.ok(St.isEmpty(book));
  St.recordMistake(book, 60, 'treble');
  assert.ok(!St.isEmpty(book));
  assert.deepStrictEqual(St.clearBook(), {});
});
t('recordMistake 对空输入安全', () => {
  const book = {};
  St.recordMistake(book, null, 'treble');
  St.recordMistake(null, 60, 'treble');
  assert.ok(St.isEmpty(book));
});

/* ---------- 练习历史 ---------- */
t('记录当天：按类型累加', () => {
  const h = {};
  St.recordDay(h, 'practice', { correct: 1, total: 1 });
  St.recordDay(h, 'practice', { correct: 0, total: 1 });
  St.recordDay(h, 'follow', { correct: 10, total: 12 });
  const key = St.todayKey();
  assert.strictEqual(h[key].practice, 2);
  assert.strictEqual(h[key].correct, 11);
  assert.strictEqual(h[key].total, 14);
  assert.strictEqual(h[key].follow, 1);
});
t('最近 7 天：补齐空缺日期', () => {
  const h = {};
  St.recordDay(h, 'practice', { correct: 1, total: 1 });
  const days = St.recent(h, 7);
  assert.strictEqual(days.length, 7);
  assert.strictEqual(days[6].count, 1, '今天有记录');
  assert.strictEqual(days[0].count, 0, '最早一天为空');
  assert.ok(days[6].label.includes('/'));
});
t('最近 7 天：正确率计算', () => {
  const h = {};
  St.recordDay(h, 'practice', { correct: 3, total: 4 });
  const today = St.recent(h, 1)[0];
  assert.strictEqual(today.rate, 75);
});
t('汇总：练习天数与总数', () => {
  const h = {};
  St.recordDay(h, 'practice', { correct: 1, total: 1 });
  St.recordDay(h, 'sight', { correct: 80, total: 100 });
  const s = St.summary(h, 7);
  assert.strictEqual(s.activeDays, 1);
  assert.strictEqual(s.totalCount, 2);
  assert.strictEqual(s.rate, 80);
});
t('历史裁剪：只保留 30 天', () => {
  const h = {};
  for (let i = 0; i < 40; i++) {
    const d = new Date(2026, 0, i + 1);
    h[St.todayKey(d)] = { practice: 1 };
  }
  St.prune(h);
  assert.strictEqual(Object.keys(h).length, St.HISTORY_DAYS);
  // 保留的是最新的
  assert.ok(h['2026-02-09'] || h['2026-02-08'], '保留最近日期');
});
t('日期键格式', () => {
  assert.match(St.todayKey(new Date(2026, 9, 5)), /^2026-10-05$/);
});

/* ---------- MIDI 解析 ---------- */
t('MIDI：note on', () => {
  const m = Midi.parseMessage(new Uint8Array([0x90, 60, 100]));
  assert.strictEqual(m.type, 'on');
  assert.strictEqual(m.midi, 60);
  assert.ok(Math.abs(m.velocity - 100 / 127) < 1e-9);
});
t('MIDI：velocity 0 视为 note off', () => {
  const m = Midi.parseMessage(new Uint8Array([0x90, 60, 0]));
  assert.strictEqual(m.type, 'off');
});
t('MIDI：note off 消息', () => {
  const m = Midi.parseMessage(new Uint8Array([0x80, 64, 0]));
  assert.strictEqual(m.type, 'off');
  assert.strictEqual(m.midi, 64);
});
t('MIDI：忽略非音符消息（CC/时钟）', () => {
  assert.strictEqual(Midi.parseMessage(new Uint8Array([0xB0, 7, 100])), null);
  assert.strictEqual(Midi.parseMessage(new Uint8Array([0xF8])), null);
  assert.strictEqual(Midi.parseMessage(null), null);
});
t('MIDI：通道号被屏蔽（0x91 也是 note on）', () => {
  assert.strictEqual(Midi.parseMessage(new Uint8Array([0x91, 72, 80])).type, 'on');
});
t('MIDI：无 Web MIDI 时 supported=false', () => {
  assert.strictEqual(Midi.supported(), false);
});

console.log('\ntest-stats.js: ' + n + ' 项全部通过 ✓');
