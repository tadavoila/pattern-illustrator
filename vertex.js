/* vertex.js
   - This file adds tools for editing and reshaping drawn lines by letting users select, move, and resample individual vertices on a stroke.
*/

(function (root) {
  const Vertex = {};
  let clampX = (x) => x;
  let clampY = (y) => y;

  // Coordinate clamping
  Vertex.configure = function ({ clampToBoxX, clampToBoxY } = {}) {
    if (typeof clampToBoxX === 'function') clampX = clampToBoxX;
    if (typeof clampToBoxY === 'function') clampY = clampToBoxY;
  };

  // Determines how close mouse should be to detect a vertex
  Vertex.hitTolerance = function (s) {
    return Math.max(10, (s?.thickness || 0) / 2 + 6);
  };

  // Finds nearest vertext to given point
  Vertex.closestVertexIndex = function (points, x, y, tol) {
    if (!Array.isArray(points)) return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = dist(x, y, points[i].x, points[i].y);
      if (d < bestD && d <= (tol ?? Infinity)) { bestD = d; best = i; }
    }
    return best;
  };

  // Finds the closest projected point along any stroke segment
  Vertex.closestSegmentProjection = function (points, x, y) {
    if (!points || points.length < 2) return null;
    let best = null;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const hit = _segProjection(x, y, p0.x, p0.y, p1.x, p1.y);
      if (!best || hit.dist < best.dist) best = { i, ...hit };
    }
    return best;
  };

  // Draws the editable vertex handles and connecting lines
  Vertex.drawHandles = function (s, selectedVertexIdx = -1) {
    if (!s || !Array.isArray(s.points)) return;
    noFill(); stroke(0, 0, 20, 60); strokeWeight(1);
    beginShape(); for (const pt of s.points) vertex(pt.x, pt.y); endShape();
    for (let i = 0; i < s.points.length; i++) {
      const pt = s.points[i];
      stroke('#111'); noFill(); circle(pt.x, pt.y, 10);
      noStroke(); fill(i === selectedVertexIdx ? '#3B82F6' : '#0EA5E9'); circle(pt.x, pt.y, 6);
    }
  };

  // Enables a vertex-count slider (removed from final product because of UI space)
  Vertex.enableSliderFor = function (s, slider, label) {
    if (!slider || !label || !s) return;
    const n = Math.max(2, s.points?.length || 0);
    try { slider.removeAttribute('disabled'); } catch (_) {}
    if (slider.elt) { slider.elt.min = 2; slider.elt.max = Math.max(2, Math.min(500, n * 2)); }
    try { slider.value(n); } catch (_) {}
    try { label.html('<b>Vertices:</b>'); } catch (_) {}
  };

  // Disables the slider outside of vertex mode (removed from final product because of UI space)
  Vertex.disableSlider = function (slider, label) {
    if (!slider || !label) return;
    try { slider.attribute('disabled', ''); } catch (_) {}
    try { label.html('<b>Vertices:</b> (Vertex Mode Only)'); } catch (_) {}
  };

  // Resamples a stroke to evenly spaced points for smoother geometry
  Vertex.resamplePoints = function (points, N) {
    if (!Array.isArray(points) || points.length < 2) return points ? points.slice() : [];
    N = Math.max(2, Math.floor(N));
    const L = [0];
    for (let i = 1; i < points.length; i++) {
      L.push(L[i - 1] + dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y));
    }
    const total = L[L.length - 1];
    if (total === 0) return Array(N).fill({ ...points[0] });
    const out = [];
    for (let k = 0; k < N; k++) {
      const t = (k / (N - 1)) * total;
      let j = 1; while (j < L.length && L[j] < t) j++;
      const i = Math.max(1, j), t0 = L[i - 1], t1 = L[i], seg = t1 - t0 || 1e-9;
      const u = (t - t0) / seg, p0 = points[i - 1], p1 = points[i];
      out.push({ x: lerp(p0.x, p1.x, u), y: lerp(p0.y, p1.y, u) });
    }
    return out;
  };

  function _segProjection(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx*dx + dy*dy || 1e-9;
    let t = ((px - x1)*dx + (py - y1)*dy) / len2; t = constrain(t, 0, 1);
    const cx = x1 + t * dx, cy = y1 + t * dy; const d = dist(px, py, cx, cy);
    return { dist: d, cx: clampX(cx), cy: clampY(cy), t };
  }

  root.Vertex = Vertex;
})(window);
