/* backup.js — 数据备份：导出 / 校验 / 合并导入（纯逻辑，可 Node 单测）
 *
 * 设计：
 *  - 导出格式带 schema 版本与导出时间，便于将来迁移；
 *  - 导入前先校验，损坏或版本不兼容的文件直接拒绝，不污染现有数据；
 *  - 提供两种模式：'replace'（覆盖）与 'merge'（合并，取更优进度）。
 */
(function (global) {
  'use strict';

  var FORMAT = 'ipiano-backup';
  var VERSION = 1;

  /** 导出包 */
  function build(state, meta) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      app: '五线谱小课堂',
      data: state,
      meta: meta || {}
    };
  }

  /** 序列化为可下载的 JSON 文本（meta 可选：档案名、头像等） */
  function serialize(state, meta) {
    return JSON.stringify(build(state, meta), null, 2);
  }

  /** 建议文件名：五线谱小课堂-备份-YYYYMMDD-HHmm.json */
  function fileName(now) {
    var d = now || new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return '五线谱小课堂-备份-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  }

  /**
   * 解析并校验备份文件。
   * @returns { ok, error?, data?, exportedAt? }
   */
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '文件是空的' };
    var obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: '不是有效的 JSON 文件' };
    }
    if (!obj || typeof obj !== 'object') return { ok: false, error: '文件内容格式不对' };

    // 兼容两种格式：标准备份包，或直接导出的裸 state（老用户手工保存的）
    var data = obj;
    if (obj.format === FORMAT) {
      if (obj.version > VERSION) {
        return { ok: false, error: '备份来自更新版本（v' + obj.version + '），请先升级应用' };
      }
      data = obj.data;
    } else if (obj.data && typeof obj.data === 'object' && !obj.stats) {
      data = obj.data;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: '找不到可导入的数据' };
    }
    // 至少要有一样可识别的字段，避免把任意 JSON 当备份
    var known = ['stats', 'courses', 'gamify', 'mistakes', 'history', 'clef', 'difficulty'];
    var hasKnown = known.some(function (k) { return data[k] !== undefined; });
    if (!hasKnown) return { ok: false, error: '这不是本应用的备份文件' };

    return { ok: true, data: data, exportedAt: obj.exportedAt || null, version: obj.version || null, meta: obj.meta || {} };
  }

  /** 深拷贝（只处理 JSON 结构） */
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /** 合并两个统计对象：取较大值（进度只进不退） */
  function mergeStats(a, b) {
    var out = clone(a) || {};
    for (var k in b) {
      var x = Number(out[k]) || 0, y = Number(b[k]) || 0;
      out[k] = Math.max(x, y);
    }
    return out;
  }

  /** 合并课程进度：取更高星级 */
  function mergeCourses(a, b) {
    var out = clone(a) || {};
    for (var id in b) {
      var cur = out[id], inc = b[id];
      if (!inc || !inc.done) continue;
      if (!cur || !cur.done || (inc.stars || 0) > (cur.stars || 0)) {
        out[id] = { done: true, stars: Math.max(1, Math.min(3, inc.stars || 1)) };
      }
    }
    return out;
  }

  /** 合并错题本：累加次数，保留较新的时间 */
  function mergeMistakes(a, b) {
    var out = clone(a) || {};
    for (var pc in b) {
      var inc = b[pc];
      if (!inc) continue;
      var cur = out[pc];
      if (!cur) { out[pc] = clone(inc); continue; }
      out[pc] = {
        wrong: (Number(cur.wrong) || 0) + (Number(inc.wrong) || 0),
        total: (Number(cur.total) || 0) + (Number(inc.total) || 0),
        last: Math.max(Number(cur.last) || 0, Number(inc.last) || 0),
        clef: inc.clef || cur.clef
      };
    }
    return out;
  }

  /** 合并练习历史：同一天相加 */
  function mergeHistory(a, b) {
    var out = clone(a) || {};
    for (var day in b) {
      var inc = b[day] || {};
      var cur = out[day] || {};
      var merged = {};
      ['practice', 'follow', 'sight', 'theory', 'rhythm', 'correct', 'total', 'seconds'].forEach(function (k) {
        merged[k] = (Number(cur[k]) || 0) + (Number(inc[k]) || 0);
      });
      out[day] = merged;
    }
    return out;
  }

  /** 合并 gamify：XP 取大，徽章取并集，连续天数取大 */
  function mergeGamify(a, b) {
    var out = clone(a) || {};
    b = b || {};
    out.xp = Math.max(Number(out.xp) || 0, Number(b.xp) || 0);
    out.dayStreak = Math.max(Number(out.dayStreak) || 0, Number(b.dayStreak) || 0);
    out.freezes = Math.max(Number(out.freezes) || 0, Number(b.freezes) || 0);
    if (b.lastDay && (!out.lastDay || b.lastDay > out.lastDay)) out.lastDay = b.lastDay;
    var badges = clone(out.badges) || {};
    for (var id in (b.badges || {})) {
      if (badges[id] === undefined) badges[id] = b.badges[id];
    }
    out.badges = badges;
    // 当日任务不跨设备合并（属于当天临时状态），保留本机
    return out;
  }

  /**
   * 合并导入：进度取更优，偏好设置保留本机。
   * @param cur 当前 state
   * @param inc 备份里的 data
   */
  function mergeState(cur, inc) {
    var out = clone(cur);
    if (!inc) return out;
    out.stats = mergeStats(cur.stats, inc.stats);
    out.courses = mergeCourses(cur.courses, inc.courses);
    out.mistakes = mergeMistakes(cur.mistakes, inc.mistakes);
    out.history = mergeHistory(cur.history, inc.history);
    out.gamify = mergeGamify(cur.gamify, inc.gamify);
    out.trainBest = mergeStats(cur.trainBest, inc.trainBest);
    return out;
  }

  /** 覆盖导入：直接用备份数据（偏好设置也一并恢复） */
  function replaceState(inc) { return clone(inc); }

  /** 概览：导入前给用户看要导入什么 */
  function overview(data) {
    var st = data.stats || {};
    var g = data.gamify || {};
    return {
      courses: Object.keys(data.courses || {}).length,
      attempts: Number(st.attempts) || 0,
      correct: Number(st.correct) || 0,
      stars: Number(st.stars) || 0,
      xp: Number(g.xp) || 0,
      badges: Object.keys(g.badges || {}).length,
      mistakes: Object.keys(data.mistakes || {}).length,
      historyDays: Object.keys(data.history || {}).length
    };
  }

  global.MusicBackup = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    build: build,
    serialize: serialize,
    fileName: fileName,
    parse: parse,
    mergeState: mergeState,
    replaceState: replaceState,
    overview: overview
  };
})(typeof window !== 'undefined' ? window : globalThis);
