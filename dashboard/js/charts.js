/**
 * Porchlight — hand-rolled SVG chart primitives (no libraries).
 * Charts.line / Charts.bar / Charts.heatmap / Charts.sparkline / Charts.ring
 * All animations honour prefers-reduced-motion via CSS; JS only sets geometry.
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function reducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === null || attrs[k] === undefined) return;
        node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function niceMax(values) {
    var max = values.reduce(function (m, v) { return Math.max(m, v); }, 0);
    if (max <= 4) return 4;
    var pow = Math.pow(10, Math.floor(Math.log10(max)));
    var norm = max / pow;
    var step = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * pow;
  }

  function ensureTip(container) {
    var tip = container.querySelector('.chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.setAttribute('role', 'status');
      tip.hidden = true;
      container.appendChild(tip);
    }
    return tip;
  }

  function showTip(tip, container, clientX, clientY, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    var rect = container.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var left = Math.min(Math.max(8, x - tw / 2), rect.width - tw - 8);
    var top = y - th - 14;
    if (top < 4) top = y + 18;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }

  function hideTip(tip) {
    tip.hidden = true;
  }

  /* ================= line chart ================= */

  function line(container, options) {
    clear(container);
    var values = options.values || [];
    var labels = options.labels || [];
    var W = 640, H = 240;
    var padL = 40, padR = 14, padT = 16, padB = 30;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var max = niceMax(values);
    var n = values.length;

    var svg = svgEl('svg', {
      class: 'chart-svg chart-svg--line',
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      tabindex: '0',
      'aria-label': options.ariaLabel || 'Line chart'
    });

    var defs = svgEl('defs');
    var grad = svgEl('linearGradient', { id: 'lineFill', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.28' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.02' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    function xAt(i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function yAt(v) { return padT + plotH - (v / max) * plotH; }

    // gridlines + y labels
    [0, 0.5, 1].forEach(function (frac) {
      var v = max * frac;
      var y = yAt(v);
      svg.appendChild(svgEl('line', {
        class: 'chart-grid', x1: padL, x2: W - padR, y1: y, y2: y
      }));
      var t = svgEl('text', { class: 'chart-tick', x: padL - 8, y: y + 4, 'text-anchor': 'end' });
      t.textContent = String(Math.round(v));
      svg.appendChild(t);
    });

    // area + line
    var linePts = values.map(function (v, i) { return xAt(i) + ',' + yAt(v); });
    var areaD = 'M' + xAt(0) + ',' + (padT + plotH) + ' L' + linePts.join(' L') + ' L' + xAt(n - 1) + ',' + (padT + plotH) + ' Z';
    svg.appendChild(svgEl('path', { class: 'chart-area', d: areaD, fill: 'url(#lineFill)' }));

    var lineD = 'M' + linePts.join(' L');
    var path = svgEl('path', { class: 'chart-line', d: lineD, fill: 'none' });
    svg.appendChild(path);

    // x labels
    var every = options.labelEvery || 4;
    labels.forEach(function (label, i) {
      if (i % every !== 0 && i !== n - 1) return;
      var t = svgEl('text', { class: 'chart-tick', x: xAt(i), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = label;
      svg.appendChild(t);
    });

    // cursor
    var guide = svgEl('line', { class: 'chart-guide', x1: 0, x2: 0, y1: padT, y2: padT + plotH });
    var dot = svgEl('circle', { class: 'chart-dot', r: 5 });
    guide.style.display = 'none';
    dot.style.display = 'none';
    svg.appendChild(guide);
    svg.appendChild(dot);
    container.appendChild(svg);

    var tip = ensureTip(container);
    var active = -1;

    function setActive(i, clientX, clientY) {
      if (i < 0 || i >= n) return;
      active = i;
      var x = xAt(i), y = yAt(values[i]);
      guide.style.display = '';
      dot.style.display = '';
      guide.setAttribute('x1', x); guide.setAttribute('x2', x);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      var rect = svg.getBoundingClientRect();
      var scaleX = rect.width / W, scaleY = rect.height / H;
      var cx = clientX !== undefined ? clientX : rect.left + x * scaleX;
      var cy = clientY !== undefined ? clientY : rect.top + y * scaleY;
      var label = labels[i] !== undefined ? labels[i] : 'Point ' + (i + 1);
      showTip(tip, container, cx, cy, '<strong>' + values[i] + '</strong> events · ' + label);
    }

    function clearActive() {
      active = -1;
      guide.style.display = 'none';
      dot.style.display = 'none';
      hideTip(tip);
    }

    function indexFromEvent(evt) {
      var rect = svg.getBoundingClientRect();
      var vx = ((evt.clientX - rect.left) / rect.width) * W;
      var i = Math.round(((vx - padL) / plotW) * (n - 1));
      return Math.min(n - 1, Math.max(0, i));
    }

    svg.addEventListener('pointermove', function (evt) {
      setActive(indexFromEvent(evt), evt.clientX, evt.clientY);
    });
    svg.addEventListener('pointerleave', clearActive);
    svg.addEventListener('focus', function () { setActive(n - 1); });
    svg.addEventListener('blur', clearActive);
    svg.addEventListener('keydown', function (evt) {
      if (evt.key === 'ArrowRight') { evt.preventDefault(); setActive(Math.min(n - 1, active + 1)); }
      else if (evt.key === 'ArrowLeft') { evt.preventDefault(); setActive(Math.max(0, (active < 0 ? n : active) - 1)); }
      else if (evt.key === 'Home') { evt.preventDefault(); setActive(0); }
      else if (evt.key === 'End') { evt.preventDefault(); setActive(n - 1); }
      else if (evt.key === 'Escape') { clearActive(); }
    });

    // animated draw-on
    if (!reducedMotion() && path.getTotalLength) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(function () {
        path.style.transition = 'stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1)';
        path.style.strokeDashoffset = '0';
      });
    }
  }

  /* ================= bar chart ================= */

  function bar(container, options) {
    clear(container);
    var values = options.values || [];
    var labels = options.labels || [];
    var W = 480, H = 240;
    var padL = 36, padR = 10, padT = 16, padB = 30;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var max = niceMax(values);
    var n = values.length;
    var slot = plotW / n;
    var barW = Math.min(34, slot * 0.56);

    var svg = svgEl('svg', {
      class: 'chart-svg chart-svg--bar',
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      tabindex: '0',
      'aria-label': options.ariaLabel || 'Bar chart'
    });

    [0, 0.5, 1].forEach(function (frac) {
      var y = padT + plotH - frac * plotH;
      svg.appendChild(svgEl('line', { class: 'chart-grid', x1: padL, x2: W - padR, y1: y, y2: y }));
      var t = svgEl('text', { class: 'chart-tick', x: padL - 8, y: y + 4, 'text-anchor': 'end' });
      t.textContent = String(Math.round(max * frac));
      svg.appendChild(t);
    });

    var bars = [];
    values.forEach(function (v, i) {
      var h = max === 0 ? 0 : (v / max) * plotH;
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + plotH - h;
      var rect = svgEl('rect', {
        class: 'chart-bar',
        x: x, y: y, width: barW, height: Math.max(h, v > 0 ? 2 : 0),
        rx: 5, ry: 5
      });
      if (!reducedMotion()) {
        rect.style.transform = 'scaleY(0)';
        rect.style.transformBox = 'fill-box';
        rect.style.transformOrigin = 'center bottom';
        rect.style.transitionDelay = (i * 55) + 'ms';
      }
      var title = svgEl('title');
      title.textContent = (labels[i] || 'Day ' + (i + 1)) + ': ' + v + ' events';
      rect.appendChild(title);
      svg.appendChild(rect);
      bars.push(rect);

      var t = svgEl('text', { class: 'chart-tick', x: padL + slot * i + slot / 2, y: H - 8, 'text-anchor': 'middle' });
      t.textContent = labels[i] || '';
      svg.appendChild(t);
    });

    container.appendChild(svg);
    var tip = ensureTip(container);
    var active = -1;

    function setActive(i, clientX, clientY) {
      if (i < 0 || i >= n) return;
      active = i;
      bars.forEach(function (b, bi) { b.classList.toggle('is-active', bi === i); });
      var rect = svg.getBoundingClientRect();
      var cx = clientX !== undefined ? clientX : rect.left + (padL + slot * i + slot / 2) * (rect.width / W);
      var cy = clientY !== undefined ? clientY : rect.top + rect.height * 0.3;
      showTip(tip, container, cx, cy, '<strong>' + values[i] + '</strong> events · ' + (labels[i] || ''));
    }

    function clearActive() {
      active = -1;
      bars.forEach(function (b) { b.classList.remove('is-active'); });
      hideTip(tip);
    }

    svg.addEventListener('pointermove', function (evt) {
      var rect = svg.getBoundingClientRect();
      var vx = ((evt.clientX - rect.left) / rect.width) * W;
      var i = Math.min(n - 1, Math.max(0, Math.floor((vx - padL) / slot)));
      setActive(i, evt.clientX, evt.clientY);
    });
    svg.addEventListener('pointerleave', clearActive);
    svg.addEventListener('focus', function () { setActive(n - 1); });
    svg.addEventListener('blur', clearActive);
    svg.addEventListener('keydown', function (evt) {
      if (evt.key === 'ArrowRight') { evt.preventDefault(); setActive(Math.min(n - 1, active + 1)); }
      else if (evt.key === 'ArrowLeft') { evt.preventDefault(); setActive(Math.max(0, (active < 0 ? n : active) - 1)); }
      else if (evt.key === 'Escape') { clearActive(); }
    });

    if (!reducedMotion()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bars.forEach(function (b) { b.style.transform = 'scaleY(1)'; });
        });
      });
    }
  }

  /* ================= heatmap ================= */

  var DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var BLOCK_LABELS = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];

  function heatmap(container, options) {
    clear(container);
    var rows = options.rows || [];
    var max = 1;
    rows.forEach(function (row) {
      row.forEach(function (v) { max = Math.max(max, v); });
    });

    var grid = document.createElement('div');
    grid.className = 'heat-grid';
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', options.ariaLabel || 'Activity heatmap');

    var corner = document.createElement('span');
    corner.className = 'heat-corner';
    grid.appendChild(corner);

    BLOCK_LABELS.forEach(function (lab) {
      var span = document.createElement('span');
      span.className = 'heat-colhead';
      span.textContent = lab;
      grid.appendChild(span);
    });

    var tip = ensureTip(container);

    rows.forEach(function (row, ri) {
      var rowLab = document.createElement('span');
      rowLab.className = 'heat-rowhead';
      rowLab.textContent = DAY_LABELS[ri] || String(ri + 1);
      grid.appendChild(rowLab);

      row.forEach(function (v, ci) {
        var cell = document.createElement('span');
        cell.className = 'heat-cell';
        var intensity = v / max;
        cell.style.setProperty('--heat', intensity.toFixed(3));
        if (intensity > 0.72) cell.classList.add('heat-cell--hot');
        var lab = (DAY_LABELS[ri] || '') + ' ' + BLOCK_LABELS[ci] + '–' + BLOCK_LABELS[ci].replace(/(\d+)/, function (m) {
          var next = (parseInt(m, 10) + 2) % 24;
          return next < 10 ? '0' + next : String(next);
        });
        cell.title = lab + ': ' + v + ' events';
        cell.addEventListener('pointerenter', function (evt) {
          showTip(tip, container, evt.clientX, evt.clientY, '<strong>' + v + '</strong> events · ' + lab);
        });
        cell.addEventListener('pointermove', function (evt) {
          showTip(tip, container, evt.clientX, evt.clientY, '<strong>' + v + '</strong> events · ' + lab);
        });
        cell.addEventListener('pointerleave', function () { hideTip(tip); });
        grid.appendChild(cell);
      });
    });

    container.appendChild(grid);

    var legend = document.createElement('div');
    legend.className = 'heat-legend';
    legend.innerHTML = '<span>Less</span>' +
      [0.1, 0.3, 0.5, 0.7, 0.9].map(function (i) {
        return '<span class="heat-cell heat-cell--sm" style="--heat:' + i + '"></span>';
      }).join('') +
      '<span>More</span>';
    container.appendChild(legend);
  }

  /* ================= sparkline ================= */

  function sparkline(container, options) {
    clear(container);
    var values = options.values || [];
    var n = values.length;
    if (!n) return;
    var W = 160, H = 44, pad = 4;
    var min = options.min !== undefined ? options.min : Math.min.apply(null, values);
    var max = options.max !== undefined ? options.max : Math.max.apply(null, values);
    if (max === min) max = min + 1;

    var svg = svgEl('svg', {
      class: 'chart-svg chart-svg--spark',
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': options.ariaLabel || 'Trend sparkline'
    });

    function xAt(i) { return pad + (n === 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2)); }
    function yAt(v) { return pad + (H - pad * 2) - ((v - min) / (max - min)) * (H - pad * 2); }

    var pts = values.map(function (v, i) { return xAt(i) + ',' + yAt(v); });
    svg.appendChild(svgEl('path', {
      class: 'spark-area',
      d: 'M' + xAt(0) + ',' + (H - pad) + ' L' + pts.join(' L') + ' L' + xAt(n - 1) + ',' + (H - pad) + ' Z'
    }));
    svg.appendChild(svgEl('polyline', { class: 'spark-line', points: pts.join(' ') }));
    svg.appendChild(svgEl('circle', {
      class: 'spark-dot', cx: xAt(n - 1), cy: yAt(values[n - 1]), r: 3.5
    }));

    container.appendChild(svg);
  }

  /* ================= progress ring ================= */

  function ring(container, options) {
    clear(container);
    var pct = Math.max(0, Math.min(100, options.percent || 0));
    var size = options.size || 108;
    var stroke = 10;
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;

    var svg = svgEl('svg', {
      class: 'chart-svg chart-svg--ring',
      width: size, height: size, viewBox: '0 0 ' + size + ' ' + size,
      role: 'img',
      'aria-label': options.ariaLabel || (Math.round(pct) + ' percent')
    });
    svg.appendChild(svgEl('circle', {
      class: 'ring-track', cx: size / 2, cy: size / 2, r: r, fill: 'none', 'stroke-width': stroke
    }));
    var prog = svgEl('circle', {
      class: 'ring-prog' + (options.tone ? ' ring-prog--' + options.tone : ''),
      cx: size / 2, cy: size / 2, r: r, fill: 'none', 'stroke-width': stroke,
      'stroke-dasharray': c.toFixed(2),
      'stroke-dashoffset': c.toFixed(2),
      transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'
    });
    svg.appendChild(prog);

    var label = document.createElement('span');
    label.className = 'ring-label';
    label.innerHTML = '<strong>' + options.centerTop + '</strong><span>' + (options.centerSub || '') + '</span>';

    var wrap = document.createElement('div');
    wrap.className = 'ring-wrap';
    wrap.appendChild(svg);
    wrap.appendChild(label);
    container.appendChild(wrap);

    var target = c * (1 - pct / 100);
    if (reducedMotion()) {
      prog.style.strokeDashoffset = target.toFixed(2);
    } else {
      requestAnimationFrame(function () {
        prog.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)';
        prog.style.strokeDashoffset = target.toFixed(2);
      });
    }
  }

  global.Charts = {
    line: line,
    bar: bar,
    heatmap: heatmap,
    sparkline: sparkline,
    ring: ring,
    DAY_LABELS: DAY_LABELS,
    BLOCK_LABELS: BLOCK_LABELS
  };
})(window);
