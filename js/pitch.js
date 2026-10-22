/* pitch.js — 唱谱音高检测：麦克风采集 + 自相关基频检测 + 音准判定
 * 纯逻辑函数（freqToMidi / pitchDiffHalf / isPitchOk）可独立单测；
 * 麦克风部分依赖浏览器 API（getUserMedia），jsdom/无 HTTPS 环境自动降级。
 */
(function (global) {
  'use strict';

  /* ---------- 纯逻辑 ---------- */
  /** 频率 -> midi（浮点） */
  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

  /** midi -> 频率 */
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /** 归一化最小半音差（把跨八度折叠到 [-6,6]）：同音名（差 12 半音）返回 0 */
  function pitchDiffHalf(detectedMidi, targetMidi) {
    var d = detectedMidi - targetMidi;
    return ((d + 6) % 12 + 12) % 12 - 6;
  }

  /**
   * 音准判定：|归一化半音差| <= tolerance 即算对。
   * 注意这同时允许：±0.5 半音（音准小偏差）和 ±12 半音（跨八度同音名，
   * 儿童整体移八度唱也算对），对小朋友友好。
   */
  function isPitchOk(detectedMidi, targetMidi, tolerance) {
    if (detectedMidi == null || targetMidi == null) return false;
    tolerance = tolerance == null ? 0.5 : tolerance;
    return Math.abs(pitchDiffHalf(detectedMidi, targetMidi)) <= tolerance;
  }

  /* ---------- 自相关基频检测 ---------- */
  /** 返回频率 Hz；无有效信号返回 -1 */
  function autoCorrelate(buf, sampleRate) {
    var size = buf.length;
    var rms = 0;
    for (var i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.012) return -1; // 静音

    var r1 = 0, r2 = size - 1;
    var thres = 0.2;
    for (var i1 = 0; i1 < size / 2; i1++) {
      if (Math.abs(buf[i1]) < thres) { r1 = i1; break; }
    }
    for (var i2 = 1; i2 < size / 2; i2++) {
      if (Math.abs(buf[size - i2]) < thres) { r2 = size - i2; break; }
    }
    buf = buf.slice(r1, r2);
    size = buf.length;
    if (size < 64) return -1;

    var c = new Float32Array(size);
    for (var j = 0; j < size; j++) {
      var sum = 0;
      for (var k = 0; k < size - j; k++) sum += buf[k] * buf[k + j];
      c[j] = sum;
    }
    var d = 0;
    while (d < size - 1 && c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (var m = d; m < size; m++) {
      if (c[m] > maxval) { maxval = c[m]; maxpos = m; }
    }
    if (maxpos <= 0 || maxpos >= size - 1) return -1;
    var t0 = maxpos;
    var x1 = c[t0 - 1], x2 = c[t0], x3 = c[t0 + 1];
    var a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
    if (a !== 0) t0 = t0 - b / (2 * a);
    if (t0 <= 1) return -1;
    return sampleRate / t0;
  }

  /* ---------- 麦克风封装 ---------- */
  var audioCtx = null, analyser = null, stream = null, rafId = null, running = false;
  var fftSize = 2048;
  var duoRanges = { lowMinM: 36, lowMaxM: 58, highMinHz: 200, highMaxHz: 22000 };

  function supported() {
    return !!(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function start(onPitch, onError, opts) {
    if (!supported()) {
      if (onError) onError('unsupported');
      return;
    }
    opts = opts || {};
    fftSize = opts.mode === 'duo' ? 8192 : 2048;
    if (opts.duoRanges) for (var k in opts.duoRanges) duoRanges[k] = opts.duoRanges[k];
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = 0.4;
        src.connect(analyser);
        running = true;
        loop(onPitch, opts);
      } catch (e) {
        if (onError) onError('audio');
      }
    }).catch(function (e) {
      // 友好提示：区分权限被拒、NotFound、其他
      var name = e && e.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        if (onError) onError('denied');
      } else if (name === 'NotFoundError') {
        if (onError) onError('notfound');
      } else {
        if (onError) onError(name || 'unknown');
      }
    });
  }

  function loop(onPitch, opts) {
    if (!running || !analyser) return;
    if (opts && opts.mode === 'duo' && onPitch.__duo) {
      var fd = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(fd);
      var td = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(td);
      var duo = detectDuo(td, audioCtx ? audioCtx.sampleRate : 44100, analyser.fftSize, fd, duoRanges);
      onPitch.__duo(duo);
    } else {
      var buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      var f = autoCorrelate(buf, audioCtx ? audioCtx.sampleRate : 44100);
      if (f > 0) onPitch(freqToMidi(f), f);
      else onPitch(null, null);
    }
    rafId = global.requestAnimationFrame(function () { loop(onPitch, opts); });
  }

  /** 当前麦克风流（供录音复用，避免二次申请权限）；未开启时返回 null */
  function currentStream() { return stream; }

  function stop() {
    running = false;
    if (rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    analyser = null;
  }

  /* ---------- 复音（双手）检测：低音自相关 + 高音频谱峰 ---------- */
  /** 一阶低通滤波（用于低音基频检测，滤掉高音干扰） */
  function lowpass(buf, alpha) {
    var out = new Float32Array(buf.length);
    var prev = 0;
    for (var i = 0; i < buf.length; i++) {
      prev += alpha * (buf[i] - prev);
      out[i] = prev;
    }
    return out;
  }

  /** 低频自相关：只在低音滞后范围（≈85Hz~190Hz，对应左手伴奏 G2~F#3）找周期，天然排除高音；粗扫+细化控制计算量 */
  function lowFreqAutocorr(buf, sampleRate) {
    var lo = Math.floor(sampleRate / 190);
    var hi = Math.min(buf.length - 2, Math.ceil(sampleRate / 85));
    if (lo >= hi) return -1;
    var best = -1, bestLag = -1;
    for (var lag = lo; lag <= hi; lag += 3) {
      var sum = 0;
      for (var i = 0; i < buf.length - lag; i += 2) sum += buf[i] * buf[i + lag];
      if (sum > best) { best = sum; bestLag = lag; }
    }
    if (bestLag < 0) return -1;
    var refined = bestLag, refBest = -1;
    for (var lag2 = Math.max(lo, bestLag - 4); lag2 <= Math.min(hi, bestLag + 4); lag2++) {
      var s = 0;
      for (var i2 = 0; i2 < buf.length - lag2; i2 += 2) s += buf[i2] * buf[i2 + lag2];
      if (s > refBest) { refBest = s; refined = lag2; }
    }
    return sampleRate / refined;
  }

  /**
   * 双手同时弹两个音时的复音检测：
   * - 低音（左手伴奏）：时域低通滤波后自相关，周期精确
   * - 高音（右手旋律）：频域峰值 + 抛物线插值
   * buf: Float32Array 时域（长度 = fftSize）；freqData: Float32Array 频域（长度 = fftSize/2）
   * 返回 { low: {freq, midi} | null, high: {freq, midi} | null }
   */
  function detectDuo(buf, sampleRate, fftSize, freqData, ranges) {
    ranges = ranges || {};
    var lowMinM = ranges.lowMinM != null ? ranges.lowMinM : 36; // C2
    var lowMaxM = ranges.lowMaxM != null ? ranges.lowMaxM : 58; // B3
    var highMinHz = ranges.highMinHz != null ? ranges.highMinHz : 200;
    var highMaxHz = ranges.highMaxHz != null ? ranges.highMaxHz : 22000;

    // 低音：低通后低频自相关（滞后范围锁定 29~88Hz，不受高音干扰）
    var low = null;
    if (buf && buf.length >= 512) {
      var lp = lowpass(buf, 0.94);
      var f = lowFreqAutocorr(lp, sampleRate);
      if (f > 0) {
        var m = freqToMidi(f);
        if (m >= lowMinM && m <= lowMaxM) low = { freq: f, midi: m };
      }
    }

    // 高音：频域峰值
    var high = null;
    if (freqData && freqData.length > 4) {
      var binHz = sampleRate / fftSize;
      var start = Math.max(1, Math.floor(highMinHz / binHz));
      var end = Math.min(freqData.length - 1, Math.ceil(highMaxHz / binHz));
      var best = -Infinity, bestIdx = -1;
      for (var i = start; i <= end; i++) {
        if (freqData[i] > best) { best = freqData[i]; bestIdx = i; }
      }
      if (bestIdx > 0 && isFinite(best) && best > -60) {
        var y0 = freqData[bestIdx - 1] || -Infinity, y1 = freqData[bestIdx], y2 = freqData[bestIdx + 1] || -Infinity;
        var a = (y0 + y2 - 2 * y1) / 2, b = (y2 - y0) / 2;
        var peak = (a !== 0 && isFinite(a)) ? bestIdx - b / (2 * a) : bestIdx;
        var hf = Math.max(highMinHz, Math.min(highMaxHz, peak * binHz));
        high = { freq: hf, midi: freqToMidi(hf) };
      }
    }
    return { low: low, high: high };
  }

  global.PitchDetector = {
    freqToMidi: freqToMidi,
    midiToFreq: midiToFreq,
    pitchDiffHalf: pitchDiffHalf,
    isPitchOk: isPitchOk,
    autoCorrelate: autoCorrelate,
    detectDuo: detectDuo,
    supported: supported,
    start: start,
    stop: stop,
    currentStream: currentStream
  };
})(typeof window !== 'undefined' ? window : globalThis);
