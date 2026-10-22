/* gamify.js — 游戏化系统：XP/等级、每日任务、徽章、连击、庆祝动画
 * 依赖：window.MusicCore（用不到）、window.PianoAudio（庆祝音）
 * 与 app.js 协作：通过传入 state + audio + helpers（$ / todayStr / activePracticeConfig）解耦
 */
(function (global) {
  'use strict';

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayStr() {
    var d = new Date(); d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function create(deps) {
    var state = deps.state;          // 应用总 state（含 state.gamify / state.stats）
    var Audio = deps.Audio;          // window.PianoAudio
    var $ = deps.$;                  // document.getElementById 简写
    var save = deps.save || function () {};
    var getPracticeDifficulty = deps.getPracticeDifficulty || function () { return 'easy'; };
    var celebrateDuration = deps.celebrateDuration || 3200;

    /* ---------- XP / 等级 ---------- */
    function xpForLevel(lv) { return 20 + (lv - 1) * 5; }
    function levelOf(xp) {
      var lv = 1, left = xp;
      while (left >= xpForLevel(lv)) { left -= xpForLevel(lv); lv++; }
      return lv;
    }
    function xpInLevel(xp, lv) {
      var left = xp, i = 1;
      while (i < lv) { left -= xpForLevel(i); i++; }
      return Math.max(0, left);
    }

    /* ---------- 庆祝动画（事件队列：避免升级/徽章/任务重叠丢失） ---------- */
    var queue = [];
    var celebrating = false;
    function _show(title, sub, emoji) {
      var ov = document.createElement('div');
      ov.className = 'celebrate';
      // 可读：屏幕阅读器播报，且允许用户点一下 / 按 Esc 提前关掉
      ov.setAttribute('role', 'alertdialog');
      ov.setAttribute('aria-live', 'assertive');
      ov.setAttribute('aria-label', title + '，' + sub);
      ov.innerHTML = '<div class="confetti" aria-hidden="true"></div>' +
        '<div class="celebrate-box"><div class="celebrate-emoji" aria-hidden="true">' + emoji + '</div>' +
        '<div class="celebrate-title">' + title + '</div>' +
        '<div class="celebrate-sub">' + sub + '</div>' +
        '<div class="celebrate-hint">点击任意处关闭</div></div>';
      document.body.appendChild(ov);

      var closed = false;
      var timer = null;
      function close() {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        document.removeEventListener('keydown', onKey, true);
        ov.removeEventListener('click', close);
        ov.remove();
        celebrating = false;
        var next = queue.shift();
        if (next) setTimeout(function () { _show(next.title, next.sub, next.emoji); }, 400);
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          close();
        }
      }
      ov.addEventListener('click', close);
      document.addEventListener('keydown', onKey, true);
      if (state.sound && Audio && Audio.playDing) Audio.playDing(72);
      timer = setTimeout(close, celebrateDuration);
    }
    function celebrate(title, sub, emoji) {
      if (celebrating) { queue.push({ title: title, sub: sub, emoji: emoji }); return; }
      celebrating = true;
      _show(title, sub, emoji);
    }

    /* ---------- 每日任务池 ---------- */
    var TASK_POOL = [
      { id: 'answer10', name: '答对 10 题', icon: '🎯', check: function (p) { return p.answered >= 10; } },
      { id: 'streak5', name: '一次答对连对 5 题', icon: '🔥', check: function (p) { return p.streakBest >= 5; } },
      { id: 'full5', name: '完成 5 道 88 键题', icon: '🎹', check: function (p) { return p.fullAnswered >= 5; } },
      { id: 'any3', name: '完成 3 题', icon: '✏️', check: function (p) { return p.answered >= 3; } }
    ];
    function taskInfo(id) {
      for (var i = 0; i < TASK_POOL.length; i++) if (TASK_POOL[i].id === id) return TASK_POOL[i];
      return null;
    }
    function ensureDaily() {
      var g = state.gamify, t = todayStr();
      if (g.taskDate === t) return;
      if (g.lastDay === yesterdayStr()) {
        g.dayStreak++;
      } else if (g.lastDay && g.lastDay !== t && g.dayStreak > 0) {
        if (g.freezes > 0) g.freezes--;
        else g.dayStreak = 1;
      } else if (!g.lastDay || g.lastDay !== t) {
        g.dayStreak = 1;
      }
      g.lastDay = t;
      var pool = TASK_POOL.slice();
      g.tasks = [];
      while (g.tasks.length < 3 && pool.length) {
        var i = Math.floor(Math.random() * pool.length);
        g.tasks.push({ id: pool[i].id, done: false });
        pool.splice(i, 1);
      }
      g.prog = { answered: 0, streakBest: 0, fullAnswered: 0 };
      g.taskDate = t;
      save();
    }
    function renderTasks() {
      var g = state.gamify;
      var box = $('taskList');
      if (!box) return;
      box.innerHTML = '';
      g.tasks.forEach(function (t) {
        var info = taskInfo(t.id);
        if (!info) return;
        var li = document.createElement('li');
        li.className = 'task' + (t.done ? ' done' : '');
        li.innerHTML = '<span class="task-ico">' + info.icon + '</span>' +
          '<span class="task-name">' + info.name + '</span>' +
          '<span class="task-check">' + (t.done ? '✅' : '⬜') + '</span>';
        box.appendChild(li);
      });
    }
    function bumpTasks() {
      var g = state.gamify;
      g.prog.answered++;
      if (getPracticeDifficulty() === 'full') g.prog.fullAnswered++;
      if (state.stats.currentStreak > g.prog.streakBest) g.prog.streakBest = state.stats.currentStreak;
      var changed = false;
      g.tasks.forEach(function (t) {
        if (t.done) return;
        var info = taskInfo(t.id);
        if (info && info.check(g.prog)) { t.done = true; changed = true; }
      });
      if (changed) celebrate('完成任务！', '今天的任务完成了一个，真棒！', '🎁✨');
      save();
      renderTasks();
    }

    /* ---------- 徽章 ---------- */
    var BADGES = [
      { id: 'first', name: '第一步', desc: '答对第一题', icon: '🌱', check: function (p) { return p.correct >= 1; } },
      { id: 'correct50', name: '识谱新星', desc: '累计答对 50 题', icon: '⭐', check: function (p) { return p.correct >= 50; } },
      { id: 'correct200', name: '识谱大师', desc: '累计答对 200 题', icon: '🏆', check: function (p) { return p.correct >= 200; } },
      { id: 'streak10', name: '连对小达人', desc: '一次答对连对 10 题', icon: '🔥', check: function (p) { return p.bestStreak >= 10; } },
      { id: 'day7', name: '坚持七天', desc: '连续练习 7 天', icon: '📅', check: function (p) { return p.dayStreak >= 7; } },
      { id: 'full88', name: '钢琴小能手', desc: '88 键难度答对 20 题', icon: '🎹', check: function (p) { return p.fullCorrect >= 20; } },
      { id: 'challenge3', name: '每日之星', desc: '累计 3 天挑战全对', icon: '🏆', limited: true,
        check: function (p) { return p.challengePerfectDays >= 3; } }
    ];
    function checkBadges() {
      var g = state.gamify;
      var p = {
        correct: state.stats.firstTry,
        bestStreak: state.stats.bestStreak,
        dayStreak: g.dayStreak,
        fullCorrect: state.stats.fullCorrect,
        challengePerfectDays: (state.challenge && state.challenge.perfectDays) || 0
      };
      var fresh = [];
      BADGES.forEach(function (b) {
        if (g.badges[b.id] === undefined && b.check(p)) {
          g.badges[b.id] = Date.now();
          fresh.push(b);
        }
      });
      if (fresh.length) {
        var b = fresh[fresh.length - 1];
        celebrate('获得徽章！', '「' + b.icon + ' ' + b.name + '」——' + b.desc, '🏅');
        save();
      }
      renderBadges();
    }
    /** 徽章获得日期（MM/DD） */
    function formatBadgeDate(ts) {
      if (!ts) return '';
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return (d.getMonth() + 1) + '/' + d.getDate();
    }

    /** 徽章进度：返回 { pct, text } */
    function badgeProgress(b) {
      var st = state.stats || {};
      var g = state.gamify || {};
      var cur = 0, need = 1;
      if (b.id === 'first') { cur = st.firstTry || 0; need = 1; }
      else if (b.id === 'correct50') { cur = st.firstTry || 0; need = 50; }
      else if (b.id === 'correct200') { cur = st.firstTry || 0; need = 200; }
      else if (b.id === 'streak10') { cur = st.bestStreak || 0; need = 10; }
      else if (b.id === 'day7') { cur = g.dayStreak || 0; need = 7; }
      else if (b.id === 'full88') { cur = st.fullCorrect || 0; need = 20; }
      else if (b.id === 'challenge3') { cur = (state.challenge && state.challenge.perfectDays) || 0; need = 3; }
      var pct = Math.max(0, Math.min(100, Math.round(cur / need * 100)));
      return { pct: pct, text: Math.min(cur, need) + ' / ' + need };
    }

    function renderBadges() {
      var box = $('badgeList');
      if (!box) return;
      box.innerHTML = '';
      BADGES.forEach(function (b) {
        var got = state.gamify.badges[b.id] !== undefined;
        var el = document.createElement('div');
        el.className = 'badge' + (got ? '' : ' locked');
        el.title = b.name + '：' + b.desc + (got ? '' : '（未获得）');
        var when = got ? formatBadgeDate(state.gamify.badges[b.id]) : '';
        var prog = badgeProgress(b);
        el.innerHTML = '<span class="badge-ico" aria-hidden="true">' + (got ? b.icon : '🔒') + '</span>' +
          '<span class="badge-name">' + b.name + (b.limited ? ' <em class="badge-limited">限定</em>' : '') + '</span>' +
          '<span class="badge-desc">' + b.desc + '</span>' +
          (when ? '<span class="badge-date">' + when + '</span>' : '') +
          (got ? '' : '<span class="badge-bar"><i style="width:' + prog.pct + '%"></i></span>' +
            '<span class="badge-progress">' + prog.text + '</span>');
        box.appendChild(el);
      });
    }

    /* ---------- 公开 API ---------- */
    function addXp(n) {
      var g = state.gamify;
      var before = levelOf(g.xp);
      g.xp += n;
      var after = levelOf(g.xp);
      if (after > before) celebrate('升级啦！', '你升到了 ' + after + ' 级，太厉害了！', '🎉🌟🏆');
      save();
    }

    function updateStatsUI() {
      var st = state.stats;
      $('statStars').textContent = st.stars;
      $('statStreak').textContent = st.currentStreak;
      // 一次答对率 = 一次答对 / 答对题数
      $('statRate').textContent = (st.correct ? Math.round((st.firstTry / st.correct) * 100) : 0) + '%';
      $('statCount').textContent = st.correct;
      $('sTotal').textContent = st.attempts;
      $('sCorrect').textContent = st.correct;
      $('sFirstTry').textContent = st.firstTry;
      $('sBest').textContent = st.bestStreak;
      $('sStars').textContent = st.stars;
      // XP 条
      var g = state.gamify;
      var lv = levelOf(g.xp);
      $('xpLevel').textContent = lv;
      var cur = xpInLevel(g.xp, lv);
      var need = xpForLevel(lv);
      $('xpBar').style.width = Math.min(100, Math.round(cur / need * 100)) + '%';
      $('xpText').textContent = cur + '/' + need;
      $('dayStreak').textContent = g.dayStreak;
      renderTasks();
    }

    function popChip(id) {
      var c = $(id).parentElement;
      c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    }

    return {
      // 统计与游戏化
      addXp: addXp,
      ensureDaily: ensureDaily,
      bumpTasks: bumpTasks,
      checkBadges: checkBadges,
      renderBadges: renderBadges,
      updateStatsUI: updateStatsUI,
      popChip: popChip,
      celebrate: celebrate,
      // 工具（暴露给 app.js 用）
      levelOf: levelOf,
      xpForLevel: xpForLevel,
      xpInLevel: xpInLevel
    };
  }

  global.MusicGamify = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
