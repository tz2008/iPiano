// integration.test.js — jsdom 集成测试（node js/integration.test.js）
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'http://localhost/',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

// localStorage：jsdom 在 http:// URL 下自带内存实现，直接用
const assert = require('assert');

// 逐个加载脚本（模拟 <script src> 顺序）
['js/core.js', 'js/courses.js', 'js/songs.js', 'js/library.js', 'js/audio.js', 'js/pitch.js', 'js/midi.js', 'js/follow.js', 'js/stats.js', 'js/recorder.js', 'js/profiles.js', 'js/backup.js', 'js/weekly.js', 'js/challenge.js', 'js/sight.js', 'js/glyphs.js', 'js/staff.js', 'js/gamify.js', 'js/practice.js', 'js/app.js'].forEach(f => {
  window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
// 触发 app.js 的初始化：jsdom 解析完成后会自动派发 DOMContentLoaded，
// 只需等一个宏任务让 init 完成（切勿再手动 dispatch，否则会绑定两次）
const sleep = ms => new Promise(r => setTimeout(r, ms));

const $ = id => document.getElementById(id);
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
/** 读取当前活动档案的数据（v2 存储结构） */
const savedData = (win) => {
  const raw = JSON.parse((win || window).localStorage.getItem('music-tutor-v1'));
  if (raw && raw.profiles) return raw.profiles[raw.activeId].data;
  return raw;
};

(async () => {
  await sleep(30); // 等 jsdom 自动触发 DOMContentLoaded，init 完成
  // ---------- 练习页 ----------
  assert.strictEqual($('answerButtons').children.length, 7, '7 个答案按钮');
  const labelsSolfege = [...$('answerButtons').children].map(b => b.textContent);
  assert.deepStrictEqual(labelsSolfege, ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'], '默认唱名按钮');

  // 五线谱上有一个音符
  assert.ok(document.querySelector('#practiceStaff .note'), '练习谱上有音符');
  assert.ok(document.querySelector('#practiceStaff .clef-glyph'), 'SVG 谱号渲染');
  const noteMidi = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  assert.ok(noteMidi >= 40 && noteMidi <= 84, '出题 midi 在合理范围');

  // 先答错：按钮变 wrong、禁用，可以重试
  const wrongIdx = (Core => {
    const dia = Core.midiToDia(noteMidi);
    return ((dia % 7) + 7) % 7 === 0 ? 1 : 0;
  })(window.MusicCore);
  click($('answerButtons').children[wrongIdx]);
  assert.ok($('answerButtons').children[wrongIdx].classList.contains('wrong'), '答错变红');
  assert.ok($('answerButtons').children[wrongIdx].disabled, '答错按钮禁用');
  assert.ok($('feedback').classList.contains('no'), '答错反馈');
  assert.ok($('statStars').textContent === '0', '答错不加星');

  // 再答对
  const rightIdx = ((window.MusicCore.midiToDia(noteMidi) % 7) + 7) % 7;
  click($('answerButtons').children[rightIdx]);
  assert.ok($('feedback').classList.contains('ok'), '答对反馈 ok');
  assert.ok($('statStars').textContent === '1', '答对 +1 星');
  assert.ok($('statStreak').textContent === '0', '答错后答对不累积连对');
  assert.ok($('statRate').textContent === '0%', '一次答对率 0%');

  // 等待自动下一题
  await sleep(1300);
  assert.ok(document.querySelector('#practiceStaff .note'), '自动进入下一题');
  assert.ok($('statCount').textContent === '1', '总题数 1');

  // ---------- 答案写法切换 ----------
  click(document.querySelector('#segNaming .seg[data-value="letter"]'));
  const labelsLetter = [...$('answerButtons').children].map(b => b.textContent);
  assert.deepStrictEqual(labelsLetter, ['C', 'D', 'E', 'F', 'G', 'A', 'B'], '切到音名按钮');
  click(document.querySelector('#segNaming .seg[data-value="solfege"]'));

  // ---------- 难度/谱号切换 ----------
  click(document.querySelector('#segClef .seg[data-value="bass"]'));
  await sleep(50);
  assert.ok(document.querySelector('#practiceStaff .note'), '低音谱号出题正常');
  const m2 = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  assert.ok(m2 >= 40 && m2 <= 60, '低音范围出题');
  click(document.querySelector('#segClef .seg[data-value="random"]'));
  click(document.querySelector('#segDifficulty .seg[data-value="standard"]'));
  await sleep(50);
  const m3 = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  assert.ok(m3 >= 40 && m3 <= 84, '标准难度出题范围');

  // ---------- 学习页 ----------
  click(document.querySelector('.nav-tab[data-page="learn"]'));
  assert.ok($('page-learn').classList.contains('active'), '学习页激活');
  const trebleScaleCount = window.MusicCore.naturalsIn(60, 84).length;
  // 练习页设置是 random→学习页用高音谱号
  assert.strictEqual($('learnTitle').textContent, '高音谱号 · 音阶', '学习页标题');
  assert.strictEqual(document.querySelectorAll('#learnStaff .note').length, trebleScaleCount, '学习页音符数与音阶一致');

  // 点一个音符 → 信息更新 + 键盘高亮
  const firstNote = document.querySelector('#learnStaff .note');
  click(firstNote);
  assert.ok($('learnKeyInfo').textContent.includes('·'), '点音符显示音名信息');
  assert.ok($('learnKeyboard').querySelector('.key.active'), '键盘高亮同步');

  // 键盘黑键 → 谱上出现带 ♯ 的音符
  const blackKey = document.querySelector('#learnKeyboard .key.black');
  click(blackKey);
  assert.ok($('learnKeyInfo').textContent.includes('♯'), '黑键信息含升号');
  const sharpNote = [...document.querySelectorAll('#learnStaff .note')].find(n =>
    n.querySelector('text') && n.querySelector('text').textContent === '♯');
  assert.ok(sharpNote, '谱上出现带 ♯ 的音符');

  // ---------- 设置：统计持久化 ----------
  const savedRaw = window.localStorage.getItem('music-tutor-v1');
  assert.ok(savedRaw, 'localStorage 已保存');
  const saved = savedData();
  // 先答错一次再答对：尝试 2 次、答对 1 题、星数 1
  assert.strictEqual(saved.stats.attempts, 2, '尝试次数含答错');
  assert.strictEqual(saved.stats.correct, 1, '答对题数持久化');
  assert.strictEqual(saved.stats.stars, 1, '答错后答对得 1 星');
  assert.strictEqual(saved.stats.firstTry, 0, '非一次答对');

  // 重置统计（二次点击确认）
  click($('resetStats'));
  assert.strictEqual($('resetStats').textContent, '再点一次确认', '首次点击进入确认态');
  click($('resetStats'));
  assert.strictEqual($('sTotal').textContent, '0', '重置统计');
  assert.strictEqual($('sCorrect').textContent, '0', '答对清零');
  assert.strictEqual($('sStars').textContent, '0', '星数清零');

  // ---------- 首帧主题预读（v2 多档案结构） ----------
  {
    const domT = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
    const wT = domT.window;
    // 先写入 v2 结构的深色主题，再重新解析一次页面
    const store = {
      version: 2, activeId: 'p1',
      profiles: { p1: { id: 'p1', name: '小朋友', avatar: '🐻', createdAt: 1, data: { theme: 'dark' } } }
    };
    const domT2 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(win) {
      win.localStorage.setItem('music-tutor-v1', JSON.stringify(store));
    } });
    await sleep(30);
    assert.strictEqual(domT2.window.document.documentElement.getAttribute('data-theme'), 'dark',
      'v2 结构下首帧应用深色主题');
  }

  // ---------- 主题切换 ----------
  click($('themeBtn'));
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark', '切到深色');
  click($('themeBtn'));

  // ---------- 声音开关 ----------
  click($('soundBtn'));
  assert.strictEqual($('soundBtn').textContent, '🔇', '声音关闭图标');

  // 学习页 bass 谱号
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  click(document.querySelector('#segClef .seg[data-value="bass"]'));
  click(document.querySelector('.nav-tab[data-page="learn"]'));
  assert.strictEqual($('learnTitle').textContent, '低音谱号 · 音阶', '学习页低音谱号标题');

  // ---------- M3：flash 残留 ----------
  // 当前学习页 bass；点黑键产生 flash 后切回高音，不应有越界残留音符
  click(document.querySelector('#learnKeyboard .key.black'));
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  click(document.querySelector('#segClef .seg[data-value="treble"]'));
  click(document.querySelector('.nav-tab[data-page="learn"]'));
  assert.strictEqual(
    document.querySelectorAll('#learnStaff .note').length,
    trebleScaleCount,
    '切回高音后无残留 flash 音符'
  );

  // ---------- M4：答错立即断连对 ----------
  click(document.querySelector('.nav-tab[data-page="practice"]'));
  // 连续答对 2 题（都是首次答对）
  for (let i = 0; i < 2; i++) {
    const nm = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
    const ri = ((window.MusicCore.midiToDia(nm) % 7) + 7) % 7;
    click($('answerButtons').children[ri]);
    await sleep(1300);
  }
  assert.ok(parseInt($('statStreak').textContent) >= 2, '连对累积到 2');
  const nmA = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const wi = (((window.MusicCore.midiToDia(nmA) % 7) + 7) % 7) === 0 ? 1 : 0;
  click($('answerButtons').children[wi]);
  assert.strictEqual($('statStreak').textContent, '0', '答错立即断连对');
  // 答对完成本题以便后续
  const nmB = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const ri2 = ((window.MusicCore.midiToDia(nmB) % 7) + 7) % 7;
  click($('answerButtons').children[ri2]);
  await sleep(1300);

  // ---------- M1：切设置后旧定时器不换题 ----------
  const nmC = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const ri3 = ((window.MusicCore.midiToDia(nmC) % 7) + 7) % 7;
  click($('answerButtons').children[ri3]); // 答对，进入 1100ms 倒计时
  click(document.querySelector('#segDifficulty .seg[data-value="easy"]')); // 立即换难度，应清掉旧定时器

  // ---------- P0 #3：答错揭示正确答案 ----------
  // 等待当前题目渲染完成
  await sleep(1400);
  const revealNote = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const revealDia = window.MusicCore.midiToDia(revealNote);
  const revealIdx = ((revealDia % 7) + 7) % 7;
  // 答错 1 次：仅方向提示，不揭示
  const firstWrong = revealIdx === 0 ? 1 : 0;
  click($('answerButtons').children[firstWrong]);
  assert.ok($('answerButtons').children[firstWrong].classList.contains('wrong'), '答错 1 次按钮变红');
  assert.ok(!$('answerButtons').children[revealIdx].classList.contains('reveal'), '第 1 次答错不揭示');
  assert.ok($('answerHint').innerHTML.includes('方向') || $('answerHint').innerHTML.includes('机会'), '第 1 次答错给方向/机会提示');
  // 答错第 2 次：揭示正确答案 + 自动下一题（2.2 秒）
  const secondWrong = revealIdx === 2 ? 1 : (revealIdx === 1 ? 2 : (revealIdx === 0 ? 1 : 0));
  click($('answerButtons').children[secondWrong]);
  assert.ok($('answerButtons').children[revealIdx].classList.contains('reveal'), '答错 2 次后正确按钮 reveal');
  assert.ok($('feedback').textContent.includes('答案揭晓'), '反馈显示"答案揭晓"');
  assert.ok($('answerHint').innerHTML.includes('已高亮'), '提示说明已高亮');
  // 等待自动下一题（2.2s）。随机可能抽到同一个音，因此以“揭示标记被清除”为准
  await sleep(2800);
  assert.ok(document.querySelector('#practiceStaff .note'), '自动进入下一题（谱面有音符）');
  assert.ok(!$('answerButtons').querySelector('.reveal'), '新题目没有残留 reveal 标记');

  // ---------- M1：切设置后旧定时器不换题 ----------
  const frozenEl = document.querySelector('#practiceStaff .note');
  await sleep(1400);
  assert.strictEqual(document.querySelector('#practiceStaff .note'), frozenEl, '切设置后旧定时器不再换题');

  // ---------- M2：损坏 localStorage 不白屏 ----------
  {
    const dom2 = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
    const w2 = dom2.window;
    w2.localStorage.setItem('music-tutor-v1', JSON.stringify({
      clef: 'hack', difficulty: 42, naming: 7, theme: 'blue', sound: 'yes',
      stats: { total: 'abc', firstTry: NaN, stars: -3, currentStreak: 'x', bestStreak: 1e9 }
    }));
    ['js/core.js', 'js/courses.js', 'js/songs.js', 'js/library.js', 'js/audio.js', 'js/pitch.js', 'js/midi.js', 'js/follow.js', 'js/stats.js', 'js/recorder.js', 'js/profiles.js', 'js/backup.js', 'js/weekly.js', 'js/challenge.js', 'js/sight.js', 'js/glyphs.js', 'js/staff.js', 'js/gamify.js', 'js/practice.js', 'js/app.js'].forEach(f => w2.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    await sleep(30);
    assert.ok(w2.document.querySelector('#answerButtons'), '损坏数据下应用仍正常初始化');
    assert.strictEqual(w2.document.querySelectorAll('#answerButtons .answer-btn').length, 7, '损坏数据下按钮正常');
  }

  // ---------- P0 #2：老版本数字课程 ID 迁移 ----------
  {
    const dom3 = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
    const w3 = dom3.window;
    // 模拟老用户：老 ID 13（拜厄第 1 课）、5（基础教程第 5 课）、28（哈农第 6 课）
    w3.localStorage.setItem('music-tutor-v1', JSON.stringify({
      clef: 'treble', difficulty: 'easy', naming: 'solfege', theme: 'light', sound: true,
      courses: {
        '13': { done: true, stars: 3 },
        '5': { done: true, stars: 2 },
        '28': { done: true, stars: 1 }
      }
    }));
    ['js/core.js', 'js/courses.js', 'js/songs.js', 'js/library.js', 'js/audio.js', 'js/pitch.js', 'js/midi.js', 'js/follow.js', 'js/stats.js', 'js/recorder.js', 'js/profiles.js', 'js/backup.js', 'js/weekly.js', 'js/challenge.js', 'js/sight.js', 'js/glyphs.js', 'js/staff.js', 'js/gamify.js', 'js/practice.js', 'js/app.js'].forEach(f => w3.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    await sleep(30);
    const saved3 = savedData(w3);
    assert.ok(saved3.courses['baier-01'], '老 ID 13 → baier-01');
    assert.strictEqual(saved3.courses['baier-01'].stars, 3, '拜厄星级保留');
    assert.ok(saved3.courses['jichu-05'], '老 ID 5 → jichu-05');
    assert.strictEqual(saved3.courses['jichu-05'].stars, 2, '基础教程星级保留');
    assert.ok(saved3.courses['hanon-06'], '老 ID 28 → hanon-06');
    assert.strictEqual(saved3.courses['hanon-06'].stars, 1, '哈农星级保留');
    assert.ok(!saved3.courses['13'], '老数字 ID 不残留');
    // 渲染课程列表时不应崩
    const tab = w3.document.querySelector('.nav-tab[data-page="courses"]');
    tab.dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    assert.ok(w3.document.querySelector('.course-item.done'), '迁移后课程列表正确显示完成态');
  }

  // ---------- 88 键难度（练习） ----------
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  click(document.querySelector('#segDifficulty .seg[data-value="full"]'));
  click(document.querySelector('.nav-tab[data-page="practice"]'));
  await sleep(50);
  assert.strictEqual($('answerButtons').children.length, 12, '88 键 12 个答案按钮');
  assert.ok($('answerButtons').classList.contains('cols-12'), '12 按钮网格类');
  const label12 = [...$('answerButtons').children].map(b => b.textContent);
  assert.ok(label12.includes('升Do') && label12.includes('升Fa') && label12.includes('升La'), '唱名 12 音含黑键');
  const fNote = document.querySelector('#practiceStaff .note');
  const fBase = parseInt(fNote.dataset.midi, 10);
  const fAcc = parseInt(fNote.dataset.accidental || '0', 10);
  const fq = fBase + fAcc;
  assert.ok(fq >= 21 && fq <= 108, '88 键出题范围');
  const fIdx = window.MusicCore.SEMI_INDEX[fq % 12];
  click($('answerButtons').children[fIdx]);
  assert.ok($('feedback').classList.contains('ok'), '88 键答题判定正确');
  await sleep(1300);
  // 循环答到出现黑键题，验证 ♯ 渲染与黑键判定
  let sawBlack = false;
  for (let i = 0; i < 25 && !sawBlack; i++) {
    const n2 = document.querySelector('#practiceStaff .note');
    const b2 = parseInt(n2.dataset.midi, 10);
    const a2 = parseInt(n2.dataset.accidental || '0', 10);
    if (a2 === 1) {
      sawBlack = true;
      const idx2 = window.MusicCore.SEMI_INDEX[(b2 + 1) % 12];
      click($('answerButtons').children[idx2]);
      assert.ok($('feedback').classList.contains('ok'), '黑键题判定正确');
      await sleep(1300);
    } else {
      const idx3 = window.MusicCore.SEMI_INDEX[b2 % 12];
      click($('answerButtons').children[idx3]);
      await sleep(1300);
    }
  }
  assert.ok(sawBlack, '88 键出题包含黑键');
  // 切音名模式：按钮变 C C# ...
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  click(document.querySelector('#segNaming .seg[data-value="letter"]'));
  click(document.querySelector('.nav-tab[data-page="practice"]'));
  await sleep(50);
  const labelLetter12 = [...$('answerButtons').children].map(b => b.textContent);
  assert.deepStrictEqual(labelLetter12, ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'D#', 'F#', 'G#', 'A#'], '音名 12 按钮');
  click(document.querySelector('#segNaming .seg[data-value="solfege"]'));

  // ---------- 88 键学习页 ----------
  click(document.querySelector('.nav-tab[data-page="learn"]'));
  assert.strictEqual($('learnTitle').textContent, '高音谱号 · 音阶', '88 键学习页音阶标题');
  const whiteKeys = document.querySelectorAll('#learnKeyboard .key.white').length;
  const blackKeys = document.querySelectorAll('#learnKeyboard .key.black').length;
  assert.strictEqual(whiteKeys, 52, '88 键 52 个白键');
  assert.strictEqual(blackKeys, 36, '88 键 36 个黑键');
  const firstBlack = document.querySelector('#learnKeyboard .key.black');
  assert.ok(firstBlack.style.left.includes('%'), '黑键按百分比定位（自适应宽度）');
  const c4Mark = [...document.querySelectorAll('#learnKeyboard .key.white')].find(k => k.dataset.midi === '60');
  assert.ok(c4Mark && c4Mark.classList.contains('has-mark'), '键盘标注中央 C');
  assert.strictEqual(c4Mark.querySelector('.mark').textContent, '中央C', '中央 C 标签文字');
  // 点最低音 A0 → 音阶保留，A0 追加显示在谱面（带跳动动画）
  const a0Key = [...document.querySelectorAll('#learnKeyboard .key')].find(k => k.dataset.midi === '21');
  click(a0Key);
  assert.ok($('learnTitle').textContent.includes('音阶'), 'A0 后仍保留完整音阶');
  assert.strictEqual(document.querySelectorAll('#learnStaff .note').length, trebleScaleCount + 1, '音阶 + 追加的 A0 音符');
  assert.ok($('learnKeyInfo').textContent.includes('A0'), 'A0 音名显示');
  const a0Note = [...document.querySelectorAll('#learnStaff .note')].find(n => n.dataset.midi === '21');
  assert.ok(a0Note, 'A0 音符渲染');
  assert.ok(a0Note.classList.contains('note-blink'), '琴键音符带原地闪烁动画');
  // 点黑键 C#4 → 音阶视图下 C4 位置出现 ♯ 音符
  const cSharpKey = [...document.querySelectorAll('#learnKeyboard .key.black')].find(k => k.dataset.midi === '61');
  click(cSharpKey);
  assert.ok($('learnTitle').textContent.includes('音阶'), 'C#4 回到音阶视图');
  const sharpEl = document.querySelector('#learnStaff .note[data-accidental="1"]');
  assert.ok(sharpEl, '黑键 ♯ 音符出现在谱上');
  assert.ok($('learnKeyInfo').textContent.includes('♯'), '黑键信息含升号');
  // 点极高音 C8 → 音阶保留，C8 追加显示
  const c8Key = [...document.querySelectorAll('#learnKeyboard .key')].find(k => k.dataset.midi === '108');
  click(c8Key);
  assert.ok($('learnTitle').textContent.includes('高音谱号'), 'C8 后仍高音谱号音阶');
  assert.strictEqual(document.querySelectorAll('#learnStaff .note').length, trebleScaleCount + 1, '音阶 + 追加的 C8 音符');
  assert.ok($('learnKeyInfo').textContent.includes('C8'), 'C8 音名显示');
  assert.ok([...document.querySelectorAll('#learnStaff .note')].some(n => n.dataset.midi === '108'), 'C8 音符渲染');

  // ---------- 新模式：键盘作答（keyboard） ----------
  click(document.querySelector('.nav-tab[data-page="practice"]'));
  click(document.querySelector('#segMode .seg[data-mode="keyboard"]'));
  await sleep(30);
  assert.strictEqual($('answerButtons').style.display, 'none', '键盘模式隐藏音名按钮');
  assert.ok($('keyboardAnswer').querySelector('.key.white'), '键盘模式显示迷你键盘');
  const kq = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const kAcc = parseInt(document.querySelector('#practiceStaff .note').dataset.accidental || '0', 10);
  const kReal = kq + kAcc;
  const keyEl = [...$('keyboardAnswer').querySelectorAll('.key')].find(k => k.dataset.midi === String(kReal));
  click(keyEl);
  assert.ok($('feedback').classList.contains('ok'), '点琴键答对');
  await sleep(1300);

  // ---------- 新模式：听音辨键（listen） ----------
  if ($('soundBtn').textContent === '🔇') click($('soundBtn')); // 确保声音开启（自动播放依赖）
  const playedMidis = [];
  const origPlay = window.PianoAudio.playNote;
  window.PianoAudio.playNote = function (m) { playedMidis.push(m); return origPlay.apply(this, arguments); };
  click(document.querySelector('#segMode .seg[data-mode="listen"]'));
  await sleep(950); // 等自动播放问题音
  assert.strictEqual(document.querySelectorAll('#practiceStaff .note').length, 0, '听音模式谱面不显示音符');
  assert.ok(playedMidis.length > 0, '听音模式自动播放了问题音');
  const listenAns = playedMidis[playedMidis.length - 1];
  const listenKey = [...$('keyboardAnswer').querySelectorAll('.key')].find(k => k.dataset.midi === String(listenAns));
  click(listenKey);
  assert.ok($('feedback').classList.contains('ok'), '听音答题判定正确');
  await sleep(200);
  assert.ok(document.querySelector('#practiceStaff .note'), '听音答对后谱面显示音符');
  window.PianoAudio.playNote = origPlay;
  await sleep(1100);

  // ---------- 新模式：放音符（place） ----------
  click(document.querySelector('#segMode .seg[data-mode="place"]'));
  await sleep(30);
  assert.ok($('placeConfirmWrap').style.display !== 'none', 'place 显示确认区');
  assert.strictEqual(document.querySelectorAll('#practiceStaff .note').length, 0, 'place 谱面初始无音符');
  const svgEl = document.querySelector('#practiceStaff svg');
  svgEl.getBoundingClientRect = () => ({ top: 0, left: 0, width: 460, height: 300, right: 460, bottom: 300 });
  const vb = svgEl.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  svgEl.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientY: vb[1] + vb[3] * 0.55 }));
  await sleep(30);
  assert.ok(document.querySelector('#practiceStaff .note'), '点击谱面放置了音符');
  assert.ok(!$('placeConfirm').disabled, '放置后确认按钮可用');
  click($('placeConfirm'));
  await sleep(30);
  assert.ok($('feedback').classList.contains('ok') || $('feedback').classList.contains('no'), 'place 提交有对错反馈');
  // 若答错，切走重来（答错不自动下一题）
  if ($('feedback').classList.contains('no')) {
    click(document.querySelector('#segMode .seg[data-mode="name"]'));
    await sleep(30);
  }
  await sleep(1300);

  // ---------- 键盘快捷键 ----------
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  click(document.querySelector('#segDifficulty .seg[data-value="easy"]'));
  click(document.querySelector('.nav-tab[data-page="practice"]'));
  click(document.querySelector('#segMode .seg[data-mode="name"]'));
  await sleep(50);
  const nq = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const nIdx = ((window.MusicCore.midiToDia(nq) % 7) + 7) % 7;
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ['a', 's', 'd', 'f', 'g', 'h', 'j'][nIdx], bubbles: true }));
  assert.ok($('feedback').classList.contains('ok'), '键盘快捷键答对');
  await sleep(1300);

  // ---------- 游戏化：XP / 任务 / 徽章 ----------
  assert.ok(parseInt($('xpLevel').textContent) >= 1, 'XP 等级显示');
  assert.ok(parseInt($('xpText').textContent.split('/')[0]) > 0, 'XP 进度有值');
  assert.strictEqual($('taskList').children.length, 3, '今日任务 3 个');
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  assert.ok($('badgeList').children.length >= 6, '徽章区渲染 6 个');
  assert.ok($('badgeList').querySelector('.badge:not(.locked)'), '已有解锁徽章');

  // ---------- 课程闯关 ----------
  click(document.querySelector('.nav-tab[data-page="courses"]'));
  await sleep(30);
  assert.strictEqual(document.querySelectorAll('#courseLineTabs .seg').length, 3, '3 条教材线路');
  // 默认线路 = 拜厄（第一个未完成线路），列表 10 课
  assert.strictEqual(document.querySelectorAll('.course-item').length, 12, '拜厄线路 12 课');
  assert.ok(document.querySelector('.course-item:not(.locked)'), '拜厄第 1 课未锁定');
  // 未解锁课不可点（点击无效：无 click 绑定）
  click(document.querySelector('.course-item.locked'));
  await sleep(30);
  assert.ok($('courseList').style.display !== 'none', '锁定课不能进入');
  // 切到基础教程线路
  click(document.querySelector('#courseLineTabs .seg[data-line="jichu"]'));
  await sleep(30);
  assert.strictEqual(document.querySelectorAll('.course-item').length, 15, '基础教程线路 15 课');
  click(document.querySelector('#courseLineTabs .seg[data-line="baier"]'));
  await sleep(30);
  // 进入拜厄第 1 课详情
  click(document.querySelector('.course-item:not(.locked)'));
  await sleep(30);
  assert.ok($('courseDetail').style.display !== 'none', '进入课程详情');
  assert.ok($('courseDetail').innerHTML.includes('📌'), '详情含知识点卡片');
  // 开始练习
  click($('startCourseBtn'));
  await sleep(50);
  assert.ok($('courseBanner').style.display !== 'none', '课程横幅显示');
  assert.ok($('segMode').style.display === 'none', '课程练习中隐藏模式切换');
  // 拜厄第 1 课：高音 easy 点音名，答对 5 题过关
  for (let i = 0; i < 5; i++) {
    const nm = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
    const ri = ((window.MusicCore.midiToDia(nm) % 7) + 7) % 7;
    click($('answerButtons').children[ri]);
    await sleep(1300);
  }
  // 过关后自动回到课程列表
  await sleep(2000);
  assert.ok($('courseList').style.display !== 'none', '过关后回到课程列表');
  assert.ok(document.querySelector('.course-item.done'), '拜厄第 1 课标记完成');
  assert.ok(document.querySelectorAll('.course-item:not(.locked)').length >= 2, '拜厄第 2 课解锁');
  const saved2 = savedData();
  assert.ok(saved2.courses && saved2.courses['baier-01'] && saved2.courses['baier-01'].done, '课程进度持久化（新 ID 格式）');

  // ---------- 曲谱库 ----------
  click(document.querySelector('.nav-tab[data-page="songs"]'));
  await sleep(30);
  assert.ok(document.querySelectorAll('.song-item').length >= 10, '曲谱列表 >= 10 首');
  click(document.querySelector('.song-item'));
  await sleep(30);
  assert.ok($('songDetail').style.display !== 'none', '打开曲目详情');
  assert.ok(document.querySelectorAll('#songScore .note').length > 10, '谱面渲染旋律音符');
  assert.ok($('songPlayBtn').textContent.includes('播放'), '播放按钮存在');
  assert.ok($('songSpeedSel'), '播放速度选择器存在');
  click(document.querySelector('#songSpeedSel .seg[data-sp="0.6"]'));
  assert.ok(document.querySelector('#songSpeedSel .seg[data-sp="0.6"]').classList.contains('active'), '切到慢速');
  // 唱谱按钮：jsdom 无麦克风 → 按钮不应出现（supported 降级）
  assert.strictEqual($('songSingBtn'), null, '无麦克风环境不显示唱谱按钮');
  // 播放 / 停止
  click($('songPlayBtn'));
  await sleep(50);
  assert.ok($('songPlayBtn').textContent.includes('停止'), '播放中按钮变停止');
  click($('songPlayBtn'));
  await sleep(30);
  // 找音练习：小星星 7 键答题
  click($('songQuizBtn'));
  await sleep(50);
  const quizNote = document.querySelector('#songScore .note.note-blink') ||
    document.querySelector('#songScore .note[data-midi]');
  const qReal = parseInt(quizNote.dataset.midi, 10) + parseInt(quizNote.dataset.accidental || '0', 10);
  const qAns = window.MusicCore.SEMI_INDEX[qReal % 12];
  click($('songAnswerBtns').children[qAns]);
  await sleep(30);
  assert.ok($('songQuizHint').textContent.includes('答对'), '找音练习答对');
  // 返回曲库
  click($('backToSongs'));
  await sleep(30);
  assert.ok($('songList').style.display !== 'none', '返回曲谱列表');

  // ---------- 教材曲库 ----------
  click(document.querySelector('.nav-tab[data-page="songs"]'));
  await sleep(50);
  const groupHeads = [...document.querySelectorAll('.song-group-head')].map(h => h.textContent);
  assert.ok(groupHeads.some(t => t.includes('经典儿歌')), '曲库分组：经典儿歌');
  assert.ok(groupHeads.some(t => t.includes('小汤')), '曲库分组：小汤');
  assert.ok(groupHeads.some(t => t.includes('拜厄')), '曲库分组：拜厄');
  assert.ok(document.querySelectorAll('.song-item').length >= 30, '曲目总数 >= 30');
  // 打开教材曲目 → 有分段播放
  const libItem = [...document.querySelectorAll('.song-item')].find(e => e.textContent.includes('拜厄 No.8'));
  assert.ok(libItem, '教材曲目存在');
  click(libItem);
  await sleep(50);
  assert.ok(document.querySelectorAll('#songSectionSel .seg').length >= 2, '分段播放按钮');
  assert.ok(document.querySelectorAll('#songScore .note').length > 10, '教材曲目谱面渲染');
  // 黑键音符必须渲染出来（拜厄 No.8 含 F♯）
  const sharpNotes = [...document.querySelectorAll('#songScore .note')].filter(n => n.dataset.accidental === '1');
  assert.ok(sharpNotes.length > 0, '曲谱中的黑键音符正确渲染（含 ♯）');
  assert.ok(document.querySelector('#songScore .note[data-midi="78"]'), 'F♯5 音符存在');

  // ---------- 训练营 ----------
  click(document.querySelector('.nav-tab[data-page="train"]'));
  await sleep(50);
  assert.ok($('page-train').classList.contains('active'), '训练营页面激活');
  assert.strictEqual(document.querySelectorAll('#trainTabs .seg').length, 5, '训练营 5 个标签');

  // 视奏
  click($('sightStartBtn'));
  await sleep(80);
  assert.ok(document.querySelectorAll('#sightStaff .note').length > 0, '视奏生成谱面');
  assert.ok($('sightTimer').textContent.includes('秒'), '视奏倒计时显示');
  // 键盘作答：按谱面顺序输入 A–J
  const sightNotes = [...document.querySelectorAll('#sightStaff .note')].map(n => parseInt(n.dataset.midi, 10));
  const keyFor = m => ['a', 's', 'd', 'f', 'g', 'h', 'j'][((window.MusicCore.midiToDia(m) % 7) + 7) % 7];
  for (let i = 0; i < sightNotes.length; i++) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyFor(sightNotes[i]), bubbles: true }));
  }
  await sleep(50);
  assert.ok($('sightResult').style.display !== 'none', '视奏结束后显示结果');
  assert.ok($('sightResult').textContent.includes('视奏完成'), '视奏结果标题');

  // 乐理
  click(document.querySelector('#trainTabs [data-tab="theory"]'));
  await sleep(30);
  assert.ok(document.querySelectorAll('#theoryCats .seg').length > 5, '乐理分类按钮');
  click($('theoryStartBtn'));
  await sleep(30);
  assert.ok(document.querySelector('.theory-q'), '乐理题目渲染');
  assert.strictEqual(document.querySelectorAll('.theory-opt').length, 4, '4 个选项');
  // 选正确答案
  const qState = document.querySelector('.theory-q').textContent;
  click(document.querySelector('.theory-opt.correct') || document.querySelectorAll('.theory-opt')[0]);
  await sleep(50);
  assert.ok($('theoryExplain').textContent.length > 0, '显示解析');

  // 节奏
  click(document.querySelector('#trainTabs [data-tab="rhythm"]'));
  await sleep(30);
  click($('rhythmStartBtn'));
  await sleep(60);
  assert.ok(document.querySelectorAll('#rhythmView .rhythm-cell').length >= 4, '节奏格子渲染');
  assert.strictEqual($('rhythmPad').disabled, true, '预备拍期间按钮禁用');

  // ---------- 重置：三档互不影响 ----------
  {
    // 先造出课程进度与统计
    const raw = JSON.parse(window.localStorage.getItem('music-tutor-v1'));
    const d4 = raw.profiles[raw.activeId].data;
    d4.courses = { 'baier-01': { done: true, stars: 3 } };
    d4.stats.attempts = 9;
    d4.stats.correct = 5;
    d4.mistakes = { 0: { wrong: 2, total: 3, last: 1, clef: 'treble' } };
    window.localStorage.setItem('music-tutor-v1', JSON.stringify(raw));

    const dom4 = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
    const w4 = dom4.window;
    w4.localStorage.setItem('music-tutor-v1', JSON.stringify(raw));
    ['js/core.js', 'js/courses.js', 'js/songs.js', 'js/library.js', 'js/audio.js', 'js/pitch.js', 'js/midi.js', 'js/follow.js', 'js/stats.js', 'js/recorder.js', 'js/profiles.js', 'js/backup.js', 'js/weekly.js', 'js/challenge.js', 'js/sight.js', 'js/glyphs.js', 'js/staff.js', 'js/gamify.js', 'js/practice.js', 'js/app.js'].forEach(f => w4.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    await sleep(40);
    const c4 = el => el.dispatchEvent(new w4.MouseEvent('click', { bubbles: true }));

    // 重置统计：课程保留
    c4(w4.document.getElementById('resetStats'));
    c4(w4.document.getElementById('resetStats'));
    let saved4 = savedData(w4);
    assert.strictEqual(saved4.stats.attempts, 0, '重置统计：尝试清零');
    assert.ok(saved4.courses['baier-01'], '重置统计：课程保留');
    assert.strictEqual(Object.keys(saved4.mistakes || {}).length, 0, '重置统计：错题本清空');

    // 重置课程：统计保留
    saved4.stats.attempts = 7;
    w4.localStorage.setItem('music-tutor-v1', JSON.stringify(saved4));
    const dom5 = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
    const w5 = dom5.window;
    w5.localStorage.setItem('music-tutor-v1', JSON.stringify(saved4));
    ['js/core.js', 'js/courses.js', 'js/songs.js', 'js/library.js', 'js/audio.js', 'js/pitch.js', 'js/midi.js', 'js/follow.js', 'js/stats.js', 'js/recorder.js', 'js/profiles.js', 'js/backup.js', 'js/weekly.js', 'js/challenge.js', 'js/sight.js', 'js/glyphs.js', 'js/staff.js', 'js/gamify.js', 'js/practice.js', 'js/app.js'].forEach(f => w5.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    await sleep(40);
    const c5 = el => el.dispatchEvent(new w5.MouseEvent('click', { bubbles: true }));
    c5(w5.document.getElementById('resetCourses'));
    c5(w5.document.getElementById('resetCourses'));
    const saved5 = savedData(w5);
    assert.strictEqual(Object.keys(saved5.courses).length, 0, '重置课程：课程清空');
    assert.strictEqual(saved5.stats.attempts, 7, '重置课程：统计保留');

    // 单次点击不生效
    c5(w5.document.getElementById('resetAll'));
    assert.strictEqual(w5.document.getElementById('resetAll').textContent, '再点一次确认', '首次点击只进入确认态');
    const saved6 = savedData(w5);
    assert.strictEqual(saved6.stats.attempts, 7, '单次点击不清数据');
  }

  // ---------- 可访问性 ----------
  {
    const tab = document.querySelector('#tab-practice');
    assert.strictEqual(tab.getAttribute('role'), 'tab', '导航为 tab');
    assert.strictEqual(tab.getAttribute('aria-controls'), 'page-practice', 'tab 关联面板');
    assert.strictEqual(document.querySelector('#page-practice').getAttribute('aria-labelledby'), 'tab-practice', '面板标注');
    // 方向键切换
    tab.focus();
    tab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(30);
    assert.strictEqual(document.querySelector('.nav-tab.active').dataset.page, 'courses', '方向键切换标签');
    assert.strictEqual(document.querySelector('.nav-tab.active').getAttribute('aria-selected'), 'true', 'aria-selected 同步');
    assert.strictEqual(document.querySelector('#tab-practice').getAttribute('aria-selected'), 'false', '非当前标签 aria-selected=false');
    assert.strictEqual(document.querySelector('#tab-practice').tabIndex, -1, '漫游 tabindex');
    click(document.querySelector('#tab-practice'));

    // 琴键可聚焦、有名称
    const k0 = document.querySelector('#keyboardAnswer .key, #learnKeyboard .key');
    assert.ok(k0, '存在琴键');
    // 学习页琴键
    click(document.querySelector('.nav-tab[data-page="learn"]'));
    await sleep(30);
    const keyEl = document.querySelector('#learnKeyboard .key[tabindex="0"]');
    assert.ok(keyEl, '琴键可聚焦');
    assert.strictEqual(keyEl.getAttribute('role'), 'button', '琴键 role=button');
    assert.ok(keyEl.getAttribute('aria-label').includes('键'), '琴键有可读名称');
    // 方向键移动焦点
    keyEl.focus();
    keyEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.notStrictEqual(document.activeElement, keyEl, '方向键移动琴键焦点');
    // 回车激活
    document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(30);
    assert.ok($('learnKeyInfo').textContent.length > 0, '回车激活琴键');

    // 学习页音符可聚焦并有名称
    const noteEl = document.querySelector('#learnStaff .note');
    assert.strictEqual(noteEl.getAttribute('role'), 'button', '音符 role=button');
    assert.ok(noteEl.getAttribute('aria-label'), '音符有可读名称');
    click(document.querySelector('.nav-tab[data-page="practice"]'));
  }

  // ---------- 打磨项：segmented ARIA / 徽章说明 / 庆祝可关闭 ----------
  {
    // segmented 控件带 aria-pressed 且随点击同步
    const clefBtns = [...document.querySelectorAll('#segClef .seg')];
    assert.ok(clefBtns.every(b => b.hasAttribute('aria-pressed')), 'segmented 均有 aria-pressed');
    assert.strictEqual(clefBtns.filter(b => b.getAttribute('aria-pressed') === 'true').length, 1, '每组只有一个选中');
    const before = clefBtns.find(b => b.getAttribute('aria-pressed') === 'true').dataset.value;
    const target = clefBtns.find(b => b.dataset.value !== before);
    click(target);
    await sleep(30);
    assert.strictEqual(target.getAttribute('aria-pressed'), 'true', '点击后 aria-pressed 同步');
    assert.strictEqual(clefBtns.find(b => b.dataset.value === before).getAttribute('aria-pressed'), 'false', '旧选中置 false');
    click(document.querySelector('#segClef [data-value="treble"]'));

    // 徽章说明常驻可见
    click(document.querySelector('.nav-tab[data-page="settings"]'));
    await sleep(30);
    const badge0 = document.querySelector('#badgeList .badge');
    assert.ok(badge0.querySelector('.badge-desc'), '徽章有常驻说明');
    assert.ok(badge0.querySelector('.badge-desc').textContent.length > 0, '说明文字非空');
    assert.ok(document.querySelector('#badgeList .badge-bar'), '未获得徽章显示进度条');
    assert.ok(document.querySelector('#badgeList .badge-progress'), '未获得徽章显示进度数值');

    // 庆祝遮罩：可点击关闭 + ARIA
    const ov = document.createElement('div');
    document.body.appendChild(ov);
    window.MusicGamify.create({
      state: { gamify: { badges: {}, xp: 0, dayStreak: 0, tasks: [], prog: {} }, stats: {} },
      Audio: null, $: id => document.getElementById(id), save: () => {},
      getPracticeDifficulty: () => 'easy'
    }).celebrate('测试标题', '测试副标题', '🎉');
    await sleep(30);
    const cel = document.querySelector('.celebrate');
    assert.ok(cel, '庆祝遮罩出现');
    assert.strictEqual(cel.getAttribute('role'), 'alertdialog', '庆祝遮罩 role=alertdialog');
    assert.ok(cel.getAttribute('aria-label').includes('测试标题'), '庆祝遮罩有可读标签');
    click(cel);
    await sleep(30);
    assert.ok(!document.querySelector('.celebrate'), '点击可关闭庆祝遮罩');
  }

  // ---------- 错题本与练习历史 ----------
  // 之前答错过的题会写入错题本
  click(document.querySelector('.nav-tab[data-page="train"]'));
  await sleep(50);
  click(document.querySelector('#trainTabs [data-tab="review"]'));
  await sleep(50);
  assert.ok($('trainReview').style.display !== 'none', '错题本标签显示');
  assert.ok(document.querySelectorAll('#reviewBody .review-row').length > 0, '错题本记录答错的音');
  assert.ok(!$('reviewDrillBtn').disabled, '错题专项按钮可用');
  // 开始专项练习
  click($('reviewDrillBtn'));
  await sleep(50);
  assert.ok(document.querySelector('#practiceStaff .note'), '错题专项出题');
  assert.ok($('placeLabel').textContent.includes('错题专项'), '专项练习标题');
  // 答对一题
  const drillMidi = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
  const drillIdx = ((window.MusicCore.midiToDia(drillMidi) % 7) + 7) % 7;
  click($('answerButtons').children[drillIdx]);
  await sleep(1300);
  // 返回训练营看历史
  click(document.querySelector('.nav-tab[data-page="train"]'));
  await sleep(50);
  click(document.querySelector('#trainTabs [data-tab="history"]'));
  await sleep(50);
  assert.strictEqual(document.querySelectorAll('#historyChart .hist-col').length, 7, '历史图 7 天');
  assert.ok(document.querySelectorAll('#historySummary .stat-box').length === 3, '历史汇总 3 项');
  assert.ok(parseInt(document.querySelectorAll('#historySummary .stat-box-num')[1].textContent, 10) > 0, '有练习次数');
  const savedHist = savedData();
  assert.ok(savedHist.history && Object.keys(savedHist.history).length >= 1, '历史已持久化');
  assert.ok(savedHist.mistakes && Object.keys(savedHist.mistakes).length >= 1, '错题本已持久化');

  // ---------- 设置：八度判定 ----------
  click(document.querySelector('.nav-tab[data-page="settings"]'));
  await sleep(30);
  assert.ok($('segOctave'), '八度判定设置存在');
  click(document.querySelector('#segOctave .seg[data-value="strict"]'));
  await sleep(30);
  const savedOct = savedData();
  assert.strictEqual(savedOct.octaveStrict, true, '严格八度已保存');
  click(document.querySelector('#segOctave .seg[data-value="lenient"]'));

  // ---------- 跟练（桩麦克风） ----------
  // jsdom 没有麦克风，真实环境不显示跟练按钮（前面已断言过）；
  // 这里先打桩再重新渲染曲目详情。
  const origSupported = window.PitchDetector.supported;
  const origStart = window.PitchDetector.start;
  const origStop = window.PitchDetector.stop;
  let onPitchCb = null;
  window.PitchDetector.supported = () => true;
  window.PitchDetector.start = function (cb) { onPitchCb = cb; };

  click(document.querySelector('.nav-tab[data-page="songs"]'));
  await sleep(50);
  click([...document.querySelectorAll('.song-item')].find(e => e.textContent.includes('欢乐颂')));
  await sleep(80);
  assert.ok($('songPianoBtn'), '麦克风可用时显示跟弹按钮');
  // startDetector 用 handler.__duo 传递双手回调，桩保持同一函数对象即可
  // 不在此处清空回调：测试需要检查它，且真实 stop 也不影响下一次 start

  // 先在设置里关掉预备拍（默认开启，4 拍倒计时会让测试等待约 3 秒）
  click($('songPianoBtn'));
  await sleep(80);
  const countInSeg = document.querySelector('#singTempo [data-toggle="countin"]');
  if (countInSeg && countInSeg.classList.contains('active')) { click(countInSeg); await sleep(60); }
  // 关掉后重新开始一次，确保走“无预备拍”分支
  click($('singStopBtn'));
  await sleep(60);
  click($('songPianoBtn'));
  await sleep(120);
  assert.ok($('singArea').style.display !== 'none', '跟练区显示');
  assert.ok(document.querySelectorAll('#singHandSel .seg').length >= 3, '分手/双手选项');
  assert.ok(document.querySelectorAll('#singSectionSel .seg').length >= 2, '跟练分段选项');
  assert.ok(document.querySelectorAll('#singStaff .note').length > 10, '跟练谱面渲染');

  assert.ok(onPitchCb, '麦克风回调已注册');
  const run = window.__musicApp.followRun();
  assert.ok(run, '跟练引擎已创建');
  // 每个音持续 ~120ms（跨过 55ms 稳定阈值），再松键
  const feedNote = async m => {
    for (let k = 0; k < 3; k++) { onPitchCb(m); await sleep(70); }
    onPitchCb(null);
    await sleep(30);
  };
  // 弹对前 3 个音
  for (let i = 0; i < 3; i++) await feedNote(run.seq[i].midis[run.seq[i].midis.length - 1]);
  assert.strictEqual(run.hits, 3, '跟练：前 3 个音命中');
  assert.strictEqual(run.index, 3, '跟练：索引推进');
  // 弹错一个音：evaluate 模式继续前进并标记
  await feedNote(run.seq[3].midis[0] + 3);
  assert.ok(run.wrong[3], '跟练：错音被标记');
  assert.strictEqual(run.index, 4, '跟练：错音后继续（不卡住）');
  // 弹完整段 → 自动结算
  for (let i = run.index; i < run.end; i++) await feedNote(run.seq[i].midis[run.seq[i].midis.length - 1]);
  await sleep(100);
  assert.ok(document.querySelector('.sing-done'), '跟练结束生成报告');
  assert.ok(document.querySelector('.sing-report'), '报告含音准/节奏/完整三项');
  const reportText = document.querySelector('.sing-report').textContent;
  assert.ok(reportText.includes('音准') && reportText.includes('节奏') && reportText.includes('完整'), '报告三项指标');
  // 结果计入统计
  const savedFollow = savedData();
  assert.ok(savedFollow.stats.followRuns >= 1, '跟练结果计入统计');

  // ---------- 录音回放（桩 MediaRecorder） ----------
  {
    const fakeTrack = { stop() {} };
    const fakeStream = { getTracks: () => [fakeTrack] };
    const origStream = window.PitchDetector.currentStream;
    window.PitchDetector.currentStream = () => fakeStream;
    let stopped = false;
    class FakeRecorder {
      constructor() { this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        if (this.ondataavailable) this.ondataavailable({ data: new window.Blob(['x'], { type: 'audio/webm' }) });
        if (this.onstop) this.onstop();
      }
    }
    const origMR = window.MediaRecorder;
    window.MediaRecorder = FakeRecorder;
    window.MediaRecorder.isTypeSupported = () => true;

    click(document.querySelector('.nav-tab[data-page="songs"]'));
    await sleep(50);
    click([...document.querySelectorAll('.song-item')].find(e => e.textContent.includes('欢乐颂')));
    await sleep(50);
    click($('songPianoBtn'));
    await sleep(100);
    // 关预备拍后重开
    const ci = document.querySelector('#singTempo [data-toggle="countin"]');
    if (ci && ci.classList.contains('active')) { click(ci); await sleep(50); }
    click($('singStopBtn'));
    await sleep(60);
    click($('songPianoBtn'));
    await sleep(150);

    const recSeg = document.querySelector('#singTempo [data-toggle="record"]');
    assert.ok(recSeg, '显示录音开关');
    click(recSeg);
    await sleep(150);
    assert.ok(window.MusicRecorder.isRecording(), '开始录音');

    // 录到东西后结束（录音结束是异步的，报告会延迟渲染）
    // 先弹几个音，让练习有内容可结算（否则 stop 只会关闭面板）
    const recRun = window.__musicApp.followRun();
    for (let i = 0; i < 3; i++) {
      const m = recRun.seq[i].midis[0];
      for (let k = 0; k < 3; k++) { onPitchCb(m); await sleep(70); }
      onPitchCb(null);
      await sleep(30);
    }
    click($('singStopBtn'));
    await sleep(1200);
    assert.ok(!window.MusicRecorder.isRecording(), '结束录音');
    assert.ok(document.getElementById('recBlock'), '报告里有录音回放块');
    assert.ok(document.querySelector('.rec-meta').textContent.includes('KB'), '显示录音大小');

    // 删除录音
    click($('recDelBtn'));
    await sleep(50);
    assert.strictEqual(document.getElementById('recBlock'), null, '可删除录音');

    window.MediaRecorder = origMR;
    window.PitchDetector.currentStream = origStream;
  }

  // 离开页面停止采集
  click(document.querySelector('.nav-tab[data-page="practice"]'));
  await sleep(30);
  assert.ok(!document.getElementById('page-songs').classList.contains('active'), '已离开曲谱页');

  // ---------- MIDI 键盘输入 ----------
  {
    const origRequest = window.navigator.requestMIDIAccess;
    let midiHandler = null;
    const fakeInput = { id: 'fake', name: 'Fake Piano' };
    Object.defineProperty(fakeInput, 'onmidimessage', {
      set(v) { midiHandler = v; }, get() { return midiHandler; }
    });
    window.navigator.requestMIDIAccess = () => Promise.resolve({
      inputs: new Map([['fake', fakeInput]]), onstatechange: null
    });
    const sendMidi = bytes => { if (midiHandler) midiHandler({ data: new Uint8Array(bytes) }); };

    assert.ok(window.MidiInput.supported(), 'Web MIDI 可用');
    click(document.querySelector('.nav-tab[data-page="songs"]'));
    await sleep(50);
    click([...document.querySelectorAll('.song-item')].find(e => e.textContent.includes('欢乐颂')));
    await sleep(50);
    click($('songPianoBtn'));
    await sleep(80);
    // 关掉预备拍（否则 4 拍内不采集）
    const ci2 = document.querySelector('#singTempo [data-toggle="countin"]');
    if (ci2 && ci2.classList.contains('active')) { click(ci2); await sleep(50); }
    click($('singStopBtn'));
    await sleep(60);
    click($('songPianoBtn'));
    await sleep(120);
    assert.ok(document.querySelector('#singInput [data-input="midi"]'), '显示 MIDI 输入选项');
    click(document.querySelector('#singInput [data-input="midi"]'));
    await sleep(150);
    assert.ok(midiHandler, 'MIDI 消息回调已绑定');

    const mRun = window.__musicApp.followRun();
    const m1 = mRun.seq[0].midis[0];
    sendMidi([0x90, m1, 100]);
    await sleep(150);
    sendMidi([0x80, m1, 0]);
    await sleep(50);
    assert.strictEqual(mRun.hits, 1, 'MIDI 按键命中第 1 个音');
    assert.strictEqual(mRun.index, 1, 'MIDI 推进索引');

    // 和弦：双手同时按下两个键
    click(document.querySelector('#singHandSel [data-hand="BOTH"]'));
    await sleep(150);
    const duoRun = window.__musicApp.followRun();
    const chord = duoRun.seq[0].midis;
    chord.forEach(m => sendMidi([0x90, m, 100]));
    await sleep(150);
    assert.strictEqual(duoRun.hits, 1, 'MIDI 双手和弦命中');
    chord.forEach(m => sendMidi([0x80, m, 0]));

    window.navigator.requestMIDIAccess = origRequest;
  }

  window.PitchDetector.supported = origSupported;
  window.PitchDetector.start = origStart;
  window.PitchDetector.stop = origStop;

  // ---------- 回归：审计发现的缺陷 ----------
  {
    // (a) 非练习页按字母键不应答题
    click(document.querySelector('.nav-tab[data-page="settings"]'));
    await sleep(50);
    const a0 = window.__musicApp.state().stats.attempts;
    ['a', 's', 'd', 'f', 'g'].forEach(key =>
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })));
    await sleep(50);
    assert.strictEqual(window.__musicApp.state().stats.attempts, a0, '设置页按键不答题');

    // (b) 放音符模式切走后，点谱面不再改音符
    click(document.querySelector('.nav-tab[data-page="practice"]'));
    await sleep(50);
    click(document.querySelector('#segMode [data-mode="place"]'));
    await sleep(80);
    click(document.querySelector('#segMode [data-mode="name"]'));
    await sleep(80);
    const beforeMidi = document.querySelector('#practiceStaff .note').dataset.midi;
    const svg = document.querySelector('#practiceStaff svg');
    svg.getBoundingClientRect = () => ({ top: 0, left: 0, width: 460, height: 300, right: 460, bottom: 300 });
    svg.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientY: 40 }));
    await sleep(50);
    assert.strictEqual(document.querySelector('#practiceStaff .note').dataset.midi, beforeMidi,
      '点音名模式下点谱面不改音符');

    // (c) 快捷键在点琴键模式按半音类判定正确
    click(document.querySelector('#segMode [data-mode="keyboard"]'));
    await sleep(80);
    const kn = document.querySelector('#practiceStaff .note');
    const km = parseInt(kn.dataset.midi, 10) + parseInt(kn.dataset.accidental || '0', 10);
    const LETTER_PC = { a: 0, s: 2, d: 4, f: 5, g: 7, h: 9, j: 11 };
    let key = null;
    Object.keys(LETTER_PC).forEach(k => { if (LETTER_PC[k] === km % 12) key = k; });
    if (key) {
      const c0 = window.__musicApp.state().stats.correct;
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
      await sleep(50);
      assert.ok(window.__musicApp.state().stats.correct > c0, '快捷键在点琴键模式判对');
      await sleep(1300);
    }
    click(document.querySelector('#segMode [data-mode="name"]'));
  }

  // ---------- 回归：学习页每个音符都可点击 ----------
  {
    click(document.querySelector('.nav-tab[data-page="learn"]'));
    await sleep(50);
    const notes = [...document.querySelectorAll('#learnStaff .note')];
    assert.ok(notes.length >= 13, '学习页有完整音阶');
    assert.ok(notes.every(n => n.querySelector('.note-hit')), '每个可点音符都有透明热区');
    // 点第 1 个音符（此前因符头太窄点不中）
    const first = notes[0];
    click(first.querySelector('.note-hit'));
    await sleep(30);
    assert.ok($('learnKeyInfo').textContent.length > 0, '点第一个音符能显示音名');
    // 热区足够大
    const hit = notes[0].querySelector('.note-hit');
    assert.strictEqual(hit.getAttribute('width'), '30', '热区宽度 30');
    assert.strictEqual(hit.getAttribute('height'), '72', '热区高度 6 个线距');
  }

  // ---------- 每日挑战 ----------
  {
    click(document.querySelector('.nav-tab[data-page="weekly"]'));
    await sleep(50);
    assert.ok($('challengeBody'), '周报页含每日挑战');
    assert.ok($('challengeStartBtn'), '有开始挑战按钮');
    assert.ok($('challengeBody').textContent.includes('全对天数'), '显示全对天数');

    click($('challengeStartBtn'));
    await sleep(60);
    assert.ok(document.querySelector('.ch-head'), '进入挑战');
    assert.ok(document.querySelector('.ch-timer').textContent.includes('秒'), '显示倒计时');
    assert.ok(document.querySelector('#chStaff .note') || document.querySelector('.ch-q'), '题目已渲染');

    // 切页暂停倒计时（避免在别的页面超时被静默判 0 分）
    {
      const r0 = window.__musicApp.challengeRun();
      const remain0 = r0.remaining;
      click(document.querySelector('.nav-tab[data-page="settings"]'));
      await sleep(50);
      assert.ok(r0.paused, '离开周报页后倒计时暂停');
      assert.strictEqual(r0.timer, null, '计时器已清除');
      click(document.querySelector('.nav-tab[data-page="weekly"]'));
      await sleep(50);
      assert.ok(!r0.paused, '回到周报页恢复计时');
      assert.ok(r0.timer, '计时器重新启动');
      assert.strictEqual(r0.remaining, remain0, '暂停期间不扣时间');
    }

    // 全部答对
    const run = window.__musicApp.challengeRun();
    assert.ok(run, '挑战状态存在');
    assert.strictEqual(run.challenge.questions.length, 8, '8 道题');
    for (let i = 0; i < 8; i++) {
      const cur = window.__musicApp.challengeRun();
      if (!cur) break;
      const q = cur.challenge.questions[cur.idx];
      const opts = document.querySelectorAll('#chOptions .answer-btn, #chOptions .theory-opt');
      assert.ok(opts.length > 0, '第 ' + (i + 1) + ' 题有选项');
      click(opts[q.answer]);
      await sleep(150);   // 等防连点锁释放
    }
    await sleep(150);
    assert.ok($('challengeBody').textContent.includes('全对'), '全对结果');
    const cs = window.__musicApp.state().challenge;
    assert.strictEqual(cs.perfectDays, 1, '全对天数 +1');
    assert.strictEqual(cs.attempts, 1, '挑战次数 +1');
    assert.ok(cs.history[window.MusicChallenge.todayKey()], '记录到历史');

    // 徽章进度条
    click(document.querySelector('.nav-tab[data-page="settings"]'));
    await sleep(30);
    const badges = [...document.querySelectorAll('#badgeList .badge')];
    assert.ok(badges.some(b => b.textContent.includes('每日之星')), '成就墙含限定徽章');
    assert.ok(badges.some(b => b.querySelector('.badge-bar')), '未获得徽章有进度条');
    const limited = badges.find(b => b.textContent.includes('每日之星'));
    assert.ok(limited.textContent.includes('限定'), '限定徽章有标记');
    assert.ok(limited.querySelector('.badge-progress').textContent.includes('1 / 3'), '限定徽章显示进度');
  }

  // ---------- 家长周报 ----------
  {
    // 造一周数据
    const raw = JSON.parse(window.localStorage.getItem('music-tutor-v1'));
    const d = raw.profiles[raw.activeId].data;
    const key = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const today = new Date();
    d.history = {};
    d.history[key(new Date(today.getFullYear(), today.getMonth(), today.getDate()))] = { practice: 5, correct: 4, total: 5 };
    d.history[key(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))] = { practice: 3, correct: 3, total: 3 };
    d.mistakes = { 0: { wrong: 4, total: 5, last: 1, clef: 'treble' } };
    d.courses = { 'baier-01': { done: true, stars: 3 } };
    d.gamify.dayStreak = 2;
    window.localStorage.setItem('music-tutor-v1', JSON.stringify(raw));

    const domW = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
    const wW = domW.window;
    wW.localStorage.setItem('music-tutor-v1', JSON.stringify(raw));
    ['js/core.js', 'js/courses.js', 'js/songs.js', 'js/library.js', 'js/audio.js', 'js/pitch.js', 'js/midi.js', 'js/follow.js', 'js/stats.js', 'js/recorder.js', 'js/profiles.js', 'js/backup.js', 'js/weekly.js', 'js/challenge.js', 'js/sight.js', 'js/glyphs.js', 'js/staff.js', 'js/gamify.js', 'js/practice.js', 'js/app.js'].forEach(f => wW.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    await sleep(40);
    const cW = el => el.dispatchEvent(new wW.MouseEvent('click', { bubbles: true }));

    // 导航里有周报标签
    assert.ok(wW.document.querySelector('#tab-weekly'), '导航含周报标签');
    cW(wW.document.querySelector('#tab-weekly'));
    await sleep(50);
    assert.ok(wW.document.getElementById('page-weekly').classList.contains('active'), '周报页激活');

    const doc = wW.document;
    assert.ok(doc.getElementById('weeklyRange').textContent.includes('~'), '显示统计区间');
    assert.strictEqual(doc.querySelectorAll('.wk-col').length, 7, '7 天柱状图');
    assert.ok(doc.querySelector('.wk-hero-level').textContent.length > 0, '显示周评级');
    const stats = [...doc.querySelectorAll('.wk-stats .stat-box')];
    assert.strictEqual(stats.length, 4, '4 项关键指标');
    assert.strictEqual(stats[0].querySelector('.stat-box-num').textContent.replace('/7', ''), '2', '练习天数 2');
    assert.strictEqual(stats[1].querySelector('.stat-box-num').textContent, '8', '练习次数 8');
    assert.ok(doc.querySelectorAll('.wk-kind').length >= 1, '显示练习分类');
    assert.ok(doc.querySelector('.wk-weak-name').textContent.includes('C'), '显示薄弱音');
    assert.ok(doc.querySelectorAll('.wk-advice li').length >= 1, '有给家长的建议');
    assert.ok(doc.querySelector('.wk-meta').textContent.includes('1'), '显示课程与成就');

    // 文字版可生成
    const text = wW.MusicWeekly.toText(wW.MusicWeekly.build({
      history: d.history, mistakes: d.mistakes, courses: d.courses, gamify: d.gamify
    }, { name: '小朋友' }));
    assert.ok(text.includes('五线谱小课堂 · 周报'), '文字版标题');
    assert.ok(text.includes('练习天数'), '文字版含练习天数');
    assert.ok(text.includes('建议'), '文字版含建议');
  }

  // ---------- 多儿童档案 ----------
  {
    click(document.querySelector('.nav-tab[data-page="settings"]'));
    await sleep(30);
    assert.ok($('profileList').children.length >= 1, '设置页显示档案列表');
    assert.strictEqual($('profileName').textContent.length > 0, true, '顶部显示当前档案名');

    // 记录当前档案的成绩
    const before = savedData();
    const beforeAttempts = before.stats.attempts;

    // 添加第二个小朋友
    $('profileNameInput').value = '妹妹';
    click($('profileAddBtn'));
    await sleep(50);
    const store = window.__musicApp.profiles();
    assert.strictEqual(Object.keys(store.profiles).length, 2, '新增第二个档案');
    assert.strictEqual($('profileName').textContent, '妹妹', '自动切到新档案');
    assert.strictEqual(window.__musicApp.state().stats.attempts, 0, '新档案成绩从 0 开始');
    assert.strictEqual(Object.keys(window.__musicApp.state().courses).length, 0, '新档案课程为空');

    // 新档案做一题，产生独立数据
    click(document.querySelector('.nav-tab[data-page="practice"]'));
    await sleep(30);
    const nm = parseInt(document.querySelector('#practiceStaff .note').dataset.midi, 10);
    const ri = ((window.MusicCore.midiToDia(nm) % 7) + 7) % 7;
    click($('answerButtons').children[ri]);
    await sleep(60);
    assert.strictEqual(window.__musicApp.state().stats.correct, 1, '新档案记录答题');

    // 切回第一个小朋友：原数据完好
    click(document.querySelector('.nav-tab[data-page="settings"]'));
    await sleep(30);
    const rows = [...document.querySelectorAll('#profileList .profile-row')];
    const firstRow = rows.find(r => r.textContent.includes('小朋友'));
    click(firstRow);
    await sleep(60);
    assert.strictEqual(window.__musicApp.state().stats.attempts, beforeAttempts, '切回后原成绩恢复');
    const store2 = window.__musicApp.profiles();
    const p1 = Object.values(store2.profiles).find(p => p.name === '小朋友');
    const p2 = Object.values(store2.profiles).find(p => p.name === '妹妹');
    assert.strictEqual(p1.data.stats.attempts, beforeAttempts, '档案 1 数据独立保存');
    assert.strictEqual(p2.data.stats.correct, 1, '档案 2 数据独立保存');

    // 删除第二个档案
    const rows2 = [...document.querySelectorAll('#profileList .profile-row')];
    const secondRow = rows2.find(r => r.textContent.includes('妹妹'));
    const delBtn = secondRow.querySelector('[data-act="remove"]');
    assert.ok(delBtn, '非唯一档案可删除');
    const origConfirm = window.confirm;
    window.confirm = () => true;
    click(delBtn);
    await sleep(50);
    window.confirm = origConfirm;
    assert.strictEqual(Object.keys(window.__musicApp.profiles().profiles).length, 1, '删除后只剩一个档案');
    assert.strictEqual(document.querySelector('#profileList [data-act="remove"]'), null, '唯一档案不显示删除按钮');
  }

  // ---------- 数据备份：导出 / 导入 ----------
  {
    // 准备一份有内容的状态
    click(document.querySelector('.nav-tab[data-page="settings"]'));
    await sleep(30);
    const raw = JSON.parse(window.localStorage.getItem('music-tutor-v1'));
    raw.courses = { 'baier-01': { done: true, stars: 3 } };
    window.localStorage.setItem('music-tutor-v1', JSON.stringify(raw));

    // 导出：验证生成的备份文本（jsdom 不支持真实下载）
    const exported = window.__musicApp.exportText();
    const expParsed = window.MusicBackup.parse(exported);
    assert.ok(expParsed.ok, '导出的文本可被自己解析');
    assert.ok(expParsed.data.stats, '导出包含成绩');
    assert.ok(expParsed.data.gamify, '导出包含游戏化数据');
    assert.ok(exported.includes('ipiano-backup'), '导出带格式标识');

    // 导入：直接调用解析 + 应用逻辑（jsdom 的 FileReader 可用）
    const goodBackup = window.MusicBackup.serialize({
      stats: { attempts: 99, correct: 90, firstTry: 80, stars: 100, currentStreak: 1, bestStreak: 9, fullCorrect: 0 },
      courses: { 'baier-01': { done: true, stars: 2 }, 'baier-02': { done: true, stars: 1 } },
      mistakes: {}, history: {},
      gamify: { xp: 55, dayStreak: 3, lastDay: '2026-10-21', freezes: 2, tasks: [], prog: {}, badges: { first: 1 } }
    });
    const parsed = window.MusicBackup.parse(goodBackup);
    assert.ok(parsed.ok, '备份可解析');

    // 合并导入：进度取更优
    window.__musicApp.applyImport(parsed.data, 'merge');
    await sleep(50);
    const merged = savedData();
    assert.strictEqual(merged.stats.attempts, 99, '合并后尝试次数取大');
    assert.strictEqual(merged.courses['baier-01'].stars, 3, '合并保留高星');
    assert.ok(merged.courses['baier-02'], '合并导入新增课程');
    assert.ok($('backupStatus').textContent.includes('已合并导入'), '合并提示');

    // 覆盖导入：直接采用备份
    window.__musicApp.applyImport(parsed.data, 'replace');
    await sleep(50);
    const replaced = savedData();
    assert.strictEqual(replaced.courses['baier-01'].stars, 2, '覆盖后采用备份星级');
    assert.ok(!replaced.courses['baier-02'] || replaced.courses['baier-02'].stars === 1, '覆盖后课程来自备份');
    assert.ok($('backupStatus').textContent.includes('已覆盖导入'), '覆盖提示');

    // 损坏文件不污染数据
    const before = JSON.stringify(savedData());
    const bad = window.MusicBackup.parse('{ broken');
    assert.strictEqual(bad.ok, false, '损坏文件被拒绝');
    assert.strictEqual(JSON.stringify(savedData()), before, '数据未被改动');
  }

  console.log('integration.test.js: 全部通过 ✓');
  process.exit(0);
})().catch(e => {
  console.error('测试失败:', e.message);
  process.exit(1);
});
