/* app.js (base)
   - UI, tools, drawing
   - Uses Anim from animation.js 
   - Uses Stroke from stroke.js 
   - Uses Erase from erase.js 
   - Uses Store from store.js 
   - Uses Vertex from vertex.js 
   - Uses ai.js for AI swatches
   - Uses ai_art.js for AI art generation
   - Uses Symmetry from symmetry.js
   - Consulted ChatGPT5 for 
      - Help with the math-heavy portions (e.g. Hit Tests & Sliders and Rendering)
      - Help with integrating the AI portions into the base application
      - Help with debugging errors that came up while integrating button functionalities
      - Help with JavaScript/HTML syntax for interaction and clipping 
   - Primarily consulted the following:
      - https://p5js.org/reference/ (For p5.js)
      - Past projects and portfolios I've made for help with the UI and p5.js syntax
      - Various websites on Google for small issues
   - This file is the main p5.js sketch that builds the drawing UI 
        (tools, sliders, color wheel, symmetry, vertex/move/erase modes), 
        manages strokes and hit-testing, and builds storing/animating frames 
        and AI integrations for palettes and art.
   - Additionally, while Copilot was consulted for UI, throughout this project and helper files, UI design is also my own creation. 
     - While I attempted to prototype different UIs with Copilot, most were really unappealling.
     - Copilot did help a little with autocompletes to make the UI design faster.
*/

let strokes = [];
let currentStroke = null;

// live symmetric clones for current drag
let liveSymmetryStrokes = [];

// Layout (responsive width/height; keep left gutter for tools)
let BOX = { x: 450, y: 70, w: 1100, h: 550 };

// Wheel + Brightness bar (scaled via uiScale)
let WHEEL = { cx: 190, cy: 150, r: 120 };
let BBAR  = { x: 330, y: 35, w: 18,  h: 224, r: 6 };

// Buttons (base sizes; styled with uiScale)
let BTN_W = 70;   
let BTN_H = 32;  

// Current color (HSB + Alpha)
let H = 16, S = 46, B = 100, A = 100;

// Controls
let thickSlider, opacSlider, eraserSlider, saveBtn, clearBtn;
let drawBtn, eraseBtn, eraseStrokeBtn, changeColorBtn, vertexBtn, moveBtn;
let storeBtn, animateBtn, exportBtn, easeSelect, durationSlider, durationLabel;
let isExporting = false;
let _exportState = { rec: null, id: null, off: null, chunks: [] };
let symDropdown = null;

// Offscreen color wheel
let gWheel;

// Tool mode
let toolMode = 'draw';

// Vertex mode state
let selectedStrokeIdx = -1;
let selectedVertexIdx = -1;
let draggingVertex = false;

// MOVE mode state
let movingStrokeIdx = -1;
let prevMouse = null;

// Vector eraser state
let erasing = false;
let eraserPrev = null; 

// AI palette state
let paletteColors = [];
let PALETTE = { x: BOX.x, y: BOX.y - 50, sw: 36, gap: 10, rows: 1 };

// Global UI scale
let uiScale = 1;
let cnv;

function setup() {
  cnv = createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  pixelDensity(1);
  textFont('cursive');

  // Fit BOX to current window so right side never overflows
  updateBoxForWindow();
  // Compute UI scale and apply scaled metrics
  updateUIScale();
  applyUIScale();

  // Sliders
  createSpan('<b>Thickness:</b>')
    .position(40, 355)
    .style('font-size','14px').style('font-family','cursive').style('color','#111');
  thickSlider = createSlider(1, 40, 4, 1);
  thickSlider.position(40, 375).style('width','260px');

  createSpan('<b>Opacity:</b>')
    .position(40, 395)
    .style('font-size','14px').style('font-family','cursive').style('color','#111');
  opacSlider = createSlider(0, 100, 100, 1);
  opacSlider.position(40, 415).style('width','260px');
  opacSlider.input(() => { A = opacSlider.value(); });

  // Eraser Size
  createSpan('<b>Eraser Size:</b>')
    .position(40, 435)
    .style('font-size','14px').style('font-family','cursive').style('color','#111');
  eraserSlider = createSlider(4, 80, 20, 1);
  eraserSlider.position(40, 455).style('width','260px');

  // Buttons
  saveBtn = createButton('Save PNG');
  saveBtn.position(280, 530);
  saveBtn.mousePressed(saveCropped);
  styleButton(saveBtn, '#2563EB');

  clearBtn = createButton('Clear');
  clearBtn.position(190, 530);
  clearBtn.mousePressed(() => {
    strokes = [];
    selectedStrokeIdx = -1; selectedVertexIdx = -1;
    movingStrokeIdx = -1; prevMouse = null;
  });
  styleButton(clearBtn, '#10B981');

  drawBtn = createButton('Draw');
  drawBtn.position(30, 485);
  drawBtn.mousePressed(() => setMode('draw'));
  styleButton(drawBtn, '#374151');

  eraseBtn = createButton('Erase');
  eraseBtn.position(30, 530);
  eraseBtn.mousePressed(() => setMode('erase'));
  styleButton(eraseBtn, '#F59E0B');

  eraseStrokeBtn = createButton('Delete');
  eraseStrokeBtn.position(110, 530);
  eraseStrokeBtn.mousePressed(() => setMode('eraseStroke'));
  styleButton(eraseStrokeBtn, '#EF4444');

  changeColorBtn = createButton('Change');
  changeColorBtn.position(110, 485);
  changeColorBtn.mousePressed(() => setMode('recolor'));
  styleButton(changeColorBtn, '#8B5CF6');

  // Custom tooltip for recolor
  let ctooltip = createDiv(`• Set thickness, opacity, and color<br> 
    • Click stroke to change`);
  ctooltip.style('position', 'absolute');
  ctooltip.style('background', 'rgba(0,0,0,0.85)');
  ctooltip.style('color', '#fff');
  ctooltip.style('padding', '6px 8px');
  ctooltip.style('border-radius', '6px');
  ctooltip.style('font-size', '12px');
  ctooltip.style('line-height', '1.3em');
  ctooltip.style('max-width', '210px');
  ctooltip.style('pointer-events', 'none');
  ctooltip.style('display', 'none');
  ctooltip.style('z-index', '10');

  changeColorBtn.mouseOver(() => {
    ctooltip.position(changeColorBtn.x + 70, changeColorBtn.y - 5);
    ctooltip.style('display', 'block');
  });
  changeColorBtn.mouseOut(() => {
    ctooltip.style('display', 'none');
  });

  vertexBtn = createButton('Vertex');
  vertexBtn.position(200, 485);
  vertexBtn.mousePressed(() => setMode('vertex'));
  styleButton(vertexBtn, '#0EA5E9');

  // Vertex tooltip
  let tooltip = createDiv(`• Click stroke to view vertices.<br>
  • Click and drag vertex to move.<br>
  • Shift+click to add.<br>
  • Backspace or delete to remove.`);
  tooltip.style('position', 'absolute');
  tooltip.style('background', 'rgba(0,0,0,0.85)');
  tooltip.style('color', '#fff');
  tooltip.style('padding', '6px 8px');
  tooltip.style('border-radius', '6px');
  tooltip.style('font-size', '12px');
  tooltip.style('line-height', '1.3em');
  tooltip.style('max-width', '210px');
  tooltip.style('pointer-events', 'none');
  tooltip.style('display', 'none');
  tooltip.style('z-index', '10');

  vertexBtn.mouseOver(() => {
    tooltip.position(vertexBtn.x + 70, vertexBtn.y - 5);
    tooltip.style('display', 'block');
  });
  vertexBtn.mouseOut(() => {
    tooltip.style('display', 'none');
  });

  moveBtn = createButton('Move');
  moveBtn.position(280, 485);
  moveBtn.mousePressed(() => setMode('move'));
  styleButton(moveBtn, '#22C55E');

  // Store and Animate
  storeBtn = createButton('Store');
  storeBtn.position(30, 575);
  styleButton(storeBtn, '#9333EA');

  animateBtn = createButton('Animate');
  animateBtn.position(110, 575);
  styleButton(animateBtn, '#0D9488');

  // Export Animation button
  exportBtn = createButton('Export Animation');
  // Place above the drawing box (not overlapping it)
  exportBtn.position(BOX.x + 10, Math.max(10, BOX.y - 50));
  styleDropdownLike(exportBtn);

  // Ease + Duration
  createSpan('<b>Ease:</b>')
    .position(200, 580)
    .style('font-size','14px').style('font-family','cursive').style('color','#111');
  easeSelect = createSelect();
  easeSelect.position(240, 575);
  easeSelect.style('font-family','cursive').style('font-size','12px').style('padding','6px').style('border-radius','8px');
  ['EaseInOutCubic','Linear','EaseInOutQuad'].forEach(opt => easeSelect.option(opt));
  easeSelect.selected('EaseInOutCubic');

  durationLabel = createSpan('<b>Animation Duration:</b> 10s')
    .position(40, 615)
    .style('font-size','14px').style('font-family','cursive').style('color','#111');

  durationSlider = createSlider(2, 30, 10, 1);
  durationSlider.position(210, 621).style('width','150px');
  durationSlider.input(() => {
    const v = durationSlider.value();
    durationLabel.html(`<b>Animation Duration:</b> ${v}s`);
  });

  // --- Symmetry dropdown (right side of title) ---
  // Anchor near the top-right of the box header area (after BOX sizing)
  const symX = BOX.x + BOX.w - 300;
  const symY = BOX.y - 46;
  // default mode lives in symmetry.js (Symmetry.mode)
  symDropdown = window.Symmetry?.createDropdown(symX, symY);
  // Size + position Export next to symmetry dropdown
  syncExportSizeToSymmetry();
  rightAlignSymmetryDropdown();
  positionExportNextToSymmetry('left');

  // AI panels
  if (window.AIArt?.init) window.AIArt.init({ x: 40, y: 640 });
  if (window.AIPalette?.init) window.AIPalette.init({ x: 40, y: 730 });

  window.addEventListener('ai-palette', (e) => {
    paletteColors = Array.isArray(e.detail?.colors) ? e.detail.colors : [];
  });
  window.addEventListener('ai-art', (e) => {
    try { addArtStrokes(e.detail); } catch (err) { console.error(err); }
  });

  // Configure helpers
  if (window.Erase?.configure) {
    Erase.configure({ clampToBoxX, clampToBoxY });
  }
  if (window.Vertex?.configure) {
    Vertex.configure({ clampToBoxX, clampToBoxY });
  }

  // Wire storage panel 
  Store.init({
    box: BOX,
    mountBelowPx: 45,
    onLoadRequested: (idx) => {
      const loaded = Store.loadStored(idx);
      strokes = loaded;
      currentStroke = null;
      liveSymmetryStrokes = [];
      selectedStrokeIdx = -1;
      selectedVertexIdx = -1;
    }
  });

  // After panel mounts, tighten BOX.h to avoid vertical scroll
  updateBoxForWindow();
  Store.reposition({ box: BOX });

  // Storage/Animation button handlers 
  storeBtn.mousePressed(() => {
    if (Anim.running) return;
    Store.addFrameFrom(strokes, () => get(BOX.x, BOX.y, BOX.w, BOX.h));
  });

  animateBtn.mousePressed(() => {
    if (Store.count() < 2) { alert('Need at least 2 stored drawings to animate.'); return; }
    strokes = []; currentStroke = null; liveSymmetryStrokes = [];
    selectedStrokeIdx = -1; selectedVertexIdx = -1;
    const ms = Number(durationSlider?.value() || 10) * 1000;
    Anim.start(ms);
  });

  // Export button: run animation and auto-save frames
  exportBtn.mousePressed(() => {
    if (isExporting) return;
    if (Store.count() < 2) { alert('Need at least 2 stored drawings to export.'); return; }
    // Prepare clean canvas state and start animation
    strokes = []; currentStroke = null; liveSymmetryStrokes = [];
    selectedStrokeIdx = -1; selectedVertexIdx = -1;
    const seconds = Number(durationSlider?.value() || 10);
    const ms = seconds * 1000;
    isExporting = true;
    Anim.start(ms);
    // Export a cropped WebM of just the BOX region while UI stays visible
    exportAnimationVideoCropped(seconds, 30);
  });

  setMode('draw');
}

// Clip any drawing to box
function withClipToBox(fn) {
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(BOX.x, BOX.y, BOX.w, BOX.h);
  ctx.clip();
  fn();
  ctx.restore();
}

function draw() {
  background('#ffffff');
  // Always render UI and box; export is cropped so UI can remain visible
  drawUIPanel();
  drawBox(); // draws background + border + labels

  if (Anim.running) {
    const easeName = easeSelect?.value() || 'EaseInOutCubic';
    withClipToBox(() => {
      // Render animation frames clipped to box
      Anim.drawFrame(Store.getFrames(), easeName, Store.drawDrawing);
    });
  } else {
    withClipToBox(() => {
      for (const s of strokes) s.draw(this);
      if (currentStroke) currentStroke.draw(this);

      // live symmetry preview
      for (const s of liveSymmetryStrokes) s.draw(this);

      if (toolMode === 'vertex' && selectedStrokeIdx >= 0 && strokes[selectedStrokeIdx]) {
        Vertex.drawHandles(strokes[selectedStrokeIdx], selectedVertexIdx);
      }
      if (toolMode === 'move' && movingStrokeIdx >= 0 && strokes[movingStrokeIdx]) {
        drawStrokeBounds(strokes[movingStrokeIdx]);
      }
    });
  }

  // Re-draw a crisp border on top so clipped content sits neatly inside
  noFill();
  stroke('#111');
  strokeWeight(1);
  rect(BOX.x, BOX.y, BOX.w, BOX.h);

  // show eraser cursor inside the box
  if (toolMode === 'erase' && inBox(mouseX, mouseY)) {
    noFill(); stroke(0, 0, 20, 60); strokeWeight(1);
    circle(mouseX, mouseY, Erase.radius(eraserSlider) * 2);
  }
}

// Interaction
function mousePressed() {
  if (inWheel(mouseX, mouseY)) { pickFromWheel(mouseX, mouseY); return; }
  if (inBBar(mouseX, mouseY)) { pickBrightness(mouseY); return; }
  const hex = swatchAt(mouseX, mouseY);
  if (hex) { setFromHex(hex); return; }

  if (!inBox(mouseX, mouseY)) return;
  if (Anim.running) return;

  // Move
  if (toolMode === 'move') {
    const idx = findStrokeAt(mouseX, mouseY);
    movingStrokeIdx = idx;
    prevMouse = (idx !== -1) ? { x: mouseX, y: mouseY } : null;
    return;
  }

  // Vertex
  if (toolMode === 'vertex') {
    const idx = findStrokeAt(mouseX, mouseY);
    if (idx !== -1) {
      selectedStrokeIdx = idx;
      const s = strokes[idx];

      if (keyIsDown(SHIFT)) {
        const tol = (Vertex.hitTolerance(s) + 6);
        const hit = Vertex.closestSegmentProjection(s.points, mouseX, mouseY);
        if (hit && hit.dist <= tol) {
          const insertAt = hit.i + 1;
          s.points.splice(insertAt, 0, { x: clampToBoxX(hit.cx), y: clampToBoxY(hit.cy) });
          selectedVertexIdx = insertAt;
          draggingVertex = true;
          return;
        }
      }

      selectedVertexIdx = Vertex.closestVertexIndex(s.points, mouseX, mouseY, Vertex.hitTolerance(s));
      draggingVertex = (selectedVertexIdx !== -1);
    } else {
      selectedStrokeIdx = -1;
      selectedVertexIdx = -1;
      draggingVertex = false;
    }
    return;
  }

  // Recolor
  if (toolMode === 'recolor') {
    const idx = findStrokeAt(mouseX, mouseY);
    if (idx !== -1) {
      A = opacSlider.value();
      const s = strokes[idx];
      s.col = color(H, S, B, A);
      s.thickness = thickSlider.value();
      s.opacity = A;
      s.eraser = false;
    }
    return;
  }

  // Erase whole stroke
  if (toolMode === 'eraseStroke') {
    const idx = findStrokeAt(mouseX, mouseY);
    if (idx !== -1) strokes.splice(idx, 1);
    return;
  }

  // Erase mode
  if (toolMode === 'erase') {
    erasing = true;
    eraserPrev = { x: mouseX, y: mouseY };
    strokes = Erase.applyPoint(strokes, eraserPrev, Erase.radius(eraserSlider));
    return;
  }

  // Draw (with symmetry)
  A = opacSlider.value();
  currentStroke = new Stroke(color(H, S, B, A), thickSlider.value(), A, false);

  // Build symmetric clones based on current Symmetry.mode
  liveSymmetryStrokes = Symmetry.buildClones({
    h: H, s: S, b: B, a: A, thickness: thickSlider.value()
  }, BOX);

  // seed first points into all clones via transforms
  const transforms = Symmetry.getTransforms(BOX);
  for (let i = 0; i < transforms.length; i++) {
    const { x, y } = transforms[i](mouseX, mouseY);
    liveSymmetryStrokes[i].add(x, y);
  }
}

function mouseDragged() {
  if (inWheel(mouseX, mouseY)) { pickFromWheel(mouseX, mouseY); return; }
  if (inBBar(mouseX, mouseY)) { pickBrightness(mouseY); return; }
  if (Anim.running) return;

  // Move
  if (toolMode === 'move' && movingStrokeIdx >= 0) {
    const s = strokes[movingStrokeIdx];
    if (!s || !s.points.length) return;
    const dx = mouseX - prevMouse.x;
    const dy = mouseY - prevMouse.y;
    translateStrokeClamped(s, dx, dy, BOX);
    prevMouse = { x: mouseX, y: mouseY };
    return;
  }

  // Vertex
  if (toolMode === 'vertex' && draggingVertex && selectedStrokeIdx >= 0) {
    const s = strokes[selectedStrokeIdx];
    if (!s) return;
    if (selectedVertexIdx >= 0 && selectedVertexIdx < s.points.length) {
      s.points[selectedVertexIdx].x = clampToBoxX(mouseX);
      s.points[selectedVertexIdx].y = clampToBoxY(mouseY);
    }
    return;
  }

  // Erase
  if (toolMode === 'erase' && erasing) {
    strokes = Erase.applySegment(strokes, eraserPrev, { x: mouseX, y: mouseY }, Erase.radius(eraserSlider));
    eraserPrev = { x: mouseX, y: mouseY };
    return;
  }

  // Freehand (with symmetry)
  if (currentStroke && inBox(mouseX, mouseY)) {
    const transforms = Symmetry.getTransforms(BOX);
    for (let i = 0; i < transforms.length; i++) {
      const { x, y } = transforms[i](mouseX, mouseY);
      liveSymmetryStrokes[i].add(x, y);
    }
  }
}

function mouseReleased() {
  if (Anim.running) return;

  if (toolMode === 'move') {
    movingStrokeIdx = -1;
    prevMouse = null;
    return;
  }
  if (toolMode === 'vertex') {
    draggingVertex = false;
    return;
  }
  if (toolMode === 'erase') {
    erasing = false;
    eraserPrev = null;
    return;
  }

  // commit symmetry strokes
  if (liveSymmetryStrokes.length) {
    for (const s of liveSymmetryStrokes) {
      if (s.points.length >= 2) strokes.push(s);
    }
  }
  currentStroke = null;
  liveSymmetryStrokes = [];
}

// Delete/Backspace to remove selected vertex (Vertex mode)
function keyPressed() {
  if (toolMode === 'vertex' && selectedStrokeIdx >= 0) {
    if (keyCode === DELETE || keyCode === BACKSPACE) {
      const s = strokes[selectedStrokeIdx];
      if (!s) return;
      if (selectedVertexIdx >= 0 && s.points.length > 2) {
        s.points.splice(selectedVertexIdx, 1);
        selectedVertexIdx = Math.min(selectedVertexIdx, s.points.length - 1);
      }
      return false;
    }
  }
}

// Hit tests and pickers
function inBox(x, y) { return x >= BOX.x && x <= BOX.x + BOX.w && y >= BOX.y && y <= BOX.y + BOX.h; }
function inWheel(x, y) { const dx = x - WHEEL.cx, dy = y - WHEEL.cy; return (dx*dx + dy*dy) <= (WHEEL.r * WHEEL.r); }
function inBBar(x, y) { return x >= BBAR.x && x <= BBAR.x + BBAR.w && y >= BBAR.y && y <= BBAR.y + BBAR.h; }
function pickFromWheel(mx, my) {
  const dx = mx - WHEEL.cx, dy = my - WHEEL.cy;
  let ang = degrees(Math.atan2(dy, dx)); if (ang < 0) ang += 360;
  const r = Math.min(WHEEL.r, Math.hypot(dx, dy));
  H = ang; S = Math.round(map(r, 0, WHEEL.r, 0, 100, true));
}
function pickBrightness(my) { B = Math.round(map(constrain(my, BBAR.y, BBAR.y + BBAR.h), BBAR.y + BBAR.h, BBAR.y, 0, 100)); }

// Rendering
function drawUIPanel() {
  noStroke(); fill('#ffffff'); rect(0, 0, BOX.x - 40, height);
  stroke('#111'); strokeWeight(1); line(BOX.x - 25, 0, BOX.x - 25, height);

  noStroke(); fill('#111'); textSize(16 * uiScale); textStyle(BOLD); text('Tools', 40, 34);

  imageMode(CENTER); image(gWheel, WHEEL.cx, WHEEL.cy);

  // pointer
  const r = map(S, 0, 100, 0, WHEEL.r); const a = radians(H);
  const px = WHEEL.cx + r * cos(a); const py = WHEEL.cy + r * sin(a);
  push(); translate(px, py); noStroke(); fill(H, S, max(40, B), A); circle(0, 0, 14 * uiScale); stroke('#111'); noFill(); circle(0, 0, 14 * uiScale); pop();

  // brightness bar
  noFill(); strokeWeight(1);
  for (let i = 0; i < BBAR.h; i++) { const t = 1 - i / (BBAR.h - 1); const bri = t * 100; stroke(H, S, bri); line(BBAR.x, BBAR.y + i, BBAR.x + BBAR.w, BBAR.y + i); }
  noFill(); stroke('#111'); rect(BBAR.x, BBAR.y, BBAR.w, BBAR.h, BBAR.r);
  const yPos = map(B, 0, 100, BBAR.y + BBAR.h, BBAR.y);
  fill('#ffffff'); stroke('#111'); rect(BBAR.x - 7, yPos - 8, BBAR.w + 14, 16, 8);

  // swatch + readouts
  const swY = WHEEL.cy + WHEEL.r + 12;
  noStroke(); fill(H, S, B, A); rect(40, swY, 260, 28, 8);
  stroke('#111'); noFill(); rect(40, swY, 260, 28, 8);

  const c = color(H, S, B, A);
  const R = Math.round(red(c)), G = Math.round(green(c)), Bl = Math.round(blue(c));
  const alpha255 = Math.round(map(A, 0, 100, 0, 255));
  noStroke(); fill('#111'); textSize(12 * uiScale); textStyle(NORMAL);
  const y1 = swY + 46, y2 = y1 + 20;
  text(`Hue: ${Math.round(H)}°`, 40, y1); text(`Sat: ${Math.round(S)}%`, 100, y1); text(`Bri: ${Math.round(B)}%`, 165, y1);
  text(`Red: ${R}`, 40, y2); text(`Green: ${G}`, 100, y2); text(`Blue: ${Bl}`, 165, y2); text(`Alpha: ${alpha255}`, 220, y2);

  drawPaletteStrip();
}

function drawBox() {
  noStroke(); fill('#ffffff'); rect(BOX.x, BOX.y, BOX.w, BOX.h);
  stroke('#111'); strokeWeight(1); noFill(); rect(BOX.x, BOX.y, BOX.w, BOX.h);
  noStroke(); fill('#111'); textSize(42 * uiScale); textStyle(BOLD); textFont('cursive'); text('Pattern Illustrator', BOX.x * 1.8, BOX.y - 20);
  textStyle(ITALIC); textFont('cursive'); textSize(16 * uiScale); fill('#444'); text('By: Siddharth Chattoraj', BOX.x + BOX.w - 185, BOX.y + BOX.h + 22.5);
}

// AI Palette
function drawPaletteStrip() {
  if (!paletteColors.length) return;
  noStroke(); fill('#111'); textSize(12);
  for (let i = 0; i < paletteColors.length; i++) {
    const x = PALETTE.x + i * (PALETTE.sw + PALETTE.gap);
    const y = PALETTE.y;
    noStroke(); fill(0, 0, 100); rect(x - 1, y - 1, PALETTE.sw + 2, PALETTE.sw + 2, 8);
    fill(paletteColors[i]); rect(x, y, PALETTE.sw, PALETTE.sw, 6);
  }
}
function swatchAt(mx, my) {
  if (!paletteColors.length) return null;
  for (let i = 0; i < paletteColors.length; i++) {
    const x = PALETTE.x + i * (PALETTE.sw + i * 0 + PALETTE.gap);
    const y = PALETTE.y;
    if (mx >= x && mx <= x + PALETTE.sw && my >= y && my <= y + PALETTE.sw) return paletteColors[i];
  } return null;
}
function setFromHex(hex) { const { h, s, b } = hexToHSB(hex); H = h; S = s; B = b; }
function hexToHSB(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { h: H, s: S, b: B };
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255, g = (int >> 8) & 255, b8 = int & 255;
  push(); colorMode(RGB, 255); const c = color(r, g, b8);
  colorMode(HSB, 360, 100, 100);
  const out = { h: Math.round(hue(c)), s: Math.round(saturation(c)), b: Math.round(brightness(c)) };
  pop(); return out;
}

// Save PNG of drawing box
function saveCropped() { const img = get(BOX.x, BOX.y, BOX.w, BOX.h); img.save('drawing_cropped', 'png'); }
// (handled below with responsive sizing)

// Keep BOX inside the viewport with a small right/bottom margin
function updateBoxForWindow() {
  // Keep existing left gutter for the tool panel
  const RIGHT_MARGIN = 30;
  const MOUNT_BELOW = 45; // matches Store.init mountBelowPx
  const FOOTER_SAFETY = 24; // for footer text inside the box area
  const panelH = (window.Store && typeof Store.panelHeight === 'function') ? Store.panelHeight() : 140;
  const BOTTOM_RESERVED = MOUNT_BELOW + panelH + FOOTER_SAFETY;

  // Minimum sizes so the box remains usable on smaller screens
  const MIN_W = 600;
  const MIN_H = 400;

  // Recompute width/height to avoid overflowing right/bottom edges
  BOX.w = Math.max(MIN_W, Math.floor(windowWidth - BOX.x - RIGHT_MARGIN));
  BOX.h = Math.max(MIN_H, Math.floor(windowHeight - BOX.y - BOTTOM_RESERVED));
}

// Also recalc layout when the window changes size
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateBoxForWindow();
  updateUIScale();
  applyUIScale();
  // Reposition symmetry controls relative to BOX
  const symX = BOX.x + BOX.w - 300;
  const symY = BOX.y - 46;
  window.Symmetry?.reposition(symX, symY, BOX);
  // Keep AI panels at fixed positions; do not scale with viewport
  window.AIArt?.reposition?.(40, 640);
  window.AIPalette?.reposition?.(40, 730);
  // Reposition storage panel under BOX
  Store.reposition({ box: BOX });
  // Keep Export button above the drawing box and align to symmetry row
  // Keep Export next to the symmetry dropdown
  syncExportSizeToSymmetry();
  rightAlignSymmetryDropdown();
  positionExportNextToSymmetry('left');
}

// Compute scale based on viewport, clamped to a sensible range
function updateUIScale() {
  const baseW = 1600;
  const baseH = 900;
  const s = Math.min(windowWidth / baseW, windowHeight / baseH);
  uiScale = Math.max(0.8, Math.min(1.25, s));
}

// Apply scaled metrics to UI bits and rebuild dependent graphics
function applyUIScale() {
  // Scale wheel radius and brightness bar height
  WHEEL.r = Math.round(120 * uiScale);
  BBAR.h = Math.round(224 * uiScale);
  // Rebuild wheel graphic at new size
  buildColorWheelGraphic();

  // Re-apply button sizing
  const allBtns = [saveBtn, clearBtn, drawBtn, eraseBtn, eraseStrokeBtn, changeColorBtn, vertexBtn, moveBtn, storeBtn, animateBtn];
  const colors = ['#2563EB','#10B981','#374151','#F59E0B','#EF4444','#8B5CF6','#0EA5E9','#22C55E','#9333EA','#0D9488'];
  for (let i = 0; i < allBtns.length; i++) {
    const b = allBtns[i]; if (b) styleButton(b, colors[i] || '#374151');
  }

  // Keep Export button pinned visually above the box at same Y as symmetry dropdown
  // Keep its dropdown-like style and size in sync with scale
  exportBtn && styleDropdownLike(exportBtn);
  syncExportSizeToSymmetry();
  rightAlignSymmetryDropdown();
  positionExportNextToSymmetry('left');

  // Scale sliders' visual width
  const sliderWidth = Math.round(260 * uiScale) + 'px';
  thickSlider && thickSlider.style('width', sliderWidth);
  opacSlider && opacSlider.style('width', sliderWidth);
  eraserSlider && eraserSlider.style('width', sliderWidth);
  durationSlider && durationSlider.style('width', Math.round(150 * uiScale) + 'px');

  // Scale palette swatch size
  PALETTE.sw = Math.round(36 * uiScale);
}

// Export a WebM video of just the BOX region (cropped) using an offscreen canvas
function exportAnimationVideoCropped(seconds = 10, fps = 30) {
  const mainCanvas = cnv?.elt || document.querySelector('canvas');
  if (!mainCanvas) { console.error('Canvas not found'); isExporting = false; return; }
  if (typeof window.MediaRecorder === 'undefined') {
    alert('Video export requires MediaRecorder support in your browser.');
    isExporting = false;
    return;
  }
  // Clean up any previous export run
  try {
    if (_exportState.id) { clearInterval(_exportState.id); _exportState.id = null; }
    if (_exportState.rec && _exportState.rec.state !== 'inactive') { _exportState.rec.stop(); }
  } catch (_) {}
  if (_exportState.off?.parentNode) { _exportState.off.parentNode.removeChild(_exportState.off); }
  _exportState = { rec: null, id: null, off: null, chunks: [] };
  // Offscreen canvas sized to the drawing box
  const off = document.createElement('canvas');
  off.width = Math.max(1, BOX.w);
  off.height = Math.max(1, BOX.h);
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = true;
  // Attach offscreen to DOM (hidden) for broader compatibility
  off.style.position = 'fixed';
  off.style.left = '-99999px';
  off.style.top = '0';
  document.body.appendChild(off);

  // Choose a supported mime type
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let mime = '';
  for (const c of candidates) { if (MediaRecorder.isTypeSupported?.(c)) { mime = c; break; } }
  const stream = off.captureStream(fps);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (e) {
    console.error('Failed to start MediaRecorder:', e);
    alert('Could not start video recorder.');
    isExporting = false;
    return;
  }

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    try {
      const size = chunks.reduce((n, b) => n + (b?.size || 0), 0);
      if (size > 0) {
        const blob = new Blob(chunks, { type: mime || 'video/webm' });
        downloadBlob(blob, 'pattern_animation_cropped.webm');
      } else {
        console.warn('Recorder produced empty output; no chunks.');
        alert('Export recording had no data. Try again or a different browser.');
      }
    } finally {
      isExporting = false;
      try { if (_exportState.id) clearInterval(_exportState.id); } catch (_) {}
      if (off.parentNode) off.parentNode.removeChild(off);
      _exportState = { rec: null, id: null, off: null, chunks: [] };
    }
  };

  // Copy-only-the-box loop
  const totalFrames = Math.max(1, Math.round(seconds * fps));
  let frames = 0;
  const intervalMs = 1000 / fps;
  recorder.start();
  const id = setInterval(() => {
    try {
      octx.clearRect(0, 0, off.width, off.height);
      // Copy box region from main canvas into offscreen canvas
      octx.drawImage(mainCanvas, BOX.x, BOX.y, BOX.w, BOX.h, 0, 0, off.width, off.height);
    } catch (e) {
      console.error('Frame copy failed:', e);
    }
    frames++;
    if (frames >= totalFrames) {
      clearInterval(id);
      try {
        if (recorder.state === 'recording' && recorder.requestData) {
          recorder.requestData();
        }
        recorder.stop();
      } catch (_) { isExporting = false; }
    }
  }, intervalMs);
  _exportState = { rec: recorder, id, off, chunks };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// Build/rebuild offscreen color wheel graphic per current WHEEL.r
function buildColorWheelGraphic() {
  gWheel = createGraphics(WHEEL.r * 2 + 2, WHEEL.r * 2 + 2);
  gWheel.colorMode(HSB, 360, 100, 100, 100);
  gWheel.noStroke();
  gWheel.noSmooth();
  const C = gWheel.width / 2;
  gWheel.loadPixels();
  for (let y = 0; y < gWheel.height; y++) {
    for (let x = 0; x < gWheel.width; x++) {
      const dx = x - C, dy = y - C;
      const r = Math.hypot(dx, dy);
      if (r <= WHEEL.r) {
        let ang = degrees(Math.atan2(dy, dx));
        if (ang < 0) ang += 360;
        const sat = map(r, 0, WHEEL.r, 0, 100, true);
        gWheel.set(x, y, gWheel.color(ang, sat, 100));
      } else {
        gWheel.set(x, y, gWheel.color(0, 0, 100, 0));
      }
    }
  }
  gWheel.updatePixels();
}

// Button Styles & Mode Helpers
function styleButton(btn, bg) {
  btn.style('background', bg);
  btn.style('color', '#fff');
  btn.style('border', 'none');
  btn.style('border-radius', '8px');
  btn.style('font-family', 'cursive');
  btn.style('font-size', Math.round(12 * uiScale) + 'px');
  btn.style('cursor', 'pointer');

  btn.style('width',  Math.round(BTN_W * uiScale) + 'px');
  btn.style('height', Math.round(BTN_H * uiScale) + 'px');
  btn.style('padding', '0');
  btn.style('box-sizing', 'border-box');
  btn.style('display', 'inline-flex');
  btn.style('align-items', 'center');
  btn.style('justify-content', 'center');
}
// Dropdown-like style (match selects like ease/symmetry)
function styleDropdownLike(btn) {
  btn.style('background', '#ffffff');
  btn.style('color', '#111');
  btn.style('border', '1px solid #111');
  btn.style('border-radius', '8px');
  btn.style('font-family', 'cursive');
  // Match dropdown typography exactly
  btn.style('font-size', '11px');
  btn.style('font-weight', 'normal');
  btn.style('cursor', 'pointer');
  // Match dropdown padding
  btn.style('padding', '5px');
  btn.style('box-sizing', 'border-box');
  btn.style('display', 'inline-block');
}

function syncExportSizeToSymmetry() {
  try {
    if (!symDropdown || !exportBtn) return;
    const el = symDropdown.elt || null;
    if (!el) return;
    const w = Math.max(0, el.offsetWidth || 0);
    const h = Math.max(0, el.offsetHeight || 0);
    if (w && h) {
      exportBtn.style('width', w + 'px');
      exportBtn.style('height', h + 'px');
    }
  } catch (e) {
    // noop
  }
}

function positionExportNextToSymmetry(side = 'left') {
  try {
    if (!symDropdown || !exportBtn) return;
    const el = symDropdown.elt || null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 16;
    const symW = el.offsetWidth || 0;
    const btnW = exportBtn.elt ? (exportBtn.elt.offsetWidth || 0) : 0;
    const x = side === 'left'
      ? (window.scrollX + rect.left - (btnW || symW) - gap)
      : (window.scrollX + rect.left + symW + gap);
    const y = window.scrollY + rect.top;
    exportBtn.position(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)));
  } catch (e) {
    // noop
  }
}

function rightAlignSymmetryDropdown() {
  try {
    if (!symDropdown) return;
    const el = symDropdown.elt || null;
    if (!el) return;
    const w = el.offsetWidth || 0;
    const x = BOX.x + BOX.w - w;
    const y = BOX.y - 46; // same baseline as before
    symDropdown.position(x, y);
  } catch (e) {
    // noop
  }
}
function setMode(mode) {
  toolMode = mode;
  const all = [drawBtn, eraseBtn, eraseStrokeBtn, changeColorBtn, vertexBtn, moveBtn];
  for (const b of all) b && b.style('box-shadow', 'none');
  const mapBtn = { draw: drawBtn, erase: eraseBtn, eraseStroke: eraseStrokeBtn, recolor: changeColorBtn, vertex: vertexBtn, move: moveBtn };
  const active = mapBtn[mode]; if (active) active.style('box-shadow', '0 0 0 3px rgba(196, 140, 191, 0.68)');
  if (mode !== 'vertex') { draggingVertex = false; }
  if (mode !== 'move') { movingStrokeIdx = -1; prevMouse = null; }
}

// Stroke picking
function findStrokeAt(x, y) { for (let i = strokes.length - 1; i >= 0; i--) { if (strokeHit(strokes[i], x, y)) return i; } return -1; }
function strokeHit(s, px, py) {
  const pts = s.points; if (pts.length < 2) return false;
  const tol = Math.max(8, s.thickness / 2 + 4);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (pointSegDist(px, py, a.x, a.y, b.x, b.y) <= tol) return true;
  } return false;
}
function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1; const len2 = dx*dx + dy*dy;
  if (len2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1)*dx + (py - y1)*dy) / len2; t = constrain(t, 0, 1);
  const cx = x1 + t * dx, cy = y1 + t * dy; return dist(px, py, cx, cy);
}

// Move helpers
function boundsOf(points) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of points) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
  return { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny };
}
function translateStrokeClamped(s, dx, dy, box) {
  if (!dx && !dy) return;
  const b = boundsOf(s.points);
  if (b.minx + dx < box.x) dx = box.x - b.minx;
  if (b.maxx + dx > box.x + box.w) dx = box.x + box.w - b.maxx;
  if (b.miny + dy < box.y) dy = box.y - b.miny;
  if (b.maxy + dy > box.y + box.h) dy = box.y + box.h - b.maxy;
  for (const p of s.points) { p.x += dx; p.y += dy; }
}
function drawStrokeBounds(s) { const b = boundsOf(s.points); noFill(); stroke('#22C55E'); strokeWeight(1.5); rect(b.minx, b.miny, b.w, b.h); }

// Clamp helpers (shared by Erase/Vertex)
function clampToBoxX(x) { return constrain(x, BOX.x, BOX.x + BOX.w); }
function clampToBoxY(y) { return constrain(y, BOX.y, BOX.y + BOX.h); }

// AI Art helper 
function addArtStrokes(art, opts = {}) {
  if (!art || !Array.isArray(art.strokes)) return;
  const pad = 24;
  const target = {
    x: opts.x ?? (BOX.x + pad),
    y: opts.y ?? (BOX.y + pad),
    w: opts.w ?? (BOX.w - 2 * pad),
    h: opts.h ?? (BOX.h - 2 * pad),
  };
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const s of art.strokes) {
    for (const p of (s.points || [])) {
      minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
    }
  }
  if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return;
  const aw = Math.max(1, maxx - minx), ah = Math.max(1, maxy - miny);
  const sx = target.w / aw, sy = target.h / ah;
  const scale = Math.min(sx, sy);
  const ox = target.x + (target.w - aw * scale) / 2;
  const oy = target.y + (target.h - ah * scale) / 2;

  for (const as of art.strokes) {
    const hex = as.color || '#000000';
    const { h, s, b } = hexToHSB(hex);
    const alpha = typeof as.opacity === 'number' ? as.opacity : 100;
    const thick = Math.max(1, Math.min(80, as.thickness || 4));
    const st = new Stroke(color(h, s, b, alpha), thick, alpha, !!as.eraser);
    for (const p of (as.points || [])) {
      const tx = ox + (p.x - minx) * scale;
      const ty = oy + (p.y - miny) * scale;
      st.add(tx, ty);
    }
    if (st.points.length >= 2) strokes.push(st);
  }
}
