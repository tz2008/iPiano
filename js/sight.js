/* sight.js — 视奏训练 + 乐理题库 + 节奏打拍（纯逻辑，可 Node 单测）
 *
 * 三部分互相独立：
 *  - 视奏：按难度随机生成一小节“没见过的谱”，限时首读
 *  - 乐理：题库 + 按类别抽题 + 判分
 *  - 节奏：生成节奏型，判定打拍是否合拍
 */
(function (global) {
  'use strict';

  var Core = global.MusicCore;

  /* ============================================================
   * 一、视奏
   * ============================================================ */

  /** 视奏难度参数 */
  var SIGHT_LEVELS = {
    1: { name: '入门', clef: 'treble', range: [60, 72], beats: [4, 4], values: [1, 1, 2], steps: [1, 2], accidentals: false, seconds: 30 },
    2: { name: '初级', clef: 'treble', range: [60, 77], beats: [4, 4], values: [1, 1, 1, 2, 0.5], steps: [1, 2, 3], accidentals: false, seconds: 25 },
    3: { name: '中级', clef: 'treble', range: [55, 81], beats: [4, 4], values: [0.5, 1, 1, 2, 4], steps: [1, 2, 3, 4], accidentals: false, seconds: 20 },
    4: { name: '进阶', clef: 'both', range: [48, 84], beats: [4, 4], values: [0.5, 1, 1, 2, 4], steps: [1, 2, 3, 4, 5], accidentals: true, seconds: 18 }
  };

  function randInt(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[randInt(arr.length)]; }

  /** 在音域内按音级移动 step 个自然音（超出音域则反向） */
  function stepFrom(midi, step, range) {
    var dia = Core.midiToDia(midi);
    if (dia == null) dia = Core.midiToDia(midi - 1);
    var next = Core.diaToMidi(dia + step);
    if (next < range[0] || next > range[1]) {
      next = Core.diaToMidi(dia - step);
      if (next < range[0] || next > range[1]) return midi;
    }
    return next;
  }

  /**
   * 生成一段视奏谱。
   * opts: { level, measures, seed }
   * 返回 { clef, notes: [{midi, beats}], beatsPerMeasure, level, seconds }
   */
  function generateSight(opts) {
    opts = opts || {};
    var level = SIGHT_LEVELS[opts.level] || SIGHT_LEVELS[1];
    var measures = opts.measures || 2;
    var clef = level.clef === 'both' ? (Math.random() < 0.5 ? 'treble' : 'bass') : level.clef;
    var range = level.range.slice();
    // 低音谱号：整体下移两个八度，保证在低音谱表附近
    if (clef === 'bass') { range[0] -= 24; range[1] -= 12; }

    var notes = [];
    // 起始音：落在音域中间附近，避免一开始就贴边
    var mid = range[0] + Math.round((range[1] - range[0]) * (0.35 + Math.random() * 0.3));
    var cur = Core.diaToMidi(Core.midiToDia(mid) || 28);
    if (cur < range[0] || cur > range[1]) cur = Core.diaToMidi(Math.round((range[0] + range[1]) / 24) * 7);

    for (var m = 0; m < measures; m++) {
      var beat = 0;
      var target = pick(level.beats);   // 拍号：入门固定 4/4
      while (beat < target) {
        var remain = target - beat;
        var dur = pick(level.values.filter(function (v) { return v <= remain; }));
        if (dur == null) dur = remain;
        // 每小节最后一个音常用较长时值收束
        if (remain <= 1) dur = remain;
        notes.push({ midi: cur, beats: dur });
        beat += dur;
        // 音高移动：大跳概率随难度增加
        var step = pick(level.steps);
        if (Math.random() < 0.25) step = -step;
        cur = stepFrom(cur, step, range);
      }
    }

    // 进阶难度：随机加 1–2 个黑键（升号）
    if (level.accidentals) {
      for (var k = 0; k < notes.length; k++) {
        if (Math.random() < 0.12 && Core.midiToDia(notes[k].midi) !== null) {
          notes[k].midi += 1;
          if (notes[k].midi > range[1] + 1) notes[k].midi -= 2;
        }
      }
    }

    return {
      clef: clef,
      notes: notes,
      beatsPerMeasure: pick(level.beats),
      level: opts.level || 1,
      seconds: level.seconds,
      name: level.name
    };
  }

  /**
   * 视奏判定：逐音对照（只判音高，顺序必须正确）。
   * @returns { hits, wrongs, missed, total, accuracy }
   */
  function scoreSight(played, expected) {
    var hits = 0, wrongs = 0;
    var n = Math.max(played.length, expected.length);
    for (var i = 0; i < n; i++) {
      if (i >= played.length) break;
      if (i >= expected.length) { wrongs++; continue; }
      if (Math.abs(played[i] - expected[i]) < 0.6) hits++;
      else wrongs++;
    }
    var missed = Math.max(0, expected.length - played.length);
    var total = expected.length;
    return {
      hits: hits, wrongs: wrongs, missed: missed, total: total,
      accuracy: total ? Math.round(hits / total * 100) : 0
    };
  }

  /* ============================================================
   * 二、乐理题库
   * ============================================================ */

  /**
   * 题目结构：{ cat, q, options: [..], answer: index, explain }
   * 选择题为主；少量“看图选音”题由 UI 层用五线谱渲染。
   */
  var THEORY = [
    /* ---- 谱号 ---- */
    { cat: '谱号', q: '高音谱号的另一个名字是什么？', options: ['G 谱号', 'F 谱号', 'C 谱号', 'D 谱号'], answer: 0, explain: '高音谱号的螺旋中心绕在第二线上，第二线是 G，所以叫 G 谱号。' },
    { cat: '谱号', q: '低音谱号的另一个名字是什么？', options: ['G 谱号', 'F 谱号', 'C 谱号', 'A 谱号'], answer: 1, explain: '低音谱号的两个点夹住第四线，第四线是 F，所以叫 F 谱号。' },
    { cat: '谱号', q: '低音谱号的两个点夹住的是哪一条线？', options: ['第二线', '第三线', '第四线', '第五线'], answer: 2, explain: '两个点夹住第四线，告诉你第四线是 F。' },
    { cat: '谱号', q: '高音谱号的螺旋中心落在哪一条线上？', options: ['第一线', '第二线', '第三线', '第四线'], answer: 1, explain: 'G 谱号的螺旋绕在第二线上，所以第二线是 G。' },
    { cat: '谱号', q: '钢琴上通常用哪个谱号记右手？', options: ['高音谱号', '低音谱号', '中音谱号', '次中音谱号'], answer: 0, explain: '右手音区较高，用高音谱号；左手用低音谱号。' },

    /* ---- 五线谱 ---- */
    { cat: '五线谱', q: '五线谱一共有几条线？', options: ['3 条', '4 条', '5 条', '6 条'], answer: 2, explain: '五线谱由五条平行横线组成，线与线之间叫“间”。' },
    { cat: '五线谱', q: '五线谱有几条线、几个间？', options: ['5 条线 4 个间', '5 条线 5 个间', '4 条线 5 个间', '5 条线 6 个间'], answer: 0, explain: '5 条线之间夹出 4 个间。' },
    { cat: '五线谱', q: '高音谱号第一线（最下面一条线）是什么音？', options: ['C', 'D', 'E', 'F'], answer: 2, explain: '高音谱号第一线是 E。口诀：一线 E、二线 G、三线 B。' },
    { cat: '五线谱', q: '高音谱号第三线是什么音？', options: ['B', 'D', 'F', 'A'], answer: 0, explain: '高音谱号三线是 B。' },
    { cat: '五线谱', q: '中央 C 在高音谱号上画在哪里？', options: ['第一线', '下加一线', '第二间', '第三线'], answer: 1, explain: '中央 C（C4）在高音谱号的下加一线上。' },
    { cat: '五线谱', q: '中央 C 在低音谱号上画在哪里？', options: ['第一线', '第五线', '上加一线', '下加一线'], answer: 2, explain: '中央 C 在低音谱号的上加一线上。' },
    { cat: '五线谱', q: '音符超出五线范围时，需要画什么？', options: ['加线', '延长线', '小节线', '连音线'], answer: 0, explain: '超出五线范围的音要画“加线”（ledger line）。' },

    /* ---- 音符时值 ---- */
    { cat: '音符', q: '一个全音符等于几个四分音符？', options: ['2 个', '3 个', '4 个', '8 个'], answer: 2, explain: '全音符 = 4 拍（4 个四分音符）。' },
    { cat: '音符', q: '二分音符有几拍（以四分音符为一拍）？', options: ['1 拍', '2 拍', '3 拍', '4 拍'], answer: 1, explain: '二分音符是 2 拍。' },
    { cat: '音符', q: '八分音符是几拍（以四分音符为一拍）？', options: ['半拍', '1 拍', '2 拍', '4 拍'], answer: 0, explain: '八分音符是半拍，两个八分音符等于一个四分音符。' },
    { cat: '音符', q: '四分音符的符头是实心还是空心？', options: ['实心', '空心', '有时实心有时空心', '没有符头'], answer: 0, explain: '四分音符是实心符头；二分、全音符是空心符头。' },
    { cat: '音符', q: '哪个音符没有符干？', options: ['四分音符', '二分音符', '全音符', '八分音符'], answer: 2, explain: '全音符只有一个空心符头，没有符干。' },
    { cat: '音符', q: '八分音符比四分音符多了什么？', options: ['一个符尾', '一个符头', '一条加线', '一个附点'], answer: 0, explain: '八分音符在符干上加一个符尾。' },

    /* ---- 休止符 ---- */
    { cat: '休止符', q: '休止符表示什么？', options: ['声音渐强', '声音渐弱', '不发声的静默', '重复前一音'], answer: 2, explain: '休止符表示这段时间不发声。' },
    { cat: '休止符', q: '全休止符等于几拍？', options: ['1 拍', '2 拍', '3 拍', '4 拍'], answer: 3, explain: '全休止符休止整小节（4/4 拍中为 4 拍）。' },

    /* ---- 拍号 ---- */
    { cat: '拍号', q: '4/4 拍表示什么？', options: ['每小节 4 拍，以四分音符为一拍', '每小节 4 拍，以八分音符为一拍', '每小节 2 拍', '每小节 4 小节'], answer: 0, explain: '上面的 4 是每小节拍数，下面的 4 表示以四分音符为一拍。' },
    { cat: '拍号', q: '3/4 拍每小节有几拍？', options: ['2 拍', '3 拍', '4 拍', '6 拍'], answer: 1, explain: '3/4 拍每小节 3 拍，常用于圆舞曲。' },
    { cat: '拍号', q: '2/4 拍每小节有几拍？', options: ['2 拍', '3 拍', '4 拍', '8 拍'], answer: 0, explain: '2/4 拍每小节 2 拍，进行曲常用。' },
    { cat: '拍号', q: '拍号写在什么地方？', options: ['每行开头', '谱号后面', '曲子最后', '音符上方'], answer: 1, explain: '拍号写在谱号后面、每行开头都要重复。' },

    /* ---- 音名唱名 ---- */
    { cat: '音名', q: '唱名 Do Re Mi 对应的音名是？', options: ['C D E', 'A B C', 'D E F', 'G A B'], answer: 0, explain: 'Do=C、Re=D、Mi=E、Fa=F、Sol=G、La=A、Si=B。' },
    { cat: '音名', q: '音名 F 对应的唱名是？', options: ['Mi', 'Fa', 'Sol', 'La'], answer: 1, explain: 'F 唱作 Fa。' },
    { cat: '音名', q: '一个八度有几个半音？', options: ['7 个', '10 个', '12 个', '13 个'], answer: 2, explain: '一个八度有 12 个半音（7 个白键 + 5 个黑键）。' },
    { cat: '音名', q: '钢琴一共有多少个键？', options: ['61 个', '76 个', '88 个', '96 个'], answer: 2, explain: '标准钢琴 88 键：52 个白键、36 个黑键。' },
    { cat: '音名', q: '钢琴上有几组“两个黑键 + 三个黑键”？', options: ['5 组', '6 组', '7 组', '8 组'], answer: 2, explain: '88 键钢琴共有 7 组完整的黑键排列。' },
    { cat: '音名', q: '中央 C 的另一个名字是？', options: ['C3', 'C4', 'C5', 'C8'], answer: 1, explain: '中央 C 是 C4，频率约 261.6 Hz。' },

    /* ---- 升降号 ---- */
    { cat: '升降号', q: '升号（♯）表示什么？', options: ['升高半音', '降低半音', '升高八度', '还原'], answer: 0, explain: '♯ 把音升高半音。' },
    { cat: '升降号', q: '降号（♭）表示什么？', options: ['升高半音', '降低半音', '升高八度', '还原'], answer: 1, explain: '♭ 把音降低半音。' },
    { cat: '升降号', q: '还原号（♮）表示什么？', options: ['升高半音', '降低半音', '取消前面的升降', '延长一拍'], answer: 2, explain: '还原号取消前面的升号或降号。' },
    { cat: '升降号', q: '调号写在谱号的哪一边？', options: ['左边', '右边', '上方', '下方'], answer: 1, explain: '调号写在谱号右边，表示整首曲子的升降规律。' },
    { cat: '升降号', q: 'G 大调有几个升号？', options: ['0 个', '1 个', '2 个', '3 个'], answer: 1, explain: 'G 大调有 1 个升号（F♯）。' },
    { cat: '升降号', q: 'F 大调有几个降号？', options: ['0 个', '1 个', '2 个', '3 个'], answer: 1, explain: 'F 大调有 1 个降号（B♭）。' },
    { cat: '升降号', q: 'C 大调有几个升号或降号？', options: ['0 个', '1 个', '2 个', '4 个'], answer: 0, explain: 'C 大调没有升降号，全用白键。' },

    /* ---- 音程与和弦 ---- */
    { cat: '音程', q: 'C 到 E 是什么音程？', options: ['二度', '三度', '四度', '五度'], answer: 1, explain: 'C-D-E 跨三个音级，是三度。' },
    { cat: '音程', q: 'C 到 G 是什么音程？', options: ['三度', '四度', '五度', '六度'], answer: 2, explain: 'C-D-E-F-G 是五度。' },
    { cat: '音程', q: 'C 到高音 C 是什么音程？', options: ['六度', '七度', '八度', '九度'], answer: 2, explain: '相隔 12 个半音，是八度。' },
    { cat: '和弦', q: 'C 大三和弦由哪三个音组成？', options: ['C E G', 'C F A', 'C D E', 'C G B'], answer: 0, explain: '大三和弦 = 根音 + 大三度 + 纯五度，C-E-G。' },
    { cat: '和弦', q: '小三和弦与大三和弦的区别是？', options: ['中间音低半音', '根音低半音', '五音高半音', '没有区别'], answer: 0, explain: '小三和弦的中间音（三音）比大三和弦低半音。' },

    /* ---- 力度与速度 ---- */
    { cat: '力度', q: 'f（forte）表示什么？', options: ['很弱', '强', '渐慢', '延长'], answer: 1, explain: 'f = forte，强；p = piano，弱。' },
    { cat: '力度', q: 'p（piano）表示什么？', options: ['弱', '强', '渐强', '跳音'], answer: 0, explain: 'p = piano，弱。' },
    { cat: '力度', q: 'cresc.（渐强）的意思是？', options: ['越来越弱', '越来越强', '越来越快', '越来越慢'], answer: 1, explain: 'crescendo 表示逐渐变强。' },
    { cat: '速度', q: 'Adagio 表示什么速度？', options: ['慢板', '快板', '中板', '急板'], answer: 0, explain: 'Adagio = 柔板/慢板。' },
    { cat: '速度', q: 'Allegro 表示什么速度？', options: ['慢板', '行板', '快板', '急板'], answer: 2, explain: 'Allegro = 快板。' },

    /* ---- 演奏记号 ---- */
    { cat: '记号', q: '连音线（slur）表示什么？', options: ['断开弹', '连贯地弹', '跳起来弹', '延长一倍'], answer: 1, explain: '连音线表示这些音要连贯、圆滑地演奏。' },
    { cat: '记号', q: '跳音记号（·）表示什么？', options: ['连贯', '短促跳跃', '延长', '休止'], answer: 1, explain: '跳音（staccato）要弹得短促、有弹性。' },
    { cat: '记号', q: '延长记号（𝄐）表示什么？', options: ['加快', '延长时值', '降低音高', '反复'], answer: 1, explain: '延长记号（fermata）表示这个音要延长。' },
    { cat: '记号', q: '反复记号表示什么？', options: ['跳过这一段', '从头或从记号处再弹一遍', '降低八度', '停止'], answer: 1, explain: '反复记号表示要重复演奏。' },

    /* ---- 指法 ---- */
    { cat: '指法', q: '两只手的手指编号中，1 指是哪个？', options: ['大拇指', '食指', '中指', '小指'], answer: 0, explain: '1=拇指、2=食指、3=中指、4=无名指、5=小指。' },
    { cat: '指法', q: '5 指是哪根手指？', options: ['大拇指', '食指', '中指', '小指'], answer: 3, explain: '5 指是小指。' },

    /* ---- 乐曲常识 ---- */
    { cat: '乐曲', q: '《小星星》的旋律最初来自哪个国家？', options: ['法国', '德国', '奥地利', '英国'], answer: 0, explain: '《小星星》旋律来自法国民歌。' },
    { cat: '乐曲', q: '《欢乐颂》是谁的作品？', options: ['莫扎特', '贝多芬', '巴赫', '肖邦'], answer: 1, explain: '《欢乐颂》是贝多芬《第九交响曲》的主题。' },
    { cat: '乐曲', q: '《致爱丽丝》的作者是？', options: ['莫扎特', '贝多芬', '巴赫', '李斯特'], answer: 1, explain: '《致爱丽丝》是贝多芬的作品。' }
  ];

  /** 所有分类 */
  function theoryCats() {
    var seen = {}, out = [];
    THEORY.forEach(function (t) { if (!seen[t.cat]) { seen[t.cat] = 1; out.push(t.cat); } });
    return out;
  }

  /** 按分类抽题（不重复）；cats 为空表示全部 */
  function pickTheory(count, cats) {
    var pool = THEORY.filter(function (t) { return !cats || !cats.length || cats.indexOf(t.cat) >= 0; });
    // Fisher-Yates 洗牌后取前 count 个
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.slice(0, Math.min(count, pool.length)).map(function (t, idx) {
      return {
        id: idx, cat: t.cat, q: t.q,
        options: t.options.slice(), answer: t.answer, explain: t.explain
      };
    });
  }

  /** 单题判分 */
  function checkTheory(q, chosen) { return chosen === q.answer; }

  /* ============================================================
   * 三、节奏打拍
   * ============================================================ */

  /** 节奏型：以四分音符为一拍，用字符表示（'x'=拍手，'-'=空） */
  var RHYTHM_PATTERNS = {
    1: [
      { name: '四分音符', beats: 4, cells: ['x', 'x', 'x', 'x'] },
      { name: '二分音符', beats: 4, cells: ['x', '-', 'x', '-'] },
      { name: '全音符', beats: 4, cells: ['x', '-', '-', '-'] }
    ],
    2: [
      { name: '八分音符', beats: 4, cells: ['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x'], sub: 2 },
      { name: '四分 + 八分', beats: 4, cells: ['x', '-', 'x', 'x', 'x', '-', 'x', 'x'], sub: 2 },
      { name: '八分 + 四分', beats: 4, cells: ['x', 'x', 'x', '-', 'x', 'x', 'x', '-'], sub: 2 }
    ],
    3: [
      { name: '切分节奏', beats: 4, cells: ['x', '-', 'x', 'x', '-', 'x', '-', '-'], sub: 2 },
      { name: '附点节奏', beats: 4, cells: ['x', '-', '-', 'x', 'x', '-', '-', 'x'], sub: 2 },
      { name: '三连音', beats: 4, cells: ['x', 'x', 'x', '-', '-', '-', 'x', 'x', 'x', '-', '-', '-'], sub: 3 }
    ]
  };

  function generateRhythm(level) {
    var pool = RHYTHM_PATTERNS[level] || RHYTHM_PATTERNS[1];
    var p = pick(pool);
    return { name: p.name, beats: p.beats, cells: p.cells.slice(), sub: p.sub || 1, bpm: 80 };
  }

  /**
   * 判定一次打拍。
   * @param taps   [ms] 孩子拍手的时刻
   * @param rhythm { cells, sub, beats, bpm }
   * @returns { hits, total, offset, accuracy, detail:[{expected, actual, err}] }
   */
  function scoreRhythm(taps, rhythm) {
    var unit = 60000 / rhythm.bpm / (rhythm.sub || 1);
    var expected = [];
    rhythm.cells.forEach(function (c, i) { if (c === 'x') expected.push(i * unit); });
    if (!taps.length) return { hits: 0, total: expected.length, accuracy: 0, offset: 0, detail: [] };

    // 用前几个 tap 与 expected 的差估算整体延迟（孩子可能整体慢半拍）
    var offsets = [];
    for (var i = 0; i < Math.min(3, taps.length, expected.length); i++) offsets.push(taps[i] - expected[i]);
    offsets.sort(function (a, b) { return a - b; });
    var base = offsets[Math.floor(offsets.length / 2)];

    var tol = unit * 0.45;
    var used = {}, hits = 0, detail = [];
    expected.forEach(function (e) {
      var best = -1, bestErr = Infinity;
      taps.forEach(function (t, ti) {
        if (used[ti]) return;
        var err = Math.abs(t - base - e);
        if (err < bestErr) { bestErr = err; best = ti; }
      });
      if (best >= 0 && bestErr <= tol) { used[best] = true; hits++; }
      detail.push({ expected: e, actual: best >= 0 ? taps[best] - base : null, err: bestErr === Infinity ? null : bestErr });
    });
    return {
      hits: hits, total: expected.length,
      accuracy: Math.round(hits / expected.length * 100),
      offset: Math.round(base), detail: detail
    };
  }

  global.MusicSight = {
    SIGHT_LEVELS: SIGHT_LEVELS,
    generateSight: generateSight,
    scoreSight: scoreSight,
    THEORY: THEORY,
    theoryCats: theoryCats,
    pickTheory: pickTheory,
    checkTheory: checkTheory,
    RHYTHM_PATTERNS: RHYTHM_PATTERNS,
    generateRhythm: generateRhythm,
    scoreRhythm: scoreRhythm
  };
})(typeof window !== 'undefined' ? window : globalThis);
