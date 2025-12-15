/* animation.js
   - Create animations via interpolation
  - We store multiple drawings (keyframes). Each drawing is an array of strokes.
  - For a given global time t in [0,1], we figure out which two drawings we’re between,
      ease the local t, and create an in-between drawing by interpolating strokes.
  - If a drawing has more strokes than the next one (or vice versa), we "ghost" the
      extras so they fade in/out gracefully instead of popping.
*/

window.Anim = (function () {
  const Anim = {
    running: false,
    startMs: 0,
    durationMs: 10000,

    // Easing functions
    Easings: {
      Linear: (t) => t,
      EaseInOutCubic: (t) => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2),
      EaseInOutQuad: (t) => (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2),
    },

    getEase(name) {
      return Anim.Easings[name] || Anim.Easings.EaseInOutCubic;
    },

    start(durationMs) {
      Anim.durationMs = Number(durationMs) || 10000;
      Anim.running = true;
      Anim.startMs = millis();
    },

    // Draw one frame of animation between stored drawings
    drawFrame(storedDrawings, easeName, drawDrawing) {
      const n = storedDrawings.length;
      if (n < 2) return;

      let tGlobal = (millis() - Anim.startMs) / Anim.durationMs;

      // Draw final state  
      if (tGlobal >= 1) {
        drawDrawing(storedDrawings[n - 1].strokes);
        Anim.running = false;
        return;
      }

      // Figure out which two drawings we are between
      const ease = Anim.getEase(easeName);
      const segments = n - 1;
      const segT = tGlobal * segments;
      const i = Math.min(segments - 1, Math.floor(segT));
      const local = constrain(ease(constrain(segT - i, 0, 1)), 0, 1);

      const A = storedDrawings[i].strokes;
      const B = storedDrawings[i + 1].strokes;
      const tween = tweenDrawingsMulti(A, B, local);
      drawDrawing(tween);
    },
  };

  // Multi-stroke tweening

  // Centroid for set of points
  function centroidOf(points) {
    if (!points.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    for (const p of points) { sx += p.x; sy += p.y; }
    return { x: sx / points.length, y: sy / points.length };
  }

  // Polyline length
  function lengthOf(points) {
    let L = 0;
    for (let i = 1; i < points.length; i++)
      L += dist(points[i-1].x, points[i-1].y, points[i].x, points[i].y);
    return L;
  }

  // Matching functions
  function strokeMatchCost(a, b) {
    const ca = centroidOf(a.points), cb = centroidOf(b.points);
    const d = dist(ca.x, ca.y, cb.x, cb.y);
    const la = Math.max(1, lengthOf(a.points)), lb = Math.max(1, lengthOf(b.points));
    const lenTerm = Math.abs(la - lb) * 0.1;
    return d + lenTerm;
  }

  function matchStrokes(A, B) {
    const pairs = [];
    const usedB = new Set();

    for (let i = 0; i < A.length; i++) {
      let bestJ = -1, bestC = Infinity;
      for (let j = 0; j < B.length; j++) {
        if (usedB.has(j)) continue;
        const c = strokeMatchCost(A[i], B[j]);
        if (c < bestC) { bestC = c; bestJ = j; }
      }
      if (bestJ !== -1) { pairs.push([i, bestJ]); usedB.add(bestJ); }
    }

    const unmatchedA = [];
    for (let i = 0; i < A.length; i++) if (!pairs.some(p => p[0] === i)) unmatchedA.push(i);
    const unmatchedB = [];
    for (let j = 0; j < B.length; j++) if (!pairs.some(p => p[1] === j)) unmatchedB.push(j);

    return { pairs, unmatchedA, unmatchedB };
  }

  // Ghosting
  function ghostFromStrokeLike(s) {
    const c = centroidOf(s.points);
    const N = 20;
    const pts = Array.from({ length: N }, () => ({ x: c.x, y: c.y }));
    return { colHSB: { ...s.colHSB }, thickness: 0.001, opacity: 0, eraser: false, points: pts };
  }

// Resample a polyline (array of points) to have N evenly spaced points
// This helps make animation and morphing between strokes smooth and stable
function resamplePointsLocal(points, N) {
  if (!Array.isArray(points) || points.length < 2) return points ? points.slice() : [];
  N = Math.max(2, Math.floor(N));

  // Compute cumulative distances along the polyline
  const L = [0];
  for (let i = 1; i < points.length; i++) {
    L.push(L[i - 1] + dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y));
  }

  const total = L[L.length - 1];
  if (total === 0) return Array(N).fill({ ...points[0] }); // All points are the same

  const out = [];

  // Place each output sample at its proportional distance t along the path
  for (let k = 0; k < N; k++) {
    const t = (k / (N - 1)) * total;

    // Find which segment contains t
    let j = 1;
    while (j < L.length && L[j] < t) j++;
    const i = Math.max(1, j);

    // Compute local parameter u within that segment
    const t0 = L[i - 1], t1 = L[i];
    const u = (t - t0) / (t1 - t0 || 1e-9);

    // Interpolate point location between p0 and p1
    const p0 = points[i - 1], p1 = points[i];
    out.push({ x: lerp(p0.x, p1.x, u), y: lerp(p0.y, p1.y, u) });
  }

  return out;
}

// Interpolate between two strokes (a and b) at time t in [0,1]
// Returns a new stroke with interpolated points, color, thickness, and opacity
function tweenTwoStrokes(a, b, t, N = 60) {
  // Resample both strokes to have the same number of points
  const pa = resamplePointsLocal(a.points, N);
  const pb = resamplePointsLocal(b.points, N);

  // Interpolate each point
  const pts = [];
  for (let j = 0; j < N; j++)
    pts.push({ x: lerp(pa[j].x, pb[j].x, t), y: lerp(pa[j].y, pb[j].y, t) });

  // Interpolate color (HSB), thickness, and opacity
  const colHSB = {
    h: lerp(a.colHSB.h, b.colHSB.h, t),
    s: lerp(a.colHSB.s, b.colHSB.s, t),
    b: lerp(a.colHSB.b, b.colHSB.b, t),
    a: lerp(a.opacity ?? a.colHSB.a ?? 100, b.opacity ?? b.colHSB.a ?? 100, t)
  };

  const thickness = lerp(a.thickness || 4, b.thickness || 4, t);
  const opacity = lerp(a.opacity ?? 100, b.opacity ?? 100, t);

  return { colHSB, thickness, opacity, eraser: false, points: pts };
}

// Interpolate between two drawings (arrays of strokes) at time t in [0,1]
// Matches strokes between drawings, morphs matched pairs, and fades in/out unmatched strokes
function tweenDrawingsMulti(A, B, t) {
  // Ignore eraser strokes for morphing
  const AA = A.filter(s => !s.eraser);
  const BB = B.filter(s => !s.eraser);
  const { pairs, unmatchedA, unmatchedB } = matchStrokes(AA, BB);
  const out = [];

  // Morph matched strokes
  for (const [ia, ib] of pairs)
    out.push(tweenTwoStrokes(AA[ia], BB[ib], t, 60));

  // Fade out unmatched strokes from A
  for (const ia of unmatchedA)
    out.push(tweenTwoStrokes(AA[ia], ghostFromStrokeLike(AA[ia]), t, 40));

  // Fade in unmatched strokes from B
  for (const ib of unmatchedB)
    out.push(tweenTwoStrokes(ghostFromStrokeLike(BB[ib]), BB[ib], t, 40));

  return out;
}

// Expose tweenDrawingsMulti for use elsewhere
Anim._tweenDrawingsMulti = tweenDrawingsMulti;
return Anim;
})();