/* fx-core.js
 * Pure (DOM-free) logic for the real-time video effects:
 *   parameters + sanitising, looks, colour maths, the SVG filter-graph builder,
 *   geometry (flip / rotate / crop / aspect) and a few frame-analysis helpers.
 *
 * Nothing here pre-renders anything. The result of buildFilter() is the inside of an
 * SVG <filter> that the browser applies to the live <video> element every frame.
 * When every parameter is neutral, no filter is produced at all (needsFilter() === false),
 * which keeps the video on its untouched, hardware-overlay-friendly path.
 */
(function (root) {
  "use strict";

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const f6 = (n) => String(Math.round(n * 1e6) / 1e6);
  const f4 = (n) => {
    const s = String(Math.round(n * 10000) / 10000);
    return s === "-0" ? "0" : s;
  };

  /* ------------------------------------------------------------------ */
  /* Parameters                                                          */
  /* ------------------------------------------------------------------ */
  const DEFAULTS = {
    on: true,
    look: "",
    // light
    exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, gamma: 100,
    // colour
    saturation: 100, hue: 0, temperature: 0, tint: 0, mono: 0, sepia: 0, invert: 0, swap: "rgb",
    stAmount: 0, stShadow: "#2b7a9b", stHigh: "#ff9d4d",
    popColor: "off", popTol: 50,
    // detail & glow
    sharpen: 0, clarity: 0, blur: 0, bloom: 0, bloomThr: 70, bloomSize: 14,
    // stylise
    gmap: "off", gmapAmt: 100, gmapC1: "#0b1026", gmapC2: "#c0408a", gmapC3: "#ffe9b0",
    posterize: 0, solarize: 0, outline: "off", outlineAmt: 60, neonColor: "#19f3ff", pixelate: 0,
    // lens & focus
    warpMode: "off", warpAmt: 0, tilt: "off", tiltBlur: 50, tiltPos: 50, tiltSize: 20, chroma: 0,
    // film & retro
    grain: 0, grainSize: 1.5, vignette: 0, vigSize: 50, scan: 0, scanSize: 1,
    // glitch & motion
    glitch: 0, glitchMode: "burst", wave: 0,
    // audio reactive
    reactOn: false, reactBand: "bass", reactAmt: 60,
    reactBright: true, reactSat: false, reactChroma: true, reactZoom: false, reactGlitch: false,
    // smart auto
    autoLevels: false, autoWB: false, autoAmt: 70,
    // transform
    flipH: false, flipV: false, rotate: 0, straighten: 0, aspect: "auto",
    crop: "off", cropRatio: 1, cropPos: 50, cropT: 0, cropB: 0, cropL: 0, cropR: 0,
  };

  const ENUMS = {
    swap: ["rgb", "rbg", "grb", "gbr", "brg", "bgr"],
    popColor: ["off", "red", "yellow", "green", "cyan", "blue", "magenta"],
    gmap: ["off", "thermal", "night", "matrix", "cyber", "sunset", "ice", "gold", "custom"],
    outline: ["off", "ink", "neon", "edges", "emboss"],
    warpMode: ["off", "lens", "bulge", "swirl"],
    tilt: ["off", "linear", "radial"],
    glitchMode: ["burst", "constant"],
    reactBand: ["bass", "mid", "treble", "full"],
    aspect: ["auto", "16:9", "4:3", "21:9", "2.35:1", "1:1"],
    crop: ["off", "aspect", "manual"],
    scanSize: [0, 1, 2],
    rotate: [0, 90, 180, 270],
  };

  const RANGES = {
    exposure: [-200, 200], brightness: [-100, 100], contrast: [-100, 100], highlights: [-100, 100],
    shadows: [-100, 100], whites: [-100, 100], blacks: [-100, 100], gamma: [50, 200],
    saturation: [0, 300], hue: [-180, 180], temperature: [-100, 100], tint: [-100, 100],
    mono: [0, 100], sepia: [0, 100], invert: [0, 100], stAmount: [0, 100], popTol: [0, 100],
    sharpen: [0, 100], clarity: [0, 100], blur: [0, 100], bloom: [0, 100], bloomThr: [40, 95], bloomSize: [2, 40],
    gmapAmt: [0, 100], posterize: [0, 12], solarize: [0, 100], outlineAmt: [0, 100], pixelate: [0, 40],
    warpAmt: [-100, 100], tiltBlur: [0, 100], tiltPos: [0, 100], tiltSize: [5, 60], chroma: [0, 100],
    grain: [0, 100], grainSize: [1, 4], vignette: [0, 100], vigSize: [0, 100], scan: [0, 100],
    glitch: [0, 100], wave: [0, 100], reactAmt: [0, 100], autoAmt: [0, 100],
    straighten: [-100, 100], cropRatio: [0.4, 3], cropPos: [0, 100], cropT: [0, 40], cropB: [0, 40], cropL: [0, 40], cropR: [0, 40],
  };

  // Keys that belong to "the look" (everything except master switch, transform, audio and smart toggles)
  const TRANSFORM_KEYS = ["flipH", "flipV", "rotate", "straighten", "aspect", "crop", "cropRatio", "cropPos", "cropT", "cropB", "cropL", "cropR"];
  const REACT_KEYS = ["reactOn", "reactBand", "reactAmt", "reactBright", "reactSat", "reactChroma", "reactZoom", "reactGlitch"];
  const AUTO_KEYS = ["autoLevels", "autoWB", "autoAmt"];
  const LOOK_KEYS = Object.keys(DEFAULTS).filter(
    (k) => k !== "on" && k !== "look" && !TRANSFORM_KEYS.includes(k) && !REACT_KEYS.includes(k) && !AUTO_KEYS.includes(k)
  );

  const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

  function sanitize(saved) {
    const out = Object.assign({}, DEFAULTS);
    if (!saved || typeof saved !== "object") return out;
    for (const k of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[k];
      const v = saved[k];
      if (v === undefined || v === null) continue;
      if (typeof d === "boolean") {
        if (typeof v === "boolean") out[k] = v;
      } else if (typeof d === "number") {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        if (ENUMS[k]) {
          if (ENUMS[k].includes(n)) out[k] = n;
        } else if (RANGES[k]) {
          out[k] = clamp(n, RANGES[k][0], RANGES[k][1]);
        }
      } else if (typeof d === "string") {
        if (ENUMS[k]) {
          if (ENUMS[k].includes(v)) out[k] = v;
        } else if (k === "look") {
          if (typeof v === "string" && v.length <= 32) out[k] = v;
        } else if (isHex(v)) out[k] = v.toLowerCase();
      }
    }
    if (saved.crop === undefined && (out.cropT > 0 || out.cropB > 0 || out.cropL > 0 || out.cropR > 0)) out.crop = "manual";
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Looks (presets)                                                     */
  /* ------------------------------------------------------------------ */
  const LOOKS = [
    { id: "none", name: "Original", p: {} },
    { id: "vivid", name: "Vivid", p: { contrast: 16, saturation: 132, sharpen: 30, clarity: 22, shadows: 8 } },
    { id: "cinema", name: "Cinematic", p: { contrast: 14, saturation: 104, stAmount: 55, vignette: 30, vigSize: 48, shadows: 10, highlights: -12, grain: 10, bloom: 12, bloomThr: 78 } },
    { id: "film", name: "Film stock", p: { contrast: 12, saturation: 88, temperature: 10, blacks: 35, grain: 38, grainSize: 1.6, vignette: 22, stAmount: 30, stShadow: "#3a5d7a", stHigh: "#ffbf80" } },
    { id: "noir", name: "Noir", p: { mono: 100, contrast: 45, shadows: -10, grain: 32, vignette: 45, vigSize: 42 } },
    { id: "vintage", name: "Vintage", p: { sepia: 50, saturation: 82, contrast: -6, blacks: 40, vignette: 38, grain: 26, temperature: 12 } },
    { id: "bleach", name: "Bleach bypass", p: { saturation: 55, contrast: 42, clarity: 30, grain: 18, highlights: -8 } },
    { id: "warm", name: "Golden hour", p: { temperature: 38, tint: 6, saturation: 112, contrast: 8, bloom: 18, bloomThr: 72, vignette: 18 } },
    { id: "cool", name: "Moonlight", p: { temperature: -45, saturation: 90, brightness: -6, contrast: 12, vignette: 30, stAmount: 40, stShadow: "#1b3b7a", stHigh: "#9fd0ff" } },
    { id: "vhs", name: "VHS tape", p: { chroma: 55, scan: 35, scanSize: 1, grain: 24, glitch: 20, saturation: 120, contrast: -6, blur: 6, wave: 10, blacks: 30 } },
    { id: "crt", name: "Retro CRT", p: { warpMode: "lens", warpAmt: 32, scan: 55, scanSize: 1, vignette: 48, chroma: 26, contrast: 16, saturation: 118, bloom: 24, bloomThr: 62 } },
    { id: "cyber", name: "Cyberpunk", p: { saturation: 128, contrast: 16, stAmount: 65, stShadow: "#7a1fa2", stHigh: "#20e0e0", chroma: 42, bloom: 38, bloomThr: 60, vignette: 25, grain: 8 } },
    { id: "thermal", name: "Thermal", p: { gmap: "thermal", gmapAmt: 100, contrast: 10, blur: 3 } },
    { id: "night", name: "Night vision", p: { gmap: "night", brightness: 12, contrast: 26, grain: 48, vignette: 58, vigSize: 40, scan: 22, scanSize: 0, bloom: 24 } },
    { id: "matrix", name: "Matrix", p: { gmap: "matrix", contrast: 28, bloom: 34, bloomThr: 55, scan: 18, scanSize: 1, grain: 12 } },
    { id: "comic", name: "Comic book", p: { posterize: 5, outline: "ink", outlineAmt: 70, saturation: 140, contrast: 16 } },
    { id: "neon", name: "Neon edges", p: { outline: "neon", outlineAmt: 80, neonColor: "#19f3ff", bloom: 45, bloomThr: 55, saturation: 120 } },
    { id: "pencil", name: "Pencil sketch", p: { mono: 100, brightness: 18, contrast: 10, outline: "ink", outlineAmt: 100, grain: 10 } },
    { id: "dream", name: "Dreamy glow", p: { bloom: 62, bloomThr: 52, bloomSize: 20, saturation: 112, brightness: 5, contrast: -10, vignette: 14, blur: 5 } },
    { id: "mini", name: "Miniature", p: { tilt: "linear", tiltBlur: 55, tiltPos: 52, tiltSize: 16, saturation: 138, contrast: 14, sharpen: 20 } },
    { id: "pop", name: "Colour pop", p: { popColor: "red", popTol: 55, contrast: 30, grain: 14, vignette: 22 } },
    { id: "water", name: "Underwater", p: { wave: 42, temperature: -36, tint: -8, saturation: 108, bloom: 16, vignette: 26, blur: 6 } },
    { id: "glitch", name: "Glitch", p: { glitch: 72, chroma: 48, scan: 20, scanSize: 0, contrast: 8, grain: 10 } },
    { id: "pixel", name: "Pixel art", p: { pixelate: 8, posterize: 8, saturation: 132, contrast: 14 } },
    { id: "fisheye", name: "Fisheye", p: { warpMode: "lens", warpAmt: 70 } },
    { id: "swirl", name: "Swirl", p: { warpMode: "swirl", warpAmt: 38 } },
    { id: "solar", name: "Solarize", p: { solarize: 70, saturation: 130, contrast: 10 } },
  ];

  function applyLook(state, look) {
    const next = Object.assign({}, state);
    for (const k of LOOK_KEYS) next[k] = DEFAULTS[k];
    Object.assign(next, look.p);
    next.look = look.id === "none" ? "" : look.id;
    return sanitize(next);
  }

  /* ------------------------------------------------------------------ */
  /* Colour helpers                                                      */
  /* ------------------------------------------------------------------ */
  function hex2rgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
    const n = m ? parseInt(m[1], 16) : 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  const GMAPS = {
    thermal: ["#05001a", "#2a0a7a", "#a41c8f", "#ff4a1c", "#ffd21f", "#ffffff"],
    night: ["#000a02", "#06501a", "#2fff4a", "#d8ffd8"],
    matrix: ["#000000", "#003b12", "#00ff55", "#c8ffd8"],
    cyber: ["#0a0030", "#4a0fa8", "#ff2ea6", "#27e6ff", "#f0ffff"],
    sunset: ["#1a0b3a", "#8a2a6a", "#ff6a3a", "#ffd27a"],
    ice: ["#021028", "#0b4a8a", "#5fb8ff", "#f0fbff"],
    gold: ["#120a00", "#7a4a10", "#ffd070", "#fff6dc"],
  };
  function gmapStops(p) {
    return p.gmap === "custom" ? [p.gmapC1, p.gmapC2, p.gmapC3] : GMAPS[p.gmap] || null;
  }

  /* 4x5 colour matrices, row-major, applied as out = M * [r g b a 1] */
  const I20 = () => [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  function mmul(A, B) {
    // result applies B first, then A
    const R = new Array(20).fill(0);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += A[r * 5 + k] * B[k * 5 + c];
        if (c === 4) s += A[r * 5 + 4];
        R[r * 5 + c] = s;
      }
    }
    return R;
  }
  const mDiag = (r, g, b) => [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
  const mOff = (r, g, b) => [1, 0, 0, 0, r, 0, 1, 0, 0, g, 0, 0, 1, 0, b, 0, 0, 0, 1, 0];
  function mSat(s) {
    const lr = 0.2126, lg = 0.7152, lb = 0.0722;
    return [
      lr + (1 - lr) * s, lg * (1 - s), lb * (1 - s), 0, 0,
      lr * (1 - s), lg + (1 - lg) * s, lb * (1 - s), 0, 0,
      lr * (1 - s), lg * (1 - s), lb + (1 - lb) * s, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }
  function mHue(deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0, 0,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }
  function mSepia(a) {
    const k = 1 - a;
    return [
      0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0, 0,
      0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0, 0,
      0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }
  function mPerm(order) {
    const idx = { r: 0, g: 1, b: 2 };
    const m = I20();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i * 5 + j] = 0;
      m[i * 5 + idx[order[i]]] = 1;
    }
    return m;
  }

  function needCM(p) {
    return (
      p.swap !== "rgb" || p.exposure !== 0 || p.brightness !== 0 || p.contrast !== 0 || p.saturation !== 100 ||
      p.mono > 0 || p.hue !== 0 || p.sepia > 0 || p.invert > 0 || p.temperature !== 0 || p.tint !== 0 ||
      (p.reactOn && (p.reactBright || p.reactSat)) || p.autoLevels || p.autoWB
    );
  }

  // d: dynamic values { auto:{gain:[3],off:[3]}, bright, sat }
  function composeMatrix(p, d) {
    d = d || {};
    let M = I20();
    const apply = (X) => (M = mmul(X, M));
    if (d.auto) {
      const a = d.auto;
      apply([a.gain[0], 0, 0, 0, a.off[0], 0, a.gain[1], 0, 0, a.off[1], 0, 0, a.gain[2], 0, a.off[2], 0, 0, 0, 1, 0]);
    }
    if (p.swap !== "rgb") apply(mPerm(p.swap));
    let g = Math.pow(2, p.exposure / 100);
    if (d.bright) g *= 1 + d.bright;
    if (g !== 1) apply(mDiag(g, g, g));
    if (p.temperature !== 0) {
      const w = p.temperature / 100;
      apply(mDiag(1 + 0.22 * w, 1 + 0.03 * w, 1 - 0.25 * w));
    }
    if (p.tint !== 0) {
      const t = p.tint / 100;
      apply(mDiag(1 + 0.08 * t, 1 - 0.16 * t, 1 + 0.08 * t));
    }
    if (p.brightness !== 0) {
      const o = (p.brightness / 100) * 0.35;
      apply(mOff(o, o, o));
    }
    if (p.contrast !== 0) {
      const k = p.contrast >= 0 ? 1 + (p.contrast / 100) * 1.5 : 1 + p.contrast / 100;
      apply(mDiag(k, k, k));
      const o = 0.5 * (1 - k);
      apply(mOff(o, o, o));
    }
    const sat = (p.saturation / 100) * (1 + (d.sat || 0));
    if (sat !== 1) apply(mSat(sat));
    if (p.mono > 0) apply(mSat(1 - p.mono / 100));
    if (p.hue !== 0) apply(mHue(p.hue));
    if (p.sepia > 0) apply(mSepia(p.sepia / 100));
    if (p.invert > 0) {
      const i = p.invert / 100;
      apply([1 - 2 * i, 0, 0, 0, i, 0, 1 - 2 * i, 0, 0, i, 0, 0, 1 - 2 * i, 0, i, 0, 0, 0, 1, 0]);
    }
    return M;
  }

  /* Tone curve (per channel look-up) ---------------------------------- */
  function needTone(p) {
    return p.highlights !== 0 || p.shadows !== 0 || p.whites !== 0 || p.blacks !== 0 || p.gamma !== 100 || p.stAmount > 0 || p.solarize > 0;
  }
  const TONE_N = 65;
  function toneTable(p, c) {
    const bp = (-p.blacks / 100) * 0.12;
    const wp = 1 - (p.whites / 100) * 0.12;
    const g = p.gamma / 100;
    const sh = p.shadows / 100, hi = p.highlights / 100, A = p.stAmount / 100, sol = p.solarize / 100;
    const sc = hex2rgb(p.stShadow)[c] - 0.5;
    const hc = hex2rgb(p.stHigh)[c] - 0.5;
    const out = [];
    for (let i = 0; i < TONE_N; i++) {
      let x = i / (TONE_N - 1);
      x = clamp((x - bp) / (wp - bp), 0, 1);
      x = Math.pow(x, 1 / g);
      x += sh * 0.65 * 2.6 * x * (1 - x) * (1 - x);
      x += hi * 0.65 * 2.6 * x * x * (1 - x);
      x = clamp(x, 0, 1);
      if (A > 0) x += A * 0.5 * (sc * (1 - x) * (1 - x) + hc * x * x);
      x = clamp(x, 0, 1);
      if (sol > 0) x = lerp(x, 1 - Math.abs(2 * x - 1), sol);
      out.push(f4(clamp(x, 0, 1)));
    }
    return out.join(" ");
  }

  /* ------------------------------------------------------------------ */
  /* Displacement-map fields (lens / bulge / swirl / radial)             */
  /* ------------------------------------------------------------------ */
  const MAP_W = 128, MAP_H = 72;
  function fieldVec(kind, k, u, v) {
    const r2 = u * u + v * v;
    if (kind === "lens") return [k * r2 * u, k * r2 * v];
    if (kind === "bulge") {
      const R = 0.8, r = Math.sqrt(r2);
      if (r >= R) return [0, 0];
      const t = 1 - (r / R) * (r / R);
      return [-k * t * t * u * 0.9, -k * t * t * v * 0.9];
    }
    if (kind === "swirl") {
      const R = 0.95, r = Math.sqrt(r2);
      if (r >= R) return [0, 0];
      const a = k * Math.PI * 1.6 * Math.pow(1 - r / R, 2);
      const ca = Math.cos(a), sa = Math.sin(a);
      return [u * ca - v * sa - u, u * sa + v * ca - v];
    }
    return [u, v]; // "radial": plain outward vector (used for lens-style chromatic aberration)
  }
  // hw = height / width of the picture. Returns { rgba, maxN } (maxN in width-normalised units)
  function makeField(kind, k, hw) {
    const rgba = new Uint8ClampedArray(MAP_W * MAP_H * 4);
    const du = new Float32Array(MAP_W * MAP_H), dv = new Float32Array(MAP_W * MAP_H);
    let maxN = 1e-9;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const u = (x / (MAP_W - 1)) * 2 - 1;
        const v = ((y / (MAP_H - 1)) * 2 - 1) * hw;
        const [a, b] = fieldVec(kind, k, u, v);
        const i = y * MAP_W + x;
        du[i] = a; dv[i] = b;
        maxN = Math.max(maxN, Math.abs(a), Math.abs(b));
      }
    }
    if (kind === "radial") maxN = 1;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      rgba[i * 4] = Math.round(clamp(0.5 + (0.5 * du[i]) / maxN, 0, 1) * 255);
      rgba[i * 4 + 1] = Math.round(clamp(0.5 + (0.5 * dv[i]) / maxN, 0, 1) * 255);
      rgba[i * 4 + 2] = 128;
      rgba[i * 4 + 3] = 255;
    }
    return { rgba, maxN };
  }

  /* ------------------------------------------------------------------ */
  /* Plan: which parts of the graph are needed for these parameters      */
  /* ------------------------------------------------------------------ */
  function plan(p) {
    const f = {
      warp: p.warpMode !== "off" && p.warpAmt !== 0,
      wave: p.wave > 0,
      glitch: p.glitch > 0 || (p.reactOn && p.reactGlitch),
      pixel: p.pixelate >= 2,
      tilt: p.tilt !== "off",
      blur: p.blur > 0,
      sharpen: p.sharpen > 0,
      clarity: p.clarity > 0,
      pop: p.popColor !== "off",
      cm: needCM(p),
      tone: needTone(p),
      posterize: p.posterize >= 2,
      gmap: p.gmap !== "off" && p.gmapAmt > 0 && !!gmapStops(p),
      outline: p.outline !== "off" && p.outlineAmt > 0,
      bloom: p.bloom > 0,
      chroma: p.chroma > 0 || (p.reactOn && p.reactChroma),
      grain: p.grain > 0,
      vig: p.vignette > 0,
      scan: p.scan > 0,
    };
    f.any = Object.keys(f).some((k) => f[k]);
    return f;
  }
  function needsFilter(p) {
    return !!p.on && plan(p).any;
  }
  function cropActive(p) {
    return p.crop === "aspect" || (p.crop === "manual" && (p.cropT > 0 || p.cropB > 0 || p.cropL > 0 || p.cropR > 0));
  }
  // Any geometry change at all (flip, rotate, straighten, forced shape, crop, sound zoom)?
  function needsTransform(p) {
    return (
      !!p.on &&
      (p.flipH || p.flipV || p.rotate !== 0 || p.straighten !== 0 || p.aspect !== "auto" || cropActive(p) || (p.reactOn && p.reactZoom))
    );
  }
  // Does anything in the graph change from frame to frame?
  function needsAnim(p) {
    return !!p.on && (p.grain > 0 || p.glitch > 0 || p.wave > 0 || p.autoLevels || p.autoWB || (p.reactOn && (p.reactBright || p.reactSat || p.reactChroma || p.reactZoom || p.reactGlitch)));
  }
  function activeCount(p, keys) {
    let n = 0;
    for (const k of keys) if (p[k] !== DEFAULTS[k]) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry                                                            */
  /* ------------------------------------------------------------------ */
  /*
   * Crop works on the real frame, never on the player box:
   *   - the crop window is described as fractions of the frame (insets)
   *   - the browser then shows that window with the player's own "Video fit" (object-fit),
   *     so Fit keeps the shape, Fill covers the player and Stretch is the only mode that distorts.
   */
  function cropInsets(p, vw, vh) {
    if (p.crop === "manual") {
      if (!(p.cropT > 0 || p.cropB > 0 || p.cropL > 0 || p.cropR > 0)) return null;
      return { l: p.cropL / 100, r: p.cropR / 100, t: p.cropT / 100, b: p.cropB / 100 };
    }
    if (p.crop !== "aspect" || !(vw > 0 && vh > 0)) return null;
    const Af = vw / vh, At = p.cropRatio, pos = p.cropPos / 100;
    if (Math.abs(At - Af) < 0.002) return null;
    if (At < Af) {
      const free = 1 - At / Af, l = free * pos; // trim the sides
      return { l, r: free - l, t: 0, b: 0 };
    }
    const free = 1 - Af / At, t = free * pos; // trim top and bottom
    return { l: 0, r: 0, t, b: free - t };
  }
  function windowDims(vw, vh, ins) {
    const l = ins ? ins.l : 0, r = ins ? ins.r : 0, t = ins ? ins.t : 0, b = ins ? ins.b : 0;
    return { w: vw * (1 - l - r), h: vh * (1 - t - b) };
  }
  // Size the picture is drawn at inside a box for object-fit contain / cover / fill (cover may overflow the box)
  function displayDims(bw, bh, ww, wh, fit) {
    if (fit === "fill") return { w: bw, h: bh };
    const s = fit === "cover" ? Math.max(bw / ww, bh / wh) : Math.min(bw / ww, bh / wh);
    return { w: ww * s, h: wh * s };
  }
  // Where the visible picture sits inside the box (used for letter-box masks, vignette, tilt-shift...)
  function pictureRect(bw, bh, vw, vh, fit, ins) {
    if (!(bw > 0 && bh > 0)) return { x: 0, y: 0, w: Math.max(bw, 0), h: Math.max(bh, 0) };
    if (!(vw > 0 && vh > 0) || fit === "fill" || fit === "cover") return { x: 0, y: 0, w: bw, h: bh };
    const wd = windowDims(vw, vh, ins);
    const d = displayDims(bw, bh, wd.w, wd.h, "contain");
    return { x: (bw - d.w) / 2, y: (bh - d.h) / 2, w: d.w, h: d.h };
  }

  const ASPECTS = { "16:9": 16 / 9, "4:3": 4 / 3, "21:9": 21 / 9, "2.35:1": 2.35, "1:1": 1 };

  // g: { bw, bh, vw, vh, fit }  ->  { viewBox, clip, transform }  (all "" when nothing is needed)
  function computeGeometry(p, g, zoomPulse) {
    const none = { viewBox: "", clip: "", transform: "" };
    const bw = g.bw, bh = g.bh, vw = g.vw, vh = g.vh, fit = g.fit || "contain";
    if (!(bw > 0 && bh > 0)) return none;
    const known = vw > 0 && vh > 0;
    const ins = known ? cropInsets(p, vw, vh) : null;
    const wd = known ? windowDims(vw, vh, ins) : { w: bw, h: bh };
    const dd = displayDims(bw, bh, wd.w, wd.h, fit);

    let viewBox = "", clip = "";
    if (ins) {
      const pc = (v) => f4(v * 100) + "%";
      viewBox = `inset(${pc(ins.t)} ${pc(ins.r)} ${pc(ins.b)} ${pc(ins.l)})`;
      // In Fit mode the browser keeps drawing frame content outside the window, so cut it off.
      if (fit === "contain") {
        const x = Math.max(0, (bw - dd.w) / 2), y = Math.max(0, (bh - dd.h) / 2);
        if (x > 0.5 || y > 0.5) clip = `inset(${f4(y)}px ${f4(x)}px ${f4(y)}px ${f4(x)}px)`;
      }
    }

    const quarter = p.rotate % 180 !== 0;
    const tw = quarter ? bh : bw, th = quarter ? bw : bh;
    let sx = 1;
    if (p.aspect !== "auto" && ASPECTS[p.aspect]) sx = ASPECTS[p.aspect] / (dd.w / dd.h);
    let kx = 1, ky = 1;
    if (quarter || sx !== 1) {
      const dwS = dd.w * sx;
      if (fit === "fill") {
        kx = (tw / dwS) * sx;
        ky = th / dd.h;
      } else {
        const f = fit === "cover" ? Math.max(tw / dwS, th / dd.h) : Math.min(tw / dwS, th / dd.h);
        kx = f * sx;
        ky = f;
      }
    }
    const phi = p.straighten / 10;
    let sS = 1;
    if (phi !== 0) {
      const preW = dd.w * kx, preH = dd.h * ky;
      const dW = quarter ? preH : preW, dH = quarter ? preW : preH;
      const pr = (Math.abs(phi) * Math.PI) / 180;
      sS = Math.cos(pr) + Math.sin(pr) * Math.max(dW / dH, dH / dW);
    }
    const S = sS * (1 + (zoomPulse || 0));
    const parts = [];
    if (p.flipH || p.flipV) parts.push(`scale(${p.flipH ? -1 : 1}, ${p.flipV ? -1 : 1})`);
    const totalRot = p.rotate + phi;
    if (totalRot !== 0) parts.push(`rotate(${f4(totalRot)}deg)`);
    if (Math.abs(S - 1) > 1e-4) parts.push(`scale(${f4(S)})`);
    if (Math.abs(kx - 1) > 1e-4 || Math.abs(ky - 1) > 1e-4) parts.push(Math.abs(kx - ky) < 1e-4 ? `scale(${f4(kx)})` : `scale(${f4(kx)}, ${f4(ky)})`);
    return { viewBox, clip, transform: parts.join(" ") };
  }

  /* ------------------------------------------------------------------ */
  /* Dynamic values                                                      */
  /* ------------------------------------------------------------------ */
  function dynStatic() {
    return { seed: 7, t: 0, bright: 0, sat: 0, chromaPx: 0, glAmt: 1, glSeed: 11, auto: null, zoom: 0 };
  }
  function waveParams(p, d, u) {
    const t = d.t || 0;
    const k = 1 / Math.max(u, 0.2);
    const fx = 0.0055 * k * (1 + 0.18 * Math.sin(t * 0.0007));
    const fy = 0.009 * k * (1 + 0.18 * Math.cos(t * 0.0009));
    return { bf: `${f6(fx)} ${f6(fy)}`, scale: (p.wave / 100) * 24 * u };
  }
  function glitchParams(p, d, u) {
    const inten = Math.max(p.glitch / 100, p.reactOn && p.reactGlitch ? (0.9 * p.reactAmt) / 100 : 0);
    const a = clamp(d.glAmt || 0, 0, 1) * inten;
    return { scale: a * 55 * u, split: a * 16 * u, seed: d.glSeed | 0 };
  }
  function chromaScales(p, d, u) {
    const base = (p.chroma / 100) * 14 * u + (d.chromaPx || 0) * u;
    return { r: 2 * base, b: -2 * base };
  }

  /* ------------------------------------------------------------------ */
  /* SVG filter builder                                                  */
  /* ------------------------------------------------------------------ */
  const svgUri = (s) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const attrs = (o) =>
    Object.keys(o)
      .filter((k) => o[k] !== undefined && o[k] !== null)
      .map((k) => ` ${k}="${esc(o[k])}"`)
      .join("");
  const SVG_HEAD = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${f4(w)}" height="${f4(h)}" viewBox="0 0 ${f4(w)} ${f4(h)}">`;

  function vignetteSvg(w, h, R, amt, size) {
    const inner = clamp(0.18 + 0.72 * (size / 100), 0.1, 0.95);
    const a = clamp(amt / 100, 0, 1) * 0.92;
    const mid = (inner + 1) / 2;
    return (
      SVG_HEAD(w, h) +
      `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.7071"><stop offset="${f4(inner)}" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="${f4(mid)}" stop-color="#000" stop-opacity="${f4(a * 0.28)}"/><stop offset="1" stop-color="#000" stop-opacity="${f4(a)}"/></radialGradient></defs>` +
      `<rect x="${f4(R.x)}" y="${f4(R.y)}" width="${f4(R.w)}" height="${f4(R.h)}" fill="url(#g)"/></svg>`
    );
  }
  function scanSvg(w, h, R, amt, gap) {
    const a = clamp(amt / 100, 0, 1) * 0.75;
    return (
      SVG_HEAD(w, h) +
      `<defs><pattern id="p" x="0" y="0" width="${f4(w)}" height="${f4(gap)}" patternUnits="userSpaceOnUse">` +
      `<rect x="0" y="${f4(gap / 2)}" width="${f4(w)}" height="${f4(gap / 2)}" fill="#000" fill-opacity="${f4(a)}"/></pattern></defs>` +
      `<rect x="0" y="${f4(R.y)}" width="${f4(w)}" height="${f4(R.h)}" fill="url(#p)"/></svg>`
    );
  }
  function tiltSvg(w, h, R, mode, pos, size) {
    const c = pos / 100, s = size / 100, f = Math.max(0.12, s * 0.9);
    let grad;
    if (mode === "linear") {
      const a = clamp(c - s / 2 - f, 0, 1), b = clamp(c - s / 2, 0, 1), cc = clamp(c + s / 2, 0, 1), d = clamp(c + s / 2 + f, 0, 1);
      grad =
        `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="${f4(R.y)}" x2="0" y2="${f4(R.y + R.h)}">` +
        `<stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset="${f4(a)}" stop-color="#000" stop-opacity="1"/>` +
        `<stop offset="${f4(b)}" stop-color="#000" stop-opacity="0"/><stop offset="${f4(cc)}" stop-color="#000" stop-opacity="0"/>` +
        `<stop offset="${f4(d)}" stop-color="#000" stop-opacity="1"/><stop offset="1" stop-color="#000" stop-opacity="1"/></linearGradient>`;
    } else {
      const r = (s + f) * 1.25;
      const k = clamp(s / (s + f), 0.05, 0.95);
      grad =
        `<radialGradient id="g" cx="0.5" cy="${f4(c)}" r="${f4(r)}">` +
        `<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="${f4(k)}" stop-color="#000" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="1"/></radialGradient>`;
    }
    return SVG_HEAD(w, h) + `<defs>${grad}</defs><rect x="${f4(R.x)}" y="${f4(R.y)}" width="${f4(R.w)}" height="${f4(R.h)}" fill="url(#g)"/></svg>`;
  }
  const maskSvg = (w, h, R) => SVG_HEAD(w, h) + `<rect x="${f4(R.x)}" y="${f4(R.y)}" width="${f4(R.w)}" height="${f4(R.h)}" fill="#fff"/></svg>`;

  const GRAY_M = "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0";
  const POP = {
    red: [1, -0.5, -0.5], yellow: [0.5, 0.5, -1], green: [-0.5, 1, -0.5],
    cyan: [-1, 0.5, 0.5], blue: [-0.5, -0.5, 1], magenta: [0.5, -1, 0.5],
  };
  const CH_ONLY = {
    r: "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
    g: "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
    b: "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0",
  };
  const mapCache = new Map();

  /*
   * o = {
   *   w, h        - CSS pixel size of the element the filter will be applied to
   *   rect        - { x, y, w, h } where the picture sits inside that box
   *   dyn         - dynamic values (see dynStatic)
   *   png(rgba,w,h) -> data URL   (injected so this file stays DOM-free)
   * }
   * returns { markup }  (inner XML of the <filter>)
   */
  function buildFilter(p, o) {
    const w = Math.max(1, o.w), h = Math.max(1, o.h);
    const R = o.rect || { x: 0, y: 0, w, h };
    const d = o.dyn || dynStatic();
    const F = plan(p);
    const u = Math.max(0.05, R.h / 1080);
    const out = [];
    let last = "SourceGraphic";
    let n = 0;
    const NOIN = { feFlood: 1, feImage: 1, feTurbulence: 1, feMerge: 1 };

    // Adds a primitive; unless keep=true it becomes the new "last" result.
    function P(tag, a, inner, keep) {
      a = Object.assign({}, a);
      const name = "r" + ++n;
      if (!NOIN[tag] && a.in === undefined) a.in = last;
      if (a.in === null) delete a.in;
      a.result = name;
      out.push(`<${tag}${attrs(a)}${inner ? `>${inner}</${tag}>` : "/>"}`);
      if (!keep) last = name;
      return name;
    }
    const funcs = (rgb, extra) => ["R", "G", "B"].map((c, i) => `<feFunc${c} ${extra(rgb ? rgb[i] : i)}/>`).join("");
    const image = (url, extra) =>
      P("feImage", Object.assign({ x: 0, y: 0, width: f4(w), height: f4(h), preserveAspectRatio: "none", href: url, "xlink:href": url }, extra), "", true);
    function field(kind, k, hw) {
      const key = `${kind}|${f4(k)}|${f4(hw)}`;
      let hit = mapCache.get(key);
      if (!hit) {
        const m = makeField(kind, k, hw);
        hit = { url: o.png(m.rgba, MAP_W, MAP_H), maxN: m.maxN };
        mapCache.set(key, hit);
        if (mapCache.size > 40) mapCache.delete(mapCache.keys().next().value);
      }
      return hit;
    }

    // 1. geometry -------------------------------------------------------
    if (F.warp) {
      const k = p.warpMode === "lens" ? (p.warpAmt / 100) * 0.55 : p.warpAmt / 100;
      const m = field(p.warpMode, k, R.h / R.w);
      const mp = image(m.url);
      P("feDisplacementMap", { in2: mp, scale: f4(m.maxN * w), xChannelSelector: "R", yChannelSelector: "G" });
    }
    if (F.wave) {
      const wp = waveParams(p, d, u);
      const tn = P("feTurbulence", { type: "fractalNoise", baseFrequency: wp.bf, numOctaves: 2, seed: 3, "data-fx": "wave" }, "", true);
      P("feDisplacementMap", { in2: tn, scale: f4(wp.scale), xChannelSelector: "R", yChannelSelector: "G", "data-fx": "waveD" });
    }
    if (F.glitch) {
      const gp = glitchParams(p, d, u);
      const tn = P("feTurbulence", { type: "fractalNoise", baseFrequency: `0.00001 ${f4(1 / (R.h * 0.045 + 1)) }`, numOctaves: 2, seed: gp.seed, "data-fx": "gl" }, "", true);
      const amp = P("feComponentTransfer", { in: tn }, `<feFuncR type="linear" slope="3" intercept="-1"/><feFuncG type="linear" slope="0" intercept="0.5"/>`, true);
      const qn = P("feComponentTransfer", { in: amp }, `<feFuncR type="discrete" tableValues="0 0.5 0.5 0.5 0.5 1"/>`, true);
      const src = last;
      P("feDisplacementMap", { in: src, in2: qn, scale: f4(gp.scale), xChannelSelector: "R", yChannelSelector: "G", "data-fx": "glD" });
      const mid = last;
      const rN = P("feColorMatrix", { in: mid, type: "matrix", values: CH_ONLY.r }, "", true);
      const gN = P("feColorMatrix", { in: mid, type: "matrix", values: CH_ONLY.g }, "", true);
      const bN = P("feColorMatrix", { in: mid, type: "matrix", values: CH_ONLY.b }, "", true);
      const rO = P("feOffset", { in: rN, dx: f4(-gp.split), dy: 0, "data-fx": "glR" }, "", true);
      const bO = P("feOffset", { in: bN, dx: f4(gp.split), dy: 0, "data-fx": "glB" }, "", true);
      const rg = P("feComposite", { in: rO, in2: gN, operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 }, "", true);
      P("feComposite", { in: rg, in2: bO, operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 });
    }
    if (F.pixel) {
      const s = Math.max(2, Math.round(p.pixelate / 2) * 2);
      const half = s / 2;
      const src = last;
      P("feFlood", { x: half - 1, y: half - 1, width: 2, height: 2, "flood-color": "#000" }, "", true);
      P("feComposite", { in: "r" + n, width: s, height: s }, "", true);
      const tile = P("feTile", { in: "r" + n }, "", true);
      P("feComposite", { in: src, in2: tile, operator: "in" });
      P("feMorphology", { operator: "dilate", radius: half });
    }
    if (F.tilt) {
      const src = last;
      const sd = Math.max(0.6, (p.tiltBlur / 100) * 14 * u);
      const bl = P("feGaussianBlur", { in: src, stdDeviation: f4(sd) }, "", true);
      const mk = image(svgUri(tiltSvg(w, h, R, p.tilt, p.tiltPos, p.tiltSize)));
      const mm = P("feComposite", { in: bl, in2: mk, operator: "in" }, "", true);
      P("feComposite", { in: mm, in2: src, operator: "over" });
    }
    if (F.blur) P("feGaussianBlur", { stdDeviation: f4(Math.max(0.1, (p.blur / 100) * 12 * u)) });

    // 2. detail ---------------------------------------------------------
    if (F.sharpen) {
      const a = (p.sharpen / 100) * 1.2;
      P("feConvolveMatrix", { order: 3, kernelMatrix: `0 ${f4(-a)} 0 ${f4(-a)} ${f4(1 + 4 * a)} ${f4(-a)} 0 ${f4(-a)} 0`, divisor: 1, bias: 0, edgeMode: "duplicate", preserveAlpha: "true" });
    }
    if (F.clarity) {
      const k = (p.clarity / 100) * 0.8;
      const src = last;
      const bl = P("feGaussianBlur", { in: src, stdDeviation: f4(Math.max(2, 12 * u)) }, "", true);
      P("feComposite", { in: src, in2: bl, operator: "arithmetic", k1: 0, k2: f4(1 + k), k3: f4(-k), k4: 0 });
    }

    // 3. colour ---------------------------------------------------------
    if (F.pop) {
      const src = last;
      const gray = P("feColorMatrix", { in: src, type: "matrix", values: GRAY_M }, "", true);
      const c = POP[p.popColor];
      const thr = 0.34 - 0.3 * (p.popTol / 100);
      const gain = 6;
      const keep = P(
        "feColorMatrix",
        { in: src, type: "matrix", values: `1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 ${f4(gain * c[0])} ${f4(gain * c[1])} ${f4(gain * c[2])} 0 ${f4(-gain * thr)}` },
        "",
        true
      );
      P("feMerge", {}, `<feMergeNode in="${gray}"/><feMergeNode in="${keep}"/>`);
    }
    if (F.cm) {
      P("feColorMatrix", { type: "matrix", values: composeMatrix(p, d).map(f4).join(" "), "data-fx": "cm" });
    }
    if (F.tone) {
      P("feComponentTransfer", {}, [0, 1, 2].map((c) => `<feFunc${"RGB"[c]} type="table" tableValues="${toneTable(p, c)}"/>`).join(""));
    }
    if (F.posterize) {
      const lv = Math.round(p.posterize);
      const tv = Array.from({ length: lv }, (_, i) => f4(i / (lv - 1))).join(" ");
      P("feComponentTransfer", {}, funcs(null, () => `type="discrete" tableValues="${tv}"`));
    }
    if (F.gmap) {
      const stops = gmapStops(p).map(hex2rgb);
      const src = last;
      P("feColorMatrix", { type: "matrix", values: GRAY_M });
      P("feComponentTransfer", {}, [0, 1, 2].map((c) => `<feFunc${"RGB"[c]} type="table" tableValues="${stops.map((s) => f4(s[c])).join(" ")}"/>`).join(""));
      const amt = p.gmapAmt / 100;
      if (amt < 0.995) P("feComposite", { in: last, in2: src, operator: "arithmetic", k1: 0, k2: f4(amt), k3: f4(1 - amt), k4: 0 });
    }
    if (F.outline) {
      const src = last;
      const amt = p.outlineAmt / 100;
      P("feColorMatrix", { type: "matrix", values: GRAY_M });
      if (p.outline === "emboss") {
        P("feConvolveMatrix", { order: 3, kernelMatrix: "-2 -1 0 -1 1 1 0 1 2", divisor: f4(1 / (0.6 + amt * 2.4)), bias: 0.5, edgeMode: "duplicate", preserveAlpha: "true" });
      } else {
        P("feConvolveMatrix", { order: 3, kernelMatrix: "-1 -1 -1 -1 8 -1 -1 -1 -1", divisor: 16, bias: 0.5, edgeMode: "duplicate", preserveAlpha: "true" });
        P("feComponentTransfer", {}, funcs(null, () => `type="table" tableValues="1 0 1"`));
        P("feComponentTransfer", {}, funcs(null, () => `type="linear" slope="${f4(2 + 14 * amt)}" intercept="0"`));
        const e = last;
        if (p.outline === "ink") {
          const inv = P("feColorMatrix", { in: e, type: "matrix", values: "-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0" }, "", true);
          P("feComposite", { in: src, in2: inv, operator: "arithmetic", k1: 1, k2: 0, k3: 0, k4: 0 });
        } else if (p.outline === "neon") {
          const nc = hex2rgb(p.neonColor);
          const col = P("feColorMatrix", { in: e, type: "matrix", values: `${f4(nc[0])} 0 0 0 0 ${f4(nc[1])} 0 0 0 0 ${f4(nc[2])} 0 0 0 0 0 0 0 1 0` }, "", true);
          const dim = P("feComponentTransfer", { in: src }, funcs(null, () => `type="linear" slope="0.35" intercept="0"`), true);
          P("feComposite", { in: dim, in2: col, operator: "arithmetic", k1: 0, k2: 1, k3: 1.2, k4: 0 });
        } // "edges": the grey edge map itself stays as the result
      }
    }

    // 4. glow -----------------------------------------------------------
    if (F.bloom) {
      const src = last;
      const t = p.bloomThr / 100;
      const slope = 1 / (1 - t);
      P("feComponentTransfer", {}, funcs(null, () => `type="linear" slope="${f4(slope)}" intercept="${f4(-slope * t)}"`));
      P("feGaussianBlur", { stdDeviation: f4(Math.max(0.5, p.bloomSize * u)) });
      P("feComposite", { in: src, in2: last, operator: "arithmetic", k1: 0, k2: 1, k3: f4((p.bloom / 100) * 1.6), k4: 0 });
    }

    // 5. lens colour fringing ------------------------------------------
    if (F.chroma) {
      const src = last;
      const m = field("radial", 1, R.h / R.w);
      const mp = image(m.url);
      const cs = chromaScales(p, d, u);
      const rN = P("feColorMatrix", { in: src, type: "matrix", values: CH_ONLY.r }, "", true);
      const gN = P("feColorMatrix", { in: src, type: "matrix", values: CH_ONLY.g }, "", true);
      const bN = P("feColorMatrix", { in: src, type: "matrix", values: CH_ONLY.b }, "", true);
      const rD = P("feDisplacementMap", { in: rN, in2: mp, scale: f4(cs.r), xChannelSelector: "R", yChannelSelector: "G", "data-fx": "chR" }, "", true);
      const bD = P("feDisplacementMap", { in: bN, in2: mp, scale: f4(cs.b), xChannelSelector: "R", yChannelSelector: "G", "data-fx": "chB" }, "", true);
      const rg = P("feComposite", { in: rD, in2: gN, operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 }, "", true);
      P("feComposite", { in: rg, in2: bD, operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 });
    }

    // 6. film / retro overlays -----------------------------------------
    if (F.grain) {
      const src = last;
      const fr = Math.min(0.95, 0.85 / p.grainSize);
      const nz = P("feTurbulence", { type: "fractalNoise", baseFrequency: f4(fr), numOctaves: 1, seed: d.seed | 0, "data-fx": "grain" }, "", true);
      const gn = P("feColorMatrix", { in: nz, type: "matrix", values: "0.733 0.733 0.733 0 -0.6 0.733 0.733 0.733 0 -0.6 0.733 0.733 0.733 0 -0.6 0 0 0 0 1" }, "", true);
      const a = (p.grain / 100) * 0.5;
      P("feComposite", { in: src, in2: gn, operator: "arithmetic", k1: 0, k2: 1, k3: f4(a), k4: f4(-a / 2) });
    }
    if (F.vig) {
      const img = image(svgUri(vignetteSvg(w, h, R, p.vignette, p.vigSize)));
      P("feComposite", { in: img, in2: last, operator: "over" });
    }
    if (F.scan) {
      const gap = Math.max(2, Math.round([2, 3, 5][p.scanSize] * Math.max(1, Math.round(R.h / 720))));
      const img = image(svgUri(scanSvg(w, h, R, p.scan, gap)));
      P("feComposite", { in: img, in2: last, operator: "over" });
    }

    // 7. keep letter-box bars untouched ---------------------------------
    const bars = R.w < w - 1.5 || R.h < h - 1.5 || R.x > 1.5 || R.y > 1.5;
    if (bars && F.any) {
      const res = last;
      const mk = image(svgUri(maskSvg(w, h, R)));
      const mm = P("feComposite", { in: res, in2: mk, operator: "in" }, "", true);
      P("feComposite", { in: mm, in2: "SourceGraphic", operator: "over" });
    }
    return { markup: out.join("") };
  }

  // Update the values that change every frame, in place (no rebuild).
  function applyDyn(filterEl, p, d, geom) {
    if (!filterEl) return;
    const u = Math.max(0.05, geom.rect.h / 1080);
    const q = (r) => filterEl.querySelector(`[data-fx="${r}"]`);
    const set = (el, k, v) => {
      if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, v);
    };
    let el = q("cm");
    if (el) set(el, "values", composeMatrix(p, d).map(f4).join(" "));
    el = q("grain");
    if (el) set(el, "seed", d.seed | 0);
    el = q("wave");
    if (el) set(el, "baseFrequency", waveParams(p, d, u).bf);
    const gp = glitchParams(p, d, u);
    el = q("gl"); if (el) set(el, "seed", gp.seed);
    el = q("glD"); if (el) set(el, "scale", f4(gp.scale));
    el = q("glR"); if (el) set(el, "dx", f4(-gp.split));
    el = q("glB"); if (el) set(el, "dx", f4(gp.split));
    const cs = chromaScales(p, d, u);
    el = q("chR"); if (el) set(el, "scale", f4(cs.r));
    el = q("chB"); if (el) set(el, "scale", f4(cs.b));
  }

  /* ------------------------------------------------------------------ */
  /* Frame analysis                                                      */
  /* ------------------------------------------------------------------ */
  // rgba: Uint8ClampedArray of a small frame. Returns { gain:[r,g,b], off:[r,g,b] }
  function autoFromStats(rgba, p) {
    const n = rgba.length / 4;
    const hist = new Uint32Array(256);
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      sr += r; sg += g; sb += b;
      hist[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
    }
    const mr = sr / n / 255, mg = sg / n / 255, mb = sb / n / 255;
    const meanL = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
    const ident = { gain: [1, 1, 1], off: [0, 0, 0] };
    if (meanL < 0.03) return ident;
    const pct = (q) => {
      let acc = 0;
      const target = q * n;
      for (let i = 0; i < 256; i++) {
        acc += hist[i];
        if (acc >= target) return i / 255;
      }
      return 1;
    };
    const a = p.autoAmt / 100;
    let gainL = 1, offL = 0;
    if (p.autoLevels) {
      const lo = Math.min(pct(0.015), 0.25), hi = Math.max(pct(0.985), lo + 0.25);
      gainL = clamp(1 / (hi - lo), 1, 1.7);
      offL = -lo * gainL;
    }
    let gw = [1, 1, 1];
    if (p.autoWB) {
      const m = (mr + mg + mb) / 3;
      gw = [clamp(m / Math.max(mr, 0.02), 0.8, 1.25), clamp(m / Math.max(mg, 0.02), 0.8, 1.25), clamp(m / Math.max(mb, 0.02), 0.8, 1.25)];
    }
    return {
      gain: gw.map((g) => lerp(1, gainL * g, a)),
      off: [offL, offL, offL].map((o) => lerp(0, o, a)),
    };
  }

  // Finds black bars. Returns percentages of the frame to crop, plus whether the frame was too dark to tell.
  function detectBars(rgba, w, h) {
    const lum = (i) => (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    const rowDark = (y) => {
      let s = 0, m = 0;
      for (let x = 0; x < w; x++) {
        const l = lum((y * w + x) * 4);
        s += l; if (l > m) m = l;
      }
      return s / w < 0.045 && m < 0.2;
    };
    const colDark = (x) => {
      let s = 0, m = 0;
      for (let y = 0; y < h; y++) {
        const l = lum((y * w + x) * 4);
        s += l; if (l > m) m = l;
      }
      return s / h < 0.045 && m < 0.2;
    };
    let t = 0, b = 0, l = 0, r = 0;
    while (t < h && rowDark(t)) t++;
    if (t >= h) return { t: 0, b: 0, l: 0, r: 0, dark: true };
    while (b < h - t && rowDark(h - 1 - b)) b++;
    while (l < w && colDark(l)) l++;
    while (r < w - l && colDark(w - 1 - r)) r++;
    const pc = (v, total) => clamp(Math.floor(((v / total) * 100 - 0.3) * 2) / 2, 0, 40);
    return { t: pc(t, h), b: pc(b, h), l: pc(l, w), r: pc(r, w), dark: false };
  }

  const api = {
    DEFAULTS, ENUMS, RANGES, LOOKS, LOOK_KEYS, TRANSFORM_KEYS, GMAPS, ASPECTS,
    clamp, lerp, f4, sanitize, applyLook, hex2rgb, gmapStops,
    composeMatrix, toneTable, plan, needsFilter, needsTransform, needsAnim, activeCount,
    pictureRect, cropInsets, cropActive, computeGeometry, buildFilter, applyDyn, dynStatic,
    autoFromStats, detectBars, makeField, svgUri,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FXCore = api;
})(typeof window !== "undefined" ? window : globalThis);
