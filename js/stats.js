/* stats.js — 错题本 + 练习历史（纯逻辑，无 DOM，可 Node 单测）
 *
 * 错题本：记录每个音名/具体音高答错的次数，用于生成专项练习。
 * 练习历史：按天记录题数、正确率、时长，供趋势图使用。
 *
 * 两者都只存“聚合数据”，不会无限增长：
 *  - 错题本按音级聚合（最多 12 个键）
 *  - 历史只保留最近 30 天
 */
(function (global) {
  'use strict';

  var HISTORY_DAYS = 30;

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ---------- 错题本 ---------- */

  /**
   * 记录一次错题。
   * @param book   { [pitchClass]: { wrong, total, last } }，就地修改
   * @param midi   题目音高（黑键会折叠到音级）
   * @param clef   'treble' | 'bass'（用于生成练习时区分音区）
   */
  function recordMistake(book, midi, clef) {
    if (!book || midi == null) return book;
    var pc = ((midi % 12) + 12) % 12;
    var e = book[pc] || (book[pc] = { wrong: 0, total: 0, last: 0, clef: clef || 'treble' });
    e.wrong++;
    e.total++;
    e.last = Date.now();
    e.clef = clef || e.clef || 'treble';
    return book;
  }

  /** 记录一次答对（用于计算错误率） */
  function recordCorrect(book, midi) {
    if (!book || midi == null) return book;
    var pc = ((midi % 12) + 12) % 12;
    var e = book[pc];
    if (e) e.total++;
    return book;
  }

  /**
   * 最需要练的音（按错误次数排序）。
   * @returns [{ pitchClass, wrong, total, rate }]
   */
  function weakSpots(book, limit) {
    var out = [];
    for (var pc in book) {
      var e = book[pc];
      if (!e || !e.wrong) continue;
      out.push({
        pitchClass: Number(pc), wrong: e.wrong, total: e.total,
        rate: e.total ? e.wrong / e.total : 1,
        clef: e.clef
      });
    }
    out.sort(function (a, b) {
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      return b.rate - a.rate;
    });
    return limit ? out.slice(0, limit) : out;
  }

  /** 错题本是否为空 */
  function isEmpty(book) {
    for (var k in book) if (book[k] && book[k].wrong) return false;
    return true;
  }

  function clearBook() { return {}; }

  /* ---------- 练习历史 ---------- */

  /**
   * 记录一天的成绩。kind: 'practice' | 'follow' | 'sight' | 'theory' | 'rhythm'
   * 就地修改 history（{ 'YYYY-MM-DD': { practice: n, correct: n, follow: n, ... } }）
   */
  function recordDay(history, kind, opts) {
    if (!history) return history;
    opts = opts || {};
    var key = todayKey();
    var d = history[key] || (history[key] = {});
    d[kind] = (d[kind] || 0) + (opts.count || 1);
    if (opts.correct != null) d.correct = (d.correct || 0) + opts.correct;
    if (opts.total != null) d.total = (d.total || 0) + opts.total;
    if (opts.seconds != null) d.seconds = (d.seconds || 0) + opts.seconds;
    prune(history);
    return history;
  }

  /** 只保留最近 HISTORY_DAYS 天 */
  function prune(history, days) {
    days = days || HISTORY_DAYS;
    var keys = Object.keys(history).sort();
    while (keys.length > days) {
      delete history[keys.shift()];
    }
    return history;
  }

  /** 最近 n 天的序列（缺失日期补 0），用于画折线 */
  function recent(history, n) {
    n = n || 7;
    var out = [];
    var now = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var key = todayKey(d);
      var rec = history[key] || {};
      var total = (rec.practice || 0) + (rec.follow || 0) + (rec.sight || 0) + (rec.theory || 0) + (rec.rhythm || 0);
      out.push({
        date: key,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        count: total,
        correct: rec.correct || 0,
        answered: rec.total || 0,
        rate: rec.total ? Math.round((rec.correct || 0) / rec.total * 100) : null
      });
    }
    return out;
  }

  /** 汇总最近 n 天 */
  function summary(history, n) {
    var days = recent(history, n);
    var activeDays = days.filter(function (d) { return d.count > 0; }).length;
    var totalCount = days.reduce(function (a, d) { return a + d.count; }, 0);
    var answered = days.reduce(function (a, d) { return a + d.answered; }, 0);
    var correct = days.reduce(function (a, d) { return a + d.correct; }, 0);
    return {
      days: days,
      activeDays: activeDays,
      totalCount: totalCount,
      rate: answered ? Math.round(correct / answered * 100) : null
    };
  }

  global.MusicStats = {
    todayKey: todayKey,
    recordMistake: recordMistake,
    recordCorrect: recordCorrect,
    weakSpots: weakSpots,
    isEmpty: isEmpty,
    clearBook: clearBook,
    recordDay: recordDay,
    prune: prune,
    recent: recent,
    summary: summary,
    HISTORY_DAYS: HISTORY_DAYS
  };
})(typeof window !== 'undefined' ? window : globalThis);
