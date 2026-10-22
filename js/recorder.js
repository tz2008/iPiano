/* recorder.js — 跟练录音与回放（Web Audio + MediaRecorder）
 *
 * 设计要点：
 *  - 录音只保存在内存（Blob），不上传；离开曲目或关闭页面即丢弃。
 *  - 录音与跟练同时进行：麦克风流复用，不再额外申请权限。
 *  - 回放用 <audio>，不进入 AudioContext，避免与检测/合成音互相干扰。
 */
(function (global) {
  'use strict';

  var recorder = null;     // MediaRecorder
  var chunks = [];
  var blob = null;         // 最近一次录音
  var streamRef = null;
  var startedAt = 0;
  var mimeType = '';

  function supported() {
    return !!(global.MediaRecorder && global.MediaRecorder.isTypeSupported);
  }

  /** 选一个浏览器支持的音频格式（优先 webm/opus，Safari 用 mp4） */
  function pickMime() {
    if (!supported()) return '';
    var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  /**
   * 开始录音。
   * @param stream 已有的 MediaStream（与跟练共用）
   * @param cb     { onStop(blob, durationMs), onError(err) }
   */
  function start(stream, cb) {
    if (!supported() || !stream) {
      if (cb && cb.onError) cb.onError('unsupported');
      return false;
    }
    stop();                    // 保证只有一个录音实例
    mimeType = pickMime();
    chunks = [];
    blob = null;
    streamRef = stream;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    } catch (e) {
      recorder = null;
      if (cb && cb.onError) cb.onError(e && e.name || 'create');
      return false;
    }
    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = function () {
      var durationMs = Date.now() - startedAt;
      blob = chunks.length ? new Blob(chunks, { type: mimeType || 'audio/webm' }) : null;
      chunks = [];
      recorder = null;
      if (cb && cb.onStop) cb.onStop(blob, durationMs);
    };
    recorder.onerror = function (e) {
      if (cb && cb.onError) cb.onError(e && e.name || 'record');
    };
    startedAt = Date.now();
    try {
      recorder.start(250);     // 每 250ms 出一块，避免长录音占内存峰值
      return true;
    } catch (e) {
      recorder = null;
      if (cb && cb.onError) cb.onError(e && e.name || 'start');
      return false;
    }
  }

  /** 停止录音（异步回调 onStop） */
  function stop() {
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (e) {}
      return true;
    }
    return false;
  }

  /** 是否正在录 */
  function isRecording() {
    return !!(recorder && recorder.state === 'recording');
  }

  /** 最近一次录音 */
  function lastClip() { return blob; }

  function durationMs() {
    return blob ? Date.now() - startedAt : 0;
  }

  /** 生成可播放的 object URL（调用方负责 revoke） */
  function clipUrl() {
    if (!blob) return null;
    if (global.URL && global.URL.createObjectURL) return global.URL.createObjectURL(blob);
    return null;
  }

  /** 是否有可回放的录音（与 clipUrl 是否可用解耦，便于无 objectURL 的环境降级） */
  function hasClip() { return !!blob; }

  /** 丢弃录音，释放内存 */
  function clear() {
    stop();
    chunks = [];
    blob = null;
    streamRef = null;
    startedAt = 0;
  }

  /** 录音大小（KB），用于提示 */
  function sizeKB() {
    return blob ? Math.round(blob.size / 1024) : 0;
  }

  global.MusicRecorder = {
    supported: supported,
    start: start,
    stop: stop,
    isRecording: isRecording,
    lastClip: lastClip,
    hasClip: hasClip,
    clipUrl: clipUrl,
    durationMs: durationMs,
    sizeKB: sizeKB,
    clear: clear,
    pickMime: pickMime
  };
})(typeof window !== 'undefined' ? window : globalThis);
