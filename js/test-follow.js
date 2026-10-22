// test-follow.js — follow.js / sight.js / library.js 单元测试
// 运行：node js/test-follow.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'follow.js'));
require(path.join(__dirname, 'sight.js'));
require(path.join(__dirname, 'library.js'));
const F = globalThis.MusicFollow;
const S = globalThis.MusicSight;
const L = globalThis.LibraryData;
const Core = globalThis.MusicCore;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

/* ---------- 音高 ---------- */
t('八度折叠', () => {
  assert.strictEqual(F.pitchDiffHalf(72, 60), 0);
  assert.strictEqual(F.pitchDiffHalf(62, 60), 2);
  assert.strictEqual(F.pitchDiffHalf(59, 60), -1);
});
t('音高匹配：默认允许跨八度', () => {
  assert.ok(F.pitchMatches(72, 60, 0.5, true));
  assert.ok(F.pitchMatches(60.3, 60, 0.5, true));
  assert.ok(!F.pitchMatches(62, 60, 0.5, true));
});
t('音高匹配：严格八度', () => {
  assert.ok(!F.pitchMatches(72, 60, 0.5, false));
  assert.ok(F.pitchMatches(60.2, 60, 0.5, false));
});

/* ---------- 序列构造 ---------- */
const song = {
  notes: [[60, 1], [62, 1], [64, 2]],
  bass: [[48, 2], [53, 2]]
};
t('序列：右手', () => {
  const seq = F.sequenceFromSong(song, 'R');
  assert.deepStrictEqual(seq.map(s => s.midis[0]), [60, 62, 64]);
  assert.deepStrictEqual(seq.map(s => s.beats), [1, 1, 2]);
});
t('序列：左手', () => {
  const seq = F.sequenceFromSong(song, 'L');
  assert.deepStrictEqual(seq.map(s => s.midis[0]), [48, 53]);
});
t('序列：双手合并为和弦', () => {
  const seq = F.sequenceFromSong(song, 'BOTH');
  assert.deepStrictEqual(seq[0].midis, [48, 60]);   // 第 1 拍：左手 48
  assert.deepStrictEqual(seq[1].midis, [48, 62]);   // 第 2 拍：左手仍在 48（2 拍长音）
  assert.deepStrictEqual(seq[2].midis, [53, 64]);   // 第 3 拍：左手换到 53
});

/* ---------- 起音检测 ---------- */
/** 模拟真实检测流：每个音连续送入多帧（检测器每帧都会回调），
 *  每个音给 200ms，足以跨过 55ms 稳定阈值。 */
function feedSeq(run, pitches, stepMs) {
  let now = 0;
  const out = [];
  pitches.forEach(p => {
    for (let k = 0; k < 3; k++) {
      now += stepMs;
      const e = F.feed(run, p, now);
      if (e) out.push(e);
    }
  });
  return out;
}
t('稳定 55ms 后才触发起音', () => {
  const run = F.createRun({ seq: F.sequenceFromSong(song, 'R'), bpm: 60 });
  assert.strictEqual(F.feed(run, 60, 0), null);       // 刚出现
  assert.strictEqual(F.feed(run, 60, 30), null);      // 未稳定
  const e = F.feed(run, 60, 100);                     // 稳定
  assert.ok(e && e.kind === 'hit' && e.i === 0);
});
t('同一音持续不重复计分', () => {
  const run = F.createRun({ seq: F.sequenceFromSong(song, 'R'), bpm: 60 });
  F.feed(run, 60, 0); F.feed(run, 60, 100);
  F.feed(run, 60, 200); F.feed(run, 60, 900);
  assert.strictEqual(run.events.length, 1, '只记一次起音');
  assert.strictEqual(run.hits, 1, '只计一次命中');
  assert.strictEqual(run.index, 1);
});
t('静音后可再次触发同一音', () => {
  const run = F.createRun({ seq: { length: 0 }, bpm: 60 });
  // 直接构造两个相同音的序列
  const seq = [{ midis: [60], beats: 1 }, { midis: [60], beats: 1 }];
  const r2 = F.createRun({ seq: seq, bpm: 60 });
  // 第 1 个音：稳定后命中，但没松键（声音持续）
  F.feed(r2, 60, 0); F.feed(r2, 60, 100);
  assert.strictEqual(r2.index, 1, '第 1 个音命中');
  // 声音持续不重复计分
  F.feed(r2, 60, 400); F.feed(r2, 60, 800);
  assert.strictEqual(r2.index, 1, '持续音不重复触发');
  // 松键后再次起音 → 第 2 个音
  F.feed(r2, null, 900);
  F.feed(r2, 60, 1000); F.feed(r2, 60, 1100);
  assert.strictEqual(r2.hits, 2, '两次起音都命中');
  assert.ok(r2.finished, '两个音都弹完即结束');
});

/* ---------- 匹配：正确 / 错音 / 漏音 ---------- */
t('依次弹对 → 走完并结算', () => {
  const run = F.createRun({ seq: F.sequenceFromSong(song, 'R'), bpm: 60 });
  feedSeq(run, [60, null, 62, null, 64], 80);
  assert.ok(run.finished, '应已结束');
  const sum = F.summary(run);
  assert.strictEqual(sum.hits, 3);
  assert.strictEqual(sum.pitchAccuracy, 100);
});
t('弹错音：practice 模式停在原位', () => {
  const run = F.createRun({ seq: F.sequenceFromSong(song, 'R'), bpm: 60 });
  feedSeq(run, [60, null, 65], 80);
  assert.strictEqual(run.index, 1, '错音后 index 不变');
  assert.ok(run.wrong[1], '记录错音');
  // 改正后继续
  feedSeq(run, [null, 62], 80);
  assert.strictEqual(run.index, 2);
});
t('弹错音：evaluate 模式继续前进', () => {
  const run = F.createRun({ seq: F.sequenceFromSong(song, 'R'), mode: 'evaluate', bpm: 60 });
  feedSeq(run, [60, null, 65], 80);
  assert.strictEqual(run.index, 2, 'evaluate 模式跳过错音');
  assert.strictEqual(F.summary(run).wrongNotes, 1);
});
t('漏弹：直接弹后面第 2 个音 → 记为漏音', () => {
  const run = F.createRun({ seq: F.sequenceFromSong(song, 'R'), bpm: 60 });
  feedSeq(run, [60, null, 64], 80);
  assert.strictEqual(run.index, 3);
  assert.ok(run.missed[1], '第 2 个音记为漏弹');
  const sum = F.summary(run);
  assert.strictEqual(sum.missed, 1);
  assert.strictEqual(sum.hits, 2);
});
t('漏弹超过前瞻范围 → 判为错音而不是漏音', () => {
  const seq = [60, 62, 64, 65, 67].map(m => ({ midis: [m], beats: 1 }));
  const run = F.createRun({ seq: seq, bpm: 60 });
  feedSeq(run, [60, null, 67], 80);   // 隔了 3 个音
  assert.ok(!run.missed[1], '超出 LOOKAHEAD 不算漏音');
  assert.strictEqual(run.index, 1, '停在原位');
});

/* ---------- 和弦 ---------- */
t('双手：必须两个音都对', () => {
  const seq = F.sequenceFromSong(song, 'BOTH');
  const run = F.createRun({ seq: seq, bpm: 60 });
  feedSeq(run, [[60, 48]], 80);               // 第 1 拍双音
  assert.strictEqual(run.index, 1);
  feedSeq(run, [null, [62]], 80);             // 第 2 拍只弹右手
  assert.strictEqual(run.index, 1, '缺左手不通过');
  assert.ok(run.wrong[1], '记为错音');
  feedSeq(run, [null, [62, 48]], 80);         // 补上左手
  assert.strictEqual(run.index, 2);
});
t('双手：左右手任意顺序都算对（和弦集合匹配）', () => {
  const seq = F.sequenceFromSong(song, 'BOTH');
  const run = F.createRun({ seq: seq, bpm: 60 });
  feedSeq(run, [[48, 60]], 80);
  assert.strictEqual(run.index, 1);
});

/* ---------- 节奏 ---------- */
t('节奏：均匀弹奏时值准确', () => {
  const seq = [{ midis: [60], beats: 1 }, { midis: [62], beats: 1 }, { midis: [64], beats: 2 }];
  const run = F.createRun({ seq: seq, bpm: 60 });   // 1 拍 = 1000ms
  const feed = (p, t) => { F.feed(run, p, t); F.feed(run, p, t + 60); };
  feed(60, 0); feed(62, 1000); feed(64, 2000);
  const r = F.rhythmStats(run);
  assert.ok(r.hasData);
  assert.strictEqual(r.early, 0);
  assert.strictEqual(r.late, 0);
  assert.strictEqual(r.accuracy, 100);
});
t('节奏：整体放慢仍算准（相对速度归一化）', () => {
  const seq = [{ midis: [60], beats: 1 }, { midis: [62], beats: 1 }, { midis: [64], beats: 1 }];
  const run = F.createRun({ seq: seq, bpm: 60 });
  const feed = (p, t) => { F.feed(run, p, t); F.feed(run, p, t + 60); };
  feed(60, 0); feed(62, 2000); feed(64, 4000);   // 全部慢一倍
  const r = F.rhythmStats(run);
  assert.strictEqual(r.accuracy, 100, '相对节奏正确');
  assert.strictEqual(r.tempoRatio, 2, '识别出整体慢一倍');
});
t('节奏：抢拍 / 拖拍被识别', () => {
  const seq = [{ midis: [60], beats: 1 }, { midis: [62], beats: 1 }, { midis: [64], beats: 1 }, { midis: [65], beats: 1 }];
  const run = F.createRun({ seq: seq, bpm: 60 });
  const feed = (p, t) => { F.feed(run, p, t); F.feed(run, p, t + 60); };
  feed(60, 0); feed(62, 400); feed(64, 1000); feed(65, 2500);
  const r = F.rhythmStats(run);
  assert.ok(r.early > 0 || r.late > 0, '应识别出节奏偏差');
});

/* ---------- 段落 ---------- */
t('分段：按 4 小节切分', () => {
  const seq = [];
  for (let i = 0; i < 20; i++) seq.push({ midis: [60], beats: 1 });
  const segs = S ? F.segments(seq, 4, 1) : null;   // 每段 1 小节 = 4 拍
  assert.strictEqual(segs[0].label, '整曲');
  assert.ok(segs.length >= 5, '应切出多个段落');
  assert.strictEqual(segs[1].start, 0);
  assert.strictEqual(segs[1].end, 4);
});

/* ---------- 视奏 ---------- */
t('视奏：生成音符数与时值合法', () => {
  for (let lv = 1; lv <= 4; lv++) {
    for (let k = 0; k < 30; k++) {
      const p = S.generateSight({ level: lv, measures: 2 });
      assert.ok(p.notes.length > 0, '有音符');
      assert.ok(['treble', 'bass'].includes(p.clef));
      // 每小节拍数合计等于拍号
      let beat = 0, measure = 0;
      p.notes.forEach(nt => {
        assert.ok(nt.beats > 0 && nt.beats <= 4, '时值合法');
        beat += nt.beats;
        if (beat >= p.beatsPerMeasure - 1e-6) { measure++; beat = 0; }
      });
      assert.ok(measure >= 2, '两小节完整');
    }
  }
});
t('视奏：入门难度不含黑键', () => {
  for (let k = 0; k < 40; k++) {
    const p = S.generateSight({ level: 1, measures: 2 });
    p.notes.forEach(nt => assert.notStrictEqual(Core.midiToDia(nt.midi), null, '全为白键'));
  }
});
t('视奏评分', () => {
  const exp = [60, 62, 64, 65];
  assert.strictEqual(S.scoreSight([60, 62, 64, 65], exp).accuracy, 100);
  assert.strictEqual(S.scoreSight([60, 62, 66, 65], exp).accuracy, 75);
  assert.strictEqual(S.scoreSight([60, 62], exp).accuracy, 50);
  assert.strictEqual(S.scoreSight([60, 62], exp).missed, 2);
});

/* ---------- 乐理 ---------- */
t('乐理：题库结构合法', () => {
  assert.ok(S.THEORY.length >= 45, '题目 >= 45，实际 ' + S.THEORY.length);
  S.THEORY.forEach(q => {
    assert.ok(q.cat && q.q, '有分类与题干');
    assert.strictEqual(q.options.length, 4, '四个选项：' + q.q);
    assert.ok(q.answer >= 0 && q.answer < 4, '答案下标合法：' + q.q);
    assert.ok(q.explain, '有解析：' + q.q);
  });
});
t('乐理：抽题不重复、数量正确', () => {
  const qs = S.pickTheory(5);
  assert.strictEqual(qs.length, 5);
  assert.strictEqual(new Set(qs.map(q => q.q)).size, 5, '题干不重复');
});
t('乐理：按分类抽题', () => {
  const qs = S.pickTheory(4, ['拍号']);
  assert.strictEqual(qs.length, 4);
  qs.forEach(q => assert.strictEqual(q.cat, '拍号'));
});
t('乐理：判分', () => {
  const q = S.THEORY[0];
  assert.ok(S.checkTheory(q, q.answer));
  assert.ok(!S.checkTheory(q, (q.answer + 1) % 4));
});

/* ---------- 节奏打拍 ---------- */
t('打拍：全对', () => {
  const r = { cells: ['x', '-', 'x', '-'], sub: 1, beats: 4, bpm: 60 }; // 0ms, 2000ms
  const res = S.scoreRhythm([0, 2000], r);
  assert.strictEqual(res.accuracy, 100);
});
t('打拍：整体延迟仍算对（自动对齐）', () => {
  const r = { cells: ['x', '-', 'x', '-'], sub: 1, beats: 4, bpm: 60 };
  const res = S.scoreRhythm([500, 2500], r);
  assert.strictEqual(res.accuracy, 100);
  assert.strictEqual(res.offset, 500);
});
t('打拍：漏拍', () => {
  const r = { cells: ['x', '-', 'x', '-'], sub: 1, beats: 4, bpm: 60 };
  assert.strictEqual(S.scoreRhythm([0], r).accuracy, 50);
});
t('打拍：乱拍', () => {
  const r = { cells: ['x', '-', 'x', '-'], sub: 1, beats: 4, bpm: 60 };
  assert.strictEqual(S.scoreRhythm([0, 700], r).accuracy, 50);
});
t('节奏型生成合法', () => {
  for (let lv = 1; lv <= 3; lv++) {
    const r = S.generateRhythm(lv);
    assert.ok(r.cells.indexOf('x') >= 0);
    assert.strictEqual(r.cells.length % (r.sub || 1), 0);
  }
});

/* ---------- 教材曲库 ---------- */
t('曲库：结构合法、ID 唯一', () => {
  assert.ok(L.LIBRARY.length >= 46, '曲目 >= 46，实际 ' + L.LIBRARY.length);
  const ids = new Set();
  L.LIBRARY.forEach(s => {
    assert.ok(!ids.has(s.id), 'ID 唯一：' + s.id);
    ids.add(s.id);
    assert.ok(s.title && s.book && s.key, '元信息完整');
    assert.ok(s.notes.length > 0, '有音符：' + s.title);
    s.notes.forEach(nt => {
      assert.ok(nt[0] >= 21 && nt[0] <= 108, 'MIDI 合法：' + s.title);
      assert.ok(nt[1] > 0 && nt[1] <= 4, '时值合法：' + s.title);
    });
    if (s.bass) {
      // 伴奏时值合法，且总拍数与旋律一致（normalizeBass 保证）
      const mel = s.notes.reduce((a, n) => a + n[1], 0);
      const bas = s.bass.reduce((a, n) => a + n[1], 0);
      assert.ok(Math.abs(mel - bas) < 0.01, '伴奏总拍数与旋律一致：' + s.title);
      s.bass.forEach(nt => assert.ok(nt[1] > 0 && nt[1] <= 16, '伴奏时值合法：' + s.title));
    }
  });
});
t('曲库：分类覆盖三本教材', () => {
  const b = L.books();
  assert.ok(b.includes('小汤 1') && b.includes('拜厄') && b.includes('车尔尼 599'), '分类：' + b.join(','));
  assert.ok(b.includes('小汤 3'), '含扩充的小汤 3');
  assert.ok(b.includes('小汤 4'), '含扩充的小汤 4');
});
t('曲库：绝大多数曲目有左手伴奏', () => {
  const withBass = L.LIBRARY.filter(s => s.bass && s.bass.length).length;
  assert.ok(withBass >= L.LIBRARY.length - 2, '带伴奏曲目 ' + withBass + '/' + L.LIBRARY.length);
});
t('曲库：normalizeBass 能对齐伴奏长度', () => {
  const song = {
    notes: [[60, 1], [62, 1], [64, 2]],
    bass: [[48, 4], [53, 4], [55, 4]]
  };
  L.normalizeBass(song);
  const total = song.bass.reduce((a, n) => a + n[1], 0);
  assert.strictEqual(total, 4, '裁齐到旋律总拍数');
  const short = { notes: [[60, 4], [62, 4]], bass: [[48, 4]] };
  L.normalizeBass(short);
  assert.strictEqual(short.bass.reduce((a, n) => a + n[1], 0), 8, '不足时延长最后一个音');
});
t('曲库：按 ID 查找', () => {
  assert.ok(L.byId('by-01'));
  assert.strictEqual(L.byId('nope'), null);
});

console.log('\ntest-follow.js: ' + n + ' 项全部通过 ✓');
