// test-ear.js — 视唱练耳单元测试
// 运行：node js/test-ear.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'ear.js'));
const E = globalThis.MusicEar;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

/** 可复现的随机数 */
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/* ---------- 音程 ---------- */
t('入门音程：5 个选项，答案在范围内', () => {
  const rnd = seeded(42);
  for (let i = 0; i < 50; i++) {
    const q = E.question({ level: 1, rnd });
    assert.strictEqual(q.mode, 'interval');
    assert.strictEqual(q.options.length, 5);
    assert.ok(q.answer >= 0 && q.answer < 5);
    assert.strictEqual(q.notes.length, 2, '两个音');
  }
});
t('音程的跨度与答案一致', () => {
  const rnd = seeded(7);
  for (let i = 0; i < 50; i++) {
    const q = E.question({ level: 2, rnd });
    const semis = q.notes[1] - q.notes[0];
    const iv = E.INTERVALS.find(x => x.short === q.options[q.answer]);
    assert.strictEqual(semis, iv.semitones, '实际跨度 ' + semis + ' 应为 ' + iv.semitones);
  }
});
t('音程音高在舒适区内', () => {
  const rnd = seeded(99);
  for (let i = 0; i < 80; i++) {
    const q = E.question({ level: 2, rnd });
    q.notes.forEach(m => assert.ok(m >= 48 && m <= 84, '音高越界: ' + m));
  }
});
t('进阶音程包含六度', () => {
  const rnd = seeded(3);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(E.question({ level: 2, rnd }).label);
  assert.ok(seen.has('大六度'), '实际：' + [...seen].join(','));
});

/* ---------- 和弦 ---------- */
t('大小三和弦：2 个选项', () => {
  const rnd = seeded(11);
  for (let i = 0; i < 40; i++) {
    const q = E.question({ level: 3, rnd });
    assert.strictEqual(q.mode, 'chord');
    assert.strictEqual(q.options.length, 2);
    assert.strictEqual(q.notes.length, 3, '三个音');
  }
});
t('和弦音程结构与答案一致', () => {
  const rnd = seeded(21);
  for (let i = 0; i < 60; i++) {
    const q = E.question({ level: 4, rnd });
    const root = q.notes[0];
    const rel = q.notes.map(m => m - root);
    const chord = E.CHORDS.find(c => c.name === q.options[q.answer]);
    assert.deepStrictEqual(rel, chord.semitones, '实际 ' + rel.join(',') + ' 应为 ' + chord.semitones.join(','));
  }
});
t('四种和弦都能出现', () => {
  const rnd = seeded(5);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(E.question({ level: 4, rnd }).label);
  assert.strictEqual(seen.size, 4, '实际：' + [...seen].join(','));
});
t('和弦最高音不越界', () => {
  const rnd = seeded(13);
  for (let i = 0; i < 80; i++) {
    const q = E.question({ level: 4, rnd });
    q.notes.forEach(m => assert.ok(m >= 48 && m <= 84, '越界: ' + m));
  }
});

/* ---------- 旋律 ---------- */
t('旋律题：3–5 个音，3 个选项', () => {
  const rnd = seeded(17);
  for (let i = 0; i < 40; i++) {
    const q = E.question({ level: 5, rnd });
    assert.strictEqual(q.mode, 'melody');
    assert.ok(q.notes.length >= 3 && q.notes.length <= 5, '实际 ' + q.notes.length);
    assert.strictEqual(q.options.length, 3);
    assert.ok(q.intervalMs > 0);
  }
});
t('上行旋律整体向上', () => {
  const rnd = seeded(23);
  for (let i = 0; i < 40; i++) {
    const q = E.question({ level: 5, rnd });
    if (q.label !== '上行') continue;
    assert.ok(q.notes[q.notes.length - 1] > q.notes[0], '上行应结束更高');
  }
});
t('下行旋律整体向下', () => {
  const rnd = seeded(29);
  for (let i = 0; i < 40; i++) {
    const q = E.question({ level: 5, rnd });
    if (q.label !== '下行') continue;
    assert.ok(q.notes[q.notes.length - 1] < q.notes[0], '下行应结束更低');
  }
});
t('旋律音高在合理范围', () => {
  const rnd = seeded(31);
  for (let i = 0; i < 80; i++) {
    E.question({ level: 5, rnd }).notes.forEach(m => assert.ok(m >= 48 && m <= 88, '越界: ' + m));
  }
});

/* ---------- 判分 ---------- */
t('判分正确', () => {
  const q = E.question({ level: 1, rnd: seeded(1) });
  assert.ok(E.check(q, q.answer));
  assert.ok(!E.check(q, (q.answer + 1) % q.options.length));
});
t('空题目安全', () => {
  assert.ok(!E.check(null, 0));
});
t('统计', () => {
  const s = E.summarize([true, true, false, true]);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.correct, 3);
  assert.strictEqual(s.accuracy, 75);
  assert.strictEqual(E.summarize([]).accuracy, 0);
});

/* ---------- 选项文案 ---------- */
t('选项不重复', () => {
  for (let lv = 1; lv <= 5; lv++) {
    const q = E.question({ level: lv, rnd: seeded(100 + lv) });
    assert.strictEqual(new Set(q.options).size, q.options.length, '第 ' + lv + ' 级选项重复');
  }
});
t('未知难度回退到入门', () => {
  const q = E.question({ level: 99, rnd: seeded(2) });
  assert.strictEqual(q.mode, 'interval');
});

console.log('\ntest-ear.js: ' + n + ' 项全部通过 ✓');
