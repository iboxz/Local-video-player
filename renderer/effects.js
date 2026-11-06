/* effects.js
 * Runtime + UI for real-time video effects.
 *
 *  - Effects are applied live to the playing <video> through one SVG filter (CSS `filter:url(#fx-main)`).
 *    Nothing is pre-rendered and nothing is drawn on top of the video: no overlay, no extra canvas over it.
 *  - When all effects are neutral (or switched off) the video gets no filter at all, so the picture stays
 *    on the player's normal path (RTX enhancement behaves exactly as before).
 *  - While a filter is active, Chromium cannot hand the frame to the hardware overlay, so RTX enhancement
 *    pauses until effects are reset / switched off. The UI says so.
 */
(function () {
  "use strict";
  const C = window.FXCore;
  if (!C) return;

  const $ = (s, r) => (r || document).querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const D = C.DEFAULTS;

  let ctx = null; // bound by renderer.js
  let S = C.sanitize(null);
  let bypass = false; // "hold V to compare"
  let filterActive = false;
  const dyn = { seed: 1, t: 0, bright: 0, sat: 0, chromaPx: 0, glAmt: 0, glSeed: 1, auto: null, zoom: 0 };

  /* ------------------------------------------------------------------ */
  /* SVG plumbing                                                        */
  /* ------------------------------------------------------------------ */
  const defsSvg = document.createElementNS(NS, "svg");
  defsSvg.setAttribute("width", "0");
  defsSvg.setAttribute("height", "0");
  defsSvg.setAttribute("aria-hidden", "true");
  defsSvg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  const defs = document.createElementNS(NS, "defs");
  defsSvg.appendChild(defs);
  document.body.appendChild(defsSvg);

  function getFilter(id) {
    let f = defs.querySelector("#" + id);
    if (!f) {
      f = document.createElementNS(NS, "filter");
      f.setAttribute("id", id);
      f.setAttribute("x", "0");
      f.setAttribute("y", "0");
      f.setAttribute("width", "1");
      f.setAttribute("height", "1");
      f.setAttribute("color-interpolation-filters", "sRGB");
      defs.appendChild(f);
    }
    return f;
  }
  function png(rgba, w, h) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    cv.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
    return cv.toDataURL("image/png");
  }
  const mainF = getFilter("fx-main");
  const prevF = getFilter("fx-prev");

  /* ------------------------------------------------------------------ */
  /* Main video                                                          */
  /* ------------------------------------------------------------------ */
  let fitMode = "contain";
  const OVB = !!(window.CSS && CSS.supports && CSS.supports("object-view-box", "inset(0)"));
  let boxAspect = 16 / 9; // shape of the real player area, so the preview can mimic it
  // Everything the geometry needs for one element: box size, source frame size, the player's fit mode
  function mkGeom(bw, bh, vw, vh) {
    const ins = !bypass && S.on && OVB ? C.cropInsets(S, vw, vh) : null;
    return { bw, bh, vw, vh, fit: fitMode, rect: C.pictureRect(bw, bh, vw, vh, fitMode, ins) };
  }
  function geom() {
    const v = ctx.video;
    return mkGeom(v.clientWidth, v.clientHeight, v.videoWidth, v.videoHeight);
  }
  // Sets crop (native object-view-box), flip/rotate/straighten/shape (transform) on an element.
  function setGeometry(el, g, zoom) {
    const on = !bypass && C.needsTransform(S);
    const t = on ? C.computeGeometry(S, g, zoom) : { viewBox: "", clip: "", transform: "" };
    const vb = OVB ? t.viewBox : "";
    if (el.style.transform !== t.transform) el.style.transform = t.transform;
    if (el.style.clipPath !== t.clip) el.style.clipPath = t.clip;
    if (el.style.getPropertyValue("object-view-box") !== vb) el.style.setProperty("object-view-box", vb);
  }
  function applyTransform(g) {
    setGeometry(ctx.video, g || geom(), dyn.zoom);
  }
  function update(silent) {
    if (!ctx) return false;
    const v = ctx.video;
    try { fitMode = getComputedStyle(v).objectFit || "contain"; } catch (_) {}
    if (v.clientWidth > 0 && v.clientHeight > 0) boxAspect = v.clientWidth / v.clientHeight;
    const g = geom();
    const use = !bypass && C.needsFilter(S) && g.bw > 0 && g.bh > 0;
    if (use) {
      mainF.innerHTML = C.buildFilter(S, { w: g.bw, h: g.bh, rect: g.rect, dyn, png }).markup;
      if (v.style.filter !== "url(#fx-main)") v.style.filter = "url(#fx-main)";
    } else {
      const base = ctx.rtxOn() ? "" : "brightness(1.001)";
      if (v.style.filter !== base) v.style.filter = base;
      if (mainF.firstChild) mainF.innerHTML = "";
    }
    applyTransform(g);
    filterActive = use;
    chrome();
    if (!silent) ctx.onState(use);
    kick();
    return use;
  }
  let updRaf = 0;
  function scheduleUpdate() {
    if (updRaf) return;
    updRaf = requestAnimationFrame(() => {
      updRaf = 0;
      update();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame loop: grain / glitch / wave / audio-reactive / auto       */
  /* ------------------------------------------------------------------ */
  const BANDS = { bass: [40, 160], mid: [400, 2500], treble: [4000, 12000], full: [40, 12000] };
  let bins = null, peak = 0.12, env = 0, raf = 0, glState = { until: 0, next: 0 }, lastGlSeed = 0;

  function audioLevel() {
    const an = ctx.getAnalyser && ctx.getAnalyser();
    if (!an) return 0;
    if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bins);
    const binHz = an.context.sampleRate / an.fftSize;
    const band = BANDS[S.reactBand] || BANDS.bass;
    const a = Math.max(1, Math.floor(band[0] / binHz)), b = Math.min(bins.length - 1, Math.ceil(band[1] / binHz));
    let sum = 0;
    for (let i = a; i <= b; i++) sum += bins[i];
    return sum / ((b - a + 1) * 255);
  }
  function loopNeeded() {
    const v = ctx && ctx.video;
    return !!v && S.on && !bypass && C.needsAnim(S) && v.readyState >= 2 && !v.paused && !v.ended;
  }
  function kick() {
    if (!raf && loopNeeded()) raf = requestAnimationFrame(tick);
  }
  function step(ts) {
    dyn.t = ts;
    if (S.grain > 0) dyn.seed = ((ts / 42) | 0) % 997 + 1;
    // audio envelope
    if (S.reactOn) {
      const level = audioLevel();
      peak = Math.max(peak * 0.998, level, 0.12);
      const n = Math.pow(Math.min(1, level / peak), 2);
      env = n > env ? env + (n - env) * 0.6 : env + (n - env) * 0.12;
    } else env = 0;
    const a = S.reactAmt / 100;
    dyn.bright = S.reactOn && S.reactBright ? a * 0.45 * env : 0;
    dyn.sat = S.reactOn && S.reactSat ? a * 0.9 * env : 0;
    dyn.chromaPx = S.reactOn && S.reactChroma ? a * 10 * env : 0;
    dyn.zoom = S.reactOn && S.reactZoom ? a * 0.05 * env : 0;
    // glitch
    let gl = 0;
    if (S.glitch > 0) {
      if (S.glitchMode === "constant") gl = 1;
      else {
        if (ts >= glState.next) {
          glState.until = ts + 90 + Math.random() * 220;
          glState.next = glState.until + (500 + Math.random() * 2200) * (1.3 - (S.glitch / 100) * 0.9);
        }
        gl = ts < glState.until ? 1 : 0;
      }
    }
    if (S.reactOn && S.reactGlitch) gl = Math.max(gl, Math.min(1, Math.max(0, (env - 0.5) * 2.2)));
    dyn.glAmt = gl;
    if (gl > 0 && ts - lastGlSeed > 55) {
      dyn.glSeed = (Math.random() * 9999) | 0;
      lastGlSeed = ts;
    }
    // smooth the auto-adjust towards its latest measurement
    if (autoTarget) {
      if (!dyn.auto) dyn.auto = { gain: autoTarget.gain.slice(), off: autoTarget.off.slice() };
      for (let i = 0; i < 3; i++) {
        dyn.auto.gain[i] += (autoTarget.gain[i] - dyn.auto.gain[i]) * 0.08;
        dyn.auto.off[i] += (autoTarget.off[i] - dyn.auto.off[i]) * 0.08;
      }
    }
  }
  function tick(ts) {
    raf = 0;
    if (!loopNeeded()) return;
    step(ts);
    const g = geom();
    C.applyDyn(mainF, S, dyn, g);
    if (S.reactOn && S.reactZoom) applyTransform(g);
    if (previewVisible()) {
      const pg = previewGeom();
      if (pg) C.applyDyn(prevF, S, dyn, pg);
      if (meterEl) meterEl.style.width = Math.round(env * 100) + "%";
    }
    raf = requestAnimationFrame(tick);
  }

  // Smart auto-adjust: samples a tiny copy of the raw frame a few times a second.
  let autoTarget = null, autoTimer = 0;
  const autoCv = document.createElement("canvas");
  autoCv.width = 64;
  autoCv.height = 36;
  const autoG = autoCv.getContext("2d", { willReadFrequently: true });
  function autoSample() {
    const v = ctx && ctx.video;
    if (!v || !S.on || !(S.autoLevels || S.autoWB) || v.paused || v.readyState < 2 || !v.videoWidth) return;
    try {
      autoG.drawImage(v, 0, 0, 64, 36);
      autoTarget = C.autoFromStats(autoG.getImageData(0, 0, 64, 36).data, S);
    } catch (_) {}
  }
  function syncAutoTimer() {
    const need = S.on && (S.autoLevels || S.autoWB);
    if (need && !autoTimer) autoTimer = setInterval(autoSample, 280);
    if (!need && autoTimer) {
      clearInterval(autoTimer);
      autoTimer = 0;
      autoTarget = null;
      dyn.auto = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Preview + looks                                                     */
  /* ------------------------------------------------------------------ */
  let panel = null, view = null, cvBefore = null, cvAfter = null, badge = null, meterEl = null;
  let viewMode = "after", splitPos = 50, thumbsDirty = true, wasVisible = false;
  const lookCards = []; // {look, btn, cv}
  const baseCv = document.createElement("canvas");
  baseCv.width = 288;
  baseCv.height = 162;
  let sampleBase = null;

  function hasVideo() {
    const v = ctx && ctx.video;
    return !!v && v.readyState >= 2 && v.videoWidth > 0;
  }
  function previewVisible() {
    return !!panel && !panel.classList.contains("hidden") && panel.offsetParent !== null;
  }
  // The preview is a miniature of the player: same box shape, same fit mode, same crop / flip / filter.
  function previewGeom() {
    if (!view || !view.clientWidth || !view.clientHeight) return null;
    return mkGeom(view.clientWidth, view.clientHeight, cvAfter.width, cvAfter.height);
  }
  function drawSample(g, w, h) {
    let gr = g.createLinearGradient(0, 0, 0, h * 0.62);
    gr.addColorStop(0, "#1c3f7a");
    gr.addColorStop(0.55, "#6f7fb8");
    gr.addColorStop(1, "#f0a868");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h * 0.62);
    gr = g.createRadialGradient(w * 0.72, h * 0.42, 2, w * 0.72, h * 0.42, h * 0.3);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(0.25, "rgba(255,236,190,0.95)");
    gr.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h * 0.7);
    g.fillStyle = "#1f4b52";
    g.beginPath();
    g.moveTo(0, h * 0.62); g.lineTo(w * 0.16, h * 0.4); g.lineTo(w * 0.3, h * 0.54); g.lineTo(w * 0.47, h * 0.34); g.lineTo(w * 0.66, h * 0.58); g.lineTo(w * 0.82, h * 0.46); g.lineTo(w, h * 0.6); g.lineTo(w, h * 0.64); g.lineTo(0, h * 0.64);
    g.fill();
    g.fillStyle = "#14343a";
    g.beginPath();
    g.moveTo(0, h * 0.64); g.lineTo(w * 0.22, h * 0.5); g.lineTo(w * 0.4, h * 0.62); g.lineTo(w * 0.58, h * 0.52); g.lineTo(w * 0.8, h * 0.64); g.lineTo(0, h * 0.66);
    g.fill();
    gr = g.createLinearGradient(0, h * 0.62, 0, h * 0.9);
    gr.addColorStop(0, "#2a6f8a");
    gr.addColorStop(1, "#0d2c3d");
    g.fillStyle = gr;
    g.fillRect(0, h * 0.64, w, h * 0.26);
    g.fillStyle = "rgba(255,225,170,0.55)";
    for (let i = 0; i < 7; i++) g.fillRect(w * (0.7 - i * 0.004) - i * 6, h * (0.66 + i * 0.03), w * 0.08 + i * 12, h * 0.008);
    g.fillStyle = "#d9a07a"; g.beginPath(); g.arc(w * 0.28, h * 0.58, h * 0.07, 0, 7); g.fill();
    g.fillStyle = "#c83a2e"; g.fillRect(w * 0.28 - h * 0.09, h * 0.65, h * 0.18, h * 0.16);
    g.fillStyle = "#3aa655"; g.beginPath(); g.ellipse(w * 0.1, h * 0.76, w * 0.05, h * 0.11, -0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(w * 0.14, h * 0.77, w * 0.04, h * 0.09, 0.5, 0, 7); g.fill();
    g.fillStyle = "#ffd23a"; g.beginPath(); g.arc(w * 0.45, h * 0.8, h * 0.05, 0, 7); g.fill();
    g.fillStyle = "#2b6fff"; g.fillRect(w * 0.52, h * 0.76, h * 0.09, h * 0.09);
    const bars = ["#ffffff", "#ffe600", "#00e5ff", "#12d12a", "#ff2bd6", "#ff2a1f", "#2447ff", "#000000"];
    bars.forEach((c, i) => { g.fillStyle = c; g.fillRect((w / bars.length) * i, h * 0.92, w / bars.length + 1, h * 0.08); });
    for (let i = 0; i < 16; i++) { const v = Math.round((i / 15) * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect((w * 0.62 / 16) * i + w * 0.36, h * 0.9, w * 0.62 / 16 + 1, h * 0.02); }
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = `700 ${Math.round(h * 0.07)}px sans-serif`;
    g.fillText("SAMPLE", w * 0.04, h * 0.14);
  }
  function drawBase() {
    const g = baseCv.getContext("2d");
    if (hasVideo()) {
      try {
        const ar = ctx.video.videoWidth / ctx.video.videoHeight;
        baseCv.height = Math.max(1, Math.round(baseCv.width / ar));
        g.drawImage(ctx.video, 0, 0, baseCv.width, baseCv.height);
        return true;
      } catch (_) {}
    }
    baseCv.height = 162;
    if (!sampleBase) {
      sampleBase = document.createElement("canvas");
      sampleBase.width = 288; sampleBase.height = 162;
      drawSample(sampleBase.getContext("2d"), 288, 162);
    }
    g.drawImage(sampleBase, 0, 0);
    return false;
  }
  function paintPreview() {
    if (!view || !previewVisible()) return;
    const live = drawBase();
    const ar = baseCv.width / baseCv.height;
    view.style.setProperty("--fx-box-ar", String(boxAspect));
    view.style.setProperty("--fx-fit", fitMode);
    const w = 640, h = Math.max(1, Math.round(640 / ar));
    for (const cv of [cvBefore, cvAfter]) {
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cv.getContext("2d").drawImage(baseCv, 0, 0, w, h);
    }
    badge.textContent = live ? "Live frame" : "Sample scene";
    applyPreview();
  }
  let pvKey = "";
  function applyPreview() {
    const sv = bypass;
    bypass = false; // the preview always shows the effect; V only compares the real video
    try {
      const g = previewGeom();
      if (!g) return;
      const use = C.needsFilter(S);
      cvAfter.style.filter = use ? "url(#fx-prev)" : "none";
      setGeometry(cvAfter, g, 0);
      if (!use) { prevF.innerHTML = ""; pvKey = ""; return; }
      const key = JSON.stringify(S) + "|" + g.bw + "x" + g.bh + "|" + g.vw + "x" + g.vh + "|" + fitMode;
      if (key === pvKey) return;
      pvKey = key;
      prevF.innerHTML = C.buildFilter(S, { w: g.bw, h: g.bh, rect: g.rect, dyn: previewDyn(), png }).markup;
    } finally {
      bypass = sv;
    }
  }
  const previewDyn = () => Object.assign({}, dyn, { glAmt: dyn.glAmt || (S.glitch > 0 ? 1 : 0), glSeed: dyn.glSeed || 11 });
  function updatePreview() {
    pvKey = "";
    if (previewVisible()) applyPreview();
  }

  function buildLooks(host) {
    C.LOOKS.forEach((look) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fx-look";
      btn.dataset.id = look.id;
      btn.innerHTML = `<span class="fx-look-img"><canvas width="144" height="81"></canvas></span><b>${look.name}</b>`;
      const cv = btn.querySelector("canvas");
      const f = getFilter("fx-look-" + look.id);
      const p = C.applyLook(D, look);
      p.on = true;
      if (C.needsFilter(p)) {
        f.innerHTML = C.buildFilter(p, { w: 144, h: 81, rect: { x: 0, y: 0, w: 144, h: 81 }, dyn: C.dynStatic(), png }).markup;
        cv.style.filter = `url(#fx-look-${look.id})`;
      }
      btn.addEventListener("click", () => {
        const keep = S.on;
        S = C.applyLook(S, look);
        S.on = true;
        if (!keep) S.on = true;
        commit(true);
        if (ctx.osd) ctx.osd(look.id === "none" ? "Effects reset" : "Look: " + look.name);
      });
      host.appendChild(btn);
      lookCards.push({ look, btn, cv });
    });
  }
  function refreshThumbs() {
    thumbsDirty = false;
    drawBase();
    for (const c of lookCards) {
      const g = c.cv.getContext("2d");
      g.drawImage(baseCv, 0, 0, c.cv.width, c.cv.height);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Settings UI                                                         */
  /* ------------------------------------------------------------------ */
  const sgn = (n) => (n > 0 ? "+" : "") + n;
  const R = (k, label, min, max, step, o) => Object.assign({ t: "range", k, label, min, max, step }, o);
  const SEG = (k, label, opts, o) => Object.assign({ t: "seg", k, label, opts }, o);
  const TG = (k, label, hint, o) => Object.assign({ t: "toggle", k, label, hint }, o);
  const COL = (k, label, o) => Object.assign({ t: "color", k, label }, o);
  const CHIPS = (k, label, opts, o) => Object.assign({ t: "chips", k, label, opts }, o);
  const MULTI = (label, items, o) => Object.assign({ t: "multi", label, items }, o);

  const gradCss = (id) => `linear-gradient(90deg,${(C.GMAPS[id] || []).join(",")})`;
  const POPCOL = { off: "transparent", red: "#ff3b30", yellow: "#ffd60a", green: "#34c759", cyan: "#32d4ff", blue: "#2f6bff", magenta: "#ff2bd6" };

  const CARDS = [
    {
      id: "light", title: "Light", sub: "Exposure, contrast and tone", open: true,
      rows: [
        R("exposure", "Exposure", -200, 200, 1, { fmt: (v) => sgn((v / 100).toFixed(2)) + " EV" }),
        R("brightness", "Brightness", -100, 100, 1, { fmt: sgn }),
        R("contrast", "Contrast", -100, 100, 1, { fmt: sgn }),
        R("highlights", "Highlights", -100, 100, 1, { fmt: sgn, hint: "Negative recovers blown-out areas." }),
        R("shadows", "Shadows", -100, 100, 1, { fmt: sgn, hint: "Positive opens up dark areas." }),
        R("whites", "Whites", -100, 100, 1, { fmt: sgn }),
        R("blacks", "Blacks", -100, 100, 1, { fmt: sgn }),
        R("gamma", "Gamma", 50, 200, 1, { fmt: (v) => (v / 100).toFixed(2) }),
      ],
    },
    {
      id: "color", title: "Colour", sub: "Balance, grading and colour isolation", open: true,
      rows: [
        R("saturation", "Saturation", 0, 300, 1, { fmt: (v) => v + "%" }),
        R("hue", "Hue shift", -180, 180, 1, { fmt: (v) => sgn(v) + "°" }),
        R("temperature", "Temperature", -100, 100, 1, { fmt: sgn, hint: "Cool to warm." }),
        R("tint", "Tint", -100, 100, 1, { fmt: sgn, hint: "Green to magenta." }),
        R("mono", "Black and white", 0, 100, 1, { fmt: (v) => v + "%" }),
        R("sepia", "Sepia", 0, 100, 1, { fmt: (v) => v + "%" }),
        R("invert", "Negative", 0, 100, 1, { fmt: (v) => v + "%" }),
        SEG("swap", "Channel swap", [["rgb", "RGB"], ["rbg", "RBG"], ["grb", "GRB"], ["gbr", "GBR"], ["brg", "BRG"], ["bgr", "BGR"]], { hint: "Recolours the picture by re-routing red, green and blue." }),
        R("stAmount", "Split toning", 0, 100, 1, { fmt: (v) => v + "%", hint: "Tints shadows and highlights separately (the classic teal and orange)." }),
        COL("stShadow", "Shadow tint", { show: (s) => s.stAmount > 0 }),
        COL("stHigh", "Highlight tint", { show: (s) => s.stAmount > 0 }),
        CHIPS("popColor", "Colour pop", ["off", "red", "yellow", "green", "cyan", "blue", "magenta"].map((c) => [c, c === "off" ? "Off" : c[0].toUpperCase() + c.slice(1), POPCOL[c]]), { kind: "dot", hint: "Keeps one colour and turns everything else grey." }),
        R("popTol", "Pop range", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.popColor !== "off" }),
      ],
    },
    {
      id: "detail", title: "Detail and glow", sub: "Sharpness, softness and bloom",
      rows: [
        R("sharpen", "Sharpen", 0, 100, 1, { fmt: (v) => v + "%" }),
        R("clarity", "Clarity", 0, 100, 1, { fmt: (v) => v + "%", hint: "Local contrast. Adds punch to mid-tones." }),
        R("blur", "Blur", 0, 100, 1, { fmt: (v) => (v === 0 ? "Off" : ((v / 100) * 12).toFixed(1) + " px") }),
        R("bloom", "Bloom", 0, 100, 1, { fmt: (v) => v + "%", hint: "Bright areas bleed a soft glow." }),
        R("bloomThr", "Bloom threshold", 40, 95, 1, { fmt: (v) => v + "%", show: (s) => s.bloom > 0 }),
        R("bloomSize", "Bloom size", 2, 40, 1, { fmt: (v) => v + " px", show: (s) => s.bloom > 0 }),
      ],
    },
    {
      id: "stylize", title: "Stylise", sub: "Gradient maps, edges, posterise and pixels",
      rows: [
        CHIPS("gmap", "Gradient map", [["off", "Off", null]].concat(["thermal", "night", "matrix", "cyber", "sunset", "ice", "gold"].map((g) => [g, g[0].toUpperCase() + g.slice(1), gradCss(g)])).concat([["custom", "Custom", "linear-gradient(90deg,var(--gm1),var(--gm2),var(--gm3))"]]), { kind: "bar", hint: "Re-colours the picture by brightness: thermal camera, night vision and more." }),
        R("gmapAmt", "Map strength", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.gmap !== "off" }),
        COL("gmapC1", "Dark colour", { show: (s) => s.gmap === "custom" }),
        COL("gmapC2", "Mid colour", { show: (s) => s.gmap === "custom" }),
        COL("gmapC3", "Light colour", { show: (s) => s.gmap === "custom" }),
        SEG("outline", "Edges", [["off", "Off"], ["ink", "Ink"], ["neon", "Neon"], ["edges", "Edges only"], ["emboss", "Emboss"]], { hint: "Detects outlines in real time." }),
        R("outlineAmt", "Edge strength", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.outline !== "off" }),
        COL("neonColor", "Neon colour", { show: (s) => s.outline === "neon" }),
        R("posterize", "Posterise", 0, 12, 1, { fmt: (v) => (v < 2 ? "Off" : v + " levels") }),
        R("solarize", "Solarise", 0, 100, 1, { fmt: (v) => v + "%" }),
        R("pixelate", "Pixelate", 0, 40, 1, { fmt: (v) => (v < 2 ? "Off" : v + " px") }),
      ],
    },
    {
      id: "lens", title: "Lens and focus", sub: "Distortion, tilt-shift and colour fringing",
      rows: [
        SEG("warpMode", "Warp", [["off", "Off"], ["lens", "Lens"], ["bulge", "Bulge"], ["swirl", "Swirl"]], { hint: "Bends the picture in real time." }),
        R("warpAmt", "Warp amount", -100, 100, 1, { fmt: sgn, show: (s) => s.warpMode !== "off" }),
        SEG("tilt", "Tilt-shift", [["off", "Off"], ["linear", "Band"], ["radial", "Spot"]], { hint: "Blurs everything outside a focus zone for a miniature look." }),
        R("tiltBlur", "Blur amount", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.tilt !== "off" }),
        R("tiltPos", "Focus position", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.tilt !== "off" }),
        R("tiltSize", "Focus size", 5, 60, 1, { fmt: (v) => v + "%", show: (s) => s.tilt !== "off" }),
        R("chroma", "Chromatic aberration", 0, 100, 1, { fmt: (v) => v + "%", hint: "Red and blue drift apart toward the edges, like a cheap lens." }),
      ],
    },
    {
      id: "film", title: "Film and retro", sub: "Grain, vignette and scanlines",
      rows: [
        R("grain", "Film grain", 0, 100, 1, { fmt: (v) => v + "%" }),
        R("grainSize", "Grain size", 1, 4, 0.5, { fmt: (v) => v.toFixed(1), show: (s) => s.grain > 0 }),
        R("vignette", "Vignette", 0, 100, 1, { fmt: (v) => v + "%" }),
        R("vigSize", "Vignette size", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.vignette > 0 }),
        R("scan", "Scanlines", 0, 100, 1, { fmt: (v) => v + "%" }),
        SEG("scanSize", "Line size", [[0, "Fine"], [1, "Medium"], [2, "Coarse"]], { show: (s) => s.scan > 0 }),
      ],
    },
    {
      id: "motion", title: "Glitch and motion", sub: "Live distortion that moves with the video",
      rows: [
        R("glitch", "Glitch", 0, 100, 1, { fmt: (v) => v + "%", hint: "Torn lines and colour splits." }),
        SEG("glitchMode", "Glitch timing", [["burst", "Bursts"], ["constant", "Constant"]], { show: (s) => s.glitch > 0 }),
        R("wave", "Heat haze and ripple", 0, 100, 1, { fmt: (v) => v + "%", hint: "A slow wobble, like warm air or looking through water." }),
      ],
    },
    {
      id: "react", title: "Sound reactive", sub: "The picture pulses with the audio",
      rows: [
        TG("reactOn", "React to sound", "Reads the audio you are hearing, including the equaliser and boost."),
        SEG("reactBand", "Listen to", [["bass", "Bass"], ["mid", "Mids"], ["treble", "Treble"], ["full", "Full"]], { show: (s) => s.reactOn }),
        R("reactAmt", "Intensity", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.reactOn }),
        MULTI("Pulse", [["reactBright", "Brightness"], ["reactSat", "Saturation"], ["reactChroma", "Colour split"], ["reactZoom", "Zoom"], ["reactGlitch", "Glitch"]], { show: (s) => s.reactOn }),
        { t: "meter", label: "Level", show: (s) => s.reactOn },
      ],
    },
    {
      id: "auto", title: "Smart auto", sub: "Adapts to every scene as it plays",
      rows: [
        TG("autoLevels", "Auto contrast", "Stretches dull scenes to use the full brightness range."),
        TG("autoWB", "Auto white balance", "Removes colour casts, such as yellow indoor lighting."),
        R("autoAmt", "Strength", 0, 100, 1, { fmt: (v) => v + "%", show: (s) => s.autoLevels || s.autoWB }),
      ],
    },
    {
      id: "crop", title: "Crop and fit", sub: "Cut the picture to a shape without stretching it",
      rows: [
        SEG("crop", "Crop", [["off", "Off"], ["aspect", "Aspect ratio"], ["manual", "Manual edges"]], {
          hint: OVB ? "Cuts the real picture, then shows it using Picture fit below." : "This version of Electron cannot crop. Update Electron to use it.",
        }),
        SEG("cropRatio", "Shape", [[1, "1:1"], [0.8, "4:5"], [1.3333, "4:3"], [1.5, "3:2"], [1.7778, "16:9"], [2.3333, "21:9"], [2.39, "2.39:1"], [0.5625, "9:16"]], {
          hint: "The shape to keep. The rest is trimmed from the sides, or from the top and bottom.",
          show: (s) => s.crop === "aspect",
        }),
        R("cropRatio", "Custom shape", 0.4, 3, 0.01, { fmt: (v) => v.toFixed(2) + " : 1", show: (s) => s.crop === "aspect" }),
        R("cropPos", "Position", 0, 100, 1, {
          fmt: (v) => (v === 50 ? "Centre" : v + "%"),
          hint: "Slides the kept area along the side that is being trimmed.",
          show: (s) => s.crop === "aspect",
        }),
        R("cropT", "Trim top", 0, 40, 0.5, { fmt: (v) => v + "%", show: (s) => s.crop === "manual" }),
        R("cropB", "Trim bottom", 0, 40, 0.5, { fmt: (v) => v + "%", show: (s) => s.crop === "manual" }),
        R("cropL", "Trim left", 0, 40, 0.5, { fmt: (v) => v + "%", show: (s) => s.crop === "manual" }),
        R("cropR", "Trim right", 0, 40, 0.5, { fmt: (v) => v + "%", show: (s) => s.crop === "manual" }),
        { t: "buttons", label: "Black bars", buttons: [["Detect and crop", autoCrop], ["Clear crop", () => resetKeys(["crop", "cropT", "cropB", "cropL", "cropR"])]] },
        SEG(null, "Picture fit", [["contain", "Fit"], ["cover", "Fill"], ["fill", "Stretch"]], {
          hint: "Fit keeps the whole picture. Fill zooms until the player is full. Stretch distorts it. Same as Video fit in Appearance.",
          get: () => (ctx.getFit ? ctx.getFit() : fitMode),
          set: (v) => { if (ctx.setFit) ctx.setFit(v); },
        }),
      ],
    },
    {
      id: "xform", title: "Flip, rotate and shape", sub: "Orientation, levelling and forced aspect ratio",
      rows: [
        MULTI("Flip", [["flipH", "Horizontal"], ["flipV", "Vertical"]]),
        SEG("rotate", "Rotate", [[0, "0°"], [90, "90°"], [180, "180°"], [270, "270°"]]),
        R("straighten", "Straighten", -100, 100, 1, { fmt: (v) => sgn((v / 10).toFixed(1)) + "°", hint: "Levels a tilted horizon and zooms in to hide the corners." }),
        SEG("aspect", "Force shape", ["auto", "16:9", "4:3", "21:9", "2.35:1", "1:1"].map((a) => [a, a === "auto" ? "Original" : a]), {
          hint: "Stretches or squeezes the whole picture into this shape. To cut instead of stretch, use Crop.",
        }),
      ],
    },
  ];

  const rowApi = []; // { def, row, sync() }
  const cardApi = []; // { card, el, count, keys }

  function setKey(k, v) {
    S[k] = v;
    if (C.LOOK_KEYS.includes(k)) S.look = "";
    commit(false);
  }
  function resetKeys(keys) {
    keys.forEach((k) => {
      S[k] = D[k];
      if (C.LOOK_KEYS.includes(k)) S.look = "";
    });
    commit(true);
  }
  function commit(fullSync, now) {
    ctx.setSaved(S);
    ctx.scheduleSave();
    syncAutoTimer();
    if (!C.needsAnim(S) || !S.on) dyn.glAmt = S.glitch > 0 && S.glitchMode === "constant" ? 1 : 0;
    // Discrete actions (toggle, look, reset) apply immediately; slider drags are coalesced per frame.
    if (fullSync || now) {
      if (updRaf) { cancelAnimationFrame(updRaf); updRaf = 0; }
      update();
    } else scheduleUpdate();
    updatePreview();
    marks();
    if (fullSync) rowApi.forEach((r) => r.sync());
    kick();
  }

  const paint = (el) => {
    const min = parseFloat(el.min), max = parseFloat(el.max);
    el.style.setProperty("--p", ((el.value - min) / (max - min)) * 100 + "%");
  };

  function makeRow(def) {
    const row = document.createElement("div");
    row.className = "sset-row fx-row";
    const label = document.createElement("span");
    label.className = "sset-label";
    label.innerHTML = `<b>${def.label}</b>${def.hint ? `<small>${def.hint}</small>` : ""}`;
    const ctl = document.createElement("div");
    ctl.className = "sset-ctl";
    row.append(label, ctl);
    let sync = () => {};
    const k = def.k;
    if (def.t === "range") {
      const inp = document.createElement("input");
      inp.type = "range";
      inp.className = "rng";
      inp.min = def.min; inp.max = def.max; inp.step = def.step;
      inp.setAttribute("aria-label", def.label);
      const out = document.createElement("output");
      out.className = "val";
      inp.addEventListener("input", () => { setKey(k, parseFloat(inp.value)); paint(inp); out.textContent = def.fmt(S[k]); });
      inp.addEventListener("dblclick", () => { setKey(k, D[k]); sync(); });
      ctl.append(inp, out);
      sync = () => { inp.value = S[k]; paint(inp); out.textContent = def.fmt(S[k]); };
    } else if (def.t === "seg" || def.t === "chips") {
      const seg = document.createElement("div");
      seg.className = def.t === "seg" ? "lib-seg sset-seg fx-seg" : "fx-chips";
      def.opts.forEach(([val, text, css]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.v = String(val);
        if (def.t === "seg") b.textContent = text;
        else {
          b.className = "fx-chip" + (def.kind === "dot" ? " is-dot" : " is-bar");
          b.title = text;
          b.setAttribute("aria-label", text);
          if (def.kind === "dot") b.innerHTML = css === "transparent" ? `<i class="fx-none"></i>` : `<i style="background:${css}"></i>`;
          else b.innerHTML = `<i${css ? ` style="background:${css}"` : ' class="fx-none"'}></i><span>${text}</span>`;
        }
        b.addEventListener("click", () => {
          if (def.set) { def.set(val); sync(); return; }
          const num = typeof D[k] === "number";
          setKey(k, num ? Number(val) : val);
          sync();
        });
        seg.appendChild(b);
      });
      ctl.appendChild(seg);
      sync = () => seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === String(def.get ? def.get() : S[k])));
    } else if (def.t === "toggle") {
      row.classList.add("sset-toggle");
      const lab = document.createElement("label");
      lab.className = "switch";
      lab.innerHTML = `<input type="checkbox" aria-label="${def.label}"><span class="switch-ui"></span>`;
      const inp = lab.querySelector("input");
      inp.addEventListener("change", () => setKey(k, inp.checked));
      ctl.remove();
      row.appendChild(lab);
      label.innerHTML = `<b>${def.label}</b>${def.hint ? `<small>${def.hint}</small>` : ""}`;
      sync = () => (inp.checked = !!S[k]);
    } else if (def.t === "color") {
      const inp = document.createElement("input");
      inp.type = "color";
      inp.className = "fx-color";
      inp.setAttribute("aria-label", def.label);
      inp.addEventListener("input", () => {
        setKey(k, inp.value);
        if (k.startsWith("gmapC")) rootVars();
      });
      ctl.appendChild(inp);
      sync = () => (inp.value = S[k]);
    } else if (def.t === "multi") {
      const box = document.createElement("div");
      box.className = "fx-multi";
      def.items.forEach(([key, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.dataset.k = key;
        b.addEventListener("click", () => { setKey(key, !S[key]); sync(); });
        box.appendChild(b);
      });
      ctl.appendChild(box);
      sync = () => box.querySelectorAll("button").forEach((b) => b.classList.toggle("active", !!S[b.dataset.k]));
    } else if (def.t === "meter") {
      const m = document.createElement("div");
      m.className = "fx-meter";
      m.innerHTML = "<i></i>";
      meterEl = m.firstChild;
      ctl.appendChild(m);
    } else if (def.t === "buttons") {
      def.buttons.forEach(([text, fn]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn";
        b.textContent = text;
        b.addEventListener("click", fn);
        ctl.appendChild(b);
      });
    }
    return { def, row, sync };
  }

  function rootVars() {
    if (!panel) return;
    panel.style.setProperty("--gm1", S.gmapC1);
    panel.style.setProperty("--gm2", S.gmapC2);
    panel.style.setProperty("--gm3", S.gmapC3);
  }

  function marks() {
    rowApi.forEach((r) => {
      const d = r.def;
      if (d.show) r.row.classList.toggle("fx-hide", !d.show(S));
      const keys = d.k ? [d.k] : d.items ? d.items.map((i) => i[0]) : [];
      r.row.classList.toggle("is-changed", keys.some((k) => S[k] !== D[k]));
    });
    cardApi.forEach((c) => {
      const n = C.activeCount(S, c.keys);
      c.count.textContent = n ? n + " active" : "";
      c.count.hidden = !n;
      c.reset.hidden = !n;
    });
    lookCards.forEach((c) => c.btn.classList.toggle("active", (S.look || "none") === c.look.id || (!S.look && c.look.id === "none" && !C.needsFilter(S))));
    chrome();
  }

  function chrome() {
    if (!panel) return;
    const master = $("#fxMaster");
    if (master) master.checked = !!S.on;
    const note = $("#fxNote");
    if (note) {
      const rtx = ctx && ctx.rtxOn();
      note.hidden = !(filterActive && rtx);
    }
    const btn = $("#fxBtn");
    if (btn) {
      btn.classList.toggle("active", !!S.on && (C.needsFilter(S) || C.needsTransform(S)));
      btn.title = !hasEffects() ? "Video effects (X) - choose an effect" : S.on ? "Video effects (X) - on" : "Video effects (X) - off";
    }
    const st = $("#fxMenuState");
    if (st) st.textContent = !hasEffects() ? "None" : S.on ? "On" : "Off";
    stageMode();
  }
  function stageMode() {
    if (!view) return;
    view.dataset.mode = viewMode;
    view.style.setProperty("--split", splitPos + "%");
    $("#fxAfter").style.clipPath = viewMode === "split" ? `inset(0 0 0 ${splitPos}%)` : "";
    $("#fxViewSeg") && $("#fxViewSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === viewMode));
  }

  function buildUI() {
    panel = $("#fxPanel");
    if (!panel) return;
    panel.innerHTML = `
      <div class="sset-preview fx-preview">
        <div class="fx-stage">
          <div class="fx-view" id="fxView" data-mode="after">
            <canvas id="fxCvBefore" class="fx-pic"></canvas>
            <div class="fx-after" id="fxAfter"><canvas id="fxCvAfter" class="fx-pic"></canvas></div>
            <i class="fx-split-line"></i>
          </div>
          <span class="fx-badge" id="fxBadge">Sample scene</span>
        </div>
        <div class="sset-bar">
          <div class="sset-bar-left">
            <label class="switch" title="Turn all video effects on or off (X)"><input type="checkbox" id="fxMaster" aria-label="Video effects"><span class="switch-ui"></span></label>
            <span class="sset-bar-label">Effects</span>
            <div class="lib-seg" id="fxViewSeg"><button data-v="after">Effect</button><button data-v="before">Original</button><button data-v="split">Split</button></div>
          </div>
          <button class="btn sset-reset" id="fxResetAll" title="Reset every effect">Reset all</button>
        </div>
        <div class="fx-note" id="fxNote" hidden>RTX enhancement is paused while filter effects are active. Reset the effects or switch them off to bring it back. Flip, rotate and crop do not use a filter.</div>
      </div>
      <div class="sset-card fx-looks-card">
        <div class="sset-head"><h3>Looks</h3><p>Pick a starting point, then fine-tune below. Everything runs live on the playing video.</p></div>
        <div class="fx-looks" id="fxLooks"></div>
      </div>
      <div id="fxCards"></div>
      <p class="settings-note fx-foot">Hold <kbd>V</kbd> while watching to compare with the original. Press <kbd>X</kbd> to switch effects on or off. Double-click any slider to reset it.</p>`;
    view = $("#fxView");
    cvBefore = $("#fxCvBefore");
    cvAfter = $("#fxCvAfter");
    badge = $("#fxBadge");
    buildLooks($("#fxLooks"));
    const host = $("#fxCards");
    CARDS.forEach((cd) => {
      const card = document.createElement("div");
      card.className = "sset-card fx-card" + (cd.open ? " is-open" : "");
      card.dataset.card = cd.id;
      const keys = [];
      cd.rows.forEach((r) => {
        if (r.k && !keys.includes(r.k)) keys.push(r.k);
        if (r.items) r.items.forEach((i) => keys.push(i[0]));
      });
      card.innerHTML = `<div class="sset-head fx-head" role="button" tabindex="0" aria-expanded="${!!cd.open}">
          <div class="fx-head-t"><h3>${cd.title}</h3><p>${cd.sub}</p></div>
          <div class="fx-head-r"><span class="fx-count" hidden></span><button type="button" class="sub-link fx-reset" hidden>Reset</button>
          <svg class="fx-chev" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5.2l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        </div><div class="fx-body"></div>`;
      const body = $(".fx-body", card);
      cd.rows.forEach((def) => {
        const r = makeRow(def);
        rowApi.push(r);
        body.appendChild(r.row);
      });
      const head = $(".fx-head", card);
      const toggle = () => {
        const o = card.classList.toggle("is-open");
        head.setAttribute("aria-expanded", String(o));
      };
      head.addEventListener("click", (e) => { if (!e.target.closest(".fx-reset")) toggle(); });
      head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      const reset = $(".fx-reset", card);
      reset.addEventListener("click", () => resetKeys(keys));
      cardApi.push({ card, keys, count: $(".fx-count", card), reset });
      host.appendChild(card);
    });
    $("#fxMaster").addEventListener("change", (e) => { S.on = e.target.checked; commit(false, true); });
    $("#fxResetAll").addEventListener("click", () => {
      S = C.sanitize({ on: S.on });
      commit(true);
      if (ctx.osd) ctx.osd("Effects reset");
    });
    $("#fxViewSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      viewMode = b.dataset.v;
      stageMode();
    });
    const drag = (e) => {
      if (viewMode !== "split") return;
      const r = view.getBoundingClientRect();
      splitPos = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
      stageMode();
    };
    view.addEventListener("pointerdown", (e) => { if (viewMode !== "split") return; view.setPointerCapture(e.pointerId); drag(e); view.onpointermove = drag; });
    view.addEventListener("pointerup", () => (view.onpointermove = null));
    if (window.ResizeObserver) new ResizeObserver(() => { if (previewVisible()) { pvKey = ""; applyPreview(); } }).observe(view);
    setInterval(() => {
      const vis = previewVisible();
      if (vis && !wasVisible) { thumbsDirty = true; pvKey = ""; }
      wasVisible = vis;
      if (!vis) return;
      paintPreview();
      if (thumbsDirty) refreshThumbs();
    }, 100);
  }

  /* ------------------------------------------------------------------ */
  /* Tools                                                               */
  /* ------------------------------------------------------------------ */
  function autoCrop() {
    const v = ctx.video;
    if (!hasVideo()) {
      ctx.toast("Play a video first", { type: "error" });
      return;
    }
    try {
      const cv = document.createElement("canvas");
      cv.width = 320;
      cv.height = Math.max(8, Math.round((320 * v.videoHeight) / v.videoWidth));
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(v, 0, 0, cv.width, cv.height);
      const r = C.detectBars(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
      if (r.dark) {
        ctx.toast("This frame is too dark to find the bars. Try another moment.", { type: "error" });
        return;
      }
      if (!(r.t || r.b || r.l || r.r)) {
        ctx.toast("No black bars found");
        return;
      }
      S.crop = "manual"; S.cropT = r.t; S.cropB = r.b; S.cropL = r.l; S.cropR = r.r;
      commit(true);
      ctx.toast("Black bars cropped");
    } catch (_) {
      ctx.toast("Could not read this frame", { type: "error" });
    }
  }

  function openSettings() {
    if (ctx.closePopovers) ctx.closePopovers();
    const nav = $('.nav-item[data-page="settings"]');
    if (nav) nav.click();
    const tab = $('.settings-tab[data-tab="effects"]');
    if (tab) tab.click();
  }
  function toggleRaw() {
    S.on = !S.on;
    commit(false, true);
    if (ctx.osd) ctx.osd(S.on ? "Video effects on" : "Video effects off");
  }
  // Is there anything to switch on? (ignores the master switch)
  function hasEffects() {
    const q = Object.assign({}, S, { on: true });
    return C.needsFilter(q) || C.needsTransform(q);
  }
  // Button / X key / palette: with nothing chosen yet there is nothing to toggle, so go and choose.
  function toggle() {
    if (!hasEffects()) {
      if (ctx.osd) ctx.osd("No effects yet. Pick one.");
      openSettings();
      return;
    }
    toggleRaw();
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard: X toggles, hold V compares                                */
  /* ------------------------------------------------------------------ */
  function keyOk(e) {
    const ae = document.activeElement;
    const tag = (ae && ae.tagName) || "";
    const typing = tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["range", "checkbox", "button", "color"].includes(ae.type));
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (ctx.blocked && ctx.blocked()) return false;
    return !!ctx.video.getAttribute("src") || !!ctx.video.currentSrc || !!ctx.video.srcObject;
  }
  window.addEventListener("keydown", (e) => {
    if (!ctx) return;
    const k = (e.key || "").toLowerCase();
    if (k === "x" && !e.repeat && keyOk(e)) { e.preventDefault(); toggle(); }
    else if (k === "v" && !e.repeat && keyOk(e) && S.on && (C.needsFilter(S) || C.needsTransform(S))) {
      bypass = true;
      update(true);
      if (ctx.osd) ctx.osd("Original");
    }
  });
  const endCompare = () => { if (bypass) { bypass = false; update(true); } };
  window.addEventListener("keyup", (e) => { if ((e.key || "").toLowerCase() === "v") endCompare(); });
  window.addEventListener("blur", endCompare);

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  function wireVideo() {
    const v = ctx.video;
    ["loadedmetadata", "resize", "emptied"].forEach((ev) => v.addEventListener(ev, () => { thumbsDirty = true; dyn.auto = null; autoTarget = null; scheduleUpdate(); }));
    v.addEventListener("play", kick);
    v.addEventListener("seeked", () => { thumbsDirty = true; });
    if (window.ResizeObserver) new ResizeObserver(scheduleUpdate).observe(v);
    const btn = $("#fxBtn");
    if (btn) btn.addEventListener("click", toggle);
    const row = $("#fxOpenBtn");
    if (row) row.addEventListener("click", openSettings);
  }

  window.VideoFX = {
    // Called once by renderer.js after its helpers exist.
    bind(api) {
      ctx = api;
      buildUI();
      wireVideo();
      this.load();
    },
    // Reads saved settings (call again after the store is loaded).
    load() {
      if (!ctx) return;
      S = C.sanitize(ctx.getSaved());
      ctx.setSaved(S);
      dyn.glAmt = S.glitch > 0 && S.glitchMode === "constant" ? 1 : 0;
      rootVars();
      rowApi.forEach((r) => r.sync());
      marks();
      syncAutoTimer();
      update(true);
      updatePreview();
    },
    // Re-applies the video style. Returns true when a filter is active (RTX is then bypassed).
    refresh() {
      return update(true);
    },
    isActive: () => filterActive,
    // Called by the player when Video fit changes, so crop / preview follow it.
    fitChanged() {
      if (!ctx) return;
      rowApi.forEach((r) => r.sync());
      scheduleUpdate();
      updatePreview();
    },
    toggle,
    openSettings,
    reset() {
      S = C.sanitize({ on: S.on });
      commit(true);
    },
  };
})();
