/* midi.js — Web MIDI 接入（电钢琴 / MIDI 键盘）
 *
 * 相比麦克风的优势：音高精确、可识别和弦与力度、延迟低、不受环境噪声影响。
 * 浏览器支持：Chrome / Edge / Opera（Safari 16.4+ 部分支持）；不支持时自动降级回麦克风。
 */
(function (global) {
  'use strict';

  var access = null;      // MIDIAccess
  var inputs = [];        // 当前连接的输入设备
  var handler = null;     // { onNote(midi, velocity), onNoteOff(midi) }
  var connected = false;

  function supported() {
    return !!(global.navigator && global.navigator.requestMIDIAccess);
  }

  /** 当前已连接的设备名列表 */
  function devices() {
    return inputs.map(function (i) { return i.name || 'MIDI 键盘'; });
  }

  function isConnected() { return connected; }

  /** 解析 MIDI 消息（只关心 note on/off） */
  function parseMessage(data) {
    if (!data || data.length < 3) return null;
    var status = data[0] & 0xf0;
    var note = data[1];
    var velocity = data[2];
    if (status === 0x90 && velocity > 0) return { type: 'on', midi: note, velocity: velocity / 127 };
    if (status === 0x80 || (status === 0x90 && velocity === 0)) return { type: 'off', midi: note };
    return null;
  }

  function bindInput(input) {
    input.onmidimessage = function (ev) {
      var msg = parseMessage(ev.data);
      if (!msg || !handler) return;
      if (msg.type === 'on' && handler.onNote) handler.onNote(msg.midi, msg.velocity);
      if (msg.type === 'off' && handler.onNoteOff) handler.onNoteOff(msg.midi);
    };
  }

  /**
   * 连接 MIDI。
   * @param cb  { onNote(midi, velocity), onNoteOff(midi), onDevices(names), onError(err) }
   */
  function connect(cb) {
    if (!supported()) {
      if (cb && cb.onError) cb.onError('unsupported');
      return;
    }
    handler = cb || {};
    navigator.requestMIDIAccess({ sysex: false }).then(function (a) {
      access = a;
      refresh();
      access.onstatechange = function () { refresh(); };
      connected = true;
      if (handler.onDevices) handler.onDevices(devices());
      if (!inputs.length && handler.onError) handler.onError('nodevice');
    }).catch(function (e) {
      connected = false;
      if (cb && cb.onError) cb.onError((e && e.name) || 'denied');
    });
  }

  function refresh() {
    if (!access) return;
    inputs = [];
    access.inputs.forEach(function (input) {
      inputs.push(input);
      bindInput(input);
    });
    connected = inputs.length > 0;
    if (handler && handler.onDevices) handler.onDevices(devices());
  }

  function disconnect() {
    inputs.forEach(function (i) { i.onmidimessage = null; });
    inputs = [];
    handler = null;
    connected = false;
    if (access) access.onstatechange = null;
  }

  global.MidiInput = {
    supported: supported,
    connect: connect,
    disconnect: disconnect,
    devices: devices,
    isConnected: isConnected,
    parseMessage: parseMessage
  };
})(typeof window !== 'undefined' ? window : globalThis);
