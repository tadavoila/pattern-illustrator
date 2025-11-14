/* symmetry.js
   - Defines 180 degree rotational, 4-way rotational, mirrored, radial, dihedral, spiral, kaleidoscopic, and fractal symmetry
   - I defined the symmetries, did the UI (albeit with Copilot completions), and did the 180 degree rotation and 4-way rotation math myself
   - I consulted ChatGPT 5 for assistance with the mathematics for the other symmetries
      and with debugging JavaScript syntax errors.
   - Primarily consulted the following:
      - https://helpingwithmath.com/180-degree-rotation/ 
      - https://en.wikipedia.org/wiki/Rotational_symmetry 
*/

(function () {
  // Math Helpers
  function boxCenter(BOX) { return { cx: BOX.x + BOX.w / 2, cy: BOX.y + BOX.h / 2 }; }

  function rotateAbout(x, y, cx, cy, a) {
    const dx = x - cx, dy = y - cy;
    const ca = Math.cos(a), sa = Math.sin(a);
    return { x: cx + dx * ca - dy * sa, y: cy + dx * sa + dy * ca };
  }

  // Reflect across a line through (cx,cy) at angle theta 
  function reflectAboutAngle(x, y, cx, cy, theta) {
    const dx = x - cx, dy = y - cy;
    const ux = Math.cos(theta), uy = Math.sin(theta); // unit vector along mirror line
    const dot = dx * ux + dy * uy;
    const rx = 2 * dot * ux - dx;
    const ry = 2 * dot * uy - dy;
    return { x: cx + rx, y: cy + ry };
  }

  function scaleAbout(x, y, cx, cy, s) {
    return { x: cx + (x - cx) * s, y: cy + (y - cy) * s };
  }

  // Transform builder
  function getSymmetryTransforms(mode, BOX) {
    const { cx, cy } = boxCenter(BOX);

    switch (mode) {
      // 180 degree rotation
      case 'rot180':
        return [
          (x, y) => ({ x, y }),
          (x, y) => rotateAbout(x, y, cx, cy, Math.PI),
        ];
      // 4 way rotation
      case 'rot4':
        return [
          (x, y) => ({ x, y }),
          (x, y) => rotateAbout(x, y, cx, cy, Math.PI / 2),
          (x, y) => rotateAbout(x, y, cx, cy, Math.PI),
          (x, y) => rotateAbout(x, y, cx, cy, 3 * Math.PI / 2),
        ];

      case 'mirrorV': {
        // Mirror about the vertical axis through the center
        const { cx: mcx } = boxCenter(BOX);
        return [
          (x, y) => ({ x, y }),
          (x, y) => ({ x: 2 * mcx - x, y }),
        ];
      }

      // N-based
      case 'radialN': {
        const N = Math.max(2, Math.floor(Symmetry.N || 10));
        const out = [];
        for (let i = 0; i < N; i++) {
          const ang = (2 * Math.PI * i) / N;
          out.push((x, y) => rotateAbout(x, y, cx, cy, ang));
        }
        return out;
      }

      case 'dihedralN': {
        const k = Math.max(2, Math.floor(Symmetry.N || 8));
        const out = [];
        for (let i = 0; i < k; i++) {
          const ang = (2 * Math.PI * i) / k;
          out.push((x, y) => rotateAbout(x, y, cx, cy, ang));         // rotation
          if (Symmetry.useMirrors) {
            out.push((x, y) => reflectAboutAngle(x, y, cx, cy, ang)); // mirror
          }
        }
        return out;
      }

      case 'spiralN': {
        const N = Math.max(2, Math.floor(Symmetry.N || 10));
        const s = Math.min(1.0, Math.max(0.5, Number(Symmetry.scaleStep || 0.92)));
        const out = [];
        for (let i = 0; i < N; i++) {
          const ang = (2 * Math.PI * i) / N;
          out.push((x, y) => {
            const r = rotateAbout(x, y, cx, cy, ang);
            const sc = Math.pow(s, i);
            return scaleAbout(r.x, r.y, cx, cy, sc);
          });
        }
        return out;
      }

      // Kaleidoscopic N 
      case 'kaleidoN': {
        const N = Math.max(2, Math.floor(Symmetry.N || 8));
        const out = [];
        for (let i = 0; i < N; i++) {
          const ang = (2 * Math.PI * i) / N;
          out.push((x, y) => rotateAbout(x, y, cx, cy, ang));
          if (Symmetry.useMirrors) {
            // Mirror around a mid-axis for denser shards
            out.push((x, y) => reflectAboutAngle(x, y, cx, cy, ang + Math.PI / (2 * N)));
          }
        }
        return out;
      }

      // Fractal Symmetry N
      case 'fractalN': {
        const N = Math.max(2, Math.floor(Symmetry.N || 8));
        const s = Math.min(1.0, Math.max(0.4, Number(Symmetry.scaleStep || 0.85)));
        const depth = Math.max(2, Math.min(5, Math.floor(Symmetry.fractalDepth || 3)));
        const out = [];
        for (let i = 0; i < N; i++) {
          const ang = (2 * Math.PI * i) / N;
          for (let d = 0; d < depth; d++) {
            const sc = Math.pow(s, d);
            out.push((x, y) => {
              const r = rotateAbout(x, y, cx, cy, ang);
              return scaleAbout(r.x, r.y, cx, cy, sc);
            });
          }
        }
        return out;
      }

      default:
        return [(x, y) => ({ x, y })];
    }
  }

  // Stroke clone builder
  function buildClones(style, BOX) {
    const transforms = getSymmetryTransforms(Symmetry.mode, BOX);
    return transforms.map(() => new Stroke(color(style.h, style.s, style.b, style.a), style.thickness, style.a, false));
  }

  // UI
  let ui = {
    select: null,
    nLabel: null,
    nSlider: null,
    nBadge: null,
    mirrorCheck: null,
    mirrorLabel: null,
    // replaced: scaleInput -> scaleSlider + scaleBadge
    scaleLabel: null,
    scaleSlider: null,
    scaleBadge: null,
    depthLabel: null,
    depthSlider: null,
    depthBadge: null,
  };

  function show(el, visible) { if (el) el.style('display', visible ? 'inline-block' : 'none'); }
  function place(el, x, y) { if (el && typeof el.position === 'function') el.position(x, y); }

  function updateControlsVisibility() {
    const mode = Symmetry.mode;

    const needN = ['radialN','dihedralN','spiralN','kaleidoN','fractalN'].includes(mode);
    const needMirror = ['dihedralN','kaleidoN'].includes(mode);
    const needScale = ['spiralN','fractalN'].includes(mode);
    const needDepth = (mode === 'fractalN');

    show(ui.nLabel, needN); show(ui.nSlider, needN); show(ui.nBadge, needN);
    show(ui.mirrorLabel, needMirror); show(ui.mirrorCheck, needMirror);
    show(ui.scaleLabel, needScale); show(ui.scaleSlider, needScale); show(ui.scaleBadge, needScale);
    show(ui.depthLabel, needDepth); show(ui.depthSlider, needDepth); show(ui.depthBadge, needDepth);
  }

  function createDropdown(x, y) {
    // Dropdown 
    ui.select = createSelect();
    ui.select.position(x+120, y);
    ui.select.style('font-family', 'cursive')
      .style('font-size', '12px')
      .style('padding', '6px')
      .style('border-radius', '8px')
      .style('background', '#fff')
      .style('border', '1px solid #111');

    // Capitalized names
    ui.select.option('180° Rotational', 'rot180');
    ui.select.option('4-Way Rotational', 'rot4');
    ui.select.option('Mirror (Vertical)', 'mirrorV');
    ui.select.option('Radial N', 'radialN');
    ui.select.option('Dihedral N', 'dihedralN');
    ui.select.option('Spiral N', 'spiralN');
    ui.select.option('Kaleidoscopic N', 'kaleidoN');
    ui.select.option('Fractal Symmetry N', 'fractalN');

    ui.select.selected(Symmetry.mode);
    ui.select.changed(() => {
      Symmetry.mode = ui.select.value();
      updateControlsVisibility();
    });

    // Inline controls
    const gx = BOX.x, gy = BOX.h + 80;

    // N slider
    ui.nLabel = createSpan('<span style="opacity:.75">N</span>');
    ui.nLabel.position(gx, gy)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('color', '#111');

    ui.nSlider = createSlider(2, 36, Symmetry.N, 1);
    ui.nSlider.position(gx + 18, gy + 4).style('width', '110px');
    ui.nSlider.input(() => {
      Symmetry.N = ui.nSlider.value();
      ui.nBadge.html('&nbsp;' + Symmetry.N + '&nbsp;');
    });

    ui.nBadge = createSpan('&nbsp;' + Symmetry.N + '&nbsp;');
    ui.nBadge.position(gx + 134, gy - 2)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('border', '1px solid #aaa')
      .style('border-radius', '999px')
      .style('padding', '2px 6px')
      .style('margin-left', '6px')
      .style('color', '#111');

    // Mirrors (for dihedral/kaleido)
    ui.mirrorLabel = createSpan('<span style="opacity:.75">Mirrors:</span>');
    ui.mirrorLabel.position(gx + 190, gy + 1)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('color', '#111');

    ui.mirrorCheck = createCheckbox('', Symmetry.useMirrors);
    place(ui.mirrorCheck, gx + 240, gy + 1);
    ui.mirrorCheck.changed(() => {
      Symmetry.useMirrors = !!ui.mirrorCheck.elt.checked;
    });

    // Scale slider (for spiral/fractal) 
    ui.scaleLabel = createSpan('<span style="opacity:.75">Scale</span>');
    ui.scaleLabel.position(gx + 185, gy - 1)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('color', '#111');

    ui.scaleSlider = createSlider(0.4, 1.0, Symmetry.scaleStep, 0.01);
    ui.scaleSlider.position(gx + 225, gy + 4).style('width', '110px');
    ui.scaleSlider.input(() => {
      const v = Number(ui.scaleSlider.value());
      Symmetry.scaleStep = Math.min(1.0, Math.max(0.4, v));
      ui.scaleBadge.html('&nbsp;' + Symmetry.scaleStep.toFixed(2) + '&nbsp;');
    });

    ui.scaleBadge = createSpan('&nbsp;' + Symmetry.scaleStep.toFixed(2) + '&nbsp;');
    ui.scaleBadge.position(gx + 340, gy - 2)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('border', '1px solid #aaa')
      .style('border-radius', '999px')
      .style('padding', '2px 6px')
      .style('margin-left', '6px')
      .style('color', '#111');

    // Depth (for fractal)
    ui.depthLabel = createSpan('<span style="opacity:.75">Depth</span>');
    ui.depthLabel.position(gx + 400, gy)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('color', '#111');

    ui.depthSlider = createSlider(2, 5, Symmetry.fractalDepth, 1);
    ui.depthSlider.position(gx + 445, gy + 4).style('width', '110px');
    ui.depthSlider.input(() => {
      Symmetry.fractalDepth = ui.depthSlider.value();
      ui.depthBadge.html('&nbsp;' + Symmetry.fractalDepth + '&nbsp;');
    });

    ui.depthBadge = createSpan('&nbsp;' + Symmetry.fractalDepth + '&nbsp;');
    ui.depthBadge.position(gx + 560, gy - 2)
      .style('font-size', '12px')
      .style('font-family', 'cursive')
      .style('border', '1px solid #aaa')
      .style('border-radius', '999px')
      .style('padding', '2px 6px')
      .style('margin-left', '6px')
      .style('color', '#111');

    updateControlsVisibility();
    return ui.select;
  }

  function reposition(x, y, BOX) {
    if (!ui.select) return;
    // Move dropdown
    ui.select.position(x + 120, y);

    // Inline controls follow BOX along the bottom
    const gx = BOX.x, gy = BOX.h + 80;
    ui.nLabel && ui.nLabel.position(gx, gy);
    ui.nSlider && ui.nSlider.position(gx + 18, gy + 4);
    ui.nBadge && ui.nBadge.position(gx + 134, gy - 2);

    ui.mirrorLabel && ui.mirrorLabel.position(gx + 190, gy + 1);
    ui.mirrorCheck && ui.mirrorCheck.position(gx + 240, gy + 1);

    ui.scaleLabel && ui.scaleLabel.position(gx + 185, gy - 1);
    ui.scaleSlider && ui.scaleSlider.position(gx + 225, gy + 4);
    ui.scaleBadge && ui.scaleBadge.position(gx + 340, gy - 2);

    ui.depthLabel && ui.depthLabel.position(gx + 400, gy);
    ui.depthSlider && ui.depthSlider.position(gx + 445, gy + 4);
    ui.depthBadge && ui.depthBadge.position(gx + 560, gy - 2);
  }

  const Symmetry = {
    mode: 'rot180',
    N: 10,
    useMirrors: true,
    scaleStep: 0.92,
    fractalDepth: 3,

    createDropdown,
    getTransforms: (BOX) => getSymmetryTransforms(Symmetry.mode, BOX),
    buildClones,
    reposition,
  };

  window.Symmetry = Symmetry;
})();
