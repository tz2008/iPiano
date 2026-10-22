/* audio.js — Web Audio 钢琴音合成（无采样文件，谐波+包络） */
(function (global) {
  'use strict';
  var Core = global.MusicCore;

  var ctx = null;
  var activeVoices = 0;
  var MAX_VOICES = 12; // 并发音数上限，防快速连点堆叠
  // 用户首次手势后做一次"空播放"以解锁 AudioContext（iOS Safari 强约束）
  var unlockArmed = false;
  function ensure() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  /** 在任意用户手势（点击/触摸/按键）中调用一次，永久解锁音频 */
  function unlock() {
    if (unlockArmed) return;
    unlockArmed = true;
    var ac = ensure();
    if (!ac) return;
    try {
      var buf = ac.createBuffer(1, 1, 22050);
      var src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      src.start(0);
      // 解锁后即可移除监听
      ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(function (t) {
        document.removeEventListener(t, unlock, true);
      });
    } catch (e) {}
  }
  // 首次手势自动解锁（捕获阶段，避免被 stopPropagation 屏蔽）
  if (global.document && global.document.addEventListener) {
    ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(function (t) {
      document.addEventListener(t, unlock, true);
    });
  }

  /** 播放一个钢琴音
   * opts: { delay, dur, vel }
   */
  function playNote(midi, opts) {
    opts = opts || {};
    var ac = ensure();
    if (!ac) return;
    if (activeVoices >= MAX_VOICES) return;
    var f = Core.freq(midi);
    var t = ac.currentTime + (opts.delay || 0);
    var dur = opts.dur != null ? opts.dur : 1.3;
    var vel = opts.vel != null ? opts.vel : 0.55;

    var out = ac.createGain();
    out.connect(ac.destination);
    // 包络：快速起音 + 指数衰减（类钢琴）
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vel, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    // 谐波合成：基频 + 高次泛音（幅度递减），triangle 波形偏温暖
    var partials = [
      [1, 1.00, 0], [2, 0.50, 4], [3, 0.28, 7],
      [4, 0.16, 10], [5, 0.09, 13], [6, 0.05, 16]
    ];
    activeVoices++;
    partials.forEach(function (p) {
      var o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * p[0], t);
      o.detune.setValueAtTime(p[2], t);
      var g = ac.createGain();
      g.gain.value = p[1] * 0.28;
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.1);
      // 播放结束后释放节点，避免泄漏
      o.onended = function () {
        g.disconnect();
        o.disconnect();
      };
    });
    // 整组结束后释放 out 与并发计数
    setTimeout(function () {
      activeVoices = Math.max(0, activeVoices - 1);
      out.disconnect();
    }, (dur + 0.2) * 1000);
  }

  /** 短促的提示音（答对时的高音叮咚） */
  function playDing(midi) {
    playNote(midi, { dur: 0.9, vel: 0.5 });
  }

  /** 温和的"再想想"提示音（低音短音） */
  function playNudge() {
    var ac = ensure();
    if (!ac) return;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.linearRampToValueAtTime(180, t + 0.18);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.25);
  }

  global.PianoAudio = {
    ensure: ensure,
    unlock: unlock,
    playNote: playNote,
    playDing: playDing,
    playNudge: playNudge
  };
})(window);
