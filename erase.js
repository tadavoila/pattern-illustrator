/* erase.js
   - Implements a vector eraser that repeatedly clips each polyline stroke against a moving circular brush
   - Consulted ChatGPT 5 for
    - Help with deriving and debugging the circle–segment intersection math 
    - Help with designing and debugging a stable algorithm to reconstruct remaining stroke fragments without gaps or artifacts.
   - Primarily consulted the following websites:
    - https://p5js.org/reference/ (for p5.js)
*/

(function (root) {
  const Erase = {};
  let clampX = (x) => x;
  let clampY = (y) => y;

  Erase.configure = ({ clampToBoxX, clampToBoxY } = {}) => {
    if (typeof clampToBoxX === "function") clampX = clampToBoxX;
    if (typeof clampToBoxY === "function") clampY = clampToBoxY;
  };

  Erase.radius = (slider) => Math.max(2, Number(slider?.value?.() ?? slider ?? 20));

  // Erase at a single point
  Erase.applyPoint = function (strokes, p, radius) {
    if (!Array.isArray(strokes) || !strokes.length) return strokes;
    const cx = p.x, cy = p.y, r = radius;
    const MIN_SEG = 0.5; // discard crumbs
    const newStrokes = [];

    for (const s of strokes) {
      if (!s?.points || s.points.length < 2 || s.eraser) {
        if (s?.points?.length >= 2) newStrokes.push(s);
        continue;
      }

      const pts = s.points;
      let run = [];
      const flushRun = () => {
        if (run.length >= 2) {
          const filtered = [run[0]];
          for (let i = 1; i < run.length; i++) {
            const a = filtered[filtered.length - 1];
            const b = run[i];
            if (dist(a.x, a.y, b.x, b.y) >= MIN_SEG) filtered.push(b);
          }
          if (filtered.length >= 2) {
            const ns = new Stroke(s.col, s.thickness, s.opacity, false);
            for (const q of filtered) ns.add(q.x, q.y);
            newStrokes.push(ns);
          }
        }
        run = [];
      };

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];

        // pieces that lie OUTSIDE circle
        const pieces = _clipSegmentOutsideCircle(a, b, { x: cx, y: cy }, r);

        if (!pieces.length) {
          // fully erased
          flushRun();
          continue;
        }

        for (const [p0, p1] of pieces) {
          const A = { x: clampX(p0.x), y: clampY(p0.y) };
          const B = { x: clampX(p1.x), y: clampY(p1.y) };
          if (dist(A.x, A.y, B.x, B.y) < MIN_SEG) continue;

          if (run.length === 0) {
            run.push(A, B);
          } else {
            const last = run[run.length - 1];
            if (dist(last.x, last.y, A.x, A.y) > 1e-6) {
              // gap -> close previous polyline
              flushRun();
              run.push(A, B);
            } else {
              // contiguous -> extend
              run.push(B);
            }
          }
        }
      }
      flushRun();
    }

    return newStrokes;
  };

  // erase along a dragged segment (returns new strokes array)
  Erase.applySegment = function (strokes, p0, p1, radius) {
    const L = dist(p0.x, p0.y, p1.x, p1.y);
    if (L === 0) return Erase.applyPoint(strokes, p1, radius);
    const step = Math.max(2, radius * 0.5);
    const n = Math.max(1, Math.floor(L / step));

    let out = strokes;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(p0.x, p1.x, t);
      const y = lerp(p0.y, p1.y, t);
      out = Erase.applyPoint(out, { x, y }, radius);
    }
    return out;
  };

  // precise circle–segment clipping
  function _clipSegmentOutsideCircle(a, b, c, r) {
    const EPS = 1e-9;
    const ax = a.x, ay = a.y;
    const bx = b.x, by = b.y;
    const cx = c.x, cy = c.y;

    const dx = bx - ax, dy = by - ay;
    const fx = ax - cx, fy = ay - cy;

    const A = dx * dx + dy * dy;
    if (A < EPS) return []; 

    const B = 2 * (dx * fx + dy * fy);
    const C = fx * fx + fy * fy - r * r;

    let ts = [0, 1];

    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const sqrtD = Math.sqrt(disc);
      const t1 = (-B - sqrtD) / (2 * A);
      const t2 = (-B + sqrtD) / (2 * A);
      if (t1 > -EPS && t1 < 1 + EPS) ts.push(_clamp01(t1));
      if (t2 > -EPS && t2 < 1 + EPS) ts.push(_clamp01(t2));
    }

    ts = ts
      .sort((u, v) => u - v)
      .filter((v, i, arr) => i === 0 || Math.abs(v - arr[i - 1]) > 1e-6);

    const pieces = [];
    for (let i = 0; i < ts.length - 1; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 <= EPS) continue;

      const tm = (t0 + t1) * 0.5;
      const mx = ax + dx * tm, my = ay + dy * tm;
      const outside = (mx - cx) * (mx - cx) + (my - cy) * (my - cy) > r * r;

      if (outside) {
        const p0 = { x: ax + dx * t0, y: ay + dy * t0 };
        const p1 = { x: ax + dx * t1, y: ay + dy * t1 };
        pieces.push([p0, p1]);
      }
    }
    return pieces;
  }

  function _clamp01(t) { return Math.max(0, Math.min(1, t)); }

  root.Erase = Erase;
})(window);
