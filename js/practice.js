/* practice.js — 练习模式控制器（4 种模式：点音名 / 点琴键 / 听音辨键 / 放音符）
 * 通过 MusicPractice.create(deps) 工厂创建控制器实例。
 * 依赖：state, Core, Staff, Audio, gamify, $, setFeedback, getCourseActive, onCorrect
 */
(function (global) {
  'use strict';

  var OK_WORDS = ['太棒了！🎉', '真厉害！🌟', '答对了！👏', '完美！✨', '好聪明！🧠', '继续加油！🚀'];
  var NO_WORDS = ['再想想～', '没关系，再来一次！', '加油，你能行！💪', '仔细看看它的位置哦'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function create(deps) {
    var state = deps.state;
    var Core = deps.Core;
    var Staff = deps.Staff;
    var Audio = deps.Audio;
    var gamify = deps.gamify;
    var $ = deps.$;
    var setFeedback = deps.setFeedback;
    var getCourseActive = deps.getCourseActive || function () { return null; };
    var onCorrect = deps.onCorrect || function () {};

    // ---------- 内部状态 ----------
    var question = null;
    var usedWrong = false;
    var wrongAttempts = 0;
    var busy = false;
    var nextTimer = null;
    var placeMidi = null;
    var answerKeyboard = null;

    /* ---------- 当前练习配置 ---------- */
    function activePracticeConfig() {
      var ca = getCourseActive();
      if (ca) {
        var c = (window.CourseData.COURSES.filter(function (x) { return x.id === ca.id; })[0]) || null;
        if (c) return { clef: c.practice.clef, difficulty: c.practice.difficulty, mode: c.practice.mode };
      }
      return { clef: state.clef, difficulty: state.difficulty, mode: state.mode };
    }

    /* ---------- 答案索引/标签/范围 ---------- */
    function answerLabel(idx) {
      var cfg = activePracticeConfig();
      var names = cfg.difficulty === 'full'
        ? (state.naming === 'letter' ? Core.LETTER_12 : Core.SOLFEGE_12)
        : (state.naming === 'letter' ? Core.LETTERS : Core.SOLFEGE);
      return names[idx];
    }
    function answerIndexOf(midi) {
      var cfg = activePracticeConfig();
      if (cfg.difficulty === 'full') return Core.SEMI_INDEX[midi % 12];
      var dia = Core.midiToDia(midi);
      return ((dia % 7) + 7) % 7;
    }
    function answerKeyRange() {
      var cfg = activePracticeConfig();
      if (cfg.difficulty === 'full') return Core.KEYBOARD_RANGE.full;
      return Core.KEYBOARD_RANGE[cfg.clef === 'random' ? 'treble' : cfg.clef];
    }

    /* ---------- 作答区渲染 ---------- */
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
        (function (idx) {
          b.addEventListener('click', function () { submitAnswer(idx, 'idx'); });
        })(i);
        box.appendChild(b);
      }
    }
    function renderAnswerKeyboard() {
      var kbBox = $('keyboardAnswer');
      var r = answerKeyRange();
      answerKeyboard = Staff.renderKeyboard(kbBox, r[0], r[1], {
        marks: [{ midi: 60, label: '中央C' }],
        onKey: function (midi) { submitAnswer(midi, 'midi'); }
      });
    }
    function renderAnswerArea() {
      var box = $('answerButtons');
      var kbBox = $('keyboardAnswer');
      var cfg = activePracticeConfig();
      if (cfg.mode === 'name') {
        box.style.display = '';
        kbBox.style.display = 'none';
        buildAnswerButtons();
      } else {
        box.style.display = 'none';
        kbBox.style.display = '';
        renderAnswerKeyboard();
      }
    }

    return {
      activePracticeConfig: activePracticeConfig,
      answerLabel: answerLabel,
      answerIndexOf: answerIndexOf,
      buildAnswerButtons: buildAnswerButtons,
      renderAnswerKeyboard: renderAnswerKeyboard,
      renderAnswerArea: renderAnswerArea,
      getQuestion: function () { return question; },
      isBusy: function () { return busy; },
      OK_WORDS: OK_WORDS,
      NO_WORDS: NO_WORDS
    };
  }

  global.MusicPractice = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
