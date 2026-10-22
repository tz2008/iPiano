/* follow.js — 跟练引擎（纯逻辑，无 DOM / 无 Audio，可 Node 单测）
 *
 * 职责：
 *  1. 把逐帧送来的音高（麦克风或 MIDI）切成“音符事件”（起音检测）；
 *  2. 与目标谱面按顺序匹配，支持错音、漏音、跳音（lookahead）判定；
 *  3. 按相邻音的时值比例给出节奏评分（抢拍 / 拖拍 / 准）。
 *
 * 与旧实现的关键区别：**按起音推进，不再要求“稳住 700ms”**，
 * 因此可以自由速度弹完整首曲子，接近真实陪练 App 的体验。
 */
(function (global) {
  'use strict';

  var STABLE_MS = 55;       // 音高需稳定这么久才认为是一次起音（滤掉滑音/噪声）
  var SEMI_EPS = 0.6;       // 判定“音变了”的半音阈值
  var LOOKAHEAD = 2;        // 允许向前找几个音，用于识别“漏弹”
  var RHYTHM_TOL = 0.35;    // 相对时值误差容忍（0.35 = 35%）
  var MAX_RATIO = 3;        // 超过该比例视为“停顿”，不计入节奏统计

  /* ---------- 音高工具（与 pitch.js 一致，独立实现以便单独测试） ---------- */
  /** 折叠到 [-6, 6] 的半音差：同音名（差 12）返回 0 */
  function pitchDiffHalf(a, b) {
    var d = a - b;
    return ((d + 6) % 12 + 12) % 12 - 6;
  }
  /** 音高是否匹配：octave=true 时允许跨八度同音名 */
  function pitchMatches(detected, target, tolerance, octave) {
    if (detected == null || target == null) return false;
    var d = octave ? pitchDiffHalf(detected, target) : detected - target;
    return Math.abs(d) <= tolerance;
  }

  /* ---------- 序列构造 ---------- */
  /** 把一首曲目转成引擎使用的序列：[{ midis: [..], beats }]
   * hand: 'R' 旋律 | 'L' 左手伴奏 | 'BOTH' 右手 + 同时刻左手
   */
  function sequenceFromSong(song, hand) {
    if (!song || !song.notes) return [];
    if (hand === 'L' && song.bass && song.bass.length) {
      return song.bass.map(function (n) { return { midis: [n[0]], beats: n[1] }; });
    }
    if (hand === 'BOTH' && song.bass && song.bass.length) {
      var seq = [], acc = 0, bass = song.bass;
      for (var i = 0; i < song.notes.length; i++) {
        var midis = [song.notes[i][0]];
        var bn = bassAt(bass, acc);
        if (bn != null && midis.indexOf(bn) < 0) midis.push(bn);
        midis.sort(function (a, b) { return a - b; }); // 与输入集合一致按低→高排序
        seq.push({ midis: midis, beats: song.notes[i][1] });
        acc += song.notes[i][1];
      }
      return seq;
    }
    return song.notes.map(function (n) { return { midis: [n[0]], beats: n[1] }; });
  }
  /** tBeats 时刻的左手音 */
  function bassAt(bass, tBeats) {
    var acc = 0;
    for (var i = 0; i < bass.length; i++) {
      if (tBeats < acc + bass[i][1] - 0.001) return bass[i][0];
      acc += bass[i][1];
    }
    return bass.length ? bass[bass.length - 1][0] : null;
  }

  /** 按拍切分段落：每 measuresPerSegment 个小节为一段（默认 4 小节） */
  function segments(seq, beatsPerMeasure, measuresPerSegment) {
    beatsPerMeasure = beatsPerMeasure || 4;
    measuresPerSegment = measuresPerSegment || 4;
    var segBeats = beatsPerMeasure * measuresPerSegment;
    var out = [{ start: 0, end: seq.length, label: '整曲' }];
    var acc = 0, start = 0, no = 1;
    for (var i = 0; i < seq.length; i++) {
      acc += seq[i].beats;
      var atEnd = i === seq.length - 1;
      if (acc >= segBeats - 0.001 || atEnd) {
        if (i > start) {
          out.push({ start: start, end: i + 1, label: '第 ' + no + ' 段（第 ' + (start + 1) + '–' + (i + 1) + ' 音）' });
          no++;
        }
        start = i + 1;
        acc = 0;
      }
    }
    return out;
  }

  /* ---------- 运行状态 ---------- */
  /**
   * opts: {
   *   seq, start, end, mode: 'practice'|'evaluate', bpm, tolerance, octave, loop,
   *   onFinish(run)
   * }
   */
  function createRun(opts) {
    var seq = opts.seq || [];
    var start = opts.start || 0;
    var end = opts.end == null ? seq.length : Math.min(opts.end, seq.length);
    return {
      seq: seq, start: start, end: end,
      mode: opts.mode || 'practice',       // practice: 弹错停住等对；evaluate: 弹错也继续
      bpm: opts.bpm || 90,
      tolerance: opts.tolerance == null ? 0.5 : opts.tolerance,
      octave: opts.octave !== false,
      loop: !!opts.loop,
      onFinish: opts.onFinish || null,

      index: start,
      startedAt: null,
      finished: false,

      events: [],        // { i, kind:'hit'|'wrong'|'missed', midis, t, timing }
      wrong: {},         // i -> 次数
      missed: {},        // i -> true
      hits: 0,
      attempts: 0,
      loops: 0,

      // 内部：起音检测
      _stable: null, _stableSince: 0, _emitted: null,
      // 内部：节奏参考
      _prevT: null, _prevIndex: null
    };
  }

  /** 把一次输入（单音数字或和弦数组）规范成排序后的数组 */
  function toSet(input) {
    if (input == null) return null;
    var arr = Array.isArray(input) ? input.slice() : [input];
    arr = arr.filter(function (m) { return m != null && isFinite(m); });
    if (!arr.length) return null;
    arr.sort(function (a, b) { return a - b; });
    return arr;
  }
  function setEquals(a, b, eps) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > eps) return false;
    return true;
  }

  /**
   * 送入一帧检测结果。
   * @param input 单个 MIDI（浮点）| MIDI 数组（和弦）| null（静音）
   * @param now   单调时间（ms），测试时可任意给定
   * @returns 本次产生的起音事件，或 null
   */
  function feed(run, input, now) {
    if (!run || run.finished) return null;
    var set = toSet(input);
    if (!set) {                       // 静音：允许同一音再次触发
      run._stable = null; run._stableSince = 0; run._emitted = null;
      return null;
    }
    if (!run._stable || !setEquals(set, run._stable, SEMI_EPS)) {
      run._stable = set;
      run._stableSince = now;
      return null;                    // 刚变化，等待稳定
    }
    if (now - run._stableSince < STABLE_MS) return null;   // 未稳定
    if (run._emitted && setEquals(set, run._emitted, SEMI_EPS)) return null; // 同一音持续
    run._emitted = set;
    return onset(run, set, now);
  }

  /** 一次起音：匹配目标音，必要时前瞻 */
  function onset(run, set, now) {
    if (run.index >= run.end) {
      // 段落末尾又弹了一下：按循环/结束处理
      if (run.loop) { loopBack(run); } else { finish(run); }
      return null;
    }
    var target = run.seq[run.index];
    var timing = timingOf(run, run.index, now);
    var ok = matchesAll(set, target.midis, run.tolerance, run.octave);

    if (ok) {
      record(run, run.index, 'hit', set, now, timing);
      advance(run, run.index + 1);
      return run.events[run.events.length - 1];
    }

    // 前瞻：如果弹的是后面第 1~LOOKAHEAD 个音，说明中间漏弹了
    for (var j = run.index + 1; j <= Math.min(run.index + LOOKAHEAD, run.end - 1); j++) {
      if (matchesAll(set, run.seq[j].midis, run.tolerance, run.octave)) {
        for (var k = run.index; k < j; k++) {
          run.missed[k] = true;
          run.events.push({ i: k, kind: 'missed', midis: run.seq[k].midis, t: now });
        }
        record(run, j, 'hit', set, now, timingOf(run, j, now));
        advance(run, j + 1);
        return run.events[run.events.length - 1];
      }
    }

    // 真错音
    var wasFirstWrong = !run.wrong[run.index];
    record(run, run.index, 'wrong', set, now, timing);
    run.wrong[run.index] = (run.wrong[run.index] || 0) + 1;
    if (run.mode === 'evaluate') advance(run, run.index + 1);
    // practice 模式：停在当前音等孩子改正。
    // 同一次错音只提示一次，之后保持安静，避免刷屏。
    return wasFirstWrong ? run.events[run.events.length - 1] : null;
  }

  function matchesAll(set, targets, tolerance, octave) {
    if (!targets || !targets.length) return false;
    for (var i = 0; i < targets.length; i++) {
      var found = false;
      for (var j = 0; j < set.length; j++) {
        if (pitchMatches(set[j], targets[i], tolerance, octave)) { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  /** 记录事件并更新节奏参考点 */
  function record(run, i, kind, set, now, timing) {
    run.events.push({ i: i, kind: kind, midis: set, t: now, timing: timing });
    if (kind === 'hit') run.hits++;
    run.attempts++;
    run._prevT = now;
    run._prevIndex = i;
  }

  /** 相邻起音的时值比（相对节奏指标，天然容忍整体变速） */
  function timingOf(run, i, now) {
    if (run._prevT == null || run._prevIndex == null) {
      return { ratio: 1, err: 0, first: true, expectedBeats: run.seq[i].beats };
    }
    var beats = 0;
    for (var k = run._prevIndex; k < i; k++) beats += run.seq[k].beats;
    if (beats <= 0) beats = run.seq[run._prevIndex].beats;
    var expectedMs = beats * 60000 / run.bpm;
    var actualMs = Math.max(1, now - run._prevT);
    return { ratio: actualMs / expectedMs, err: actualMs - expectedMs, first: false, expectedBeats: beats };
  }

  function advance(run, next) {
    run.index = next;
    if (next >= run.end) {
      if (run.loop) { loopBack(run); return; }
      finish(run);
    }
  }

  function loopBack(run) {
    run.loops++;
    run.index = run.start;
    run._prevT = null;
    run._prevIndex = null;
    run.startedAt = null;
    run._emitted = null;
    run._stable = null;
  }

  function finish(run) {
    if (run.finished) return;
    run.finished = true;
    if (run.onFinish) run.onFinish(run);
  }

  /* ---------- 统计 ---------- */
  /** 节奏：用相对时值比的中位数做“整体速度归一化”，再判抢/拖 */
  function rhythmStats(run) {
    var ratios = [];
    run.events.forEach(function (e) {
      if (e.kind !== 'hit' || !e.timing || e.timing.first) return;
      var r = e.timing.ratio;
      if (r > 0 && r <= MAX_RATIO) ratios.push(r);
    });
    if (!ratios.length) return { count: 0, good: 0, early: 0, late: 0, accuracy: 0, tempoRatio: 1, hasData: false };
    var sorted = ratios.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var good = 0, early = 0, late = 0;
    ratios.forEach(function (r) {
      var norm = r / median;                    // 归一化后 = 1 表示时值准确
      if (Math.abs(norm - 1) <= RHYTHM_TOL) good++;
      else if (norm < 1) early++;               // 比预期短 → 抢拍
      else late++;                              // 比预期长 → 拖拍
    });
    return {
      count: ratios.length, good: good, early: early, late: late,
      accuracy: Math.round(good / ratios.length * 100),
      tempoRatio: Math.round(median * 100) / 100,   // 实际速度 / 目标速度
      hasData: true
    };
  }

  /** 总结（报告用） */
  function summary(run) {
    var total = Math.max(0, run.end - run.start);
    var missed = Object.keys(run.missed).length;
    var wrongNotes = Object.keys(run.wrong).length;
    var wrongHits = 0;
    for (var k in run.wrong) wrongHits += run.wrong[k];
    // 正确率：正确起音 / (正确 + 错音次数 + 漏音)，循环练习时按总尝试算
    var denom = run.hits + wrongHits + missed;
    var accuracy = denom ? Math.round(run.hits / denom * 100) : 0;
    var rh = rhythmStats(run);
    var pitchAcc = total ? Math.round((total - wrongNotes - missed) / total * 100) : 0;
    return {
      total: total,
      hits: run.hits,
      wrongNotes: wrongNotes,
      wrongHits: wrongHits,
      missed: missed,
      accuracy: accuracy,            // 按尝试次数
      pitchAccuracy: Math.max(0, Math.min(100, pitchAcc)), // 按音符数
      rhythm: rh,
      loops: run.loops,
      stars: starFor(Math.max(0, Math.min(100, pitchAcc)), rh.hasData ? rh.accuracy : 100)
    };
  }

  /** 综合星级：音准 70% + 节奏 30% */
  function starFor(pitchAcc, rhythmAcc) {
    var score = pitchAcc * 0.7 + rhythmAcc * 0.3;
    if (score >= 92) return 3;
    if (score >= 75) return 2;
    return 1;
  }

  global.MusicFollow = {
    pitchDiffHalf: pitchDiffHalf,
    pitchMatches: pitchMatches,
    sequenceFromSong: sequenceFromSong,
    bassAt: bassAt,
    segments: segments,
    createRun: createRun,
    feed: feed,
    summary: summary,
    rhythmStats: rhythmStats,
    STABLE_MS: STABLE_MS,
    RHYTHM_TOL: RHYTHM_TOL
  };
})(typeof window !== 'undefined' ? window : globalThis);
