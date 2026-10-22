/* core.js — 纯逻辑模块（无 DOM 依赖，可被 node 单测）
 * 音高映射、五线谱坐标、题目生成、音名/唱名转换、频率计算
 */
(function (global) {
  'use strict';

  // midi % 12 -> 自然音字母序号 (C D E F G A B = 0..6)；黑键无映射
  var LETTER_INDEX = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

  /* 88 键（含黑键）命名——按按钮顺序：0..6 白键，7..11 黑键（与 SEMI_INDEX 对应） */
  var LETTER_12 = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'D#', 'F#', 'G#', 'A#'];
  var SOLFEGE_12 = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', '升Do', '升Re', '升Fa', '升Sol', '升La'];
  /* midi % 12 -> 12 按钮索引（0..6 白键，7..11 黑键） */
  var SEMI_INDEX = [0, 7, 1, 8, 2, 3, 9, 4, 10, 5, 11, 6];

  /** midi -> 自然音 diatonic 数（C0=0，每八度 +7）；黑键返回 null
   *  注意 midi 60 = C4 → floor(60/12)-1 = 4 个八度
   */
  function midiToDia(midi) {
    var idx = LETTER_INDEX[midi % 12];
    if (idx === undefined) return null;
    return (Math.floor(midi / 12) - 1) * 7 + idx;
  }

  /** midi -> 音名 C/D/E/F/G/A/B；黑键返回 null */
  function letterOf(midi) {
    var d = midiToDia(midi);
    if (d === null) return null;
    return LETTERS[((d % 7) + 7) % 7];
  }

  /** midi -> 唱名 Do/Re/Mi/Fa/Sol/La/Si；黑键返回 null */
  function solfegeOf(midi) {
    var d = midiToDia(midi);
    if (d === null) return null;
    return SOLFEGE[((d % 7) + 7) % 7];
  }

  /** midi -> 频率 (A4 = 440Hz) */
  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /** 自然音 diatonic 数 -> midi（与 midiToDia 互逆；d 必须是自然音序号） */
  function diaToMidi(d) {
    var oct = Math.floor(d / 7);
    var letter = ((d % 7) + 7) % 7;
    var semitone = [0, 2, 4, 5, 7, 9, 11][letter];
    return (oct + 1) * 12 + semitone;
  }

  /** 谱面 y 坐标 -> 最近的自然音 midi（与 staffY 互逆，用于点击放置音符） */
  function yToMidi(clef, y, line5Y, spacing) {
    var line1Y = line5Y + 4 * spacing;
    var dia = CLEFS[clef].baseDia - (y - line1Y) / (spacing / 2);
    return diaToMidi(Math.round(dia));
  }

  /* 谱号定义
   * baseDia: 第一线(line1)对应音高的 diatonic 数
   *   treble 第一线 = E4 (dia 30)
   *   bass   第一线 = G2 (dia 18)
   * clefChar: Unicode 谱号字符（Segoe UI Symbol 自带）
   */
  var CLEFS = {
    treble: { name: '高音谱号', baseDia: 30, clefChar: '\uD834\uDD1E' }, // 𝄞
    bass: { name: '低音谱号', baseDia: 18, clefChar: '\uD834\uDD22' }    // 𝄢
  };

  /* 出题音域（midi 范围，含端点）
   * easy:     treble 7 个音（下加一线 C4 ~ 第三线 B4）
   *           bass  9 个音（第一线 G2 ~ 第五线 A3，全在谱表内）
   * standard: 13 个音，含上下各一条加线
   * full:     钢琴 88 键全音域（A0 ~ C8，含黑键），谱号按音区自动选择
   */
  var RANGES = {
    treble: { easy: [60, 71], standard: [60, 81], full: [21, 108] },
    bass: { easy: [43, 57], standard: [40, 60], full: [21, 108] }
  };
  var FULL_LO = 21, FULL_HI = 108; // 钢琴 88 键 A0 ~ C8
  /** midi >= 60 (C4) 用高音谱号，否则低音谱号 */
  function clefForMidi(midi) { return midi >= 60 ? 'treble' : 'bass'; }

  /** 区间内所有自然音 midi 列表 */
  function naturalsIn(lo, hi) {
    var out = [];
    for (var m = lo; m <= hi; m++) {
      if (midiToDia(m) !== null) out.push(m);
    }
    return out;
  }

  var NATURALS_CACHE = {};
  function rangeFor(clef, difficulty) {
    var key = clef + '/' + difficulty;
    if (!NATURALS_CACHE[key]) {
      var r = RANGES[clef][difficulty];
      if (difficulty === 'full') {
        // 88 键全音域：白键黑键都出题
        var all = [];
        for (var m = r[0]; m <= r[1]; m++) all.push(m);
        NATURALS_CACHE[key] = all;
      } else {
        NATURALS_CACHE[key] = naturalsIn(r[0], r[1]);
      }
    }
    return NATURALS_CACHE[key];
  }

  /** 随机出题（clef 可为 'random'；full 难度时谱号按音区自动选择） */
  function randomNote(clef, difficulty) {
    if (difficulty === 'full') {
      var m = FULL_LO + Math.floor(Math.random() * (FULL_HI - FULL_LO + 1));
      return { midi: m, clef: clefForMidi(m) };
    }
    var c = clef;
    if (c === 'random') c = Math.random() < 0.5 ? 'treble' : 'bass';
    var pool = rangeFor(c, difficulty);
    var midi = pool[Math.floor(Math.random() * pool.length)];
    return { midi: midi, clef: c };
  }

  /** 音符在五线谱上的 y 坐标（SVG 局部坐标系，y 向下增大）
   * @param line5Y 最上面一条线(line5)的 y
   * @param spacing 相邻两线间距
   */
  function staffY(clef, midi, line5Y, spacing) {
    var dia = midiToDia(midi);
    if (dia === null) return null;
    var line1Y = line5Y + 4 * spacing; // line1 在最下方
    return line1Y + (CLEFS[clef].baseDia - dia) * (spacing / 2);
  }

  /** 需要绘制的加线（超出五线时）。
   * 规则（engraving 惯例）：加线数 N = max(1, floor(dist/spacing))，
   * dist = 音符中心到最近谱线(line1/line5)的距离；恰在线上 dist=1 间距 → 1 条。
   * 返回 { top: [y...], bottom: [y...] }，y 为加线中线坐标。
   */
  function ledgerLines(clef, midi, line5Y, spacing) {
    var y = staffY(clef, midi, line5Y, spacing);
    if (y === null) return { top: [], bottom: [] };
    var line1Y = line5Y + 4 * spacing;
    var top = [], bottom = [];
    if (y < line5Y) { // 谱上方
      var n = Math.max(1, Math.floor((line5Y - y) / spacing));
      n = Math.min(n, 12);
      for (var k = 1; k <= n; k++) top.push(line5Y - k * spacing);
    } else if (y > line1Y) { // 谱下方
      var n2 = Math.max(1, Math.floor((y - line1Y) / spacing));
      n2 = Math.min(n2, 12);
      for (var k2 = 1; k2 <= n2; k2++) bottom.push(line1Y + k2 * spacing);
    }
    return { top: top, bottom: bottom };
  }

  /** 符干方向：第三线及以下向上，以上向下 */
  function stemUp(clef, midi) {
    var dia = midiToDia(midi);
    if (dia === null) return true;
    return dia <= CLEFS[clef].baseDia + 4;
  }

  /** 展示名：唱名或音名 */
  function label(midi, naming) {
    return naming === 'letter' ? letterOf(midi) : solfegeOf(midi);
  }

  /** 键盘显示范围 */
  var KEYBOARD_RANGE = {
    treble: [60, 84], // C4..C6（白键到 B5）
    bass: [40, 60],   // E2..C4
    full: [21, 108]   // 钢琴 88 键 A0..C8
  };

  global.MusicCore = {
    LETTERS: LETTERS,
    SOLFEGE: SOLFEGE,
    LETTER_12: LETTER_12,
    SOLFEGE_12: SOLFEGE_12,
    SEMI_INDEX: SEMI_INDEX,
    FULL_LO: FULL_LO,
    FULL_HI: FULL_HI,
    clefForMidi: clefForMidi,
    midiToDia: midiToDia,
    diaToMidi: diaToMidi,
    yToMidi: yToMidi,
    letterOf: letterOf,
    solfegeOf: solfegeOf,
    freq: freq,
    CLEFS: CLEFS,
    RANGES: RANGES,
    naturalsIn: naturalsIn,
    rangeFor: rangeFor,
    randomNote: randomNote,
    staffY: staffY,
    ledgerLines: ledgerLines,
    stemUp: stemUp,
    label: label,
    KEYBOARD_RANGE: KEYBOARD_RANGE
  };
})(typeof window !== 'undefined' ? window : globalThis);
