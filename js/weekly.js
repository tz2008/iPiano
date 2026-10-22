/* weekly.js — 家长周报（纯逻辑，无 DOM，可 Node 单测）
 *
 * 输入：练习历史 history、错题本 mistakes、课程进度 courses、统计 stats、游戏化 gamify
 * 输出：一周的结构化报告 + 家长可读的建议
 *
 * 周期：以「今天」为终点，向前数 7 天（含今天）。
 */
(function (global) {
  'use strict';

  var WEEK = 7;
  var KIND_LABEL = {
    practice: '识谱练习',
    follow: '跟练',
    sight: '视奏',
    theory: '乐理',
    rhythm: '节奏'
  };
  var KIND_ORDER = ['practice', 'follow', 'sight', 'theory', 'rhythm'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /** 一周的日期键（旧 → 新，含今天） */
  function weekKeys(now) {
    now = now || new Date();
    var out = [];
    for (var i = WEEK - 1; i >= 0; i--) {
      out.push(keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    }
    return out;
  }

  /** 日记录里各类练习的总次数 */
  function dayCount(rec) {
    if (!rec) return 0;
    var n = 0;
    for (var i = 0; i < KIND_ORDER.length; i++) n += Number(rec[KIND_ORDER[i]]) || 0;
    return n;
  }

  /**
   * 生成周报。
   * @param data { history, mistakes, courses, stats, gamify }
   * @param opts { now, name }
   */
  function build(data, opts) {
    opts = opts || {};
    data = data || {};
    var history = data.history || {};
    var keys = weekKeys(opts.now);

    var days = keys.map(function (k, i) {
      var rec = history[k] || {};
      var d = new Date(k + 'T00:00:00');
      return {
        date: k,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        weekday: '日一二三四五六'[d.getDay()],
        count: dayCount(rec),
        kinds: (function () {
          var o = {};
          KIND_ORDER.forEach(function (kind) { o[kind] = Number(rec[kind]) || 0; });
          return o;
        })(),
        correct: Number(rec.correct) || 0,
        answered: Number(rec.total) || 0
      };
    });

    var activeDays = days.filter(function (d) { return d.count > 0; }).length;
    var totalCount = days.reduce(function (a, d) { return a + d.count; }, 0);
    var answered = days.reduce(function (a, d) { return a + d.answered; }, 0);
    var correct = days.reduce(function (a, d) { return a + d.correct; }, 0);
    var rate = answered ? Math.round(correct / answered * 100) : null;
    var bestDay = days.slice().sort(function (a, b) { return b.count - a.count; })[0];

    // 分类统计
    var byKind = KIND_ORDER.map(function (k) {
      return {
        key: k,
        name: KIND_LABEL[k],
        count: days.reduce(function (a, d) { return a + d.kinds[k]; }, 0)
      };
    }).filter(function (x) { return x.count > 0; })
      .sort(function (a, b) { return b.count - a.count; });

    // 本周新增课程（用 history 无法判断，改用 courses 的星级分布做概览）
    var courses = data.courses || {};
    var courseIds = Object.keys(courses).filter(function (id) { return courses[id] && courses[id].done; });
    var courseStars = courseIds.reduce(function (a, id) { return a + (Number(courses[id].stars) || 0); }, 0);

    // 薄弱音（错题本前 3）
    var weak = weakSpots(data.mistakes, 3);

    var report = {
      name: opts.name || '小朋友',
      range: { from: keys[0], to: keys[keys.length - 1] },
      days: days,
      activeDays: activeDays,
      totalCount: totalCount,
      answered: answered,
      correct: correct,
      rate: rate,
      bestDay: bestDay && bestDay.count > 0 ? bestDay : null,
      byKind: byKind,
      courses: { done: courseIds.length, stars: courseStars },
      weak: weak,
      streak: (data.gamify && Number(data.gamify.dayStreak)) || 0,
      xp: (data.gamify && Number(data.gamify.xp)) || 0,
      badges: Object.keys((data.gamify && data.gamify.badges) || {}).length
    };
    report.advice = adviceFor(report);
    report.level = levelFor(report);
    return report;
  }

  /** 从错题本取最需要练的音 */
  function weakSpots(mistakes, limit) {
    if (!mistakes) return [];
    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
    var NATURAL = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    var out = [];
    Object.keys(mistakes).forEach(function (pc) {
      var e = mistakes[pc];
      if (!e || !Number(e.wrong)) return;
      var n = Number(pc);
      var natural = NATURAL[n];
      var name = natural === undefined ? LETTERS[0] + '♯' : LETTERS[natural] + ' · ' + SOLFEGE[natural];
      out.push({
        pitchClass: n,
        name: name,
        wrong: Number(e.wrong) || 0,
        total: Number(e.total) || 0,
        rate: e.total ? Math.round((Number(e.wrong) / Number(e.total)) * 100) : 100
      });
    });
    out.sort(function (a, b) {
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      return b.rate - a.rate;
    });
    return limit ? out.slice(0, limit) : out;
  }

  /** 本周表现评级：star / good / ok / low */
  function levelFor(r) {
    if (!r.totalCount) return 'none';
    var score = 0;
    score += Math.min(40, r.activeDays / WEEK * 40);          // 坚持度
    score += r.rate == null ? 15 : r.rate * 0.4;              // 正确率
    score += Math.min(20, r.totalCount / 60 * 20);            // 练习量
    if (score >= 75) return 'star';
    if (score >= 55) return 'good';
    if (score >= 30) return 'ok';
    return 'low';
  }

  /** 家长可读的建议（最多 3 条，按优先级） */
  function adviceFor(r) {
    var out = [];
    if (!r.totalCount) {
      out.push('这周还没有练习记录，可以先从「识谱练习」每天 5 分钟开始。');
      return out;
    }
    if (r.activeDays <= 2) {
      out.push('本周只练了 ' + r.activeDays + ' 天，建议固定一个时间段（如晚饭后 10 分钟），比一次练很久更有效。');
    } else if (r.activeDays >= 6) {
      out.push('本周练了 ' + r.activeDays + ' 天，坚持得很好，保持这个节奏。');
    }
    if (r.rate != null && r.rate < 70) {
      out.push('一次答对率 ' + r.rate + '%，可以放慢一点：先看清谱号与线间位置再作答，比求快更重要。');
    } else if (r.rate != null && r.rate >= 90) {
      out.push('一次答对率 ' + r.rate + '%，可以尝试更高难度（标准 → 88 键）或挑战训练营的视奏。');
    }
    if (r.weak.length && r.weak[0].wrong >= 3) {
      var names = r.weak.map(function (w) { return w.name; }).join('、');
      out.push('这几个音错得较多：' + names + '。可以在训练营的「错题本」里做一次专项练习。');
    }
    if (!r.byKind.some(function (k) { return k.key === 'follow'; }) && r.totalCount >= 10) {
      out.push('这周还没练跟练，可以在「曲谱库」挑一首熟悉的曲子跟弹，把识谱用到实际演奏上。');
    }
    if (!r.byKind.some(function (k) { return k.key === 'theory'; }) && r.totalCount >= 20) {
      out.push('可以抽 5 分钟做一组乐理题，帮助理解谱号、拍号这些“为什么”。');
    }
    return out.slice(0, 3);
  }

  /** 生成纯文本版周报（便于复制给家长或分享） */
  function toText(r) {
    var lines = [];
    lines.push('【五线谱小课堂 · 周报】' + r.name);
    lines.push(r.range.from + ' ~ ' + r.range.to);
    lines.push('');
    lines.push('练习天数：' + r.activeDays + ' / 7 天');
    lines.push('练习次数：' + r.totalCount + ' 次');
    lines.push('一次答对率：' + (r.rate == null ? '—' : r.rate + '%') +
      (r.answered ? '（' + r.correct + '/' + r.answered + '）' : ''));
    if (r.byKind.length) {
      lines.push('练习内容：' + r.byKind.map(function (k) { return k.name + ' ' + k.count + ' 次'; }).join('、'));
    }
    lines.push('课程进度：已完成 ' + r.courses.done + ' 课，累计 ' + r.courses.stars + ' 星');
    lines.push('连续练习：' + r.streak + ' 天 ｜ 徽章：' + r.badges + ' 枚 ｜ XP：' + r.xp);
    if (r.weak.length) {
      lines.push('需要加强：' + r.weak.map(function (w) { return w.name + '（错 ' + w.wrong + ' 次）'; }).join('、'));
    }
    lines.push('');
    lines.push('建议：');
    r.advice.forEach(function (a, i) { lines.push((i + 1) + '. ' + a); });
    return lines.join('\n');
  }

  global.MusicWeekly = {
    WEEK: WEEK,
    weekKeys: weekKeys,
    build: build,
    weakSpots: weakSpots,
    levelFor: levelFor,
    adviceFor: adviceFor,
    toText: toText
  };
})(typeof window !== 'undefined' ? window : globalThis);
