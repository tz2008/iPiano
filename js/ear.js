/* ear.js — 视唱练耳（纯逻辑，无 DOM，可 Node 单测）
 *
 * 三种题型：
 *   interval  音程听辨：同时弹两个音，判断是几度
 *   chord     和弦听辨：同时弹三个音，判断大三/小三/减三/增三
 *   melody    旋律模唱：依次弹 3–5 个音，判断音高走向（上行/下行/波浪）
 *
 * 出题避开极端音区，保证儿童用普通音箱也能听清。
 */
(function (global) {
  'use strict';

  /** 音程：以「大/纯」为主，适合入门 */
  var INTERVALS = [
    { id: 'M2', semitones: 2, name: '大二度', short: '二度' },
    { id: 'M3', semitones: 4, name: '大三度', short: '三度' },
    { id: 'P4', semitones: 5, name: '纯四度', short: '四度' },
    { id: 'P5', semitones: 7, name: '纯五度', short: '五度' },
    { id: 'M6', semitones: 9, name: '大六度', short: '六度' },
    { id: 'P8', semitones: 12, name: '纯八度', short: '八度' }
  ];

  /** 和弦 */
  var CHORDS = [
    { id: 'maj', name: '大三和弦', semitones: [0, 4, 7], hint: '明亮' },
    { id: 'min', name: '小三和弦', semitones: [0, 3, 7], hint: '柔和' },
    { id: 'dim', name: '减三和弦', semitones: [0, 3, 6], hint: '紧张' },
    { id: 'aug', name: '增三和弦', semitones: [0, 4, 8], hint: '漂浮' }
  ];

  /** 难度：不同难度给的选项不同 */
  var LEVELS = {
    1: { mode: 'interval', name: '音程 · 入门', pool: ['M2', 'M3', 'P4', 'P5', 'P8'] },
    2: { mode: 'interval', name: '音程 · 进阶', pool: ['M2', 'M3', 'P4', 'P5', 'M6', 'P8'] },
    3: { mode: 'chord', name: '和弦 · 大小三', pool: ['maj', 'min'] },
    4: { mode: 'chord', name: '和弦 · 四种', pool: ['maj', 'min', 'dim', 'aug'] },
    5: { mode: 'melody', name: '旋律走向', pool: ['up', 'down', 'wave'] }
  };

  var MELODY_NAMES = { up: '上行', down: '下行', wave: '波浪' };

  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  /** 根音范围：C4–C5，保证音程与和弦都不超出听辨舒适区 */
  var ROOT_LO = 60, ROOT_HI = 72;

  /**
   * 出一题。
   * @param opts { level, rnd }  rnd 可注入，便于测试复现
   */
  function question(opts) {
    opts = opts || {};
    var level = LEVELS[opts.level] || LEVELS[1];
    var rnd = opts.rnd || Math.random;

    if (level.mode === 'melody') {
      var kind = pick(level.pool, rnd);
      var notes = buildMelody(kind, rnd);
      return {
        mode: 'melody',
        notes: notes,
        answer: level.pool.indexOf(kind),
        options: level.pool.map(function (k) { return MELODY_NAMES[k]; }),
        label: MELODY_NAMES[kind],
        intervalMs: 420
      };
    }

    var root = ROOT_LO + Math.floor(rnd() * (ROOT_HI - ROOT_LO + 1));

    if (level.mode === 'chord') {
      var chord = pick(level.pool.map(function (id) {
        for (var i = 0; i < CHORDS.length; i++) if (CHORDS[i].id === id) return CHORDS[i];
        return CHORDS[0];
      }), rnd);
      // 保证最高音不超出舒适区
      if (root + chord.semitones[chord.semitones.length - 1] > 84) root -= 12;
      var notesC = chord.semitones.map(function (s) { return root + s; });
      var optionsC = level.pool.map(function (id) {
        for (var i = 0; i < CHORDS.length; i++) if (CHORDS[i].id === id) return CHORDS[i].name;
        return id;
      });
      return {
        mode: 'chord',
        notes: notesC,
        answer: level.pool.indexOf(chord.id),
        options: optionsC,
        label: chord.name,
        hint: chord.hint
      };
    }

    // 音程
    var iv = null;
    var pool = level.pool;
    var ivId = pick(pool, rnd);
    for (var i = 0; i < INTERVALS.length; i++) if (INTERVALS[i].id === ivId) iv = INTERVALS[i];
    if (!iv) iv = INTERVALS[0];
    if (root + iv.semitones > 84) root -= 12;
    return {
      mode: 'interval',
      notes: [root, root + iv.semitones],
      answer: pool.indexOf(iv.id),
      options: pool.map(function (id) {
        for (var i = 0; i < INTERVALS.length; i++) if (INTERVALS[i].id === id) return INTERVALS[i].short;
        return id;
      }),
      label: iv.name
    };
  }

  /** 旋律：3–5 个音，按走向生成 */
  function buildMelody(kind, rnd) {
    var len = 3 + Math.floor(rnd() * 3);   // 3–5 个音
    var start = ROOT_LO + Math.floor(rnd() * 8);
    var notes = [start];
    var dir = kind === 'down' ? -1 : 1;
    for (var i = 1; i < len; i++) {
      var step = (1 + Math.floor(rnd() * 2)) * (kind === 'wave' ? (i % 2 === 0 ? 1 : -1) : dir);
      var next = notes[i - 1] + step * 2;   // 自然音级：2 个半音一步（近似大调音阶）
      if (next < 57) next += 4;
      if (next > 84) next -= 4;
      notes.push(next);
    }
    return notes;
  }

  /** 判分 */
  function check(q, chosen) { return !!q && chosen === q.answer; }

  /** 一次练习的统计 */
  function summarize(results) {
    var total = results.length;
    var correct = results.filter(Boolean).length;
    return {
      total: total,
      correct: correct,
      accuracy: total ? Math.round(correct / total * 100) : 0
    };
  }

  global.MusicEar = {
    INTERVALS: INTERVALS,
    CHORDS: CHORDS,
    LEVELS: LEVELS,
    question: question,
    check: check,
    summarize: summarize
  };
})(typeof window !== 'undefined' ? window : globalThis);
