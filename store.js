/* store.js
   Frame storage: panel UI, cloning, thumbnails, and render helpers
   - Consulted ChatGPT5 for
    - Assistance in constructing the panel UI logic, organizing frame data structures,
         and debugging thumbnail generation and event handling.
   - Primarily consulted the following websites:
    - https://p5js.org/reference/ (for p5.js) 
*/

(function (root) {
  const Store = {};

  const MAX_SLOTS = 10;

  let BOX = { x: 0, y: 0, w: 0, h: 0 };
  let onLoadRequested = null;       
  let mountBelowPx = 24;

  // Internal state
  let storedDrawings = []; 
  let selectedFrameIdx = -1;

  // DOM nodes
  let storePanel, storeHeader, storeGrid;

  // Store
  Store.init = function init({ box, mountBelowPx: below = 24, onLoadRequested: cb } = {}) {
    BOX = box || BOX;
    mountBelowPx = typeof below === 'number' ? below : mountBelowPx;
    onLoadRequested = typeof cb === 'function' ? cb : null;
    _ensurePanel();
    _renderPanel();
  };

  Store.reposition = function reposition({ box } = {}) {
    if (box) BOX = box;
    if (!storePanel) return;
    storePanel.style.left = `${BOX.x}px`;
    storePanel.style.top  = `${BOX.y + BOX.h + mountBelowPx}px`;
    storePanel.style.width = `${BOX.w}px`;
  };

  Store.panelHeight = function panelHeight() {
    if (storePanel && storePanel.offsetHeight) return storePanel.offsetHeight;
    // Fallback estimate: header (32) + grid tile (84) + paddings/borders (~24)
    return 140;
  };

  Store.addFrameFrom = function addFrameFrom(strokes, captureFn) {
    if (!Array.isArray(strokes) || strokes.length === 0) {
      alert('Nothing to store — draw something first.');
      return;
    }
    if (storedDrawings.length >= MAX_SLOTS) {
      alert(`Storage full (max ${MAX_SLOTS}). Delete a tile to add more.`);
      return;
    }
    const drawing = _cloneVector(strokes);
    if (!drawing.length) {
      alert('Nothing to store — draw something first.');
      return;
    }
    const thumbUrl = _makeThumbDataUrl(captureFn);
    storedDrawings.push({ strokes: drawing, thumbDataUrl: thumbUrl });
    selectedFrameIdx = storedDrawings.length - 1;
    _renderPanel();
    return selectedFrameIdx;
  };

  Store.loadStored = function loadStored(idx) {
    const slot = storedDrawings[idx];
    if (!slot) return [];
    selectedFrameIdx = idx;
    _renderPanel();
    // Convert JSON -> p5 Stroke objects
    return slot.strokes.map(_toP5Stroke);
  };

  Store.getFrames = function getFrames() {
    return storedDrawings;
  };

  Store.count = function count() {
    return storedDrawings.length;
  };

  // For Anim.render
  Store.drawDrawing = function drawDrawing(drawing) {
    for (const s of drawing) {
      if (s.eraser) continue;
      stroke(color(s.colHSB.h, s.colHSB.s, s.colHSB.b, s.opacity ?? s.colHSB.a ?? 100));
      noFill();
      strokeWeight(s.thickness || 4);
      strokeCap(ROUND);
      strokeJoin(ROUND);
      beginShape();
      for (const pt of s.points) vertex(pt.x, pt.y);
      endShape();
    }
  };

  // Cloning / converts / thumbs 
  function _cloneVector(strokes) {
    return strokes
      .map(s => ({
        colHSB: _getStrokeHSB(s.col),
        thickness: s.thickness,
        opacity: s.opacity,
        eraser: !!s.eraser,
        points: s.points.map(p => ({ x: p.x, y: p.y }))
      }))
      .filter(s => s.points.length >= 2);
  }

  function _getStrokeHSB(c) {
    if (!c) return { h: 0, s: 0, b: 0, a: 100 };
    push(); colorMode(HSB, 360, 100, 100, 100);
    const out = { h: hue(c), s: saturation(c), b: brightness(c), a: alpha(c) };
    pop(); return out;
  }

  function _toP5Stroke(s) {
    const col = color(s.colHSB.h, s.colHSB.s, s.colHSB.b, s.opacity ?? s.colHSB.a ?? 100);
    const st = new Stroke(col, s.thickness, s.opacity ?? 100, !!s.eraser);
    for (const p of s.points) st.add(p.x, p.y);
    return st;
  }

  function _makeThumbDataUrl(captureFn) {
    // return a p5.Image of the BOX
    const snap = typeof captureFn === 'function'
      ? captureFn()
      : get(BOX.x, BOX.y, BOX.w, BOX.h);

    const TW = 110;
    const TH = Math.round((BOX.h / BOX.w) * TW);
    const g = createGraphics(TW, TH);
    g.image(snap, 0, 0, TW, TH);
    const url = g.canvas.toDataURL('image/png');
    g.remove();
    return url;
  }

  // Panel
  function _ensurePanel() {
    // Remove existing if re-init
    if (storePanel && storePanel.remove) storePanel.remove();

    storePanel = document.createElement('div');
    storePanel.style.position = 'absolute';
    storePanel.style.left = `${BOX.x}px`;
    storePanel.style.top  = `${BOX.y + BOX.h + mountBelowPx}px`;
    storePanel.style.width = `${BOX.w}px`;
    storePanel.style.background = '#fff';
    storePanel.style.border = '1px solid #ddd';
    storePanel.style.borderRadius = '10px';
    storePanel.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
    storePanel.style.fontFamily = 'cursive';
    storePanel.style.userSelect = 'none';
    storePanel.style.zIndex = '10';

    storeHeader = document.createElement('div');
    storeHeader.style.padding = '8px 12px';
    storeHeader.style.background = '#f8f8fb';
    storeHeader.style.borderBottom = '1px solid #eee';
    storeHeader.style.display = 'flex';
    storeHeader.style.alignItems = 'center';
    storeHeader.style.gap = '8px';
    storeHeader.style.cursor = 'default';

    const hTitle = document.createElement('div');
    hTitle.innerHTML = `<b>Stored</b> <span id="storeCount">(0/${MAX_SLOTS})</span>`;
    hTitle.style.fontSize = '13px';
    hTitle.style.color = '#111';

    const hint = document.createElement('div');
    hint.textContent = 'click a tile to load • X to delete';
    hint.style.fontSize = '11px';
    hint.style.color = '#666';
    hint.style.marginLeft = 'auto';

    storeHeader.appendChild(hTitle);
    storeHeader.appendChild(hint);

    storeGrid = document.createElement('div');
    storeGrid.style.padding = '12px';
    storeGrid.style.display = 'grid';
    storeGrid.style.gridTemplateColumns = 'repeat(10, 1fr)';
    storeGrid.style.gap = '12px';
    storeGrid.style.alignItems = 'stretch';

    storePanel.appendChild(storeHeader);
    storePanel.appendChild(storeGrid);
    document.body.appendChild(storePanel);
  }

  function _renderPanel() {
    if (!storeHeader || !storeGrid) return;

    const countEl = storeHeader.querySelector('#storeCount');
    if (countEl) countEl.textContent = `(${storedDrawings.length}/${MAX_SLOTS})`;

    storeGrid.innerHTML = '';

    for (let i = 0; i < storedDrawings.length; i++) {
      const slot = storedDrawings[i];

      const tile = document.createElement('div');
      tile.style.position = 'relative';
      tile.style.border = (i === selectedFrameIdx) ? '2px solid #6366F1' : '1px solid #eee';
      tile.style.borderRadius = '8px';
      tile.style.overflow = 'hidden';
      tile.style.background = '#fff';
      tile.style.cursor = 'pointer';

      const img = document.createElement('img');
      img.src = slot.thumbDataUrl;
      img.alt = `Frame ${i + 1}`;
      img.style.width = '100%';
      img.style.height = '84px';
      img.style.objectFit = 'cover';
      img.style.display = 'block';

      // Red "X"
      const del = document.createElement('button');
      del.textContent = 'X';
      del.title = 'Delete';
      del.style.position = 'absolute';
      del.style.top = '4px';
      del.style.right = '6px';
      del.style.padding = '0';
      del.style.border = 'none';
      del.style.background = 'transparent';
      del.style.color = '#EF4444';
      del.style.fontWeight = 'bold';
      del.style.fontSize = '14px';
      del.style.cursor = 'pointer';
      del.style.lineHeight = '1';

      del.addEventListener('click', (e) => {
        e.stopPropagation();
        storedDrawings.splice(i, 1);
        if (selectedFrameIdx === i) selectedFrameIdx = -1;
        if (selectedFrameIdx > i) selectedFrameIdx--;
        _renderPanel();
      });

      tile.addEventListener('click', () => {
        selectedFrameIdx = i;
        _renderPanel();
        if (onLoadRequested) onLoadRequested(i);
      });

      const tag = document.createElement('div');
      tag.textContent = `#${i + 1}`;
      tag.style.position = 'absolute';
      tag.style.left = '6px';
      tag.style.bottom = '4px';
      tag.style.fontSize = '11px';
      tag.style.color = '#374151';
      tag.style.background = 'rgba(255,255,255,0.85)';
      tag.style.padding = '1px 4px';
      tag.style.borderRadius = '4px';

      tile.appendChild(img);
      tile.appendChild(del);
      tile.appendChild(tag);
      storeGrid.appendChild(tile);
    }

    for (let j = storedDrawings.length; j < MAX_SLOTS; j++) {
      const ph = document.createElement('div');
      ph.style.border = '1px dashed #e5e7eb';
      ph.style.borderRadius = '8px';
      ph.style.height = '84px';
      ph.style.display = 'flex';
      ph.style.alignItems = 'center';
      ph.style.justifyContent = 'center';
      ph.style.color = '#9ca3af';
      ph.style.fontSize = '12px';
      ph.textContent = 'empty';
      storeGrid.appendChild(ph);
    }
  }

  root.Store = Store;
})(window);
