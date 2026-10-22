/* challenge.js — 每日挑战（纯逻辑，无 DOM，可 Node 单测）
 *
 * 每天一组固定题（同一档案当天题目相同，刷新不换题），限时完成，全对得限定徽章。
 *
 * 题目来源：从识谱练习的出题范围里按难度抽，外加乐理题。
 * 这里只负责「生成题目 / 判分 / 徽章解锁条件」，UI 在 app.js。
 */
(function (global) {
  'use strict';

  var TOTAL = 8;          // 每天题数
  var SECONDS = 60;       // 限时（秒）
  var PERFECT_DAYS = 3;   // 累计全对天数 → 限定徽章

  /** 可复现的伪随机（同一 seed 生成同一套题） */
  function seeded(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /** 由日期 + 档案 ID 生成种子：同一天同一档案题目固定 */
  function seedFor(dateKey, profileId) {
    var str = String(dateKey) + '|' + String(profileId || '');
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 16777619) : (h * 16777619) | 0;
    }
    return Math.abs(h) || 1;
  }

  /** 由 midi 得到按钮索引（与练习页一致：白键 0–6，黑键 7–11） */
  function answerIndex(midi, full) {
    var Core = global.MusicCore;
    if (full) return Core.SEMI_INDEX[((midi % 12) + 12) % 12];
    var dia = Core.midiToDia(midi);
    return ((dia % 7) + 7) % 7;
  }

  /**
   * 生成当天的挑战。
   * @param opts { dateKey, profileId, difficulty, naming }
   * @returns { id, dateKey, total, seconds, questions: [{ type, midi?, clef, options, answer, label }] }
   */
  function build(opts) {
    opts = opts || {};
    var Core = global.MusicCore;
    var dateKey = opts.dateKey || '1970-01-01';
    var difficulty = opts.difficulty || 'standard';
    var rnd = seeded(seedFor(dateKey, opts.profileId));
    var Sight = global.MusicSight;

    var questions = [];
    var pool = Core.rangeFor('treble', difficulty).concat(Core.rangeFor('bass', difficulty));
    // 去重后作为音符池
    var seen = {}, pool2 = [];
    pool.forEach(function (m) { if (!seen[m]) { seen[m] = 1; pool2.push(m); } });
    if (!pool2.length) pool2 = [60];

    var full = difficulty === 'full';
    var names = full
      ? (opts.naming === 'letter' ? Core.LETTER_12 : Core.SOLFEGE_12)
      : (opts.naming === 'letter' ? Core.LETTERS : Core.SOLFEGE);

    var notesCount = TOTAL - 2;   // 留 2 题给乐理
    for (var i = 0; i < notesCount; i++) {
      var midi = pool2[Math.floor(rnd() * pool2.length)];
      questions.push({
        type: 'note',
        midi: midi,
        clef: Core.clefForMidi(midi),
        answer: answerIndex(midi, full),
        optionCount: full ? 12 : 7,
        names: names
      });
    }

    // 乐理题：用固定题库按 seed 抽，保证当天固定
    if (Sight && Sight.THEORY && Sight.THEORY.length) {
      var idx = Math.floor(rnd() * Sight.THEORY.length);
      for (var k = 0; k < 2; k++) {
        var t = Sight.THEORY[(idx + k * 7) % Sight.THEORY.length];
        questions.push({
          type: 'theory',
          q: t.q,
          options: t.options.slice(),
          answer: t.answer,
          explain: t.explain,
          cat: t.cat
        });
      }
    }

    return {
      id: dateKey,
      dateKey: dateKey,
      total: questions.length,
      seconds: SECONDS,
      questions: questions
    };
  }

  /** 判分 */
  function score(challenge, answers) {
    var correct = 0;
    challenge.questions.forEach(function (q, i) {
      if (answers[i] === q.answer) correct++;
    });
    var total = challenge.questions.length;
    return {
      correct: correct,
      total: total,
      perfect: correct === total,
      rate: total ? Math.round(correct / total * 100) : 0
    };
  }

  /** 今天的日期键 */
  function todayKey(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /**
   * 挑战状态：{ lastDate, attempts, best, perfectDays, history: { date: {score,total} } }
   * 返回更新后的状态（就地修改）
   */
  function record(state, dateKey, result) {
    state = state || {};
    if (!state.history) state.history = {};
    state.lastDate = dateKey;
    state.attempts = (Number(state.attempts) || 0) + 1;
    state.best = Math.max(Number(state.best) || 0, result.correct);
    if (result.perfect && !state.history[dateKey]) {
      state.perfectDays = (Number(state.perfectDays) || 0) + 1;
    }
    state.history[dateKey] = {
      correct: result.correct,
      total: result.total,
      perfect: !!result.perfect
    };
    // 只保留最近 60 天
    var keys = Object.keys(state.history).sort();
    while (keys.length > 60) delete state.history[keys.shift()];
    return state;
  }

  /** 今天是否已完成（拿到满分即视为完成） */
  function isDoneToday(state, dateKey) {
    return !!(state && state.history && state.history[dateKey] && state.history[dateKey].perfect);
  }

  /** 限定徽章是否解锁 */
  function perfectBadgeUnlocked(state) {
    return (Number(state && state.perfectDays) || 0) >= PERFECT_DAYS;
  }

  /** 下一次挑战倒计时（毫秒） */
  function msUntilTomorrow(now) {
    var d = now || new Date();
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return next - d;
  }

  global.MusicChallenge = {
    TOTAL: TOTAL,
    SECONDS: SECONDS,
    PERFECT_DAYS: PERFECT_DAYS,
    seedFor: seedFor,
    build: build,
    score: score,
    todayKey: todayKey,
    record: record,
    isDoneToday: isDoneToday,
    perfectBadgeUnlocked: perfectBadgeUnlocked,
    msUntilTomorrow: msUntilTomorrow
  };
})(typeof window !== 'undefined' ? window : globalThis);
