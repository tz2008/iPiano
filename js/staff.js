/* staff.js — SVG 五线谱渲染器（依赖 core.js）
 * 提供：renderStaff（线+谱号+音符）、renderKeyboard（钢琴键盘 DOM）
 */
(function (global) {
  'use strict';
  var Core = global.MusicCore;

  var SPACING = 12;       // 相邻两线间距 (px)
  var LINE5_Y = 40;       // 最上面一条线(line5) 的 y
  var LINE1_Y = LINE5_Y + 4 * SPACING; // 最下面一条线(line1) 的 y
  var W = 460, H = 168;   // 默认画布尺寸（实际按音符范围自适应）
  var CLEF_X = 34;        // 谱号字符中心 x（给音符留出横向空间）
  var ACCENT = '#0078D4';

  /* ---------- 工具 ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- 谱号绘制 ----------
   * 轮廓数据见 js/glyphs.js（取自 Bravura 音乐字体，SIL OFL 1.1，
   * © Steinberg Media Technologies GmbH）。按 SMuFL 标准 1 em = 4 个线距：
   * G 谱号原点在第二线（G 线），F 谱号原点在第四线（F 线）。
   * 纯 path 填充，不依赖系统字体，离线与 iPad 上显示一致。
   */
  var CLEF_GLYPHS = (global.MusicGlyphs && global.MusicGlyphs.clefs) || {};

  /** 画谱号（以谱号所在谱线为纵向原点，水平居中于 x） */
  function drawClefSvg(svg, clef, x, cy, lineSpacing) {
    var g = CLEF_GLYPHS[clef] || CLEF_GLYPHS.treble;
    if (!g) return { left: x, right: x }; // glyphs.js 未加载时跳过，不破坏谱面其余部分
    var k = lineSpacing * 4; // SMuFL：1 em = 4 个线距
    var left = x - g.w * k / 2;
    el('path', {
      d: g.path,
      transform: 'translate(' + left + ',' + cy + ') scale(' + k + ')',
      'class': 'clef-glyph',
      fill: '#1a1a1a'
    }, svg);
    return { left: left, right: left + g.w * k };
  }

  /** 在 svg 中画谱号：G 谱号中心在第二线，F 谱号中心在第四线 */
  function drawClef(svg, clef) {
    var cy = clef === 'treble' ? LINE5_Y + 3 * SPACING : LINE5_Y + 1 * SPACING;
    return drawClefSvg(svg, clef, CLEF_X, cy, SPACING);
  }

  /* ---------- 音符 ---------- */
  var NOTE_X = 300; // 练习模式默认音符 x

  /** 画一个音符。opts: { label, accidental(0|1|-1), highlight, muted, chord:[midi...] } */
  function drawNote(svg, clef, midi, x, opts) {
    opts = opts || {};
    // 黑键：谱面位置取下方白键，并自动加 ♯（除非调用方显式指定了临时记号）
    var accidental = opts.accidental;
    if (accidental === undefined) accidental = Core.midiToDia(midi) === null ? 1 : 0;
    var baseMidi = Core.midiToDia(midi) === null ? midi - 1 : midi;
    var y = Core.staffY(clef, baseMidi, LINE5_Y, SPACING);
    if (y === null) return;
    var g = el('g', { 'data-midi': midi, 'data-accidental': accidental }, svg);
    if (opts.interactive) {
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', opts.ariaLabel || ('音符 ' + midi));
      g.style.cursor = 'pointer';
      // 透明热区：<g> 本身没有可点击面积，只靠窄小的符头很难点中，
      // 加一块覆盖音符上下的矩形，让孩子容易点
      var hit = el('rect', {
        x: x - 15, y: y - 3 * SPACING, width: 30, height: 6 * SPACING,
        'class': 'note-hit', fill: 'transparent'
      }, g);
      hit.setAttribute('pointer-events', 'all');
      g.insertBefore(hit, g.firstChild);
    }
    var cls = 'note';
    if (opts.bounce) cls += ' note-blink'; // 原地闪烁反馈
    if (opts.dim) cls += ' note-dim';      // 已唱过变淡
    if (opts.ok) cls += ' note-ok';        // 弹对/唱对（绿色标记）
    if (opts.wrong) cls += ' note-wrong';  // 弹错/唱错（红色标记）
    if (opts.missed) cls += ' note-missed';// 漏弹（橙色标记）
    g.setAttribute('class', cls);

    // 和弦：其余音单独画符头（不加符干），用同一条加线
    if (opts.chord && opts.chord.length) {
      opts.chord.forEach(function (cm) {
        var cAcc = Core.midiToDia(cm) === null ? 1 : 0;
        var cBase = cAcc ? cm - 1 : cm;
        var cy = Core.staffY(clef, cBase, LINE5_Y, SPACING);
        if (cy === null) return;
        var cl = Core.ledgerLines(clef, cBase, LINE5_Y, SPACING);
        cl.top.concat(cl.bottom).forEach(function (ly) {
          el('line', { x1: x - 14, y1: ly, x2: x + 14, y2: ly, 'stroke': '#1a1a1a', 'stroke-width': 2 }, g);
        });
        if (cAcc) {
          el('text', {
            x: x - 22, y: cy + 3, 'font-size': 30, 'class': 'accidental',
            'font-family': '"Segoe UI Symbol","Segoe UI","Noto Music",sans-serif',
            'text-anchor': 'middle', fill: '#1a1a1a'
          }, g).textContent = '♯';
        }
        el('ellipse', {
          cx: x, cy: cy, rx: 7.5, ry: 5,
          transform: 'rotate(-18 ' + x + ' ' + cy + ')',
          'class': 'note-head',
          fill: '#1a1a1a', stroke: '#1a1a1a', 'stroke-width': 1.6
        }, g);
      });
    }

    // 加线
    var led = Core.ledgerLines(clef, baseMidi, LINE5_Y, SPACING);
    led.top.forEach(function (ly) {
      el('line', { x1: x - 14, y1: ly, x2: x + 14, y2: ly, 'stroke': '#1a1a1a', 'stroke-width': 2 }, g);
    });
    led.bottom.forEach(function (ly) {
      el('line', { x1: x - 14, y1: ly, x2: x + 14, y2: ly, 'stroke': '#1a1a1a', 'stroke-width': 2 }, g);
    });

    // 临时记号（黑键）♯ ♭ ♮
    var acc = accidental || 0;
    if (acc) {
      el('text', {
        x: x - 22, y: y + 3, 'font-size': 30, 'class': 'accidental',
        'font-family': '"Segoe UI Symbol","Segoe UI","Noto Music",sans-serif',
        'text-anchor': 'middle', fill: '#1a1a1a'
      }, g).textContent = acc > 0 ? '\u266F' : '\u266D'; // ♯ ♭
    }

    // 符头（向左下倾斜的椭圆；时值决定实心/空心）
    var dur = opts.dur != null ? opts.dur : 1;
    var hollow = dur >= 2;
    el('ellipse', {
      cx: x, cy: y, rx: 7.5, ry: 5,
      transform: 'rotate(-18 ' + x + ' ' + y + ')',
      'class': 'note-head' + (hollow ? ' hollow' : ''),
      fill: hollow ? '#ffffff' : '#1a1a1a',
      stroke: '#1a1a1a', 'stroke-width': 1.6
    }, g);

    // 符干（全音符无符干；二分/四分/八分有）
    var up = Core.stemUp(clef, baseMidi);
    if (dur < 4) {
      if (up) {
        el('line', { x1: x + 7, y1: y - 3, x2: x + 7, y2: y - 3.8 * SPACING, 'stroke': '#1a1a1a', 'stroke-width': 1.8 }, g);
      } else {
        el('line', { x1: x - 7, y1: y + 3, x2: x - 7, y2: y + 3.8 * SPACING, 'stroke': '#1a1a1a', 'stroke-width': 1.8 }, g);
      }
      // 八分音符加符尾
      if (dur < 1) {
        var stemX = up ? x + 7 : x - 7;
        var stemTop = up ? y - 3.8 * SPACING : y + 3.8 * SPACING;
        el('path', {
          d: 'M' + stemX + ' ' + stemTop +
             ' q ' + (up ? 10 : -10) + ' 6 ' + (up ? 18 : -18) + ' 14 ' +
             ' q ' + (up ? -5 : 5) + ' -2 ' + (up ? -10 : 10) + ' -8 z',
          fill: '#1a1a1a'
        }, g);
      }
    }

    // 高亮：仅留柔和光晕，不用蓝色虚线（闪烁动画由 .note-blink 负责）
    if (opts.highlight) {
      el('circle', { cx: x, cy: y, r: 17, 'class': 'note-halo', opacity: 0.18 }, g);
    }

    // 音名/唱名标签（学习模式）；太高/太低时翻转到另一侧
    if (opts.label) {
      var above = (y - 24) >= 0;
      var lyy = above ? y - 24 : y + 26;
      el('text', {
        x: x, y: lyy, 'font-size': 15, 'font-weight': 600, 'class': 'note-label',
        'text-anchor': 'middle', fill: opts.labelColor || '#666666',
        'font-family': '"Segoe UI","Microsoft YaHei UI",sans-serif'
      }, g).textContent = opts.label;
    }

    // 小光标（定位提示：当前音符位置）
    if (opts.cursor) {
      el('path', {
        d: 'M' + (x - 8) + ' ' + (y - 34) + ' L' + x + ' ' + (y - 26) + ' L' + (x + 8) + ' ' + (y - 34) + ' Z',
        fill: ACCENT
      }, g);
    }
    return g;
  }

  /* ---------- 五线 ---------- */
  function drawStaffLines(svg, x0, x1) {
    var g = el('g', { 'class': 'staff-lines' }, svg);
    for (var i = 0; i < 5; i++) {
      el('line', {
        x1: x0, y1: LINE5_Y + i * SPACING, x2: x1, y2: LINE5_Y + i * SPACING,
        'stroke': '#1a1a1a', 'stroke-width': 1.6
      }, g);
    }
  }

  /* ---------- 主入口 ----------
   * opts: {
   *   clef: 'treble'|'bass',
   *   notes: [{ midi, label, accidental, highlight, cursor, labelAbove, labelColor }],
   *   noteX: 单个音符的 x（练习模式）,
   *   width, height, className
   * }
   * viewBox 高度按音符/加线范围自适应（88 键极端加线也不会被裁剪）。
   */
  function renderStaff(container, opts) {
    opts = opts || {};
    var w = opts.width || W;
    var clef = opts.clef || 'treble';

    // 统计音符纵向范围（含加线与符干空间）
    var minY = LINE5_Y, maxY = LINE1_Y;
    if (opts.notes) {
      opts.notes.forEach(function (n) {
        var all = [n.midi].concat(n.chord || []);
        all.forEach(function (m) {
          var base = Core.midiToDia(m) === null ? m - 1 : m; // 黑键按下方白键定位
          var y = Core.staffY(clef, base, LINE5_Y, SPACING);
          if (y === null) return;
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          var led = Core.ledgerLines(clef, base, LINE5_Y, SPACING);
          led.top.forEach(function (ly) { minY = Math.min(minY, ly); });
          led.bottom.forEach(function (ly) { maxY = Math.max(maxY, ly); });
        });
      });
    }
    // 默认（无音符）时留出上下各一条加线
    minY = Math.min(minY, LINE5_Y - SPACING);
    maxY = Math.max(maxY, LINE1_Y + SPACING);

    var padTop = 48;   // 符干向上 / 音名标签
    var padBottom = 46;
    var y0 = minY - padTop;
    var y1 = maxY + padBottom;
    var h = y1 - y0;

    container.innerHTML = '';
    // scroll: 长曲谱按真实像素宽度渲染，交给 .scroll-x 横向滚动，避免压缩重叠
    var svgAttrs = {
      viewBox: '0 ' + y0 + ' ' + w + ' ' + h,
      'class': 'staff-svg' + (opts.scroll ? ' wide' : '') + (opts.className ? ' ' + opts.className : '')
    };
    if (opts.scroll) {
      svgAttrs.width = Math.round(w);
      svgAttrs.height = Math.round(h * w / w); // 高度由 viewBox 比例决定
      svgAttrs.style = 'width:' + Math.round(w) + 'px;max-width:none';
    } else {
      svgAttrs.width = '100%';
    }
    var svg = el('svg', svgAttrs, container);
    drawStaffLines(svg, 0, w);
    drawClef(svg, clef);
    if (opts.notes) {
      opts.notes.forEach(function (n) {
        drawNote(svg, clef, n.midi, n.x != null ? n.x : (opts.noteX || NOTE_X), n);
      });
    }
    return svg;
  }

  /* ---------- 钢琴键盘 ----------
   * lo/hi：midi 范围（含黑键）。键盘宽度自适应容器：白键 flex 均分，
   * 黑键按白键比例百分比定位，88 键也能在容器内完整显示。
   * 返回 { root, keyEls: Map(midi -> el) }
   */
  function renderKeyboard(container, lo, hi, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var root = document.createElement('div');
    root.className = 'keyboard';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', opts.label || '钢琴键盘');
    var whiteH = opts.whiteH || 120;
    var keys = new Map();
    var whites = [];

    function isBlack(m) { return Core.midiToDia(m) === null; }

    // 先统计白键总数（黑键百分比定位依赖）
    var nWhite = 0;
    for (var mm = lo; mm <= hi; mm++) if (!isBlack(mm)) nWhite++;

    for (var m = lo; m <= hi; m++) {
      if (isBlack(m)) continue;
      var wk = document.createElement('div');
      wk.className = 'key white';
      wk.dataset.midi = m;
      wk.style.height = whiteH + 'px';
      var wname = Core.letterOf(m) + (Math.floor(m / 12) - 1);
      wk.title = wname;
      wk.setAttribute('role', 'button');
      wk.setAttribute('tabindex', '-1');
      wk.setAttribute('aria-label', wname + ' 键');
      root.appendChild(wk);
      whites.push(wk);
      keys.set(m, wk);
      // 键位标记（如中央 C）
      if (opts.marks) {
        for (var mi = 0; mi < opts.marks.length; mi++) {
          if (opts.marks[mi].midi === m) {
            wk.classList.add('has-mark');
            var mark = document.createElement('span');
            mark.className = 'mark';
            mark.textContent = opts.marks[mi].label || '';
            wk.appendChild(mark);
          }
        }
      }
    }
    // 黑键绝对定位（百分比，跟随自适应宽度）
    var count = 0;
    for (var m2 = lo; m2 <= hi; m2++) {
      if (!isBlack(m2)) { count++; continue; }
      var bk = document.createElement('div');
      bk.className = 'key black';
      bk.dataset.midi = m2;
      var bname = Core.letterOf(m2 - 1) + '♯';
      bk.title = '黑键 ' + bname;
      bk.setAttribute('role', 'button');
      bk.setAttribute('tabindex', '-1');
      bk.setAttribute('aria-label', bname + ' 黑键');
      bk.style.left = (count / nWhite * 100) + '%';
      bk.style.width = (0.62 / nWhite * 100) + '%';
      bk.style.height = (whiteH * 0.62) + 'px';
      root.appendChild(bk);
      keys.set(m2, bk);
    }
    root.style.height = whiteH + 'px';

    // 键盘可达性：整组一个 Tab 位，内部用左右方向键移动，Enter/空格激活
    var ordered = [];
    for (var om = lo; om <= hi; om++) if (keys.has(om)) ordered.push(keys.get(om));
    if (ordered.length) {
      ordered[0].setAttribute('tabindex', '0');
      ordered[0].classList.add('key-focusable');
    }
    function focusKey(k) {
      ordered.forEach(function (x) {
        x.setAttribute('tabindex', '-1');
        x.classList.remove('key-focusable');
      });
      k.setAttribute('tabindex', '0');
      k.classList.add('key-focusable');
      k.focus();
    }
    root.addEventListener('keydown', function (ev) {
      var k = ev.target.closest && ev.target.closest('.key');
      if (!k) return;
      var i = ordered.indexOf(k);
      if (i < 0) return;
      var j = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = Math.min(ordered.length - 1, i + 1);
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = Math.max(0, i - 1);
      else if (ev.key === 'Home') j = 0;
      else if (ev.key === 'End') j = ordered.length - 1;
      if (j >= 0) {
        ev.preventDefault();
        focusKey(ordered[j]);
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (opts.onKey) opts.onKey(parseInt(k.dataset.midi, 10), k);
      }
    });

    if (opts.onKey) {
      root.addEventListener('click', function (ev) {
        var k = ev.target.closest('.key');
        if (k) opts.onKey(parseInt(k.dataset.midi, 10), k);
      });
    }
    container.appendChild(root);
    return { root: root, keys: keys };
  }

  /** 键盘高亮 */
  function setKeyActive(keyboard, midi) {
    keyboard.root.querySelectorAll('.key.active').forEach(function (k) {
      k.classList.remove('active');
    });
    var k = keyboard.keys.get(midi);
    if (k) k.classList.add('active');
  }

  global.MusicStaff = {
    SPACING: SPACING,
    LINE5_Y: LINE5_Y,
    renderStaff: renderStaff,
    drawNote: drawNote,
    renderKeyboard: renderKeyboard,
    setKeyActive: setKeyActive
  };
})(window);
