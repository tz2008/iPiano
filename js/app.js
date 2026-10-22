/* app.js — 应用逻辑：练习/学习/设置、状态持久化、统计 */
(function () {
  'use strict';
  var Core = window.MusicCore;
  var Staff = window.MusicStaff;
  var Audio = window.PianoAudio;

  var LS_KEY = 'music-tutor-v1';

  /* ---------- 状态 ---------- */
  var state = {
    clef: 'treble',       // treble | bass | random
    difficulty: 'easy',   // easy | standard | full
    naming: 'solfege',    // solfege | letter
    mode: 'name',         // name | keyboard | listen | place
    sound: true,
    theme: 'light',
    octaveStrict: false, // 点琴键/放音符是否严格判八度
    inputSource: 'mic',  // 跟练输入：mic | midi
    mistakes: {},        // 错题本 { pitchClass: {wrong,total,last,clef} }
    history: {},         // 练习历史 { 'YYYY-MM-DD': {...} }
    followBpm: 80,      // 跟练速度
    metronome: false,   // 跟练节拍器
    countIn: true,      // 跟练预备拍（一小节倒计时）
    sightLevel: 1,      // 视奏难度
    rhythmLevel: 1,     // 节奏难度
    trainBest: {},      // 各项训练最佳星级
    challenge: { lastDate: '', attempts: 0, best: 0, perfectDays: 0, history: {} }, // 每日挑战
    stats: { attempts: 0, correct: 0, firstTry: 0, stars: 0, currentStreak: 0, bestStreak: 0, fullCorrect: 0 },
    courses: {}, // 课程进度 { id: { done, stars } }
    gamify: {
      xp: 0, dayStreak: 0, lastDay: '', freezes: 2,
      taskDate: '', tasks: [], prog: { answered: 0, streakBest: 0, fullAnswered: 0 },
      badges: {}
    }
  };
  var CLEF_KEYS = { treble: 1, bass: 1, random: 1 };
  var DIFF_KEYS = { easy: 1, standard: 1, full: 1 };
  var NAMING_KEYS = { solfege: 1, letter: 1 };
  var MODE_KEYS = { name: 1, keyboard: 1, listen: 1, place: 1 };
  function toNum(v) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /** 多档案存储（由 load 初始化） */
  var profileStore = null;

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        // 首次使用：建一个默认档案
        profileStore = window.MusicProfiles.createStore();
        window.MusicProfiles.addProfile(profileStore, {});
        return;
      }
      var parsed = JSON.parse(raw);
      var needSave = false;
      // 旧版（v1）是裸 state：包成第一个档案，不丢进度
      if (window.MusicProfiles.isLegacy(parsed)) {
        profileStore = window.MusicProfiles.migrateLegacy(parsed);
        needSave = true;
      } else if (window.MusicProfiles.isStore(parsed)) {
        profileStore = window.MusicProfiles.sanitize(parsed) || window.MusicProfiles.migrateLegacy(parsed);
      } else {
        profileStore = window.MusicProfiles.createStore();
        window.MusicProfiles.addProfile(profileStore, {});
        needSave = true;
      }
      // 先把数据读进 state，再决定是否写回（顺序反了会用默认值覆盖档案数据）
      var active = window.MusicProfiles.getActive(profileStore);
      if (active && active.data) {
        var migrated = applyDataToState(active.data);
        if (migrated) needSave = true;   // 课程 ID 等迁移后写回
      }
      if (needSave) save();
    } catch (e) {
      profileStore = window.MusicProfiles.createStore();
      window.MusicProfiles.addProfile(profileStore, {});
    }
  }

  /** 把某份数据校验后写入 state（就地修改，保持引用不变） */
  function applyDataToState(data) {
    var migrated = false;
    try {
      var s = data || {};
      // 白名单校验，避免损坏/手改数据导致 init 崩溃
      if (CLEF_KEYS[s.clef]) state.clef = s.clef;
      if (DIFF_KEYS[s.difficulty]) state.difficulty = s.difficulty;
      if (NAMING_KEYS[s.naming]) state.naming = s.naming;
      if (MODE_KEYS[s.mode]) state.mode = s.mode;
      if (typeof s.sound === 'boolean') state.sound = s.sound;
      if (s.theme === 'light' || s.theme === 'dark') state.theme = s.theme;
      if (typeof s.followBpm === 'number' && s.followBpm >= 40 && s.followBpm <= 200) state.followBpm = Math.round(s.followBpm);
      if (typeof s.metronome === 'boolean') state.metronome = s.metronome;
      if (typeof s.countIn === 'boolean') state.countIn = s.countIn;
      if (typeof s.octaveStrict === 'boolean') state.octaveStrict = s.octaveStrict;
      if (s.inputSource === 'mic' || s.inputSource === 'midi') state.inputSource = s.inputSource;
      if (s.mistakes && typeof s.mistakes === 'object') {
        for (var pc in s.mistakes) {
          var e = s.mistakes[pc];
          if (!e || typeof e !== 'object') continue;
          var n = parseInt(pc, 10);
          if (!(n >= 0 && n <= 11)) continue;
          state.mistakes[n] = { wrong: toNum(e.wrong), total: toNum(e.total), last: toNum(e.last), clef: e.clef === 'bass' ? 'bass' : 'treble' };
        }
      }
      if (s.history && typeof s.history === 'object') {
        var hist = {};
        for (var dk in s.history) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
          var dv = s.history[dk];
          if (!dv || typeof dv !== 'object') continue;
          hist[dk] = {
            practice: toNum(dv.practice), follow: toNum(dv.follow), sight: toNum(dv.sight),
            theory: toNum(dv.theory), rhythm: toNum(dv.rhythm),
            correct: toNum(dv.correct), total: toNum(dv.total), seconds: toNum(dv.seconds)
          };
        }
        state.history = hist;
      }
      if (s.challenge && typeof s.challenge === 'object') {
        state.challenge = {
          lastDate: typeof s.challenge.lastDate === 'string' ? s.challenge.lastDate : '',
          attempts: toNum(s.challenge.attempts),
          best: toNum(s.challenge.best),
          perfectDays: toNum(s.challenge.perfectDays),
          history: (s.challenge.history && typeof s.challenge.history === 'object') ? s.challenge.history : {}
        };
      }
      if (s.sightLevel >= 1 && s.sightLevel <= 4) state.sightLevel = Math.floor(s.sightLevel);
      if (s.rhythmLevel >= 1 && s.rhythmLevel <= 3) state.rhythmLevel = Math.floor(s.rhythmLevel);
      if (s.trainBest && typeof s.trainBest === 'object') {
        ['sight', 'theory', 'rhythm'].forEach(function (k) {
          if (s.trainBest[k] >= 1 && s.trainBest[k] <= 3) state.trainBest[k] = Math.floor(s.trainBest[k]);
        });
      }
      if (s.stats && typeof s.stats === 'object') {
        ['attempts', 'correct', 'firstTry', 'stars', 'currentStreak', 'bestStreak', 'fullCorrect'].forEach(function (k) {
          state.stats[k] = toNum(s.stats[k]);
        });
        // 老版本只有 total（= 答对题数）：迁移为 correct，attempts 至少等于它
        if (s.stats.total != null && s.stats.correct == null) {
          state.stats.correct = toNum(s.stats.total);
          state.stats.attempts = Math.max(state.stats.attempts, state.stats.correct);
        }
      }
      if (s.courses && typeof s.courses === 'object') {
        state.courses = {};
        for (var cid in s.courses) {
          var cc = s.courses[cid];
          if (!cc || typeof cc !== 'object' || !cc.done) continue;
          var stars = Math.max(1, Math.min(3, toNum(cc.stars) || 1));
          // 兼容老版本（数字 ID 1..30）：按教材线路映射到新 ID
          var newId = cid;
          if (/^\d+$/.test(cid)) {
            var n = parseInt(cid, 10);
            if (n >= 1 && n <= 12) newId = 'jichu-' + String(n).padStart(2, '0');
            else if (n >= 13 && n <= 22) newId = 'baier-' + String(n - 12).padStart(2, '0');
            else if (n >= 23 && n <= 30) newId = 'hanon-' + String(n - 22).padStart(2, '0');
            else continue; // 非法 ID 跳过
            migrated = true;
          }
          state.courses[newId] = { done: true, stars: stars };
        }
      }
      if (s.gamify && typeof s.gamify === 'object') {
        var g = s.gamify;
        state.gamify.xp = toNum(g.xp);
        state.gamify.dayStreak = toNum(g.dayStreak);
        state.gamify.freezes = toNum(g.freezes);
        state.gamify.lastDay = typeof g.lastDay === 'string' ? g.lastDay : '';
        state.gamify.taskDate = typeof g.taskDate === 'string' ? g.taskDate : '';
        if (Array.isArray(g.tasks) && g.tasks.length === 3) state.gamify.tasks = g.tasks;
        if (g.prog && typeof g.prog === 'object') {
          state.gamify.prog.answered = toNum(g.prog.answered);
          state.gamify.prog.streakBest = toNum(g.prog.streakBest);
          state.gamify.prog.fullAnswered = toNum(g.prog.fullAnswered);
        }
        if (g.badges && typeof g.badges === 'object') {
          for (var b in g.badges) if (typeof g.badges[b] === 'number') state.gamify.badges[b] = g.badges[b];
        }
      }
    } catch (e) { /* 忽略损坏数据 */ }
    return migrated;
  }

  /** 保存：把当前 state 深拷贝写回活动档案
   *  （必须拷贝：切换档案时会清空 state，共享引用会把旧档案一起清掉） */
  function save() {
    try {
      if (!profileStore) return;
      var active = window.MusicProfiles.getActive(profileStore);
      if (active) active.data = JSON.parse(JSON.stringify(state));
      localStorage.setItem(LS_KEY, JSON.stringify(profileStore));
    } catch (e) {}
  }

  var question = null;     // { midi, clef }
  var usedWrong = false;   // 本题是否答错过（影响 XP/连对）
  var wrongAttempts = 0;   // 本题答错次数（>= 2 揭示答案）
  var busy = false;        // 等待下一题中
  var nextTimer = null;    // 自动下一题的定时器句柄

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 主题 ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    $('themeBtn').textContent = state.theme === 'light' ? '🌙' : '☀️';
  }
  function applySoundBtn() { $('soundBtn').textContent = state.sound ? '🔊' : '🔇'; }

  /* ---------- 反馈语 ---------- */
  var OK_WORDS = ['太棒了！🎉', '真厉害！🌟', '答对了！👏', '完美！✨', '好聪明！🧠', '继续加油！🚀'];
  var NO_WORDS = ['再想想～', '没关系，再来一次！', '加油，你能行！💪', '仔细看看它的位置哦'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function setFeedback(kind, text) {
    var f = $('feedback');
    f.className = 'feedback ' + kind;
    f.textContent = text;
  }

  /* ---------- 游戏化（gamify 模块，见 js/gamify.js）---------- */
  var gamify = null; // 在 init() 中创建

  /* ---------- 练习模式 ---------- */
  var answerKeyboard = null; // keyboard/listen 模式的迷你键盘
  var placeMidi = null;      // place 模式当前放置的音

  function answerLabel(idx) {
    var cfg = activePracticeConfig();
    var names;
    if (cfg.difficulty === 'full') {
      names = state.naming === 'letter' ? Core.LETTER_12 : Core.SOLFEGE_12;
    } else {
      names = state.naming === 'letter' ? Core.LETTERS : Core.SOLFEGE;
    }
    return names[idx];
  }

  /** 题目答案的按钮索引：白键 0..6，黑键 7..11（仅 88 键难度含黑键） */
  function answerIndexOf(midi) {
    var cfg = activePracticeConfig();
    if (cfg.difficulty === 'full') return Core.SEMI_INDEX[midi % 12];
    var dia = Core.midiToDia(midi);
    return ((dia % 7) + 7) % 7;
  }

  /** 迷你键盘范围（练习页作答区） */
  function answerKeyRange() {
    var cfg = activePracticeConfig();
    if (cfg.difficulty === 'full') return Core.KEYBOARD_RANGE.full;
    // 随机谱号：按本题实际谱号取键盘范围，避免低音题在键盘上够不到
    var clef = question ? question.clef : (cfg.clef === 'random' ? 'treble' : cfg.clef);
    return Core.KEYBOARD_RANGE[clef];
  }

  function buildAnswerButtons() {
    var box = $('answerButtons');
    box.innerHTML = '';
    var cfg = activePracticeConfig();
    var count = cfg.difficulty === 'full' ? 12 : 7;
    box.className = 'answer-grid cols-' + count;
    for (var i = 0; i < count; i++) {
      var b = document.createElement('button');
      b.className = 'answer-btn';
      b.dataset.idx = i;
      b.textContent = answerLabel(i);
      b.addEventListener('click', function () { submitAnswer(parseInt(this.dataset.idx, 10), 'idx'); });
      box.appendChild(b);
    }
  }

  function renderAnswerKeyboard() {
    var kbBox = $('keyboardAnswer');
    var r = answerKeyRange();
    answerKeyboard = Staff.renderKeyboard(kbBox, r[0], r[1], {
      label: '作答钢琴键盘（方向键选键，回车作答）',
      marks: [{ midi: 60, label: '中央C' }],
      onKey: function (midi) { submitAnswer(midi, 'midi'); }
    });
  }

  /** 按 mode 渲染作答区（按钮 / 钢琴键盘） */
  function renderAnswerArea() {
    var box = $('answerButtons');
    var kbBox = $('keyboardAnswer');
    var cfg = activePracticeConfig();
    if (cfg.mode === 'name') {
      box.style.display = '';
      kbBox.style.display = 'none';
      buildAnswerButtons();
    } else if (cfg.mode === 'place') {
      // 放音符：只在谱面上操作，不提供可点键盘
      box.style.display = 'none';
      kbBox.style.display = 'none';
    } else {
      box.style.display = 'none';
      kbBox.style.display = '';
      renderAnswerKeyboard();
    }
  }

  /** 出自然音题（place 模式专用；88 键时也只出白键） */
  function randomNaturalNote(clef, difficulty) {
    if (difficulty === 'full') {
      var m = 21 + Math.floor(Math.random() * 88);
      while (Core.midiToDia(m) === null) m = 21 + Math.floor(Math.random() * 88);
      return { midi: m, clef: Core.clefForMidi(m) };
    }
    var c = clef === 'random' ? (Math.random() < 0.5 ? 'treble' : 'bass') : clef;
    var pool = Core.rangeFor(c, difficulty);
    return { midi: pool[Math.floor(Math.random() * pool.length)], clef: c };
  }

  /** 放置音吸附到当前难度的自然音范围 */
  function clipToNatural(m) {
    var cfg = activePracticeConfig();
    var lo, hi;
    if (cfg.difficulty === 'full') { lo = 21; hi = 108; }
    else {
      var clef = question ? question.clef : (cfg.clef === 'random' ? 'treble' : cfg.clef);
      var r = Core.KEYBOARD_RANGE[clef];
      lo = r[0]; hi = r[1];
    }
    m = Math.max(lo, Math.min(hi, m));
    if (Core.midiToDia(m) !== null) return m;
    // 落到黑键上：向最近的白键吸附
    var up = m + 1, down = m - 1;
    if (up <= hi && Core.midiToDia(up) !== null) return up;
    if (down >= lo && Core.midiToDia(down) !== null) return down;
    return m;
  }

  function renderPlacePreview() {
    if (placeMidi === null) return;
    Staff.renderStaff($('practiceStaff'), {
      clef: question.clef, noteX: 320,
      notes: [{ midi: placeMidi, cursor: true }]
    });
    bindPlaceStaff();
    $('placeConfirm').disabled = false;
  }

  function bindPlaceStaff() {
    var wrap = $('practiceStaff');
    wrap.onclick = function (ev) {
      var svg = wrap.querySelector('svg');
      if (!svg || busy || !question) return;
      var rect = svg.getBoundingClientRect();
      if (rect.height <= 0) return;
      // 解析 viewBox="x y w h"，兼容 jsdom/老引擎
      var vb = String(svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      if (vb.length < 4 || !vb[3]) return;
      var ySvg = vb[1] + (ev.clientY - rect.top) / rect.height * vb[3];
      placeMidi = clipToNatural(Core.yToMidi(question.clef, ySvg, Staff.LINE5_Y, Staff.SPACING));
      renderPlacePreview();
    };
  }

  function nudgePlace(dir) {
    if (placeMidi === null) return;
    var m = placeMidi + dir;
    while (m >= 21 && m <= 108 && Core.midiToDia(m) === null) m += dir;
    if (m < 21 || m > 108) return;
    placeMidi = m;
    renderPlacePreview();
  }

  function renderQuestion() {
    if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; }
    var cfg = activePracticeConfig();
    question = cfg.mode === 'place'
      ? randomNaturalNote(cfg.clef, cfg.difficulty)
      : Core.randomNote(cfg.clef, cfg.difficulty);
    usedWrong = false;
    wrongAttempts = 0;
    busy = false;
    placeMidi = null;

    var noteOpt = { midi: question.midi };
    if (Core.midiToDia(question.midi) === null) noteOpt = { midi: question.midi - 1, accidental: 1 };
    var notes;
    if (cfg.mode === 'listen' || cfg.mode === 'place') notes = []; // 听音/放置模式谱面不显示答案
    else notes = [noteOpt];

    Staff.renderStaff($('practiceStaff'), { clef: question.clef, noteX: 320, notes: notes });
    renderAnswerArea();
    // 课程练习中隐藏模式切换（模式由课程固定）
    $('segMode').style.display = courseActive ? 'none' : '';
    $('placeConfirmWrap').style.display = cfg.mode === 'place' ? '' : 'none';
    $('replayBtn').style.display = cfg.mode === 'listen' ? '' : 'none';
    // 标题：放音符模式提示要放哪个音，其余模式恢复默认（避免残留上一题文案）
    $('placeLabel').textContent = cfg.mode === 'place'
      ? '请把「' + answerLabel(answerIndexOf(question.midi)) + '」放到五线谱上：'
      : '这个音符是？';
    if (cfg.mode === 'place') {
      $('placeConfirm').disabled = true;
      bindPlaceStaff();
    }

    var hint =
      cfg.mode === 'name' ? '看好音符，点下面它对应的名字！（也能按键盘 A–G / 1–7）'
      : cfg.mode === 'keyboard' ? '看好音符，点钢琴键盘上对应的琴键！（也能按键盘 A S D F…）'
      : cfg.mode === 'listen' ? '👂 听一听这个音，再点钢琴键盘上对应的琴键（可点「🔊 再听一次」）'
      : '点五线谱放音符，可用 ↑ ↓ 微调，好了点「就是这个！」';
    setFeedback('idle', hint);
    $('answerHint').textContent = '';

    // 听音模式自动播放
    if (cfg.mode === 'listen') {
      if (state.sound) {
        setTimeout(function () { if (question && !busy) Audio.playNote(question.midi); }, 500);
      } else {
        $('answerHint').textContent = '🔇 声音已关闭，点右上角喇叭开启后才能听音。';
      }
    }
  }

  function replayListen() {
    var cfg = activePracticeConfig();
    if (cfg.mode === 'listen' && question && state.sound) Audio.playNote(question.midi);
  }

  /** 答对后键盘高亮正确音 / 显示谱面答案（listen、place 用） */
  function showAnswerVisual() {
    var cfg = activePracticeConfig();
    if (cfg.mode === 'listen') {
      var noteOpt = { midi: question.midi };
      if (Core.midiToDia(question.midi) === null) noteOpt = { midi: question.midi - 1, accidental: 1 };
      Staff.renderStaff($('practiceStaff'), { clef: question.clef, noteX: 320, notes: [noteOpt] });
    } else if (cfg.mode === 'place') {
      var n2 = { midi: question.midi, highlight: true };
      Staff.renderStaff($('practiceStaff'), { clef: question.clef, noteX: 320, notes: [n2] });
    }
  }

  function markCorrect(value, type) {
    if (type === 'idx') {
      var btns = $('answerButtons').children;
      btns[value].classList.add('correct');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    } else {
      // 键盘模式：高亮正确音
      var keyEl = answerKeyboard && answerKeyboard.keys.get(question.midi);
      if (keyEl) keyEl.classList.add('correct');
    }
  }
  function markWrong(value, type) {
    if (type === 'idx') {
      var btns = $('answerButtons').children;
      btns[value].classList.add('wrong');
      btns[value].disabled = true;
    } else if (type === 'midi') {
      var k = answerKeyboard && answerKeyboard.keys.get(value);
      if (k) k.classList.add('wrong');
    } else if (type === 'semi') {
      // 快捷键答错：标红该半音类的第一个键
      var all = answerKeyboard ? answerKeyboard.root.querySelectorAll('.key') : [];
      for (var i = 0; i < all.length; i++) {
        if (parseInt(all[i].dataset.midi, 10) % 12 === value) { all[i].classList.add('wrong'); break; }
      }
    }
  }
  /** 高亮正确答案（不接管作答），让小朋友"看见"对的位置。
   *  同时把谱面音符染绿、播放目标音，给视觉+听觉双重提示。
   *  用于：答错 >= 2 次、listen 模式答题结束。 */
  function revealAnswer() {
    var correctName = answerLabel(answerIndexOf(question.midi));
    // 1) 名称按钮高亮 + 圈出
    var btns = $('answerButtons').children;
    if (btns && btns.length) {
      var correctIdx = answerIndexOf(question.midi);
      if (btns[correctIdx]) btns[correctIdx].classList.add('reveal');
    }
    // 2) 键盘高亮
    if (answerKeyboard) {
      var kEl = answerKeyboard.keys.get(question.midi);
      if (kEl) kEl.classList.add('correct');
    }
    // 3) 谱面染绿（listen / place 模式下显示答案位置）
    showAnswerVisual();
    // 4) 重播目标音（声音开启时）
    if (state.sound) {
      Audio.playNote(question.midi, { dur: 1.0 });
    }
    return correctName;
  }
  /** name/keyboard 模式：计算"答的方向"提示（高/低几个半音） */
  function directionHint(value, type) {
    var targetMidi = question.midi;
    var guessedMidi;
    if (type === 'idx') {
      var cfg = activePracticeConfig();
      // 反推 guess 按钮对应的半音名：白键 0..6 → 音名列表；12 键 → SEMI_INDEX 反向
      var pcs;
      if (cfg.difficulty === 'full') {
        // 12 键按钮：value 是 SEMI_INDEX 索引（即 midi%12）
        var SEMI_TO_PC = [0, 2, 4, 5, 7, 9, 11, 1, 3, 6, 8, 10];
        pcs = SEMI_TO_PC;
        guessedMidi = targetMidi - (targetMidi % 12) + SEMI_TO_PC[value];
      } else {
        // 7 键按钮：value 是 (dia%7) 序号，对应音名 C D E F G A B = 0..6 → pc 0 2 4 5 7 9 11
        pcs = [0, 2, 4, 5, 7, 9, 11];
        guessedMidi = targetMidi - (targetMidi % 12) + pcs[value];
      }
    } else if (type === 'midi') {
      guessedMidi = value;
    } else { // 'semi'：快捷键按的是半音类（midi%12）
      var SEMI_TO_PC2 = [0, 2, 4, 5, 7, 9, 11, 1, 3, 6, 8, 10];
      guessedMidi = targetMidi - (targetMidi % 12) + SEMI_TO_PC2[value];
    }
    var diff = guessedMidi - targetMidi;
    if (diff === 0) return '';
    if (diff > 0) return '（你猜高了 ' + diff + ' 个半音，往下找～）';
    return '（你猜低了 ' + Math.abs(diff) + ' 个半音，往上找～）';
  }

  /** 记录一次答题到错题本与练习历史 */
  function recordAnswerStat(cfg, midi, correct) {
    if (!window.MusicStats) return;
    if (!state.mistakes) state.mistakes = {};
    if (!state.history) state.history = {};
    if (correct) window.MusicStats.recordCorrect(state.mistakes, midi);
    else window.MusicStats.recordMistake(state.mistakes, midi, question ? question.clef : cfg.clef);
    window.MusicStats.recordDay(state.history, 'practice', { correct: correct ? 1 : 0, total: 1 });
  }

  /**
   * 统一判定口径：
   *  - 选音名（按钮 / 数字键）：只判音级，不判八度（孩子还没建立八度概念）
   *  - 弹/点琴键、放音符：判具体音高；octaveStrict=false 时允许同音名跨八度（默认宽容）
   *  - 快捷键（semi）：按半音类判定
   */
  function pitchAnswerOk(midi, target) {
    var strict = state.octaveStrict === true;
    if (!strict) return window.MusicFollow.pitchDiffHalf(midi, target) === 0
      || Math.abs(midi - target) <= 0.5;
    return Math.abs(midi - target) <= 0.5;
  }

  function submitAnswer(value, type) {
    if (busy || !question) return;
    var ok = type === 'idx' ? (value === answerIndexOf(question.midi))
      : type === 'midi' ? pitchAnswerOk(value, question.midi)
      : (value === question.midi % 12);
    var correctName = answerLabel(answerIndexOf(question.midi));

    if (ok) {
      busy = true;
      markCorrect(value, type);
      if (state.sound) Audio.playDing(question.midi);
      showAnswerVisual();

      var st = state.stats;
      // 口径：attempts=尝试次数（含答错），correct=答对题数，firstTry=一次答对，stars=累计星数
      st.attempts = (st.attempts || 0) + 1;   // 答错次数已在答错分支累加
      st.correct = (st.correct || 0) + 1;
      if (!usedWrong) {
        st.firstTry++;
        st.currentStreak++;
        if (st.currentStreak > st.bestStreak) st.bestStreak = st.currentStreak;
      } else {
        st.currentStreak = 0;
      }
      st.stars = (st.stars || 0) + (usedWrong ? 1 : 2);
      var cfg = activePracticeConfig();
      if (cfg.difficulty === 'full') st.fullCorrect++;
      recordAnswerStat(cfg, question.midi, true);
      save();
      gamify.updateStatsUI();
      gamify.popChip('statStars');
      if (st.currentStreak >= 5) gamify.popChip('statStreak');

      // 游戏化：每日连击 / 任务 / XP / 徽章
      gamify.ensureDaily();
      gamify.addXp(usedWrong ? 2 : 3);
      gamify.bumpTasks();
      gamify.checkBadges();

      // 课程：答对计数与过关结算
      bumpCourse();
      if (courseActive) renderCourseBanner();

      var msg = st.currentStreak >= 5 ? '🔥 连续答对 ' + st.currentStreak + ' 题！' : pick(OK_WORDS);
      if (usedWrong) msg = '答对啦！下次一次就答对更棒！';
      setFeedback('ok', msg);
      $('answerHint').textContent = usedWrong
        ? '这个音是 ' + correctName + '（刚才试错了没关系，记住它哦）'
        : '这个音是 ' + correctName + '，一次答对，好厉害！';

      if (reviewDrill) {
        reviewDrill.correct++;
        reviewDrill.remaining--;
        nextTimer = setTimeout(renderReviewQuestion, 1100);
      } else {
        nextTimer = setTimeout(renderQuestion, 1100);
      }
    } else {
      // 答错：连对立即断掉 + 计数
      usedWrong = true;
      state.stats.attempts = (state.stats.attempts || 0) + 1;
      recordAnswerStat(activePracticeConfig(), question.midi, false);
      if (state.stats.currentStreak > 0) {
        state.stats.currentStreak = 0;
        save();
        gamify.updateStatsUI();
      }
      markWrong(value, type);
      if (state.sound) Audio.playNudge();

      // 答错次数统计（max 2 次，第二次后直接揭示答案）
      wrongAttempts = (wrongAttempts || 0) + 1;
      var MAX_WRONG = 2;
      if (wrongAttempts >= MAX_WRONG) {
        // 揭示正确答案，给孩子"看见 + 听见"机会
        busy = true;
        var cn = revealAnswer();
        setFeedback('no', '答案揭晓：' + cn);
        $('answerHint').innerHTML = '正确答案已高亮并播放 🎵 ，记住它的位置，下一题继续加油！';
        // 2 秒后自动下一题（稍长一点让孩子看清）
        if (reviewDrill) {
          reviewDrill.remaining--;
          nextTimer = setTimeout(renderReviewQuestion, 2200);
        } else {
          nextTimer = setTimeout(renderQuestion, 2200);
        }
      } else {
        // 第一次答错：方向提示，鼓励再试
        setFeedback('no', '再想想～' + directionHint(value, type));
        $('answerHint').innerHTML = '还剩 <b>' + (MAX_WRONG - wrongAttempts) + '</b> 次机会，' +
          '再仔细听一听、看一看位置～';
      }
    }
  }

  /* ---------- 键盘快捷键（QWERTY 钢琴布局） ---------- */
  var KEYMAP_NAME7 = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 };
  // A=Do W=升Do S=Re E=升Re D=Mi F=Fa T=升Fa G=Sol Y=升Sol H=La U=升La J=Si
  var KEYMAP_12 = { a: 0, w: 7, s: 1, e: 8, d: 2, f: 3, t: 9, g: 4, y: 10, h: 5, u: 11, j: 6 };

  function onKeydown(e) {
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // 不抢浏览器/系统快捷键
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var k = e.key.toLowerCase();

    // 训练营：节奏打拍（空格）与视奏作答（A–J 白键）
    if (document.getElementById('page-train').classList.contains('active')) {
      if (trainTab === 'rhythm' && (k === ' ' || k === 'spacebar')) {
        e.preventDefault();
        tapRhythm();
        return;
      }
      if (trainTab === 'sight' && sightState && sightState.timer) {
        var si = KEYMAP_NAME7[k];
        if (si !== undefined) {
          e.preventDefault();
          // 键盘作答：按音名取当前目标音所在八度，保证与谱面音高一致
          var scaleMidi = [0, 2, 4, 5, 7, 9, 11][si];
          var target = sightState.page.notes[Math.min(sightState.played.length, sightState.page.notes.length - 1)];
          var octaveBase = target ? target.midi - (target.midi % 12) : 60;
          sightState.played.push(octaveBase + scaleMidi);
          updateSightProgress();
          if (sightState.played.length >= sightState.page.notes.length) finishSight();
        }
        return;
      }
      return;
    }

    var cfg = activePracticeConfig();
    if (cfg.mode === 'place') {
      if (k === 'enter' && placeMidi !== null) { e.preventDefault(); submitAnswer(placeMidi, 'midi'); }
      else if (k === 'arrowup') { e.preventDefault(); nudgePlace(1); }
      else if (k === 'arrowdown') { e.preventDefault(); nudgePlace(-1); }
      return;
    }
    if (cfg.mode === 'name') {
      var idx = cfg.difficulty === 'full' ? KEYMAP_12[k] : KEYMAP_NAME7[k];
      if (idx !== undefined) { e.preventDefault(); submitAnswer(idx, 'idx'); }
    } else {
      var semi = KEYMAP_12[k];
      if (semi !== undefined) { e.preventDefault(); submitAnswer(semi, 'semi'); }
    }
  }

  /* ---------- 学习模式 ---------- */
  var learnKeyboard = null;
  var flash = null; // { midi, accidental }

  function learnScale() {
    // random 时学习页固定用高音谱号；88 键难度音阶固定高音 C4~C6，键盘为完整 88 键
    var scaleClef = state.clef === 'random' ? 'treble' : state.clef;
    var kb;
    if (state.difficulty === 'full') {
      scaleClef = 'treble';
      kb = Core.KEYBOARD_RANGE.full;
    } else {
      kb = Core.KEYBOARD_RANGE[scaleClef];
    }
    var sr = Core.KEYBOARD_RANGE[scaleClef];
    var midis = Core.naturalsIn(sr[0], sr[1]);
    return { clef: scaleClef, midis: midis, lo: kb[0], hi: kb[1] };
  }

  /** 音符展示名（含八度，黑键带 ♯） */
  function noteNameOf(midi, isBlack) {
    if (isBlack) {
      var base = midi - 1;
      return Core.label(base, 'letter') + '\u266F' + (Math.floor(midi / 12) - 1) + '（黑键）';
    }
    return Core.label(midi, 'letter') + (Math.floor(midi / 12) - 1) + ' · ' + Core.label(midi, 'solfege');
  }

  function renderLearn() {
    var wrap = $('learnStaff');
    var prevScroll = wrap.scrollLeft;
    var sc = learnScale();
    var naming = state.naming;

    // 谱面始终使用音阶的谱号（键盘上的音无论高低都叠加显示在音阶谱面上）
    var noteClef = sc.clef;

    var gap = 56;
    var firstX = 150; // 谱号与首音符拉开距离
    var notes = [];
    // 始终保留完整音阶
    sc.midis.forEach(function (m, i) {
      // 黑键 flash 时，其 base 音符由带 ♯ 的版本替代显示
      if (flash && flash.accidental === 1 && flash.midi === m) return;
      var n = {
        midi: m, x: firstX + i * gap, label: Core.label(m, naming), labelColor: 'var(--text-2)',
        interactive: true, ariaLabel: noteNameOf(m, false)
      };
      if (flash && flash.accidental === 0 && flash.midi === m) {
        n.highlight = true;
        n.bounce = true; // 点击琴键时音符跳动
      }
      notes.push(n);
    });
    // flash 音：在音阶内 → ♯ 替代/高亮；在音阶外（如 A0/C8）→ 追加显示在音阶右侧
    var extraCount = 0;
    if (flash) {
      var idxInScale = sc.midis.indexOf(flash.midi);
      if (flash.accidental || idxInScale < 0) {
        var xPos = idxInScale >= 0 ? firstX + idxInScale * gap : firstX + sc.midis.length * gap;
        var fn = {
          midi: flash.midi, x: xPos, highlight: true, bounce: true,
          interactive: true, ariaLabel: noteNameOf(flash.midi + (flash.accidental ? 1 : 0), !!flash.accidental)
        };
        if (flash.accidental) fn.accidental = 1;
        notes.push(fn);
        extraCount = 1;
      }
    }

    var clefName = Core.CLEFS[noteClef].name;
    $('learnTitle').textContent = clefName + ' · 音阶';
    $('learnSub').textContent = '点一点音符或琴键，听一听它叫什么（' +
      (naming === 'letter' ? 'C D E 音名' : 'Do Re Mi 唱名') + '）';

    var w = firstX + (sc.midis.length + extraCount) * gap + 40;
    Staff.renderStaff(wrap, {
      clef: noteClef, width: w, className: 'learn-svg',
      notes: notes
    });
    wrap.scrollLeft = prevScroll; // 重绘后恢复横向滚动位置

    // 键盘：宽度自适应容器（88 键完整显示），白键加长更易按
    learnKeyboard = Staff.renderKeyboard($('learnKeyboard'), sc.lo, sc.hi, {
      whiteH: 250, label: '钢琴键盘（用方向键选键，回车试听）',
      marks: [{ midi: 60, label: '中央C' }],
      onKey: function (midi) {
        var isBlack = Core.midiToDia(midi) === null;
        flash = { midi: isBlack ? midi - 1 : midi, accidental: isBlack ? 1 : 0 };
        if (state.sound) Audio.playNote(midi);
        $('learnKeyInfo').textContent = noteNameOf(midi, isBlack);
        renderLearn();
        Staff.setKeyActive(learnKeyboard, midi);
      }
    });

    // 音符点击 / 键盘激活（事件委托在 staff-wrap 上）
    function activateLearnNote(g) {
      var midi = parseInt(g.dataset.midi, 10);
      var acc = parseInt(g.dataset.accidental || '0', 10);
      flash = { midi: midi, accidental: acc };
      var realMidi = midi + acc;
      if (state.sound) Audio.playNote(realMidi);
      $('learnKeyInfo').textContent = noteNameOf(realMidi, acc === 1);
      renderLearn();
      Staff.setKeyActive(learnKeyboard, realMidi);
      // 重绘后把焦点还给同一个音，方便键盘用户连续探索
      var again = wrap.querySelector('.note[data-midi="' + midi + '"][data-accidental="' + acc + '"]');
      if (again) again.focus();
    }
    wrap.onclick = function (ev) {
      var g = ev.target.closest('.note');
      if (g) activateLearnNote(g);
    };
    wrap.onkeydown = function (ev) {
      var g = ev.target.closest && ev.target.closest('.note');
      if (!g) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        activateLearnNote(g);
      }
    };
  }

  /* ---------- 设置 ---------- */

  /**
   * 统一设置一组 segmented 按钮的选中态（class + aria-pressed）。
   * @param box      容器
   * @param match    (btn) => boolean
   */
  function setSegActive(box, match) {
    if (!box) return;
    box.querySelectorAll('.seg').forEach(function (b) {
      var on = !!match(b);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function bindSeg(id, key, onDone) {
    var box = $(id);
    box.addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg) return;
      state[key] = seg.dataset.value;
      save();
      setSegActive(box, function (b) { return b === seg; });
      if (onDone) onDone();
    });
  }
  function syncSegments() {
    setSegActive($('segClef'), function (b) { return b.dataset.value === state.clef; });
    setSegActive($('segDifficulty'), function (b) { return b.dataset.value === state.difficulty; });
    setSegActive($('segNaming'), function (b) { return b.dataset.value === state.naming; });
    setSegActive($('segOctave'), function (b) { return b.dataset.value === (state.octaveStrict ? 'strict' : 'lenient'); });
    $('swSound').checked = state.sound;
    setSegActive($('segMode'), function (b) { return b.dataset.mode === state.mode; });
  }

  /* ---------- 导航 ---------- */
  function switchPage(name) {
    document.querySelectorAll('.nav-tab').forEach(function (t) {
      var on = t.dataset.page === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;   // 漫游 tabindex：整组只占一个 Tab 位
    });
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-' + name);
    });
    if (name !== 'songs') stopAllAudio();   // 离开曲谱页：停止播放、麦克风、节拍器
    if (name === 'courses') showCourseList();
    if (name === 'songs') showSongList();
    if (name === 'train') renderTrainPage();
    if (name === 'weekly') { renderChallenge(); renderWeekly(); }
  }

  // 切到后台时停止采集，避免麦克风常开与耗电
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAllAudio();
  });

  /* ---------- 跟练（唱谱 / 跟弹，实时纠错引擎） ----------
   * 与小叶子式陪练一致：不再“卡在当前音等对”，而是按起音推进，
   * 支持整曲自由速度、错音标记、漏音识别、分段循环、变速与节拍器。
   */
  var practiceSession = null; // 见 startPractice 中的结构

  var BPM_OPTIONS = [50, 60, 70, 80, 90, 100, 110, 120];

  function startPractice(song, mode) {
    if (!window.PitchDetector || !window.PitchDetector.supported()) {
      alert('🎤 需要麦克风权限才能唱谱/跟弹。\n\n• 桌面端：用 Chrome / Edge / Safari 直接打开，或运行 node server.js\n• iPad：部署到 https 网站，或在 Safari 里打开 localhost\n• 局域网 http 不支持麦克风，请用 HTTPS 部署');
      return;
    }
    stopSong();
    var quizArea = $('songQuizArea');
    if (quizArea) quizArea.style.display = 'none';
    var seqAll = window.MusicFollow.sequenceFromSong(song, 'R');
    practiceSession = {
      songId: song.id, mode: mode, hand: 'R', section: 0,
      input: state.inputSource === 'midi' && window.MidiInput && window.MidiInput.supported() ? 'midi' : 'mic',
      bpm: state.followBpm || 80,
      seq: seqAll, run: null, sections: [],
      bestCombo: 0, correctStreak: 0,
      metronome: !!state.metronome, countIn: state.countIn !== false, loop: false,
      record: state.recordOn === true, recording: false, recordingBlob: null,
      tickTimer: null, lastBeat: 0
    };
    var isPiano = mode === 'piano';
    var hasBass = !!(song.bass && song.bass.length);
    var area = $('singArea');
    area.style.display = '';
    area.innerHTML =
      '<div class="sing-head">' +
        '<span class="sing-title">' + (isPiano ? '🎹' : '🎤') + ' ' + (isPiano ? '跟弹' : '唱谱') + '：' + song.title + '</span>' +
        '<span class="sing-mic">🎙️ 实时纠错中</span>' +
      '</div>' +
      '<div class="sing-controls">' +
        '<div class="sing-hand" id="singHandSel"><span class="sing-hand-label">练哪种：</span>' +
          '<button class="seg active" data-hand="R">右手</button>' +
          (hasBass ? '<button class="seg" data-hand="L">左手</button>' : '') +
          (hasBass && isPiano ? '<button class="seg" data-hand="BOTH">🤝 双手</button>' : '') +
        '</div>' +
        '<div class="sing-hand" id="singInput"><span class="sing-hand-label">输入：</span>' +
          '<button class="seg" data-input="mic">🎤 麦克风</button>' +
          (window.MidiInput && window.MidiInput.supported()
            ? '<button class="seg" data-input="midi">🎹 MIDI 键盘</button>' : '') +
        '</div>' +
        '<div class="sing-hand" id="singSectionSel"><span class="sing-hand-label">练哪段：</span></div>' +
        '<div class="sing-hand" id="singTempo"><span class="sing-hand-label">速度：</span>' +
          '<button class="seg" data-step="-1">－</button>' +
          '<span class="sing-bpm" id="singBpm">80</span>' +
          '<button class="seg" data-step="1">＋</button>' +
          '<button class="seg" data-toggle="metronome">🥁 节拍器</button>' +
          '<button class="seg" data-toggle="countin">⏱ 预备拍</button>' +
          '<button class="seg" data-toggle="loop">🔁 循环</button>' +
          (window.MusicRecorder && window.MusicRecorder.supported()
            ? '<button class="seg" data-toggle="record">🎙 录音</button>' : '') +
        '</div>' +
      '</div>' +
      '<div id="singStaff" class="staff-wrap scroll-x sing-staff"></div>' +
      '<div class="sing-legend">' +
        '<span class="lg ok">●</span> 弹对 ' +
        '<span class="lg wrong">●</span> 弹错 ' +
        '<span class="lg missed">●</span> 漏弹 ' +
        '<span class="lg now">●</span> 当前' +
      '</div>' +
      '<div class="sing-status" id="singStatus">' + (isPiano ? '开始弹吧～' : '开始唱吧～') + '</div>' +
      '<div class="sing-meter" id="singMeterWrap"><div class="sing-meter-inner" id="singMeter"></div></div>' +
      '<div class="sing-progress" id="singProgress"></div>' +
      '<div class="sing-actions">' +
        '<button class="action-btn ghost" id="singDemoBtn">▶ 先听一遍</button>' +
        '<button class="action-btn ghost" id="singHintBtn">🔊 听这个音</button>' +
        '<button class="action-btn ghost" id="singStopBtn">⏹ 结束并看报告</button>' +
      '</div>';

    $('singHandSel').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg || !practiceSession) return;
      practiceSession.hand = seg.dataset.hand;
      setSegActive($('singHandSel'), function (b) { return b === seg; });
      rebuildFollowRun();
      startDetector();
      renderPracticeView();
    });
    $('singInput').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg || !practiceSession) return;
      practiceSession.input = seg.dataset.input;
      state.inputSource = seg.dataset.input;
      save();
      setSegActive($('singInput'), function (b) { return b === seg; });
      startDetector();
      renderPracticeView();
    });
    $('singSectionSel').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg || !practiceSession) return;
      practiceSession.section = parseInt(seg.dataset.sec, 10);
      setSegActive($('singSectionSel'), function (b) { return b === seg; });
      rebuildFollowRun();
      renderPracticeView();
    });
    $('singTempo').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg || !practiceSession) return;
      if (seg.dataset.step) {
        var idx = BPM_OPTIONS.indexOf(practiceSession.bpm);
        if (idx < 0) idx = BPM_OPTIONS.indexOf(80);
        idx = Math.max(0, Math.min(BPM_OPTIONS.length - 1, idx + parseInt(seg.dataset.step, 10)));
        practiceSession.bpm = BPM_OPTIONS[idx];
        state.followBpm = practiceSession.bpm;
        save();
        $('singBpm').textContent = practiceSession.bpm;
        if (practiceSession.run) practiceSession.run.bpm = practiceSession.bpm;
        if (practiceSession.metronome) startMetronome();
      } else if (seg.dataset.toggle === 'metronome') {
        practiceSession.metronome = !practiceSession.metronome;
        state.metronome = practiceSession.metronome;
        save();
        seg.setAttribute('aria-pressed', practiceSession.metronome ? 'true' : 'false');
        seg.classList.toggle('active', practiceSession.metronome);
        if (practiceSession.metronome) startMetronome(); else stopMetronome();
      } else if (seg.dataset.toggle === 'countin') {
        practiceSession.countIn = !practiceSession.countIn;
        state.countIn = practiceSession.countIn;
        save();
        seg.setAttribute('aria-pressed', practiceSession.countIn ? 'true' : 'false');
        seg.classList.toggle('active', practiceSession.countIn);
      } else if (seg.dataset.toggle === 'record') {
        practiceSession.record = !practiceSession.record;
        state.recordOn = practiceSession.record;
        save();
        seg.setAttribute('aria-pressed', practiceSession.record ? 'true' : 'false');
        seg.classList.toggle('active', practiceSession.record);
        if (practiceSession.record) startRecording();
        else stopRecording();
      } else if (seg.dataset.toggle === 'loop') {
        practiceSession.loop = !practiceSession.loop;
        seg.setAttribute('aria-pressed', practiceSession.loop ? 'true' : 'false');
        seg.classList.toggle('active', practiceSession.loop);
        if (practiceSession.run) practiceSession.run.loop = practiceSession.loop;
      }
    });
    $('singDemoBtn').addEventListener('click', function () { playSong(song); });
    $('singHintBtn').addEventListener('click', function () { playTargetNote(); });
    $('singStopBtn').addEventListener('click', function () { stopPractice(true); });

    setSegActive($('singInput'), function (b) { return b.dataset.input === practiceSession.input; });
    setSegActive($('singTempo'), function (b) {
      var t = b.dataset.toggle;
      if (t === 'metronome') return practiceSession.metronome;
      if (t === 'countin') return practiceSession.countIn;
      if (t === 'record') return practiceSession.record;
      if (t === 'loop') return practiceSession.loop;
      return false;
    });
    $('singBpm').textContent = practiceSession.bpm;
    rebuildFollowRun();
    renderPracticeView();
    if (practiceSession.countIn) {
      runCountIn(function () {
        if (!practiceSession) return;
        startDetector();
        if (practiceSession.metronome) startMetronome();
        if (practiceSession.record) startRecording();
      });
    } else {
      startDetector();
      if (practiceSession.metronome) startMetronome();
      if (practiceSession.record) startRecording();
    }
  }

  /**
   * 预备拍：一小节（4 拍）倒计时，期间不采集、不计分。
   * 与节拍器共用速度；第 1 拍重音。
   */
  function runCountIn(done) {
    var beats = 4;
    var i = 0;
    var period = 60000 / (practiceSession.bpm || 80);
    var status = $('singStatus');
    var prog = $('singProgress');
    if (status) status.textContent = '⏱ 预备… 4';
    function tick() {
      if (!practiceSession) return;
      var strong = i === 0;
      if (state.sound) Audio.playNote(strong ? 84 : 79, { dur: 0.12, vel: strong ? 0.4 : 0.22 });
      i++;
      if (status) {
        if (i <= beats) status.textContent = '⏱ 预备… ' + (beats - i + 1);
        else status.textContent = '🎹 开始！';
      }
      if (prog) {
        prog.classList.toggle('beat-strong', strong);
        setTimeout(function () { if (prog) prog.classList.remove('beat-strong'); }, 120);
      }
      if (i > beats) {
        practiceSession.countInTimer = null;
        if (done) done();
        return;
      }
      practiceSession.countInTimer = setTimeout(tick, period);
    }
    tick();
  }

  /** 重新构造练习序列（换手 / 换段 / 换曲后调用） */
  function rebuildFollowRun() {
    var s = songById(practiceSession.songId);
    if (!s) return;
    var seqAll = window.MusicFollow.sequenceFromSong(s, practiceSession.hand);
    practiceSession.seq = seqAll;
    practiceSession.sections = window.MusicFollow.segments(seqAll, 4, 4);
    if (practiceSession.section >= practiceSession.sections.length) practiceSession.section = 0;
    var sec = practiceSession.sections[practiceSession.section] || practiceSession.sections[0];
    practiceSession.run = window.MusicFollow.createRun({
      seq: seqAll,
      start: sec.start,
      end: sec.end,
      mode: 'evaluate',          // 整曲实时纠错：弹错也继续，不卡住孩子
      bpm: practiceSession.bpm,
      loop: practiceSession.loop,
      tolerance: 0.5,
      octave: true
    });
    renderSectionButtons();
  }

  function renderSectionButtons() {
    var box = $('singSectionSel');
    if (!box) return;
    box.innerHTML = '<span class="sing-hand-label">练哪段：</span>';
    practiceSession.sections.forEach(function (sec, i) {
      var b = document.createElement('button');
      b.className = 'seg' + (i === practiceSession.section ? ' active' : '');
      b.dataset.sec = i;
      b.textContent = sec.label;
      box.appendChild(b);
    });
  }

  /** 启动/重启输入源（MIDI 键盘优先，否则麦克风；双手用复音模式） */
  function startDetector() {
    window.PitchDetector.stop();
    if (practiceSession && practiceSession.midiTick) {
      clearInterval(practiceSession.midiTick);
      practiceSession.midiTick = null;
    }
    if (window.MidiInput) window.MidiInput.disconnect();
    if (!practiceSession) return;
    var duo = practiceSession.hand === 'BOTH';

    // ---- MIDI 键盘：音高精确，和弦直接给全，不需要复音检测 ----
    if (practiceSession.input === 'midi' && window.MidiInput && window.MidiInput.supported()) {
      practiceSession.held = [];
      // MIDI 是“事件”而不是“每帧采样”：按下后持续重发，才能满足引擎 55ms 的稳定判定
      var midiTick = setInterval(function () {
        if (!practiceSession || !practiceSession.held || !practiceSession.held.length) return;
        onFollowMidi(collectionSnapshot(practiceSession));
      }, 25);
      practiceSession.midiTick = midiTick;
      window.MidiInput.connect({
        onNote: function (midi) {
          if (!practiceSession) return;
          practiceSession.held = practiceSession.held || [];
          if (practiceSession.held.indexOf(midi) < 0) practiceSession.held.push(midi);
          practiceSession.held.sort(function (a, b) { return a - b; });
          onFollowMidi(collectionSnapshot(practiceSession));
        },
        onNoteOff: function (midi) {
          if (!practiceSession || !practiceSession.held) return;
          var k = practiceSession.held.indexOf(midi);
          if (k >= 0) practiceSession.held.splice(k, 1);
          if (!practiceSession.held.length) onFollowMidi(null);
        },
        onDevices: function (names) {
          var st = $('singStatus');
          if (st && names.length) st.textContent = '🎹 已连接：' + names.join('、');
          renderPracticeView();
        },
        onError: function (err) {
          practiceSession.input = 'mic';
          var st = $('singStatus');
          if (st) {
            st.textContent = err === 'nodevice'
              ? '🎹 没有检测到 MIDI 键盘，已切换到麦克风。'
              : '⚠️ MIDI 连接失败（' + err + '），已切换到麦克风。';
          }
          startDetector();
        }
      });
      return;
    }

    // ---- 麦克风 ----
    function handler(midi) { onFollowPitch(midi); }
    handler.__duo = function (d) { onFollowDuo(d); };
    window.PitchDetector.start(handler, function (err) {
      if (practiceSession) practiceSession.micFailed = true;
      var st = $('singStatus');
      if (!st) return;
      if (err === 'unsupported') {
        st.innerHTML = '⚠️ 此环境不支持麦克风（需 https:// 或 localhost）<br>' +
          '<span class="sing-help">iPad 局域网 http 不支持，部署后可练；' +
          '桌面端请直接双击 <code>index.html</code> 或用 <code>node server.js</code> 启动。' +
          (window.MidiInput && window.MidiInput.supported() ? '<br>有电钢琴的话可以改用「🎹 MIDI 键盘」输入。' : '') +
          '</span>';
      } else if (err === 'denied' || err === 'SecurityError') {
        st.innerHTML = '🔒 麦克风被拒了，请在浏览器里允许：<br>' +
          '<span class="sing-help">' +
          '<b>iOS Safari</b>：设置 → Safari → 麦克风 → 允许此网站<br>' +
          '<b>Chrome / Edge</b>：地址栏左侧 🔒 图标 → 麦克风 → 允许<br>' +
          '然后点「🔁 再来一次」重新开始。</span>';
      } else if (err === 'notfound') {
        st.innerHTML = '🎤 没找到麦克风设备，请确认麦克风已连接。';
      } else {
        st.innerHTML = '⚠️ 麦克风启动失败（' + (err || '未知错误') + '），可刷新页面再试。';
      }
      renderPracticeView();
    }, duo ? { mode: 'duo' } : {});
  }

  /** MIDI 按下音集合 → 喂给引擎（单音给数字，和弦给数组） */
  function collectionSnapshot(session) {
    var held = session.held || [];
    if (!held.length) return null;
    return held.length === 1 ? held[0] : held.slice();
  }

  /** MIDI 输入统一入口：与麦克风共用同一套跟练引擎 */
  function onFollowMidi(input) {
    if (!practiceSession || !practiceSession.run) return;
    updateMeter(typeof input === 'number' ? input : null, currentTargetMidi());
    var ev = window.MusicFollow.feed(practiceSession.run, input, Date.now());
    if (ev) handleFollowEvent(ev);
    if (practiceSession.run.finished) finishPractice();
  }

  /* ---------- 录音回放 ---------- */
  /** 开始录音：复用麦克风流；MIDI 输入没有音频流，提示不可录 */
  function startRecording() {
    if (!practiceSession || !window.MusicRecorder) return;
    // 录音复用麦克风流：若还没启动检测，先启动一次（有预备拍时会在预备拍结束后启动）
    if (window.PitchDetector && window.PitchDetector.currentStream &&
        !window.PitchDetector.currentStream() && !practiceSession.countInTimer) {
      startDetector();
    }
    if (practiceSession.input === 'midi') {
      var st0 = $('singStatus');
      if (st0) st0.textContent = '🎹 MIDI 输入没有音频流，无法录音（切回麦克风即可）。';
      practiceSession.record = false;
      var seg = $('singTempo') && $('singTempo').querySelector('[data-toggle="record"]');
      if (seg) { seg.classList.remove('active'); seg.setAttribute('aria-pressed', 'false'); }
      return;
    }
    var stream = window.PitchDetector && window.PitchDetector.currentStream
      ? window.PitchDetector.currentStream() : null;
    if (!stream) {
      // 麦克风流尚未就绪（getUserMedia 异步）：最多等 3 秒再放弃
      practiceSession.recWait = (practiceSession.recWait || 0) + 1;
      if (practiceSession.recWait <= 10) {
        setTimeout(function () {
          if (practiceSession && practiceSession.record && !practiceSession.recording) startRecording();
        }, 300);
      } else {
        practiceSession.record = false;
        var seg2 = $('singTempo') && $('singTempo').querySelector('[data-toggle="record"]');
        if (seg2) { seg2.classList.remove('active'); seg2.setAttribute('aria-pressed', 'false'); }
        var st2 = $('singStatus');
        if (st2) st2.textContent = '🎙 录音启动失败（麦克风未就绪），本次不录音。';
      }
      return;
    }
    practiceSession.recWait = 0;
    var ok = window.MusicRecorder.start(stream, {
      onStop: function (blob, ms) {
        if (!practiceSession) return;
        practiceSession.recording = false;
        practiceSession.recordingBlob = blob;
        practiceSession.recordingMs = ms;
      },
      onError: function () {
        if (practiceSession) practiceSession.record = false;
      }
    });
    practiceSession.recording = !!ok;
  }

  function stopRecording() {
    if (window.MusicRecorder) window.MusicRecorder.stop();
    if (practiceSession) practiceSession.recording = false;
  }

  /* ---------- 节拍器 ---------- */
  function startMetronome() {
    if (!practiceSession) return;
    stopMetronome();
    practiceSession.beatCount = 0;
    beatTick();
    var period = 60000 / practiceSession.bpm;
    practiceSession.tickTimer = setInterval(beatTick, period);
  }
  function beatTick() {
    if (!practiceSession || !practiceSession.metronome) return;
    var strong = practiceSession.beatCount % 4 === 0;
    practiceSession.beatCount++;
    if (state.sound) {
      Audio.playNote(strong ? 84 : 79, { dur: 0.12, vel: strong ? 0.35 : 0.2 });
    }
    var prog = $('singProgress');
    if (prog) {
      prog.classList.toggle('beat-strong', strong);
      setTimeout(function () { if (prog) prog.classList.remove('beat-strong'); }, 120);
    }
  }
  function stopMetronome() {
    if (practiceSession && practiceSession.countInTimer) {
      clearTimeout(practiceSession.countInTimer);
      practiceSession.countInTimer = null;
    }
    if (practiceSession && practiceSession.tickTimer) {
      clearInterval(practiceSession.tickTimer);
      practiceSession.tickTimer = null;
    }
  }

  /* ---------- 实时反馈 ---------- */
  function onFollowPitch(midi) {
    if (!practiceSession || !practiceSession.run) return;
    if (practiceSession.hand === 'BOTH') return;
    updateMeter(midi, currentTargetMidi());
    var ev = window.MusicFollow.feed(practiceSession.run, midi, Date.now());
    if (ev) handleFollowEvent(ev);
    else if (midi == null) {
      var st = $('singStatus');
      if (st && practiceSession.mode === 'piano') st.textContent = '🎹 弹出来呀～';
    }
    if (practiceSession.run.finished) finishPractice();
  }

  function onFollowDuo(d) {
    if (!practiceSession || practiceSession.hand !== 'BOTH' || !practiceSession.run) return;
    var chord = [];
    if (d && d.low) chord.push(d.low.midi);
    if (d && d.high) chord.push(d.high.midi);
    var ev = window.MusicFollow.feed(practiceSession.run, chord.length ? chord : null, Date.now());
    if (ev) handleFollowEvent(ev);
    if (practiceSession.run.finished) finishPractice();
  }

  function currentTargetMidi() {
    if (!practiceSession || !practiceSession.run) return null;
    var t = practiceSession.run.seq[practiceSession.run.index];
    return t && t.midis.length ? t.midis[t.midis.length - 1] : null;
  }

  function updateMeter(midi, target) {
    var meter = $('singMeter');
    if (!meter) return;
    if (midi == null || target == null) { meter.style.left = '50%'; return; }
    var dd = window.PitchDetector.pitchDiffHalf(midi, target);
    meter.style.left = Math.max(6, Math.min(94, 50 + dd * 6)) + '%';
  }

  function midiName(m) {
    return noteNameOf(m, Core.midiToDia(m) === null);
  }

  /** 处理一次起音事件：更新 UI、播放反馈音、推进视图 */
  function handleFollowEvent(ev) {
    var st = $('singStatus');
    var run = practiceSession.run;
    if (ev.kind === 'hit') {
      practiceSession.correctStreak++;
      if (practiceSession.correctStreak > practiceSession.bestCombo) practiceSession.bestCombo = practiceSession.correctStreak;
      if (st) {
        var timing = ev.timing;
        var rhythmWord = '';
        if (timing && !timing.first) {
          if (timing.ratio < 0.75) rhythmWord = '（有点抢拍）';
          else if (timing.ratio > 1.35) rhythmWord = '（有点拖拍）';
        }
        st.textContent = '✅ 对啦！' + rhythmWord +
          (practiceSession.correctStreak >= 3 ? ' 连对 ' + practiceSession.correctStreak + ' 个 🔥' : '');
      }
      if (state.sound) Audio.playDing(ev.midis[ev.midis.length - 1]);
    } else if (ev.kind === 'wrong') {
      practiceSession.correctStreak = 0;
      if (st) {
        var t = run.seq[ev.i];
        st.textContent = '❌ 这里应该是 ' + t.midis.map(midiName).join(' + ') + '，继续往下弹～';
      }
      if (state.sound) Audio.playNudge();
    } else if (ev.kind === 'missed') {
      practiceSession.correctStreak = 0;
      if (st) {
        var tm = run.seq[ev.i];
        st.textContent = '⏭ 漏掉了一个音（' + tm.midis.map(midiName).join(' + ') + '），没关系～';
      }
    }
    renderPracticeView();
  }

  function playTargetNote() {
    if (!practiceSession || !state.sound) return;
    var m = currentTargetMidi();
    if (m != null) Audio.playNote(m, { dur: 1.2 });
  }

  /* ---------- 谱面视图 ---------- */
  function renderPracticeView() {
    if (!practiceSession || !practiceSession.run) return;
    var run = practiceSession.run;
    var wrap = $('singStaff');
    var meterWrap = $('singMeterWrap');
    if (meterWrap) {
      // 麦克风未启用（或双手模式）时不显示音准条，避免一条彩条让人误解
      var showMeter = practiceSession.hand !== 'BOTH' && !practiceSession.micFailed;
      meterWrap.style.display = showMeter ? '' : 'none';
    }

    var clef = practiceSession.hand === 'L' ? 'bass' : 'treble';
    var notes = run.seq.map(function (n, i) {
      var nn = { midi: n.midis[n.midis.length - 1], dur: n.beats, x: 70 + (i - run.start) * 34 };
      if (n.midis.length > 1) nn.chord = n.midis.slice(0, -1); // 双手时低音作为和弦
      if (run.wrong[i]) nn.wrong = true;
      else if (run.missed[i]) nn.missed = true;
      else if (i < run.index) nn.ok = true;
      if (i === run.index && !run.finished) { nn.highlight = true; nn.bounce = true; }
      return nn;
    });
    var w = 70 + (run.end - run.start) * 34 + 40;
    Staff.renderStaff(wrap, { clef: clef, width: w, notes: notes, scroll: true });
    var svg = wrap.querySelector('svg');
    if (svg && run.index > run.start) {
      var pct = (run.index - run.start) / Math.max(1, run.end - run.start);
      wrap.scrollLeft = Math.max(0, pct * wrap.scrollWidth - wrap.clientWidth / 2);
    }

    var prog = $('singProgress');
    if (prog) {
      var sum = window.MusicFollow.summary(run);
      prog.textContent = '第 ' + Math.min(run.index - run.start + 1, run.end - run.start) + ' / ' + (run.end - run.start) + ' 个音' +
        ' ｜ 弹对 ' + sum.hits +
        (sum.wrongNotes ? ' ｜ 错音 ' + sum.wrongNotes : '') +
        (sum.missed ? ' ｜ 漏音 ' + sum.missed : '') +
        (practiceSession.loop ? ' ｜ 🔁 循环中' : '');
    }
  }

  /* ---------- 结算 ---------- */
  function finishPractice() {
    if (!practiceSession) return;
    stopMetronome();
    // 录音停止是异步的（ondataavailable → onstop），稍等再出报告
    if (practiceSession.recording) {
      practiceSession.recording = false;
      if (window.MusicRecorder) window.MusicRecorder.stop();
      setTimeout(function () { if (practiceSession) renderPracticeReport(); }, 350);
      return;
    }
    renderPracticeReport();
  }

  /** 生成跟练报告（拆出来是为了等录音落盘） */
  function renderPracticeReport() {
    if (!practiceSession) return;
    if (practiceSession.midiTick) { clearInterval(practiceSession.midiTick); practiceSession.midiTick = null; }
    if (practiceSession.countInTimer) { clearTimeout(practiceSession.countInTimer); practiceSession.countInTimer = null; }
    window.PitchDetector.stop();
    if (window.MidiInput) window.MidiInput.disconnect();
    var run = practiceSession.run;
    var sum = window.MusicFollow.summary(run);
    var mode = practiceSession.mode;
    var songId = practiceSession.songId;
    var bestCombo = practiceSession.bestCombo;
    var rh = sum.rhythm;
    var wrongList = Object.keys(run.wrong).map(function (k) { return Number(k) - run.start + 1; });
    var missedList = Object.keys(run.missed).map(function (k) { return Number(k) - run.start + 1; });
    var stars = sum.stars;
    if (sum.hits < sum.total) stars = Math.min(stars, 2);
    var completed = sum.hits >= sum.total;   // 是否弹完整段
    var comment = !completed ? '这次练了 ' + sum.hits + ' / ' + sum.total + ' 个音，继续加油～💪'
      : stars === 3 ? '完美！节奏和音准都棒！🎉'
      : stars === 2 ? '很棒！再稳一点就满星啦～🌟'
      : '没关系，慢一点再来一次～💪';
    var rhythmLine = rh.hasData
      ? '节奏：准确 ' + rh.accuracy + '%（抢拍 ' + rh.early + ' 次、拖拍 ' + rh.late + ' 次，整体速度 ' + rh.tempoRatio + '×）'
      : '节奏：本次没有足够的对比数据';

    var area = $('singArea');
    area.innerHTML =
      '<div class="sing-done">' +
        '<div class="sing-done-emoji">🎉</div>' +
        '<div class="sing-done-title">' + (completed ? '练完啦！' : '本次练习') + '</div>' +
        '<div class="sing-done-stars">' + starRow(stars) + '</div>' +
        '<div class="sing-report">' +
          '<div class="report-row"><span>音准</span><b>' + sum.pitchAccuracy + '%</b>' +
            '<i class="report-bar"><i style="width:' + sum.pitchAccuracy + '%"></i></i></div>' +
          '<div class="report-row"><span>节奏</span><b>' + (rh.hasData ? rh.accuracy + '%' : '—') + '</b>' +
            '<i class="report-bar"><i style="width:' + (rh.hasData ? rh.accuracy : 0) + '%"></i></i></div>' +
          '<div class="report-row"><span>完整</span><b>' + sum.hits + '/' + sum.total + '</b>' +
            '<i class="report-bar"><i style="width:' + Math.round(sum.hits / Math.max(1, sum.total) * 100) + '%"></i></i></div>' +
        '</div>' +
        '<div class="sing-done-rate">' + sum.total + ' 个音 ｜ 错音 ' + sum.wrongNotes + ' 处 ｜ 漏音 ' + sum.missed +
          ' 处 ｜ 最高连对 ' + bestCombo + '</div>' +
        '<div class="sing-done-rate">' + rhythmLine + '</div>' +
        (wrongList.length ? '<div class="sing-done-wrong">错音位置：第 ' + wrongList.join('、') + ' 个音</div>' : '') +
        (missedList.length ? '<div class="sing-done-wrong">漏音位置：第 ' + missedList.join('、') + ' 个音</div>' : '') +
        '<div class="sing-done-comment">' + comment + '</div>' +
        (practiceSession.recordingBlob ? renderRecordingBlock(practiceSession) : '') +
        '<div class="sing-actions"><button class="action-btn" id="singAgainBtn">🔁 再来一次</button>' +
        '<button class="action-btn ghost" id="singCloseBtn">关闭</button></div>' +
      '</div>';
    var recPlay = $('recPlayBtn');
    var recAudio = $('recAudio');
    if (recPlay && recAudio) {
      recPlay.addEventListener('click', function () {
        if (!recAudio.src) return;
        if (recAudio.paused) {
          var pr = recAudio.play();
          if (pr && pr.catch) pr.catch(function () {});
          recPlay.textContent = '⏸ 暂停';
        } else {
          recAudio.pause();
          recPlay.textContent = '▶ 回放录音';
        }
      });
      recAudio.addEventListener('ended', function () { recPlay.textContent = '▶ 回放录音'; });
    }
    var recDel = $('recDelBtn');
    if (recDel) recDel.addEventListener('click', function () {
      if (window.MusicRecorder) window.MusicRecorder.clear();
      var blk = $('recBlock');
      if (blk) blk.remove();
    });
    $('singAgainBtn').addEventListener('click', function () {
      if (window.MusicRecorder) window.MusicRecorder.clear();
      var s = songById(songId);
      if (s) startPractice(s, mode);
    });
    $('singCloseBtn').addEventListener('click', function () {
      $('singArea').style.display = 'none';
    });
    recordFollowResult(sum, stars);
    if (state.sound) Audio.playDing(72);
  }

  /** 报告里的录音回放块（只在本次真的录到音频时出现） */
  function renderRecordingBlock(session) {
    if (!window.MusicRecorder || !window.MusicRecorder.hasClip()) return '';
    var url = window.MusicRecorder.clipUrl();
    var sec = Math.round((session.recordingMs || 0) / 1000);
    var kb = window.MusicRecorder.sizeKB();
    return '<div class="rec-block" id="recBlock">' +
      '<div class="rec-head">🎙 本次录音 <span class="rec-meta">' + sec + ' 秒 ｜ ' + kb + ' KB ｜ 只存在本机内存</span></div>' +
      (url ? '<audio id="recAudio" src="' + url + '" preload="auto"></audio>'
           : '<p class="rec-meta">当前浏览器不支持回放，录音已保存但无法预览。</p>') +
      '<div class="rec-actions">' +
        '<button class="action-btn ghost" id="recPlayBtn">▶ 回放录音</button>' +
        '<button class="text-btn" id="recDelBtn">删除录音</button>' +
      '</div>' +
    '</div>';
  }

  /** 跟练结果计入统计 / XP / 任务 / 徽章 */
  function recordFollowResult(sum, stars) {
    var st = state.stats;
    st.followRuns = (st.followRuns || 0) + 1;
    st.followStars = (st.followStars || 0) + stars;
    if (sum.pitchAccuracy >= 90) st.followPerfect = (st.followPerfect || 0) + 1;
    save();
    if (gamify) {
      gamify.addXp(3 + stars);
      gamify.bumpTasks();
      gamify.checkBadges();
      gamify.updateStatsUI();
    }
  }

  function stopPractice(showResult) {
    if (showResult && practiceSession && practiceSession.run && practiceSession.run.events.length > 0) {
      finishPractice();
    } else {
      stopMetronome();
      if (practiceSession && practiceSession.recording) stopRecording();
      if (practiceSession && practiceSession.midiTick) { clearInterval(practiceSession.midiTick); practiceSession.midiTick = null; }
      window.PitchDetector.stop();
      if (window.MidiInput) window.MidiInput.disconnect();
      practiceSession = null;
      $('singArea').style.display = 'none';
    }
  }

  /** 离开曲谱页 / 切后台时统一清理：停止播放、麦克风、节拍器 */
  function stopAllAudio() {
    stopSong();
    stopMetronome();
    if (practiceSession && practiceSession.countInTimer) {
      clearTimeout(practiceSession.countInTimer);
      practiceSession.countInTimer = null;
    }
    if (practiceSession && practiceSession.midiTick) {
      clearInterval(practiceSession.midiTick);
      practiceSession.midiTick = null;
    }
    if (window.PitchDetector) window.PitchDetector.stop();
    if (window.MidiInput) window.MidiInput.disconnect();
    if (window.MusicRecorder) window.MusicRecorder.clear();
  }

  var currentSongId = null;
  var songSpeed = 1; // 播放速度：0.6 慢 / 1 中 / 1.4 快
  var songPlayRange = null; // { start, end } 分段播放范围
  var songPlaying = false;
  var songTimer = null;
  var songQuiz = null; // { midi, idx, hasSharp }

  function allSongs() {
    return window.SongData.SONGS.concat(window.LibraryData ? window.LibraryData.LIBRARY : []);
  }
  function songById(id) {
    var found = null;
    allSongs().forEach(function (s) { if (s.id === id) found = s; });
    return found;
  }

  function renderSongList() {
    var box = $('songList');
    box.innerHTML = '';
    var groups = [{ name: '经典儿歌', items: window.SongData.SONGS }];
    if (window.LibraryData) {
      var byBook = {};
      window.LibraryData.LIBRARY.forEach(function (s) {
        (byBook[s.book] = byBook[s.book] || []).push(s);
      });
      Object.keys(byBook).forEach(function (b) {
        groups.push({ name: '教材 · ' + b, items: byBook[b] });
      });
    }
    groups.forEach(function (g) {
      var head = document.createElement('div');
      head.className = 'song-group-head';
      head.innerHTML = '<span>' + g.name + '</span><span class="song-group-count">' + g.items.length + ' 首</span>';
      box.appendChild(head);
      g.items.forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'song-item';
        item.innerHTML =
          '<div class="song-ico">🎵</div>' +
          '<div class="song-info">' +
            '<div class="song-title">' + s.title + '</div>' +
            '<div class="song-meta">' + s.origin + ' ｜ ' + s.level + ' ｜ ' + s.key +
              (s.bass ? ' ｜ 🤝 可双手' : '') + '</div>' +
          '</div>' +
          '<div class="song-status">▶ 打开</div>';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', s.title + '，' + s.level + '，' + s.key + '，打开');
        item.addEventListener('click', function () { renderSongDetail(s.id); });
        item.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); renderSongDetail(s.id); }
        });
        box.appendChild(item);
      });
    });
  }

  function showSongList() {
    stopSong();
    if (window.PitchDetector) window.PitchDetector.stop();
    practiceSession = null;
    currentSongId = null;
    $('songDetail').style.display = 'none';
    $('songList').style.display = '';
    renderSongList();
  }

  function renderSongDetail(id) {
    var s = songById(id);
    if (!s) return;
    currentSongId = id;
    $('songList').style.display = 'none';
    var d = $('songDetail');
    d.style.display = '';
    var hasSharp = window.SongData.songHasSharp(s);
    d.innerHTML =
      '<div class="card">' +
        '<button class="text-btn" id="backToSongs">← 返回曲库</button>' +
        '<div class="song-detail-head">' +
          '<span class="song-detail-ico">🎵</span>' +
          '<div><div class="song-title">' + s.title + '</div>' +
          '<div class="song-meta">' + s.origin + ' ｜ ' + s.level + ' ｜ ' + s.key + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="card song-score-card">' +
        '<div id="songScore" class="staff-wrap scroll-x"></div>' +
        '<div class="song-actions">' +
          '<button class="action-btn" id="songPlayBtn">▶ 播放旋律</button>' +
          '<button class="action-btn ghost" id="songQuizBtn">🎯 找音练习</button>' +
          (window.PitchDetector && window.PitchDetector.supported()
            ? '<button class="action-btn ghost" id="songSingBtn">🎤 唱谱练习</button>' +
              '<button class="action-btn ghost" id="songPianoBtn">🎹 跟弹练习</button>' : '') +
        '</div>' +
        '<div class="song-speed" id="songSpeedSel">播放速度：' +
          '<button class="seg" data-sp="0.6">🐢 慢</button>' +
          '<button class="seg active" data-sp="1">▶ 中</button>' +
          '<button class="seg" data-sp="1.4">🐇 快</button>' +
        '</div>' +
        '<div class="song-speed" id="songSectionSel"><span>分段播放：</span></div>' +
        '<div id="singArea" class="sing-area" style="display:none"></div>' +
        '<div id="songQuizArea" class="song-quiz" style="display:none">' +
          '<p class="answer-title">谱上闪动的这个音是？（' + (hasSharp ? '12 个选项，含黑键' : '7 个选项') + '）</p>' +
          '<div id="songAnswerBtns" class="answer-grid cols-' + (hasSharp ? 12 : 7) + '"></div>' +
          '<p id="songQuizHint" class="answer-hint"></p>' +
        '</div>' +
      '</div>';
    $('backToSongs').addEventListener('click', showSongList);
    $('songPlayBtn').addEventListener('click', function () { playSong(s); });
    $('songQuizBtn').addEventListener('click', function () { startSongQuiz(s); });
    var singBtn = $('songSingBtn');
    if (singBtn) singBtn.addEventListener('click', function () { startPractice(s, 'sing'); });
    var pianoBtn = $('songPianoBtn');
    if (pianoBtn) pianoBtn.addEventListener('click', function () { startPractice(s, 'piano'); });
    var spSel = $('songSpeedSel');
    if (spSel) {
      spSel.querySelectorAll('.seg').forEach(function (b) {
        b.classList.toggle('active', parseFloat(b.dataset.sp) === songSpeed);
        b.setAttribute('aria-pressed', parseFloat(b.dataset.sp) === songSpeed ? 'true' : 'false');
      });
      spSel.addEventListener('click', function (ev) {
        var seg = ev.target.closest('.seg');
        if (!seg) return;
        songSpeed = parseFloat(seg.dataset.sp);
        setSegActive(spSel, function (b) { return b === seg; });
      });
    }
    songPlayRange = { start: 0, end: s.notes.length };
    renderSongSections(s);
    renderSongScore(s, null);
  }

  /** 分段播放按钮：按 4 小节切分 */
  function renderSongSections(s) {
    var box = $('songSectionSel');
    if (!box) return;
    var seq = window.MusicFollow.sequenceFromSong(s, 'R');
    var segs = window.MusicFollow.segments(seq, 4, 4);
    box.innerHTML = '<span>分段播放：</span>';
    segs.forEach(function (sec, i) {
      var b = document.createElement('button');
      b.className = 'seg' + (i === 0 ? ' active' : '');
      b.dataset.start = sec.start;
      b.dataset.end = sec.end;
      b.textContent = sec.label;
      box.appendChild(b);
    });
    box.addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg) return;
      setSegActive(box, function (b) { return b === seg; });
      songPlayRange = { start: parseInt(seg.dataset.start, 10), end: parseInt(seg.dataset.end, 10) };
      renderSongScore(s, null);
    });
  }

  function renderSongScore(s, highlightIdx) {
    var box = $('songScore');
    if (!box) return;
    var range = songPlayRange || { start: 0, end: s.notes.length };
    var notes = s.notes.map(function (n, i) {
      var nn = { midi: n[0], dur: n[1], x: 70 + i * 34 };
      if (i === highlightIdx) { nn.highlight = true; nn.bounce = true; }
      else if (i < range.start || i >= range.end) nn.dim = true;   // 非当前段落变淡
      return nn;
    });
    var w = 70 + s.notes.length * 34 + 40;
    Staff.renderStaff(box, { clef: s.clef || 'treble', width: w, notes: notes, scroll: true });
    // 播放时跟随滚动到当前音
    if (highlightIdx != null) {
      var svg = box.querySelector('svg');
      if (svg) {
        var ratio = highlightIdx / Math.max(1, s.notes.length);
        box.scrollLeft = Math.max(0, ratio * box.scrollWidth - box.clientWidth / 2);
      }
    }
  }

  function playSong(s) {
    if (songPlaying) { stopSong(); return; }
    songPlaying = true;
    var btn = $('songPlayBtn');
    if (btn) btn.textContent = '⏹ 停止';
    var range = songPlayRange || { start: 0, end: s.notes.length };
    var i = range.start;
    var bpm = 500 / songSpeed; // 每拍毫秒（受速度档控制）
    function step() {
      if (!songPlaying || i >= Math.min(range.end, s.notes.length)) { stopSong(); return; }
      var n = s.notes[i];
      if (state.sound) Audio.playNote(n[0], { dur: Math.max(0.5, n[1] * 0.55) });
      if ($('songScore')) renderSongScore(s, i);
      songTimer = setTimeout(step, n[1] * bpm);
      i++;
    }
    step();
  }

  function stopSong() {
    songPlaying = false;
    if (songTimer) { clearTimeout(songTimer); songTimer = null; }
    var btn = $('songPlayBtn');
    if (btn) btn.textContent = '▶ 播放旋律';
  }

  function startSongQuiz(s) {
    stopSong();
    var hasSharp = window.SongData.songHasSharp(s);
    $('songQuizArea').style.display = '';
    var idx = Math.floor(Math.random() * s.notes.length);
    songQuiz = { midi: s.notes[idx][0], idx: idx, hasSharp: hasSharp };
    renderSongScore(s, idx);
    var box = $('songAnswerBtns');
    box.innerHTML = '';
    var names = hasSharp
      ? (state.naming === 'letter' ? Core.LETTER_12 : Core.SOLFEGE_12)
      : (state.naming === 'letter' ? Core.LETTERS : Core.SOLFEGE);
    var count = hasSharp ? 12 : 7;
    for (var i = 0; i < count; i++) {
      var b = document.createElement('button');
      b.className = 'answer-btn';
      b.dataset.idx = i;
      b.textContent = names[i];
      b.addEventListener('click', function () { answerSongQuiz(parseInt(this.dataset.idx, 10)); });
      box.appendChild(b);
    }
    $('songQuizHint').textContent = '';
  }

  function answerSongQuiz(idx) {
    if (!songQuiz || !currentSongId) return;
    var s = songById(currentSongId);
    var ans = songQuiz.hasSharp
      ? Core.SEMI_INDEX[songQuiz.midi % 12]
      : ((Core.midiToDia(songQuiz.midi) % 7) + 7) % 7;
    var btns = $('songAnswerBtns').children;
    if (idx === ans) {
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      btns[idx].classList.add('correct');
      if (state.sound) Audio.playDing(songQuiz.midi);
      var name = songQuiz.hasSharp
        ? (state.naming === 'letter' ? Core.LETTER_12 : Core.SOLFEGE_12)[ans]
        : Core.label(songQuiz.midi, state.naming);
      $('songQuizHint').textContent = '答对啦！这个音是 ' + name + '（曲子第 ' + (songQuiz.idx + 1) + ' 个音），再来一个～';
      setTimeout(function () { if (currentSongId) startSongQuiz(songById(currentSongId)); }, 1300);
    } else {
      btns[idx].classList.add('wrong');
      btns[idx].disabled = true;
      if (state.sound) Audio.playNudge();
      $('songQuizHint').textContent = '再听听谱上闪动的音，再试一次～';
    }
  }

  /* ---------- 每日挑战 ---------- */
  var challengeRun = null;   // { challenge, idx, answers, timer, remaining }

  function challengeState() {
    if (!state.challenge || typeof state.challenge !== 'object') {
      state.challenge = { lastDate: '', attempts: 0, best: 0, perfectDays: 0, history: {} };
    }
    return state.challenge;
  }

  /** 渲染挑战入口 */
  function renderChallenge() {
    var box = $('challengeBody');
    if (!box || !window.MusicChallenge) return;
    if (challengeRun) { renderChallengeRun(); return; }

    var today = window.MusicChallenge.todayKey();
    var cs = challengeState();
    var done = window.MusicChallenge.isDoneToday(cs, today);
    var todayRec = cs.history[today];
    var perfectDays = Number(cs.perfectDays) || 0;
    var unlocked = window.MusicChallenge.perfectBadgeUnlocked(cs);

    box.innerHTML =
      '<div class="ch-meta">' +
        '<span class="ch-chip">🏅 全对天数 <b>' + perfectDays + '</b> / ' + window.MusicChallenge.PERFECT_DAYS + '</span>' +
        '<span class="ch-chip">🎯 最佳 <b>' + (cs.best || 0) + '</b> / ' + window.MusicChallenge.TOTAL + '</span>' +
        '<span class="ch-chip">📅 已挑战 <b>' + (cs.attempts || 0) + '</b> 次</span>' +
      '</div>' +
      (done
        ? '<p class="ch-done">✅ 今天的挑战已完成（全对）！明天再来～</p>'
        : '<p class="ch-tip">' + (todayRec
            ? '今天挑战过 ' + todayRec.correct + '/' + todayRec.total + '，可以再试一次冲满分。'
            : '每天一组 8 题、限时 60 秒。全对累计 ' + window.MusicChallenge.PERFECT_DAYS + ' 天可解锁限定徽章。') + '</p>') +
      '<div class="ch-actions">' +
        '<button class="action-btn" id="challengeStartBtn">' +
          (todayRec ? '🔁 再挑战一次' : '⚡ 开始挑战') +
        '</button>' +
      '</div>' +
      (unlocked ? '<p class="ch-badge">🏆 已解锁限定徽章「每日之星」</p>' : '');

    var btn = $('challengeStartBtn');
    if (btn) btn.addEventListener('click', startChallenge);
  }

  function startChallenge() {
    if (!window.MusicChallenge) return;
    var who = activeProfile();
    var ch = window.MusicChallenge.build({
      dateKey: window.MusicChallenge.todayKey(),
      profileId: who ? who.id : 'p1',
      difficulty: state.difficulty,
      naming: state.naming
    });
    challengeRun = {
      challenge: ch, idx: 0, answers: [], remaining: ch.seconds,
      timer: setInterval(function () {
        if (!challengeRun) return;
        challengeRun.remaining--;
        var t = $('chTime');
        if (t) {
          t.textContent = '⏱ ' + Math.max(0, challengeRun.remaining) + ' 秒';
          t.classList.toggle('urgent', challengeRun.remaining <= 10);
        }
        if (challengeRun.remaining <= 0) finishChallenge();
      }, 1000)
    };
    renderChallengeRun();
  }

  function renderChallengeRun() {
    var box = $('challengeBody');
    if (!box || !challengeRun) return;
    var run = challengeRun;
    if (run.idx >= run.challenge.questions.length) { finishChallenge(); return; }
    var q = run.challenge.questions[run.idx];
    var head = '<div class="ch-head">' +
      '<span class="ch-progress">第 ' + (run.idx + 1) + ' / ' + run.challenge.total + ' 题</span>' +
      '<span class="ch-timer" id="chTime">⏱ ' + Math.max(0, run.remaining) + ' 秒</span>' +
      '</div>';

    if (q.type === 'note') {
      box.innerHTML = head +
        '<div id="chStaff" class="staff-wrap"></div>' +
        '<div class="answer-grid cols-' + q.optionCount + '" id="chOptions"></div>';
      var noteOpt = { midi: q.midi };
      if (Core.midiToDia(q.midi) === null) noteOpt = { midi: q.midi - 1, accidental: 1 };
      Staff.renderStaff($('chStaff'), { clef: q.clef, noteX: 300, notes: [noteOpt] });
      var grid = $('chOptions');
      q.names.forEach(function (name, i) {
        var b = document.createElement('button');
        b.className = 'answer-btn';
        b.textContent = name;
        b.addEventListener('click', function () { answerChallenge(i); });
        grid.appendChild(b);
      });
    } else {
      box.innerHTML = head +
        '<p class="ch-q">' + q.q + '</p>' +
        '<div class="theory-options" id="chOptions">' +
          q.options.map(function (o, i) {
            return '<button class="theory-opt" data-i="' + i + '">' +
              '<span class="opt-letter">' + 'ABCD'[i] + '</span>' + o + '</button>';
          }).join('') +
        '</div>';
      box.querySelectorAll('.theory-opt').forEach(function (b) {
        b.addEventListener('click', function () { answerChallenge(parseInt(b.dataset.i, 10)); });
      });
    }
  }

  function answerChallenge(i) {
    if (!challengeRun) return;
    var q = challengeRun.challenge.questions[challengeRun.idx];
    challengeRun.answers[challengeRun.idx] = i;
    challengeRun.idx++;
    if (state.sound) {
      if (i === q.answer) Audio.playDing(76); else Audio.playNudge();
    }
    if (challengeRun.idx >= challengeRun.challenge.questions.length) finishChallenge();
    else renderChallengeRun();
  }

  function finishChallenge() {
    if (!challengeRun) return;
    if (challengeRun.timer) clearInterval(challengeRun.timer);
    var run = challengeRun;
    challengeRun = null;
    var res = window.MusicChallenge.score(run.challenge, run.answers);
    var cs = window.MusicChallenge.record(challengeState(), window.MusicChallenge.todayKey(), res);
    save();

    var box = $('challengeBody');
    if (!box) return;
    box.innerHTML =
      '<div class="train-result">' +
        '<div class="train-result-head">' +
          (res.perfect ? '🏆 全对！' : (res.correct >= 6 ? '👍 很不错' : '💪 再练练')) +
        '</div>' +
        '<div class="train-result-body">答对 ' + res.correct + ' / ' + res.total + '（' + res.rate + '%）' +
          ' ｜ 用时 ' + (run.challenge.seconds - Math.max(0, run.remaining)) + ' 秒</div>' +
        '<div class="train-result-tip">' +
          (res.perfect
            ? '全对天数 ' + cs.perfectDays + ' / ' + window.MusicChallenge.PERFECT_DAYS +
              (window.MusicChallenge.perfectBadgeUnlocked(cs) ? '，已解锁限定徽章！' : '，继续加油解锁限定徽章。')
            : '再试一次，冲满分～') +
        '</div>' +
      '</div>' +
      '<div class="ch-actions"><button class="action-btn ghost" id="chBackBtn">返回</button></div>';
    var back = $('chBackBtn');
    if (back) back.addEventListener('click', renderChallenge);

    if (gamify) {
      gamify.addXp(2 + (res.perfect ? 5 : 0));
      gamify.checkBadges();
      gamify.updateStatsUI();
    }
    if (res.perfect && window.MusicChallenge.perfectBadgeUnlocked(cs) && !state.gamify.badges.challenge3) {
      state.gamify.badges.challenge3 = Date.now();
      save();
      gamify.renderBadges();
      gamify.celebrate('限定徽章！', '「🏆 每日之星」——累计 3 天挑战全对', '🏆');
    }
  }

  /* ---------- 家长周报 ---------- */
  var LEVEL_TEXT = {
    star: { emoji: '🌟', label: '非常棒的一周' },
    good: { emoji: '👍', label: '表现不错' },
    ok: { emoji: '🙂', label: '有进步空间' },
    low: { emoji: '💪', label: '需要多练一练' },
    none: { emoji: '🌱', label: '还没开始练习' }
  };

  function renderWeekly() {
    var box = $('weeklyBody');
    if (!box || !window.MusicWeekly) return;
    var who = activeProfile();
    var r = window.MusicWeekly.build({
      history: state.history || {},
      mistakes: state.mistakes || {},
      courses: state.courses || {},
      stats: state.stats || {},
      gamify: state.gamify || {}
    }, { name: who ? who.name : '小朋友' });

    var lv = LEVEL_TEXT[r.level] || LEVEL_TEXT.none;
    var maxCount = Math.max.apply(null, r.days.map(function (d) { return d.count; }).concat([1]));

    var bars = r.days.map(function (d) {
      var h = Math.round(d.count / maxCount * 100);
      return '<div class="wk-col" title="' + d.date + '：' + d.count + ' 次">' +
        '<div class="wk-bar-wrap"><div class="wk-bar' + (d.count ? '' : ' empty') + '" style="height:' + Math.max(3, h) + '%"></div></div>' +
        '<span class="wk-label">' + d.label + '</span>' +
        '<span class="wk-weekday">' + d.weekday + '</span>' +
      '</div>';
    }).join('');

    var kindRows = r.byKind.length
      ? r.byKind.map(function (k) {
          var pct = Math.round(k.count / r.totalCount * 100);
          return '<div class="wk-kind"><span>' + k.name + '</span>' +
            '<i class="report-bar"><i style="width:' + pct + '%"></i></i>' +
            '<b>' + k.count + ' 次</b></div>';
        }).join('')
      : '<p class="wk-empty">本周还没有练习记录。</p>';

    var weakRows = r.weak.length
      ? r.weak.map(function (w) {
          return '<div class="wk-weak"><span class="wk-weak-name">' + w.name + '</span>' +
            '<span class="wk-weak-count">错 ' + w.wrong + ' 次</span></div>';
        }).join('')
      : '<p class="wk-empty">本周没有明显的薄弱音，继续保持。</p>';

    var adviceList = r.advice.map(function (a) {
      return '<li>' + a + '</li>';
    }).join('');

    $('weeklyRange').textContent = r.range.from + ' ~ ' + r.range.to;
    box.innerHTML =
      '<div class="wk-hero">' +
        '<div class="wk-hero-emoji">' + lv.emoji + '</div>' +
        '<div class="wk-hero-text">' +
          '<div class="wk-hero-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="wk-hero-level">' + lv.label + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="wk-stats">' +
        '<div class="stat-box"><span class="stat-box-num">' + r.activeDays + '<small>/7</small></span><span class="stat-box-label">练习天数</span></div>' +
        '<div class="stat-box"><span class="stat-box-num">' + r.totalCount + '</span><span class="stat-box-label">练习次数</span></div>' +
        '<div class="stat-box"><span class="stat-box-num">' + (r.rate == null ? '—' : r.rate + '%') + '</span><span class="stat-box-label">一次答对率</span></div>' +
        '<div class="stat-box"><span class="stat-box-num">' + r.streak + '</span><span class="stat-box-label">连续天数</span></div>' +
      '</div>' +

      '<h3 class="wk-h3">每日练习量</h3>' +
      '<div class="wk-chart">' + bars + '</div>' +

      '<h3 class="wk-h3">练了什么</h3>' +
      '<div class="wk-kinds">' + kindRows + '</div>' +

      '<h3 class="wk-h3">需要加强的音</h3>' +
      '<div class="wk-weaks">' + weakRows + '</div>' +

      '<h3 class="wk-h3">课程与成就</h3>' +
      '<div class="wk-meta">已完成 <b>' + r.courses.done + '</b> 课 ｜ 累计 <b>' + r.courses.stars + '</b> 星 ｜ ' +
        '徽章 <b>' + r.badges + '</b> 枚 ｜ XP <b>' + r.xp + '</b></div>' +

      '<h3 class="wk-h3">给家长的建议</h3>' +
      '<ul class="wk-advice">' + adviceList + '</ul>' +

      '<div class="wk-actions">' +
        '<button class="action-btn" id="weeklyCopyBtn">📋 复制文字版</button>' +
      '</div>' +
      '<p id="weeklyCopyHint" class="wk-hint" role="status" aria-live="polite"></p>';

    var copyBtn = $('weeklyCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () { copyWeekly(r); });
    }
  }

  /** 复制文字版周报 */
  function copyWeekly(r) {
    var text = window.MusicWeekly.toText(r);
    function done(ok) {
      var hint = $('weeklyCopyHint');
      if (hint) hint.textContent = ok ? '已复制到剪贴板，可以粘贴给家人看。' : '复制失败，请手动选择文本。';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      done(!!ok);
    } catch (e) {
      done(false);
    }
  }

  /* ---------- 训练营（视奏 / 乐理 / 节奏） ---------- */
  var trainTab = 'sight';
  var reviewDrill = null; // 错题专项练习 { pool, clef, remaining, correct }
  var sightState = null;     // { level, page, run, timer, remaining, det }
  var theoryState = null;    // { cats, qs, idx, correct, wrong }
  var rhythmState = null;    // { level, rhythm, taps, startAt, raf }

  function renderTrainPage() {
    renderSightControls();
    renderTheoryCats();
    renderRhythmControls();
    showTrainTab(trainTab);
  }

  function showTrainTab(tab) {
    trainTab = tab;
    ['sight', 'theory', 'rhythm', 'review', 'history'].forEach(function (t) {
      var pane = $('train' + t.charAt(0).toUpperCase() + t.slice(1));
      if (pane) pane.style.display = t === tab ? '' : 'none';
    });
    var tabs = $('trainTabs');
    if (tabs) tabs.querySelectorAll('.seg').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false');
    });
    if (tab !== 'sight' && sightState && sightState.timer) stopSight();
    if (tab === 'review') renderReview();
    if (tab === 'history') renderHistory();
  }

  /* ===== 错题本 ===== */
  function renderReview() {
    var box = $('reviewBody');
    if (!box) return;
    var spots = window.MusicStats.weakSpots(state.mistakes || {}, 12);
    if (!spots.length) {
      box.innerHTML = '<p class="review-empty">还没有错题～ 先去「识谱练习」做几题吧。</p>';
      $('reviewDrillBtn').disabled = true;
      return;
    }
    $('reviewDrillBtn').disabled = false;
    box.innerHTML = spots.map(function (sp) {
      var letter = Core.LETTERS[((Core.midiToDia(sp.pitchClass + 60) % 7) + 7) % 7];
      var solfege = Core.SOLFEGE[((Core.midiToDia(sp.pitchClass + 60) % 7) + 7) % 7];
      var name = Core.midiToDia(sp.pitchClass + 60) === null
        ? letter + '♯'
        : letter + ' · ' + solfege;
      var rate = Math.round(sp.rate * 100);
      return '<div class="review-row">' +
        '<span class="review-name">' + name + '</span>' +
        '<span class="review-count">错 ' + sp.wrong + ' 次</span>' +
        '<i class="report-bar"><i style="width:' + rate + '%"></i></i>' +
        '<span class="review-clef">' + (sp.clef === 'bass' ? '低音谱' : '高音谱') + '</span>' +
      '</div>';
    }).join('');
  }

  /** 用错题生成一次专项练习 */
  function startReviewDrill() {
    var spots = window.MusicStats.weakSpots(state.mistakes || {}, 6);
    if (!spots.length) return;
    reviewDrill = {
      pool: spots.map(function (sp) { return sp.pitchClass; }),
      clef: spots[0].clef || 'treble',
      remaining: 10, correct: 0
    };
    switchPage('practice');
    courseActive = null;
    renderReviewQuestion();
  }

  function renderReviewQuestion() {
    if (!reviewDrill) return;
    if (reviewDrill.remaining <= 0) {
      var rate = Math.round(reviewDrill.correct / 10 * 100);
      setFeedback(rate >= 80 ? 'ok' : 'idle',
        '专项练习完成：答对 ' + reviewDrill.correct + ' / 10（' + rate + '%）');
      var done = reviewDrill;
      reviewDrill = null;
      state.stats.trainRuns = (state.stats.trainRuns || 0) + 1;
      save();
      if (gamify) { gamify.addXp(3); gamify.updateStatsUI(); }
      return;
    }
    var pc = reviewDrill.pool[Math.floor(Math.random() * reviewDrill.pool.length)];
    // 构造一个落在当前谱号常用音区的具体音高
    var base = reviewDrill.clef === 'bass' ? 48 : 60;
    var midi = base + pc;
    question = { midi: midi, clef: reviewDrill.clef };
    usedWrong = false; wrongAttempts = 0; busy = false; placeMidi = null;
    var noteOpt = { midi: midi };
    if (Core.midiToDia(midi) === null) noteOpt = { midi: midi - 1, accidental: 1 };
    Staff.renderStaff($('practiceStaff'), { clef: question.clef, noteX: 320, notes: [noteOpt] });
    state.mode = 'name';
    $('segMode').querySelectorAll('.seg').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === 'name');
      b.setAttribute('aria-pressed', b.dataset.mode === 'name' ? 'true' : 'false');
    });
    $('segMode').style.display = '';
    $('placeConfirmWrap').style.display = 'none';
    $('replayBtn').style.display = 'none';
    $('placeLabel').textContent = '这个音符是？（错题专项）';
    buildAnswerButtons();
    $('answerButtons').style.display = '';
    $('keyboardAnswer').style.display = 'none';
    setFeedback('idle', '错题专项：还剩 ' + reviewDrill.remaining + ' 题');
    $('answerHint').textContent = '';
  }

  /* ===== 练习记录 ===== */
  function renderHistory() {
    var sumBox = $('historySummary');
    var chart = $('historyChart');
    var legend = $('historyLegend');
    if (!sumBox || !chart) return;
    var sum = window.MusicStats.summary(state.history || {}, 7);
    sumBox.innerHTML =
      '<div class="stat-box"><span class="stat-box-num">' + sum.activeDays + '</span><span class="stat-box-label">练习天数</span></div>' +
      '<div class="stat-box"><span class="stat-box-num">' + sum.totalCount + '</span><span class="stat-box-label">完成次数</span></div>' +
      '<div class="stat-box"><span class="stat-box-num">' + (sum.rate == null ? '—' : sum.rate + '%') + '</span><span class="stat-box-label">正确率</span></div>';
    var max = Math.max.apply(null, sum.days.map(function (d) { return d.count; }).concat([1]));
    chart.innerHTML = sum.days.map(function (d) {
      var h = Math.round(d.count / max * 100);
      return '<div class="hist-col" title="' + d.date + '：' + d.count + ' 次">' +
        '<div class="hist-bar-wrap"><div class="hist-bar" style="height:' + Math.max(2, h) + '%"></div></div>' +
        '<span class="hist-label">' + d.label + '</span>' +
      '</div>';
    }).join('');
    if (legend) {
      legend.textContent = sum.totalCount
        ? '共 ' + sum.totalCount + ' 次练习，' + sum.activeDays + ' 天有练习记录。'
        : '还没有练习记录，做几题就会出现在这里。';
    }
  }

  /* ===== 视奏 ===== */
  function renderSightControls() {
    var box = $('sightLevels');
    if (!box) return;
    var lv = state.sightLevel || 1;
    box.querySelectorAll('.seg').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.dataset.level, 10) === lv);
      b.setAttribute('aria-pressed', parseInt(b.dataset.level, 10) === lv ? 'true' : 'false');
    });
    if (!box.__bound) {
      box.__bound = true;
      box.addEventListener('click', function (ev) {
        var seg = ev.target.closest('.seg');
        if (!seg) return;
        state.sightLevel = parseInt(seg.dataset.level, 10);
        save();
        renderSightControls();
      });
    }
  }

  function startSight() {
    stopSight();
    var level = state.sightLevel || 1;
    var page = window.MusicSight.generateSight({ level: level, measures: 2 });
    sightState = { level: level, page: page, played: [], remaining: page.seconds, timer: null, det: false, startedAt: Date.now() };

    var staff = $('sightStaff');
    var notes = page.notes.map(function (n, i) {
      var acc = Core.midiToDia(n.midi) === null ? 1 : 0;
      return { midi: n.midi, dur: n.beats, x: 70 + i * 34 };
    });
    Staff.renderStaff(staff, {
      clef: page.clef, width: 70 + notes.length * 34 + 40, notes: notes, scroll: true
    });
    $('sightResult').style.display = 'none';
    $('sightTip').textContent = '看这段没见过的谱，' + page.seconds + ' 秒内把音按顺序弹/唱出来。只判音高，不要求节奏。';
    $('sightTimer').style.display = '';
    $('sightTimer').textContent = '⏱ ' + page.seconds + ' 秒';
    $('sightTimer').classList.remove('urgent');
    $('sightStatus').textContent = '🎤 准备好了，开始吧！';
    $('sightStartBtn').textContent = '⏹ 结束';

    // 麦克风：逐音匹配（只判音高与顺序）
    if (window.PitchDetector && window.PitchDetector.supported()) {
      var lastMidi = null, stableSince = 0, emitted = null;
      window.PitchDetector.start(function (midi) {
        if (!sightState) return;
        var now = Date.now();
        if (midi == null) { lastMidi = null; emitted = null; return; }
        if (lastMidi == null || Math.abs(midi - lastMidi) > 0.6) { lastMidi = midi; stableSince = now; return; }
        if (now - stableSince < 60) return;
        if (emitted != null && Math.abs(midi - emitted) < 0.6) return;
        emitted = midi;
        sightState.played.push(midi);
        updateSightProgress();
        if (sightState.played.length >= sightState.page.notes.length) finishSight();
      }, function (err) {
        $('sightStatus').textContent = err === 'denied'
          ? '🔒 麦克风被拒绝，可以用键盘（A S D F G H J）作答。'
          : '⚠️ 麦克风不可用，可以用键盘作答。';
        sightState.det = false;
      }, {});
      sightState.det = true;
    } else {
      $('sightStatus').textContent = '⌨️ 没有麦克风，用键盘 A S D F G H J 依次作答。';
    }

    // 倒计时
    sightState.timer = setInterval(function () {
      if (!sightState) return;
      sightState.remaining--;
      var t = $('sightTimer');
      if (t) {
        t.textContent = '⏱ ' + Math.max(0, sightState.remaining) + ' 秒';
        t.classList.toggle('urgent', sightState.remaining <= 5);
      }
      if (sightState.remaining <= 0) finishSight();
    }, 1000);
  }

  function updateSightProgress() {
    if (!sightState) return;
    var st = $('sightStatus');
    var n = sightState.played.length;
    var total = sightState.page.notes.length;
    if (st) st.textContent = '🎵 已弹 ' + n + ' / ' + total + ' 个音';
    // 已弹的音变绿
    var box = $('sightStaff');
    if (!box) return;
    var svgNotes = box.querySelectorAll('.note');
    for (var i = 0; i < svgNotes.length; i++) {
      svgNotes[i].classList.toggle('note-ok', i < n);
    }
  }

  function stopSight() {
    if (!sightState) return;
    if (sightState.timer) clearInterval(sightState.timer);
    sightState.timer = null;
    if (window.PitchDetector) window.PitchDetector.stop();
  }

  /** 用户主动结束（未弹完也算一次成绩） */
  function abortSight() {
    if (!sightState) return;
    if (!sightState.played.length && !sightState.startedAt) {
      stopSight();
      sightState = null;
      $('sightStartBtn').textContent = '▶ 开始视奏';
      $('sightTimer').style.display = 'none';
      $('sightStatus').textContent = '';
      return;
    }
    finishSight();
  }

  function finishSight() {
    if (!sightState) return;
    stopSight();
    var expected = sightState.page.notes.map(function (n) { return n.midi; });
    var res = window.MusicSight.scoreSight(sightState.played, expected);
    var stars = res.accuracy >= 95 ? 3 : res.accuracy >= 80 ? 2 : 1;
    var box = $('sightResult');
    box.style.display = '';
    box.innerHTML =
      '<div class="train-result-head">' + starRow(stars) + ' 视奏完成</div>' +
      '<div class="train-result-body">正确 ' + res.hits + ' / ' + res.total +
        '（' + res.accuracy + '%）' + (res.missed ? ' ｜ 未弹 ' + res.missed + ' 个' : '') +
        ' ｜ 用时 ' + (sightState.page.seconds - Math.max(0, sightState.remaining)) + ' 秒</div>' +
      '<div class="train-result-tip">' + (res.accuracy >= 95 ? '视奏又快又准，挑战更高难度吧！'
        : res.accuracy >= 80 ? '很不错！再快一点就更好了。' : '慢一点看清楚再弹，多练几次会明显进步。') + '</div>';
    $('sightTimer').style.display = 'none';
    $('sightStartBtn').textContent = '▶ 再来一段';
    $('sightStatus').textContent = '';
    recordTrainResult('sight', stars, res.accuracy);
    sightState.played = res.hits ? sightState.played : sightState.played;
    sightState.timer = null;
    if (state.sound) Audio.playDing(76);
  }

  /* ===== 乐理 ===== */
  function renderTheoryCats() {
    var box = $('theoryCats');
    if (!box || box.__bound) return;
    box.__bound = true;
    var cats = window.MusicSight.theoryCats();
    box.innerHTML = '<button class="seg active" data-cat="">全部</button>';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'seg';
      b.dataset.cat = c;
      b.textContent = c;
      box.appendChild(b);
    });
    box.addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg) return;
      setSegActive(box, function (b) { return b === seg; });
      theoryState = theoryState || {};
      theoryState.cat = seg.dataset.cat;
    });
  }

  function startTheory() {
    var cat = theoryState && theoryState.cat;
    var qs = window.MusicSight.pickTheory(10, cat ? [cat] : null);
    theoryState = { cat: cat, qs: qs, idx: 0, correct: 0, answered: false };
    $('theoryStartBtn').textContent = '🔄 换一组';
    renderTheoryQuestion();
  }

  function renderTheoryQuestion() {
    if (!theoryState) return;
    var body = $('theoryBody');
    if (theoryState.idx >= theoryState.qs.length) {
      var rate = Math.round(theoryState.correct / theoryState.qs.length * 100);
      var stars = rate >= 90 ? 3 : rate >= 70 ? 2 : 1;
      body.innerHTML =
        '<div class="train-result">' +
          '<div class="train-result-head">' + starRow(stars) + ' 本轮结束</div>' +
          '<div class="train-result-body">答对 ' + theoryState.correct + ' / ' + theoryState.qs.length + '（' + rate + '%）</div>' +
          '<div class="train-result-tip">' + (rate >= 90 ? '乐理小达人！' : '把答错的题再看一遍解析，会更牢。') + '</div>' +
        '</div>';
      recordTrainResult('theory', stars, rate);
      return;
    }
    var q = theoryState.qs[theoryState.idx];
    theoryState.answered = false;
    body.innerHTML =
      '<div class="theory-head"><span class="theory-cat">' + q.cat + '</span>' +
        '<span class="theory-count">第 ' + (theoryState.idx + 1) + ' / ' + theoryState.qs.length + ' 题</span></div>' +
      '<p class="theory-q">' + q.q + '</p>' +
      '<div class="theory-options">' +
        q.options.map(function (o, i) {
          return '<button class="theory-opt" data-i="' + i + '">' +
            '<span class="opt-letter">' + 'ABCD'[i] + '</span>' + o + '</button>';
        }).join('') +
      '</div>' +
      '<p class="theory-explain" id="theoryExplain"></p>';
    body.querySelectorAll('.theory-opt').forEach(function (b) {
      b.addEventListener('click', function () { answerTheory(parseInt(b.dataset.i, 10)); });
    });
  }

  function answerTheory(chosen) {
    if (!theoryState || theoryState.answered) return;
    theoryState.answered = true;
    var q = theoryState.qs[theoryState.idx];
    var ok = window.MusicSight.checkTheory(q, chosen);
    var body = $('theoryBody');
    body.querySelectorAll('.theory-opt').forEach(function (b) {
      var i = parseInt(b.dataset.i, 10);
      b.disabled = true;
      if (i === q.answer) b.classList.add('correct');
      else if (i === chosen) b.classList.add('wrong');
    });
    if (ok) theoryState.correct++;
    var ex = $('theoryExplain');
    if (ex) {
      ex.innerHTML = (ok ? '✅ 答对啦！' : '❌ 正确答案是 ' + 'ABCD'[q.answer] + '。') +
        '<br><span class="explain-text">' + q.explain + '</span>';
      ex.className = 'theory-explain ' + (ok ? 'ok' : 'no');
    }
    if (state.sound) ok ? Audio.playDing(72) : Audio.playNudge();
    theoryState.idx++;
    setTimeout(function () { if (theoryState) renderTheoryQuestion(); }, ok ? 900 : 2200);
  }

  /* ===== 节奏 ===== */
  function renderRhythmControls() {
    var box = $('rhythmLevels');
    if (!box) return;
    var lv = state.rhythmLevel || 1;
    box.querySelectorAll('.seg').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.dataset.level, 10) === lv);
      b.setAttribute('aria-pressed', parseInt(b.dataset.level, 10) === lv ? 'true' : 'false');
    });
    if (!box.__bound) {
      box.__bound = true;
      box.addEventListener('click', function (ev) {
        var seg = ev.target.closest('.seg');
        if (!seg) return;
        state.rhythmLevel = parseInt(seg.dataset.level, 10);
        save();
        renderRhythmControls();
      });
    }
  }

  function startRhythm() {
    stopRhythm();
    var level = state.rhythmLevel || 1;
    var r = window.MusicSight.generateRhythm(level);
    rhythmState = { level: level, rhythm: r, taps: [], running: true, startAt: 0, countIn: 4 };
    var view = $('rhythmView');
    view.innerHTML = r.cells.map(function (c, i) {
      return '<div class="rhythm-cell' + (c === 'x' ? ' tap' : '') + '" data-i="' + i + '">' +
        (c === 'x' ? '👏' : '') + '</div>';
    }).join('');
    $('rhythmResult').style.display = 'none';
    $('rhythmPad').disabled = true;
    $('rhythmStatus').textContent = '🥁 预备…（听 4 拍）';

    // 预备拍
    var beatMs = 60000 / r.bpm;
    var count = 0;
    rhythmState.countTimer = setInterval(function () {
      if (!rhythmState) return;
      if (state.sound) Audio.playNote(count % 4 === 0 ? 84 : 79, { dur: 0.1, vel: 0.3 });
      count++;
      if (count >= 4) {
        clearInterval(rhythmState.countTimer);
        rhythmState.countTimer = null;
        rhythmState.startAt = Date.now();
        $('rhythmPad').disabled = false;
        $('rhythmStatus').textContent = '👏 开始！在 👏 处拍手';
        rhythmState.endTimer = setTimeout(function () { finishRhythm(); }, r.cells.length * (beatMs / (r.sub || 1)) + 800);
      }
    }, beatMs);
  }

  function tapRhythm() {
    if (!rhythmState || !rhythmState.running || !rhythmState.startAt) return;
    rhythmState.taps.push(Date.now() - rhythmState.startAt);
    var cellMs = 60000 / rhythmState.rhythm.bpm / (rhythmState.rhythm.sub || 1);
    var idx = Math.round(rhythmState.taps[rhythmState.taps.length - 1] / cellMs);
    var cell = $('rhythmView').querySelector('[data-i="' + idx + '"]');
    if (cell) {
      cell.classList.add('hit');
      setTimeout(function () { cell.classList.remove('hit'); }, 200);
    }
    if (state.sound) Audio.playNote(72, { dur: 0.08, vel: 0.25 });
  }

  function finishRhythm() {
    if (!rhythmState) return;
    rhythmState.running = false;
    clearTimeout(rhythmState.endTimer);
    clearInterval(rhythmState.countTimer);
    $('rhythmPad').disabled = true;
    var res = window.MusicSight.scoreRhythm(rhythmState.taps, rhythmState.rhythm);
    var stars = res.accuracy >= 90 ? 3 : res.accuracy >= 70 ? 2 : 1;
    var box = $('rhythmResult');
    box.style.display = '';
    box.innerHTML =
      '<div class="train-result-head">' + starRow(stars) + ' 节奏练习</div>' +
      '<div class="train-result-body">拍准 ' + res.hits + ' / ' + res.total + '（' + res.accuracy + '%）' +
        (res.offset ? ' ｜ 整体延迟 ' + res.offset + 'ms（已自动对齐）' : '') + '</div>' +
      '<div class="train-result-tip">' + (res.accuracy >= 90 ? '节奏感很棒！' : '跟着节拍器再数一遍「1 2 3 4」。') + '</div>';
    $('rhythmStatus').textContent = '本轮结束';
    recordTrainResult('rhythm', stars, res.accuracy);
    if (state.sound) Audio.playDing(76);
  }

  function stopRhythm() {
    if (!rhythmState) return;
    rhythmState.running = false;
    clearInterval(rhythmState.countTimer);
    clearTimeout(rhythmState.endTimer);
    rhythmState = null;
  }

  /** 训练结果计入统计与 XP（与跟练同一套激励） */
  function recordTrainResult(kind, stars, accuracy) {
    var st = state.stats;
    st.trainRuns = (st.trainRuns || 0) + 1;
    st.trainStars = (st.trainStars || 0) + stars;
    if (accuracy >= 90) st.trainPerfect = (st.trainPerfect || 0) + 1;
    state.trainBest = state.trainBest || {};
    if (!state.trainBest[kind] || stars > state.trainBest[kind]) state.trainBest[kind] = stars;
    if (window.MusicStats) {
      state.history = state.history || {};
      window.MusicStats.recordDay(state.history, kind, { correct: accuracy, total: 100 });
    }
    save();
    if (gamify) {
      gamify.addXp(2 + stars);
      gamify.bumpTasks();
      gamify.checkBadges();
      gamify.updateStatsUI();
    }
  }

  /* ---------- 课程（闯关） ---------- */
  var courseActive = null;   // { id, correct, firstTry }
  var currentCourseId = null;
  var currentLine = null;    // 当前教材线路

  function courseById(id) {
    var found = null;
    window.CourseData.COURSES.forEach(function (c) { if (c.id === id) found = c; });
    return found;
  }
  function courseDone(id) { return !!(state.courses[id] && state.courses[id].done); }
  function courseStars(id) { return state.courses[id] ? state.courses[id].stars : 0; }
  /** 同线路内的上一课 */
  function linePrevCourse(c) {
    var line = null;
    window.CourseData.LINES.forEach(function (l) { if (l.id === c.line) line = l; });
    if (!line) return null;
    for (var i = 0; i < line.courses.length; i++) {
      if (line.courses[i].id === c.id) return i > 0 ? line.courses[i - 1] : null;
    }
    return null;
  }
  /** 线路内下一课 */
  function lineNextCourse(c) {
    var line = null;
    window.CourseData.LINES.forEach(function (l) { if (l.id === c.line) line = l; });
    if (!line) return null;
    for (var i = 0; i < line.courses.length; i++) {
      if (line.courses[i].id === c.id) return i < line.courses.length - 1 ? line.courses[i + 1] : null;
    }
    return null;
  }
  /** 课在所属线路中的 1-based 序号（用于 UI 显示"第 N 课"） */
  function courseIndexInLine(c) {
    var line = null;
    window.CourseData.LINES.forEach(function (l) { if (l.id === c.line) line = l; });
    if (!line) return 0;
    for (var i = 0; i < line.courses.length; i++) {
      if (line.courses[i].id === c.id) return i + 1;
    }
    return 0;
  }
  function courseUnlocked(c) {
    var prev = linePrevCourse(c);
    return !prev || courseDone(prev.id);
  }
  function starRow(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '⭐' : '☆';
    return s;
  }

  /** 当前练习配置：课程练习用课程的固定配置，否则用用户设置 */
  function activePracticeConfig() {
    if (courseActive) {
      var c = courseById(courseActive.id);
      return { clef: c.practice.clef, difficulty: c.practice.difficulty, mode: c.practice.mode };
    }
    return { clef: state.clef, difficulty: state.difficulty, mode: state.mode };
  }

  function renderCourses() {
    // 线路 tab
    var tabs = $('courseLineTabs');
    if (!currentLine) {
      // 默认第一个有未完成课程的线路
      currentLine = window.CourseData.LINES[0].id;
      window.CourseData.LINES.forEach(function (l) {
        var hasPending = l.courses.some(function (c) { return !courseDone(c.id); });
        if (hasPending && !currentLine) currentLine = l.id;
      });
      if (!currentLine) currentLine = window.CourseData.LINES[0].id;
    }
    tabs.innerHTML = '';
    window.CourseData.LINES.forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'seg' + (l.id === currentLine ? ' active' : '');
      b.dataset.line = l.id;
      b.innerHTML = l.icon + ' ' + l.name;
      b.addEventListener('click', function () { currentLine = l.id; renderCourses(); });
      tabs.appendChild(b);
    });

    // 当前线路课程列表
    var box = $('courseList');
    box.innerHTML = '';
    var line = null;
    window.CourseData.LINES.forEach(function (l) { if (l.id === currentLine) line = l; });
    if (!line) return;
    line.courses.forEach(function (c) {
      var done = courseDone(c.id);
      var unlocked = courseUnlocked(c);
      var item = document.createElement('div');
      item.className = 'course-item' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
      item.innerHTML =
        '<div class="course-ico">' + c.icon + '</div>' +
        '<div class="course-info">' +
          '<div class="course-book">' + c.book + '</div>' +
          '<div class="course-title">第 ' + courseIndexInLine(c) + ' 课 · ' + c.title + '</div>' +
          '<div class="course-stars">' + starRow(courseStars(c.id)) + '</div>' +
        '</div>' +
        '<div class="course-status">' + (done ? '✅ 已过关' : unlocked ? '▶ 开始' : '🔒 未解锁') + '</div>';
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label',
        '第 ' + courseIndexInLine(c) + ' 课 ' + c.title +
        (done ? '，已过关，' + courseStars(c.id) + ' 星' : unlocked ? '，开始' : '，未解锁'));
      item.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      item.setAttribute('tabindex', unlocked ? '0' : '-1');
      if (unlocked) {
        item.addEventListener('click', function () { renderCourseDetail(c.id); });
        item.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); renderCourseDetail(c.id); }
        });
      }
      box.appendChild(item);
    });
  }

  function showCourseList() {
    currentCourseId = null;
    $('courseDetail').style.display = 'none';
    $('courseList').style.display = '';
    renderCourses();
  }

  function renderCourseDetail(id) {
    currentCourseId = id;
    var c = courseById(id);
    if (!c) return;
    $('courseList').style.display = 'none';
    var d = $('courseDetail');
    d.style.display = '';

    var html = '<div class="card">' +
      '<button class="text-btn" id="backToCourses">← 返回课程列表</button>' +
      '<div class="course-detail-head">' +
        '<span class="course-detail-ico">' + c.icon + '</span>' +
        '<div class="course-detail-info">' +
          '<div class="course-book">' + c.book + '</div>' +
          '<div class="course-detail-title">第 ' + courseIndexInLine(c) + ' 课 · ' + c.title + '</div>' +
        '</div>' +
        (courseDone(id) ? '<div class="course-detail-stars">' + starRow(courseStars(id)) + '</div>' : '') +
      '</div></div>';

    c.points.forEach(function (p) {
      html += '<div class="card course-point-card"><div class="card-head"><span class="card-title">📌 ' +
        p.title + '</span></div><div class="course-point">' + p.html + '</div></div>';
    });

    if (c.staffDemo) {
      html += '<div class="card"><div class="card-head"><span class="card-title">👀 看一看</span></div>' +
        '<div id="courseDemoStaff" class="staff-wrap"></div>' +
        (c.staffDemo.caption ? '<p class="course-caption">' + c.staffDemo.caption + '</p>' : '') +
        '</div>';
    }

    html += '<div class="card course-start-card">' +
      '<button class="action-btn" id="startCourseBtn">' +
      (courseDone(id) ? '🔄 再练一次（刷新星级）' : '🚀 开始本课练习') +
      '</button>' +
      '<p class="course-target">过关目标：' + c.practice.target + ' 题 ｜ 模式：' + practiceModeName(c.practice.mode) +
      (c.practice.difficulty === 'full' ? ' ｜ 88 键' : '') + '</p></div>';

    d.innerHTML = html;
    $('backToCourses').addEventListener('click', showCourseList);
    $('startCourseBtn').addEventListener('click', function () { startCoursePractice(id); });

    if (c.staffDemo) {
      var demo = c.staffDemo;
      var notes = demo.notes.map(function (m, i) {
        return { midi: m, x: 150 + i * 56, label: Core.label(m, 'letter'), labelColor: 'var(--text-2)' };
      });
      Staff.renderStaff($('courseDemoStaff'), {
        clef: demo.clef, width: 150 + notes.length * 56 + 40,
        notes: notes
      });
    }
  }

  function practiceModeName(mode) {
    return mode === 'name' ? '点音名' : mode === 'keyboard' ? '点琴键' : mode === 'listen' ? '听音辨键' : '放音符';
  }

  function startCoursePractice(id) {
    var c = courseById(id);
    if (!c || !courseUnlocked(c)) return;
    courseActive = { id: id, correct: 0, firstTry: 0 };
    switchPage('practice');
    renderQuestion();
    renderCourseBanner();
  }

  function exitCoursePractice() {
    courseActive = null;
    renderQuestion();
    renderCourseBanner();
  }

  function renderCourseBanner() {
    var wrap = $('courseBanner');
    if (courseActive) {
      var c = courseById(courseActive.id);
      wrap.style.display = '';
      wrap.innerHTML = '<span>📚 课程：第 ' + courseIndexInLine(c) + ' 课「' + c.title + '」</span>' +
        '<span class="course-banner-progress">答对 <b>' + courseActive.correct + '</b>/' + c.practice.target + ' 题</span>' +
        '<button class="text-btn" id="exitCourseBtn">退出</button>';
      $('exitCourseBtn').addEventListener('click', exitCoursePractice);
    } else {
      wrap.style.display = 'none';
    }
  }

  /** 课程答对计数；达到目标则过关结算 */
  function bumpCourse() {
    if (!courseActive) return;
    var c = courseById(courseActive.id);
    if (!c) return;
    courseActive.correct++;
    if (!usedWrong) courseActive.firstTry++;
    renderCourseBanner();
    if (courseActive.correct >= c.practice.target) {
      completeCourse(c);
    }
  }

  function completeCourse(c) {
    var rate = courseActive.correct ? Math.round(courseActive.firstTry / courseActive.correct * 100) : 0;
    var stars = rate >= 90 ? 3 : rate >= 70 ? 2 : 1;
    var prev = state.courses[c.id];
    var isNew = !prev || !prev.done;
    if (isNew || stars > prev.stars) {
      state.courses[c.id] = { done: true, stars: Math.max(prev ? prev.stars : 0, stars) };
      save();
    }
    var nextCourse = lineNextCourse(c);
    var msg = '第 ' + courseIndexInLine(c) + ' 课「' + c.title + '」过关！获得 ' + starRow(stars) +
      (nextCourse ? '，下一课已解锁' : '，本册课程全部完成！');
    courseActive = null;
    renderCourseBanner();
    gamify.celebrate('🎓 过关啦！', msg, '🏅');
    setTimeout(function () {
      switchPage('courses');
      showCourseList();
      renderQuestion();
    }, 1800);
  }

  /* ---------- 重置（分三档，各自二次确认） ---------- */
  var RESET_LABEL = { stats: '重置统计', courses: '重置课程', all: '全部清空' };

  function bindReset(id, kind) {
    var btn = $(id);
    if (!btn) return;
    var armed = false;
    var timer = null;
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        btn.textContent = '再点一次确认';
        btn.classList.add('armed');
        timer = setTimeout(function () {
          armed = false;
          btn.textContent = RESET_LABEL[kind];
          btn.classList.remove('armed');
        }, 2500);
        return;
      }
      clearTimeout(timer);
      armed = false;
      btn.textContent = RESET_LABEL[kind];
      btn.classList.remove('armed');
      doReset(kind);
    });
  }

  /** 重置统计：只清成绩类数据，保留课程进度与偏好设置 */
  function resetStatsData() {
    state.stats = {
      attempts: 0, correct: 0, firstTry: 0, stars: 0,
      currentStreak: 0, bestStreak: 0, fullCorrect: 0,
      followRuns: 0, followStars: 0, followPerfect: 0,
      trainRuns: 0, trainStars: 0, trainPerfect: 0
    };
    state.gamify.xp = 0;
    state.gamify.badges = {};
    state.gamify.dayStreak = 0;
    state.gamify.lastDay = '';
    state.gamify.freezes = 2;
    state.gamify.taskDate = '';
    state.gamify.tasks = [];
    state.gamify.prog = { answered: 0, streakBest: 0, fullAnswered: 0 };
    state.mistakes = {};
    state.history = {};
    state.trainBest = {};
    state.challenge = { lastDate: '', attempts: 0, best: 0, perfectDays: 0, history: {} };
  }

  function doReset(kind) {
    if (kind === 'stats') {
      resetStatsData();
    } else if (kind === 'courses') {
      state.courses = {};
    } else {
      resetStatsData();
      state.courses = {};
    }
    save();
    gamify.updateStatsUI();
    gamify.renderBadges();
    renderCourses();
    renderReview();
    renderHistory();
    if (kind === 'stats') {
      setFeedback('idle', '统计已重置（课程进度保留）');
    } else if (kind === 'courses') {
      setFeedback('idle', '课程进度已重置（成绩保留）');
    } else {
      setFeedback('idle', '全部数据已清空');
    }
  }

  /* ---------- 小朋友档案 ---------- */
  function activeProfile() {
    return profileStore ? window.MusicProfiles.getActive(profileStore) : null;
  }

  /** 同步顶部档案按钮 */
  function renderProfileChip() {
    var p = activeProfile();
    if (!p) return;
    var av = $('profileAvatar'), nm = $('profileName');
    if (av) av.textContent = p.avatar;
    if (nm) nm.textContent = p.name;
    var btn = $('profileBtn');
    if (btn) btn.setAttribute('aria-label', '当前：' + p.name + '，点击切换');
  }

  /** 设置页档案列表 */
  function renderProfiles() {
    var box = $('profileList');
    if (!box || !profileStore) return;
    var list = window.MusicProfiles.listProfiles(profileStore);
    var activeId = profileStore.activeId;
    box.innerHTML = '';
    list.forEach(function (p) {
      var sum = window.MusicProfiles.summary(p);
      var row = document.createElement('div');
      row.className = 'profile-row' + (p.id === activeId ? ' active' : '');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-pressed', p.id === activeId ? 'true' : 'false');
      row.setAttribute('aria-label', p.name + '，' + sum.courses + ' 课，' + sum.attempts + ' 次尝试' +
        (p.id === activeId ? '，当前使用' : '，点击切换'));
      row.innerHTML =
        '<span class="profile-avatar" aria-hidden="true">' + p.avatar + '</span>' +
        '<span class="profile-info">' +
          '<span class="profile-name-lg">' + escapeHtml(p.name) + (p.id === activeId ? ' <em>使用中</em>' : '') + '</span>' +
          '<span class="profile-meta">' + sum.courses + ' 课 ｜ ' + sum.attempts + ' 次尝试 ｜ ' +
            sum.badges + ' 徽章 ｜ Lv.' + (sum.xp ? Math.floor(sum.xp / 20) + 1 : 1) + '</span>' +
        '</span>' +
        '<span class="profile-ops">' +
          '<button class="text-btn" data-act="rename">改名</button>' +
          (list.length > 1 ? '<button class="text-btn danger" data-act="remove">删除</button>' : '') +
        '</span>';
      row.addEventListener('click', function (ev) {
        var act = ev.target.closest('[data-act]');
        if (act) {
          ev.stopPropagation();
          if (act.dataset.act === 'rename') renameProfileFlow(p.id);
          if (act.dataset.act === 'remove') removeProfileFlow(p.id);
          return;
        }
        switchProfileTo(p.id);
      });
      row.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          switchProfileTo(p.id);
        }
      });
      box.appendChild(row);
    });
    renderProfileChip();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /** 切换档案：先存当前进度，再载入目标档案 */
  function switchProfileTo(id) {
    if (!profileStore || id === profileStore.activeId) return;
    save();                       // 当前 state 写回旧档案
    if (!window.MusicProfiles.switchProfile(profileStore, id)) return;
    var target = activeProfile();
    resetStateToDefaults();
    if (target && target.data) applyDataToState(target.data);
    save();
    refreshAllUI();
    setFeedback('idle', '已切换到 ' + target.name);
  }

  /** 把 state 恢复成默认值（切换档案前调用） */
  function resetStateToDefaults() {
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.assign(state, defaultState());
  }

  function defaultState() {
    return {
      clef: 'treble', difficulty: 'easy', naming: 'solfege', mode: 'name',
      sound: true, theme: 'light',
      octaveStrict: false, inputSource: 'mic',
      mistakes: {}, history: {},
      followBpm: 80, metronome: false, countIn: true,
      sightLevel: 1, rhythmLevel: 1, trainBest: {},
      challenge: { lastDate: '', attempts: 0, best: 0, perfectDays: 0, history: {} },
      stats: { attempts: 0, correct: 0, firstTry: 0, stars: 0, currentStreak: 0, bestStreak: 0, fullCorrect: 0 },
      courses: {},
      gamify: {
        xp: 0, dayStreak: 0, lastDay: '', freezes: 2,
        taskDate: '', tasks: [], prog: { answered: 0, streakBest: 0, fullAnswered: 0 },
        badges: {}
      }
    };
  }

  /** 切换档案后刷新所有界面 */
  function refreshAllUI() {
    applyTheme();
    applySoundBtn();
    gamify.updateStatsUI();
    gamify.renderBadges();
    syncSegments();
    renderQuestion();
    renderLearn();
    renderCourses();
    renderCourseBanner();
    renderSongList();
    renderProfiles();
    renderReview();
    renderHistory();
    renderWeekly();
    stopAllAudio();
  }

  function addProfileFlow() {
    var input = $('profileNameInput');
    var name = input ? input.value : '';
    if (!profileStore) return;
    if (Object.keys(profileStore.profiles).length >= 8) {
      setFeedback('idle', '最多 8 个档案');
      return;
    }
    var p = window.MusicProfiles.addProfile(profileStore, { name: name });
    if (input) input.value = '';
    switchProfileTo(p.id);
    renderProfiles();
  }

  function renameProfileFlow(id) {
    var p = window.MusicProfiles.getProfile(profileStore, id);
    if (!p) return;
    var name = window.prompt('新的名字（最多 12 个字）', p.name);
    if (name == null) return;
    if (!window.MusicProfiles.renameProfile(profileStore, id, name)) {
      setFeedback('idle', '名字不能为空');
      return;
    }
    save();
    renderProfiles();
  }

  function removeProfileFlow(id) {
    var p = window.MusicProfiles.getProfile(profileStore, id);
    if (!p) return;
    if (!window.confirm('确定删除「' + p.name + '」的全部进度吗？此操作不可恢复。')) return;
    var r = window.MusicProfiles.removeProfile(profileStore, id);
    if (!r.ok) {
      setFeedback('idle', r.error);
      return;
    }
    save();
    if (id !== profileStore.activeId) {
      renderProfiles();
      return;
    }
    // 删的是当前档案：载入接替的档案
    var target = activeProfile();
    resetStateToDefaults();
    if (target && target.data) applyDataToState(target.data);
    save();
    refreshAllUI();
  }

  /* ---------- 数据备份（导出 / 导入） ---------- */
  function setBackupStatus(msg, kind) {
    var el = $('backupStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'backup-status' + (kind ? ' ' + kind : '');
  }

  /** 导出：下载当前档案的 JSON 备份（含档案名，便于导入时识别） */
  function exportBackup() {
    if (!window.MusicBackup) return;
    try {
      var who = activeProfile();
      var text = window.MusicBackup.serialize(state, who ? { profileName: who.name, avatar: who.avatar } : {});
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = window.MusicBackup.fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      var ov = window.MusicBackup.overview(state);
      setBackupStatus('已导出' + (who ? '「' + who.name + '」' : '') + '：' + ov.courses + ' 课进度、' +
        ov.attempts + ' 次尝试、' + ov.badges + ' 枚徽章。', 'ok');
    } catch (e) {
      setBackupStatus('导出失败：' + (e && e.message || '未知错误'), 'no');
    }
  }

  /** 导入：先校验，再让用户选合并还是覆盖 */
  function importBackupFile(file) {
    if (!file || !window.MusicBackup) return;
    if (file.size > 2 * 1024 * 1024) {
      setBackupStatus('文件太大（超过 2MB），可能不是备份文件。', 'no');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var res = window.MusicBackup.parse(String(reader.result || ''));
      if (!res.ok) {
        setBackupStatus('导入失败：' + res.error, 'no');
        return;
      }
      var ov = window.MusicBackup.overview(res.data);
      var when = res.exportedAt ? new Date(res.exportedAt).toLocaleString() : '未知时间';
      var fromWho = res.meta && res.meta.profileName ? '（' + res.meta.profileName + '）' : '';
      var msg = [
        '备份来自 ' + when,
        '· 课程进度：' + ov.courses + ' 课',
        '· 成绩：' + ov.attempts + ' 次尝试 / ' + ov.correct + ' 题答对 / ' + ov.stars + ' 星',
        '· 徽章：' + ov.badges + ' 枚 ｜ XP：' + ov.xp,
        '',
        '点「确定」= 合并（保留两边更好的进度）',
        '点「取消」= 覆盖（用备份替换本机数据）'
      ].join('\n');
      var merge = window.confirm(msg);
      applyImport(res.data, merge ? 'merge' : 'replace');
    };
    reader.onerror = function () {
      setBackupStatus('读取文件失败，请重试。', 'no');
    };
    reader.readAsText(file);
  }

  function applyImport(data, mode) {
    // 防御：如果误把整个多档案存储当成备份，取当前档案的数据
    if (data && data.profiles && data.activeId && data.profiles[data.activeId]) {
      data = data.profiles[data.activeId].data;
    }
    var next = mode === 'merge'
      ? window.MusicBackup.mergeState(state, data)
      : window.MusicBackup.replaceState(data);
    // 用新状态替换当前对象（保持引用不变，其他模块仍持有 state）
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.keys(next).forEach(function (k) { state[k] = next[k]; });
    // 补齐可能缺失的默认字段，避免旧备份导致界面异常
    ensureDefaults();
    save();
    renderProfiles();
    applyTheme();
    applySoundBtn();
    gamify.updateStatsUI();
    gamify.renderBadges();
    syncSegments();
    renderCourses();
    renderLearn();
    renderQuestion();
    renderReview();
    renderHistory();
    var ov = window.MusicBackup.overview(state);
    setBackupStatus((mode === 'merge' ? '已合并导入：' : '已覆盖导入：') +
      ov.courses + ' 课、' + ov.attempts + ' 次尝试、' + ov.badges + ' 枚徽章。', 'ok');
  }

  /** 导入后补齐默认字段（老备份可能缺新字段） */
  function ensureDefaults() {
    if (!state.stats || typeof state.stats !== 'object') {
      state.stats = { attempts: 0, correct: 0, firstTry: 0, stars: 0, currentStreak: 0, bestStreak: 0, fullCorrect: 0 };
    }
    ['attempts', 'correct', 'firstTry', 'stars', 'currentStreak', 'bestStreak', 'fullCorrect'].forEach(function (k) {
      state.stats[k] = toNum(state.stats[k]);
    });
    if (!state.courses || typeof state.courses !== 'object') state.courses = {};
    if (!state.mistakes || typeof state.mistakes !== 'object') state.mistakes = {};
    if (!state.history || typeof state.history !== 'object') state.history = {};
    if (!state.trainBest || typeof state.trainBest !== 'object') state.trainBest = {};
    if (!state.challenge || typeof state.challenge !== 'object') {
      state.challenge = { lastDate: '', attempts: 0, best: 0, perfectDays: 0, history: {} };
    }
    if (!state.gamify || typeof state.gamify !== 'object') {
      state.gamify = { xp: 0, dayStreak: 0, lastDay: '', freezes: 2, taskDate: '', tasks: [], prog: {}, badges: {} };
    }
    var g = state.gamify;
    g.xp = toNum(g.xp);
    g.dayStreak = toNum(g.dayStreak);
    g.freezes = toNum(g.freezes);
    if (!g.badges || typeof g.badges !== 'object') g.badges = {};
    if (!g.prog || typeof g.prog !== 'object') g.prog = { answered: 0, streakBest: 0, fullAnswered: 0 };
    if (!Array.isArray(g.tasks)) g.tasks = [];
    if (!CLEF_KEYS[state.clef]) state.clef = 'treble';
    if (!DIFF_KEYS[state.difficulty]) state.difficulty = 'easy';
    if (!NAMING_KEYS[state.naming]) state.naming = 'solfege';
    if (!MODE_KEYS[state.mode]) state.mode = 'name';
    if (state.theme !== 'dark') state.theme = 'light';
    if (typeof state.sound !== 'boolean') state.sound = true;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    load();

    // 创建 gamify 模块实例（依赖注入）
    gamify = window.MusicGamify.create({
      state: state,
      Audio: Audio,
      $: $,
      save: save,
      getPracticeDifficulty: function () { return activePracticeConfig().difficulty; }
    });

    applyTheme();
    applySoundBtn();
    gamify.updateStatsUI();
    syncSegments();
    renderQuestion();
    renderLearn();
    gamify.renderBadges();
    renderCourses();
    renderCourseBanner();
    renderSongList();
    renderProfiles();

    // 导航（点击 + 方向键，符合 WAI-ARIA Tabs 模式）
    var navTabs = Array.prototype.slice.call(document.querySelectorAll('.nav-tab'));
    navTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchPage(t.dataset.page);
        if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
      t.addEventListener('keydown', function (e) {
        var i = navTabs.indexOf(t);
        var next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % navTabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + navTabs.length) % navTabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = navTabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        switchPage(navTabs[next].dataset.page);
        navTabs[next].focus();
      });
    });

    // 练习模式切换
    $('segMode').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg) return;
      state.mode = seg.dataset.mode;
      save();
      setSegActive($('segMode'), function (b) { return b === seg; });
      renderQuestion();
    });
    $('replayBtn').addEventListener('click', replayListen);
    $('placeConfirm').addEventListener('click', function () {
      if (placeMidi !== null) submitAnswer(placeMidi, 'midi');
    });

    // 键盘快捷键
    document.addEventListener('keydown', onKeydown);

    // 训练营
    $('trainTabs').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (seg) showTrainTab(seg.dataset.tab);
    });
    $('sightStartBtn').addEventListener('click', function () {
      if (sightState && sightState.timer) { abortSight(); return; }
      startSight();
    });
    $('profileBtn').addEventListener('click', function () { switchPage('settings'); });
    $('profileAddBtn').addEventListener('click', addProfileFlow);
    $('profileNameInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); addProfileFlow(); }
    });
    $('exportBtn').addEventListener('click', exportBackup);
    $('importFile').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) importBackupFile(f);
      ev.target.value = '';   // 允许重复导入同一个文件
    });
    $('reviewDrillBtn').addEventListener('click', startReviewDrill);
    $('reviewClearBtn').addEventListener('click', function () {
      var btn = $('reviewClearBtn');
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = '再点一次确认';
        setTimeout(function () { btn.dataset.armed = '0'; btn.textContent = '清空错题本'; }, 2500);
        return;
      }
      state.mistakes = {};
      save();
      btn.dataset.armed = '0';
      btn.textContent = '清空错题本';
      renderReview();
    });
    $('theoryStartBtn').addEventListener('click', startTheory);
    $('rhythmStartBtn').addEventListener('click', startRhythm);
    $('rhythmPad').addEventListener('pointerdown', function (ev) { ev.preventDefault(); tapRhythm(); });

    // 主题/声音快捷按钮
    $('themeBtn').addEventListener('click', function () {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      save(); applyTheme();
    });
    $('soundBtn').addEventListener('click', function () {
      state.sound = !state.sound;
      save(); applySoundBtn();
      if (state.sound) Audio.playNote(60);
    });

    // 设置控件（切换谱号/写法时清掉学习页残留的高亮 flash）
    bindSeg('segClef', 'clef', function () { flash = null; renderQuestion(); renderLearn(); });
    bindSeg('segDifficulty', 'difficulty', function () { renderQuestion(); renderLearn(); });
    bindSeg('segNaming', 'naming', function () { flash = null; renderQuestion(); renderLearn(); });
    $('segOctave').addEventListener('click', function (ev) {
      var seg = ev.target.closest('.seg');
      if (!seg) return;
      state.octaveStrict = seg.dataset.value === 'strict';
      save();
      setSegActive($('segOctave'), function (b) { return b === seg; });
    });
    $('swSound').addEventListener('change', function (ev) {
      state.sound = ev.target.checked;
      save(); applySoundBtn();
      if (state.sound) Audio.playNote(60);
    });
    // 重置：三档（统计 / 课程 / 全部），每档都需连点两次确认
    bindReset('resetStats', 'stats');
    bindReset('resetCourses', 'courses');
    bindReset('resetAll', 'all');
  }

  // 供自动化测试读取运行状态（只读）
  window.__musicApp = {
    followRun: function () { return practiceSession && practiceSession.run; },
    feed: function (m) { onFollowPitch(m); },
    finishFollow: function () { finishPractice(); },
    trainTab: function () { return trainTab; },
    recording: function () { return !!(practiceSession && practiceSession.recording); },
    applyImport: function (data, mode) { applyImport(data, mode); },
    exportText: function () { var w = activeProfile(); return window.MusicBackup.serialize(state, w ? { profileName: w.name, avatar: w.avatar } : {}); },
    profiles: function () { return profileStore; },
    state: function () { return state; },
    challengeRun: function () { return challengeRun; },
    history: function () { return state.history; },
    mistakes: function () { return state.mistakes; }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
