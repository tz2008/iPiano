// core.test.js — node 冒烟测试（node js/core.test.js）
'use strict';
const assert = require('assert');
require('./core.js');
require('./courses.js');
require('./songs.js');
require('./pitch.js');
const C = globalThis.MusicCore;
const CD = globalThis.CourseData;
const SD = globalThis.SongData;
const P = globalThis.PitchDetector;

const S = 12, L5 = 40; // 与 staff.js 相同的常量

function y(clef, midi) { return C.staffY(clef, midi, L5, S); }

// 高音谱号：line1=E4=88, line5=F5=40, 下加一线 C4=100, 上加一线 A5=28
assert.strictEqual(y('treble', 64), 88, 'E4 line1');
assert.strictEqual(y('treble', 65), 82, 'F4 space1');
assert.strictEqual(y('treble', 67), 76, 'G4 line2');
assert.strictEqual(y('treble', 71), 64, 'B4 line3');
assert.strictEqual(y('treble', 74), 52, 'D5 line4');
assert.strictEqual(y('treble', 76), 46, 'E5 space4');
assert.strictEqual(y('treble', 77), 40, 'F5 line5');
assert.strictEqual(y('treble', 60), 100, 'C4 下加一线');
assert.strictEqual(y('treble', 81), 28, 'A5 上加一线');
assert.strictEqual(y('treble', 84), 16, 'C6 上加二线');

// 低音谱号：line1=G2=88, line5=A3=40, 下加一线 E2=100, 上加一线 C4=28
assert.strictEqual(y('bass', 43), 88, 'G2 line1');
assert.strictEqual(y('bass', 50), 64, 'D3 line3');
assert.strictEqual(y('bass', 57), 40, 'A3 line5');
assert.strictEqual(y('bass', 40), 100, 'E2 下加一线');
assert.strictEqual(y('bass', 60), 28, 'C4 上加一线');

// 加线
function led(clef, midi) { return C.ledgerLines(clef, midi, L5, S); }
assert.deepStrictEqual(led('treble', 71), { top: [], bottom: [] }, 'B4 无加线');
assert.deepStrictEqual(led('treble', 60), { top: [], bottom: [100] }, 'C4 一条下加线');
assert.deepStrictEqual(led('treble', 62), { top: [], bottom: [100] }, 'D4 一条下加线（间上）');
assert.deepStrictEqual(led('treble', 55), { top: [], bottom: [100, 112] }, 'G3 两条下加线');
assert.deepStrictEqual(led('treble', 81), { top: [28], bottom: [] }, 'A5 一条上加线');
assert.deepStrictEqual(led('treble', 84), { top: [28, 16], bottom: [] }, 'C6 两条上加线');
assert.deepStrictEqual(led('bass', 40), { top: [], bottom: [100] }, 'E2 一条下加线');
assert.deepStrictEqual(led('bass', 60), { top: [28], bottom: [] }, 'C4 一条上加线');

// 自然音过滤与出题范围
assert.deepStrictEqual(C.rangeFor('treble', 'easy'), [60,62,64,65,67,69,71], 'treble easy 7音');
assert.strictEqual(C.rangeFor('treble', 'easy').length, 7, 'treble easy 数量');
assert.strictEqual(C.rangeFor('treble', 'standard').length, 13, 'treble standard 数量');
assert.strictEqual(C.rangeFor('bass', 'easy').length, 9, 'bass easy 数量');
assert.strictEqual(C.rangeFor('bass', 'standard').length, 13, 'bass standard 数量');

// 随机出题
for (let i = 0; i < 200; i++) {
  const q = C.randomNote('random', 'easy');
  assert.ok(C.rangeFor(q.clef, 'easy').includes(q.midi), '出题在范围内');
}
for (let i = 0; i < 200; i++) {
  const q = C.randomNote('treble', 'standard');
  assert.ok(C.rangeFor('treble', 'standard').includes(q.midi), '出题在范围内');
}

// 音名/唱名/频率
assert.strictEqual(C.letterOf(60), 'C');
assert.strictEqual(C.solfegeOf(60), 'Do');
assert.strictEqual(C.solfegeOf(62), 'Re');
assert.strictEqual(C.letterOf(67), 'G');
assert.strictEqual(C.solfegeOf(67), 'Sol');
assert.strictEqual(C.letterOf(61), null, '黑键无自然音名');
assert.strictEqual(C.midiToDia(61), null, '黑键 dia null');
assert.ok(Math.abs(C.freq(69) - 440) < 1e-9, 'A4=440');
assert.ok(Math.abs(C.freq(60) - 261.625565) < 1e-3, 'C4 频率');
assert.strictEqual(C.label(60, 'solfege'), 'Do');
assert.strictEqual(C.label(60, 'letter'), 'C');

// 符干方向
assert.strictEqual(C.stemUp('treble', 71), true, 'B4 第三线符干向上');
assert.strictEqual(C.stemUp('treble', 72), false, 'C5 第三线以上向下');
assert.strictEqual(C.stemUp('bass', 50), true, 'D3 第三线符干向上');
assert.strictEqual(C.stemUp('bass', 52), false, 'E3 第三线以上向下');

// ---------- 反向映射 ----------
assert.strictEqual(C.diaToMidi(30), 64, 'dia 30(E4) -> midi 64');
assert.strictEqual(C.diaToMidi(28), 60, 'dia 28(C4) -> midi 60');
assert.strictEqual(C.diaToMidi(18), 43, 'dia 18(G2) -> midi 43');
assert.strictEqual(C.yToMidi('treble', 88, L5, S), 64, 'line1 y -> E4');
assert.strictEqual(C.yToMidi('treble', 100, L5, S), 60, '下加一线 y -> C4');
assert.strictEqual(C.yToMidi('treble', 40, L5, S), 77, 'line5 y -> F5');
assert.strictEqual(C.yToMidi('bass', 88, L5, S), 43, '低音 line1 -> G2');
assert.strictEqual(C.yToMidi('bass', 28, L5, S), 60, '低音上加一线 -> C4');
[60, 64, 67, 71, 74, 77, 81, 84, 40, 43, 50, 57].forEach(m => {
  const yy = C.staffY('treble', m, L5, S);
  assert.strictEqual(C.yToMidi('treble', yy, L5, S), m, 'staffY/yToMidi 互逆 ' + m);
});
[40, 43, 48, 50, 52, 57, 60].forEach(m => {
  const yy = C.staffY('bass', m, L5, S);
  assert.strictEqual(C.yToMidi('bass', yy, L5, S), m, 'bass 互逆 ' + m);
});

// ---------- 88 键 ----------
assert.strictEqual(C.rangeFor('treble', 'full').length, 88, 'full 88 键');
assert.strictEqual(C.rangeFor('bass', 'full').length, 88, 'bass full 88 键');
assert.strictEqual(C.rangeFor('treble', 'full')[0], 21, 'A0 起始');
assert.strictEqual(C.rangeFor('treble', 'full')[87], 108, 'C8 结束');
assert.deepStrictEqual(C.SEMI_INDEX, [0, 7, 1, 8, 2, 3, 9, 4, 10, 5, 11, 6], '12 半音答案索引');
assert.strictEqual(C.SEMI_INDEX[61 % 12], 7, 'C#4 索引 7');
assert.strictEqual(C.SEMI_INDEX[70 % 12], 11, 'A#4 索引 11');
assert.strictEqual(C.LETTER_12[7], 'C#');
assert.strictEqual(C.SOLFEGE_12[7], '升Do');
assert.strictEqual(C.clefForMidi(60), 'treble', 'C4 起高音谱号');
assert.strictEqual(C.clefForMidi(59), 'bass', 'B3 及以下低音谱号');
for (let i = 0; i < 300; i++) {
  const q = C.randomNote('random', 'full');
  assert.ok(q.midi >= 21 && q.midi <= 108, 'full 出题在 88 键内');
  assert.strictEqual(q.clef, C.clefForMidi(q.midi), 'full 谱号按音区自动');
}
// 加线上限放开（钢琴极端音高）
assert.strictEqual(led('treble', 108).top.length, 9, 'C8 高音谱号 9 条上加线');
assert.strictEqual(led('bass', 21).bottom.length, 6, 'A0 低音谱号 6 条下加线');
assert.strictEqual(led('treble', 60).bottom.length, 1, 'C4 仍 1 条下加线');

// ---------- 课程数据 ----------
assert.strictEqual(CD.COURSES.length, 37, '共 37 课（三本教材）');
assert.strictEqual(CD.LINES.length, 3, '3 条教材线路');
var LINE_IDS = {};
CD.LINES.forEach(function (l) {
  assert.ok(['baier', 'jichu', 'hanon'].indexOf(l.id) !== -1, '线路 id 合法');
  assert.ok(l.courses.length >= 8, '线路 ' + l.id + ' 课程数 >= 8');
  LINE_IDS[l.id] = true;
});
// 每课属于某条线路、id 格式 "{line}-NN" 全局唯一
var seen = {};
var ID_RE = /^(baier|jichu|hanon)-(\d{2})$/;
CD.COURSES.forEach(function (c, i) {
  var m = ID_RE.exec(c.id);
  assert.ok(m, '课 id 格式合法（如 baier-01），实际: ' + c.id);
  assert.strictEqual(m[1], c.line, '课 ' + c.id + ' id 前缀与 line 一致');
  assert.ok(!seen[c.id], 'id 唯一');
  seen[c.id] = true;
  assert.ok(LINE_IDS[c.line], '课 ' + c.id + ' line 合法');
  assert.ok(c.book && c.title && c.icon, '课 ' + c.id + ' 基本信息齐全');
  assert.ok(c.points.length >= 1, '课 ' + c.id + ' 有知识点');
  assert.ok(c.practice && c.practice.target >= 3, '课 ' + c.id + ' 有练习配置');
  assert.ok(['treble', 'bass', 'random'].indexOf(c.practice.clef) !== -1, '课 ' + c.id + ' clef 合法');
  assert.ok(['easy', 'standard', 'full'].indexOf(c.practice.difficulty) !== -1, '课 ' + c.id + ' 难度合法');
  assert.ok(['name', 'keyboard', 'listen', 'place'].indexOf(c.practice.mode) !== -1, '课 ' + c.id + ' 模式合法');
});
// 线路内课程 id 递增（按数字后缀比较，不是字典序）
CD.LINES.forEach(function (l) {
  for (var i = 1; i < l.courses.length; i++) {
    var prevN = parseInt(l.courses[i - 1].id.split('-')[1], 10);
    var currN = parseInt(l.courses[i].id.split('-')[1], 10);
    assert.ok(currN === prevN + 1, '线路 ' + l.id + ' 内 id 连续递增：' + l.courses[i - 1].id + ' → ' + l.courses[i].id);
  }
});

// ---------- 曲谱库数据 ----------
assert.ok(SD.SONGS.length >= 10, '至少 10 首公版曲目');
SD.SONGS.forEach(function (s) {
  assert.ok(s.title && s.notes.length >= 8, '曲目 ' + s.id + ' 有标题和旋律');
  s.notes.forEach(function (n) {
    assert.ok(n[0] >= 21 && n[0] <= 108, '曲目 ' + s.id + ' midi 合法');
    assert.ok(n[1] > 0, '曲目 ' + s.id + ' 时值合法');
  });
});
function songOf(id) { var r = null; SD.SONGS.forEach(function (s) { if (s.id === id) r = s; }); return r; }
assert.ok(SD.songHasSharp(songOf(8)), '卡农含黑键');
assert.ok(!SD.songHasSharp(songOf(1)), '小星星无黑键');
assert.strictEqual(songOf(1).notes[0][0], 60, '小星星从 C4 开始');
// 左手 bass 声部
assert.ok(Array.isArray(songOf(1).bass) && songOf(1).bass.length === 12, '小星星左手 12 音');
assert.ok(Array.isArray(songOf(2).bass) && songOf(2).bass.length === 8, '欢乐颂左手 8 音');
assert.ok(Array.isArray(songOf(5).bass) && songOf(5).bass.length === 9, '两只老虎左手 9 音');
songOf(1).bass.forEach(function (n) {
  assert.ok(n[0] >= 40 && n[0] <= 55, '左手低音区 midi 合法');
  assert.ok(n[1] === 4, '左手每音 4 拍');
});

// ---------- 音高检测纯函数 ----------
assert.ok(Math.abs(P.freqToMidi(440) - 69) < 1e-9, 'A4=69');
assert.ok(Math.abs(P.freqToMidi(261.625565) - 60) < 0.01, 'C4 频率->midi');
assert.ok(Math.abs(P.midiToFreq(69) - 440) < 1e-9, 'midi 69 -> 440Hz');
function approx(a, b) { return Math.abs(a - b) < 1e-9; }
assert.ok(approx(P.pitchDiffHalf(60.3, 60), 0.3), '偏高 0.3 半音');
assert.ok(approx(P.pitchDiffHalf(59.5, 60), -0.5), '偏低 0.5 半音');
assert.ok(approx(P.pitchDiffHalf(72, 60), 0), '跨八度同音名归一为 0');
assert.ok(approx(Math.abs(P.pitchDiffHalf(66, 60)), 6), '三全音为 ±6');
assert.ok(P.isPitchOk(60.4, 60), '小偏差算对');
assert.ok(!P.isPitchOk(61.0, 60), '差整半音算错');
assert.ok(P.isPitchOk(72, 60), '跨八度同音名算对');
assert.ok(P.isPitchOk(48, 60), '低八度同音名算对');
assert.ok(!P.isPitchOk(null, 60), '无信号不算对');
// 自相关：合成 440Hz 正弦波应检出 440
(function () {
  const sr = 44100, n = 2048;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.sin(2 * Math.PI * 440 * i / sr);
  const f = P.autoCorrelate(buf, sr);
  assert.ok(f > 430 && f < 450, '自相关检出 440Hz，实际 ' + f);
})();
// detectDuo：低音（C3≈130.8Hz）用低频自相关、高音（E5≈659Hz）用频谱峰
(function () {
  const sr = 44100, n = 2048, fftSize = 2048;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.sin(2 * Math.PI * 130.81 * i / sr) * 0.8 + Math.sin(2 * Math.PI * 659.25 * i / sr) * 0.8;
  }
  const binHz = sr / fftSize;
  const fd = new Float32Array(fftSize / 2).fill(-100);
  const peakBin = Math.round(659.25 / binHz);
  fd[peakBin] = 0; fd[peakBin - 1] = -6; fd[peakBin + 1] = -6;
  const duo = P.detectDuo(buf, sr, fftSize, fd);
  assert.ok(duo.low && Math.abs(duo.low.freq - 130.81) < 3, '低音检出 ≈130.8Hz，实际 ' + (duo.low ? duo.low.freq : 'null'));
  assert.ok(duo.high && Math.abs(duo.high.freq - 659.25) < 25, '高音检出 ≈659Hz，实际 ' + (duo.high ? duo.high.freq : 'null'));
  assert.ok(duo.low && Math.abs(duo.low.midi - 48) < 0.5, '低音 midi ≈ C3(48)，实际 ' + (duo.low ? duo.low.midi : 'null'));
  assert.ok(duo.high && Math.abs(duo.high.midi - 76) < 1, '高音 midi ≈ E5(76)，实际 ' + (duo.high ? duo.high.midi : 'null'));
})();

console.log('core.test.js: 全部通过 ✓');
