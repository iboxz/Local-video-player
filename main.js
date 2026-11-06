const { app, BrowserWindow, dialog, ipcMain, screen, globalShortcut, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

// Must run before app.whenReady() - reads a tiny local flag to decide GPU
// acceleration (set from the Advanced settings tab; takes effect after relaunch).
try {
  const flagPath = path.join(app.getPath("userData"), "hw-accel.flag");
  if (fs.existsSync(flagPath) && fs.readFileSync(flagPath, "utf-8").trim() === "off") {
    app.disableHardwareAcceleration();
  }
} catch (_) {}

const fontList = require("font-list");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");
const { fileURLToPath, pathToFileURL } = require("url");

function appendDebugLog(text) {
  try {
    const p = path.join(app.getPath("userData"), "ffmpeg-debug.log");
    const ts = new Date().toISOString();
    fs.appendFileSync(p, `[${ts}] ${text}\n`, "utf8");
  } catch (_) {}
}

// Configure fluent-ffmpeg with static binaries
try {
  // Use provided paths; if the runtime path points into `app.asar` we
  // should prefer the unpacked `app.asar.unpacked` executable because
  // binaries cannot be executed from inside an ASAR archive.
  let resolvedFfmpegPath = ffmpegStatic;
  if (typeof resolvedFfmpegPath === 'string' && resolvedFfmpegPath.indexOf('.asar') !== -1) {
    const alt = resolvedFfmpegPath.replace(/app\.asar([\\/])?/, 'app.asar.unpacked$1');
    if (fs.existsSync(alt)) {
      resolvedFfmpegPath = alt;
      appendDebugLog('ffmpeg using unpacked fallback: ' + alt);
    }
  }
  if (resolvedFfmpegPath) ffmpeg.setFfmpegPath(resolvedFfmpegPath);

    if (ffprobeStatic && ffprobeStatic.path) {
      let resolvedFfprobePath = ffprobeStatic.path;
      if (typeof resolvedFfprobePath === 'string' && resolvedFfprobePath.indexOf('.asar') !== -1) {
        const altp = resolvedFfprobePath.replace(/app\.asar([\\/])?/, 'app.asar.unpacked$1');
        if (fs.existsSync(altp)) {
          resolvedFfprobePath = altp;
          appendDebugLog('ffprobe using unpacked fallback: ' + altp);
        }
      }
      ffmpeg.setFfprobePath(resolvedFfprobePath);
    }
  try {
    console.log('ffmpeg configured path:', resolvedFfmpegPath);
    appendDebugLog(`ffmpeg configured path: ${resolvedFfmpegPath}`);
    if (ffprobeStatic && ffprobeStatic.path) {
      // resolvedFfprobePath is set above when applicable
      console.log('ffprobe configured path:', ffprobeStatic.path);
      appendDebugLog(`ffprobe configured path: ${ffprobeStatic.path}`);
    }
    const { spawnSync } = require('child_process');
    if (resolvedFfmpegPath) {
      const ver = spawnSync(resolvedFfmpegPath, ['-version']);
      if (ver && ver.status === 0) {
        console.log('ffmpeg -version OK');
        appendDebugLog('ffmpeg -version OK');
      } else {
        console.warn('ffmpeg -version failed', ver && ver.error);
        appendDebugLog('ffmpeg -version failed: ' + String(ver && ver.error));
      }
    }
  } catch (logErr) {
    console.warn('FFmpeg/version check failed:', logErr);
  }
} catch (e) {
  console.warn("FFmpeg configuration failed:", e);
}

// Audio codecs Chromium's media pipeline can decode natively inside a
// Matroska/MP4 container - if the source already uses one of these we don't
// need to touch the file at all (this is the common case and was previously
// always re-encoded, which is why every .mkv felt slow).
const COMPAT_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);

function probeFile(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function timemarkToSeconds(tm) {
  const m = /(\d+):(\d+):([\d.]+)/.exec(tm || "");
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

function getCachePath() {
  return path.join(app.getPath("userData"), "rtx-player-cache.json");
}
function loadPrepareCache() {
  try {
    const p = getCachePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {}
  return {};
}
function savePrepareCache(cache) {
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (_) {}
}

// Convert raw SRT text to WebVTT. Shared by local subtitle import and
// online subtitle search/download.
function srtTextToVtt(raw) {
  const content = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let vttContent = "WEBVTT\n\n";
  const blocks = content.split("\n\n");

  for (let block of blocks) {
    const lines = block.split("\n");
    if (lines.length >= 3) {
      const timecode = lines[1].trim();
      const vttTimecode = timecode.replace(/,/g, ".");
      const subtitleText = lines
        .slice(2)
        .map((line) => line.replace(/<font[^>]*>/gi, "").replace(/<\/font>/gi, "").trim())
        .filter((line) => line.length > 0)
        .join("\n");
      if (subtitleText && vttTimecode.includes("-->")) {
        vttContent += vttTimecode + "\n" + subtitleText + "\n\n";
      }
    }
  }
  return vttContent;
}

// Hardware acceleration is enabled by default in Electron.

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---- Files / folders handed to us by Windows ("Open with", double-click, context menu) ----
let mainWin = null;
let pendingOpen = [];
function argvTargets(argv) {
  const out = [];
  for (const a of argv.slice(app.isPackaged ? 1 : 2)) {
    if (!a || a.startsWith("--")) continue;
    try {
      if (!fs.existsSync(a)) continue;
      const st = fs.statSync(a);
      if (st.isDirectory()) out.push({ type: "folder", tree: scanFolder(a) });
      else if (VIDEO_EXTS.has(path.extname(a).toLowerCase())) out.push({ type: "file", url: pathToFileURL(a).href });
    } catch (_) {}
  }
  return out;
}
function deliverOpen(items) {
  if (!items.length) return;
  if (mainWin && !mainWin.isDestroyed() && mainWin.webContents && !mainWin.webContents.isLoading()) mainWin.webContents.send("open-targets", items);
  else pendingOpen.push(...items);
}
app.on("second-instance", (_, argv) => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
  deliverOpen(argvTargets(argv));
});

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.min(Math.max(Math.floor(sw * 0.85), 1200), sw);
  const winHeight = Math.min(Math.max(Math.floor(sh * 0.85), 800), sh);
  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    backgroundColor: "#111",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      autoplayPolicy: "no-user-gesture-required",
      devTools: false, // Disable DevTools completely
      // prefer hardware decoding (Chromium flag default true when possible)
      // Electron uses ANGLE/D3D11 on Windows.
    },
  });

  // You may optionally set Chromium flags to influence decoding; keeping defaults here for stability
  // RTX Video Enhancements behavior is controlled by NVIDIA driver & control panel, not Electron

  win.removeMenu();
  win.loadFile("renderer/index.html");
  mainWin = win;
  win.webContents.on("did-finish-load", () => {
    const first = pendingOpen.length ? [] : argvTargets(process.argv);
    const items = pendingOpen.concat(first);
    pendingOpen = [];
    setTimeout(() => deliverOpen(items), 400);
  });

  // Mouse side buttons (back/forward) - Windows sends these as WM_APPCOMMAND,
  // exposed here so the renderer can map them to next/previous track.
  win.on("app-command", (_, cmd) => {
    if (cmd === "browser-backward") {
      win.webContents.send("mouse-nav", "backward");
    } else if (cmd === "browser-forward") {
      win.webContents.send("mouse-nav", "forward");
    }
  });

  // Window control handlers
  ipcMain.on("window-control", (_, command) => {
    switch (command) {
      case "minimize":
        win.minimize();
        break;
      case "maximize":
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
        break;
      case "close":
        win.close();
        break;
    }
  });

  // DevTools are disabled in webPreferences
}

// DevTools functionality removed

app.whenReady().then(() => {
  // Disable all DevTools related shortcuts
  globalShortcut.register("Control+Shift+I", () => {});
  globalShortcut.register("Control+Shift+J", () => {});
  globalShortcut.register("F12", () => {});

  createWindow();
  syncWinIntegration().catch(() => {});

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
});

// IPC: open file dialog
ipcMain.handle("select-video-files", async (event, defaultPath) => {
  const opts = {
    title: "Select video file(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Videos", extensions: ["mp4", "webm", "mkv", "mov", "avi", "m4v"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
  if (defaultPath) opts.defaultPath = defaultPath;
  const { canceled, filePaths } = await dialog.showOpenDialog(opts);
  if (canceled || !filePaths?.length) return [];
  return filePaths.map((p) => "file:///" + p.replace(/\\/g, "/"));
});

ipcMain.handle("select-default-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (canceled || !filePaths?.length) return null;
  return filePaths[0];
});

// Prepare a video for playback: for MKV files with unsupported audio codecs
const prepareJobs = new Map(); // originalFile -> { promise, outPath, status }

ipcMain.handle("prepare-video", async (event, fileUrl, force) => {
  try {
    if (typeof fileUrl === "string" && /^https?:\/\//i.test(fileUrl)) return fileUrl;
    let filePath = fileUrl;
    if (typeof fileUrl === "string" && fileUrl.startsWith("file:///")) {
      filePath = fileURLToPath(fileUrl);
    }
    filePath = path.resolve(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Only handle MKV containers here
    if (ext !== ".mkv") return fileUrl;

    const originalKey = filePath + (force ? "|force" : "");

    // If a job already exists (this session), reuse it
    const existing = prepareJobs.get(originalKey);
    if (existing) {
      if (existing.status === "done") return existing.outUrl;
      try {
        await existing.promise;
        return existing.outUrl || fileUrl;
      } catch (e) {
        return fileUrl;
      }
    }

    const stat = fs.statSync(filePath);
    const cacheKey = `${filePath}|${stat.size}|${Math.round(stat.mtimeMs)}`;

    // On-disk cache from a previous session/launch
    if (!force) {
      const cache = loadPrepareCache();
      const cached = cache[cacheKey];
      if (cached && cached.outPath && fs.existsSync(cached.outPath)) {
        const outUrl = "file:///" + cached.outPath.replace(/\\/g, "/");
        prepareJobs.set(originalKey, { status: "done", outPath: cached.outPath, outUrl, promise: Promise.resolve(outUrl) });
        return outUrl;
      }
    }

    // Probe the file to see if it actually needs any work
    let probe = null;
    try {
      probe = await probeFile(filePath);
    } catch (_) {}
    const audioStream = probe && probe.streams && probe.streams.find((s) => s.codec_type === "audio");
    const audioCodec = audioStream && audioStream.codec_name ? audioStream.codec_name.toLowerCase() : null;
    const audioChannels = (audioStream && audioStream.channels) || 2;
    const duration = probe && probe.format && probe.format.duration ? parseFloat(probe.format.duration) : null;

    // Common case: audio is already something Chromium can decode natively
    // (Matroska demuxing itself is container-agnostic) - skip ffmpeg entirely.
    if (!force && audioCodec && COMPAT_AUDIO_CODECS.has(audioCodec)) {
      prepareJobs.set(originalKey, { status: "done", outUrl: fileUrl, promise: Promise.resolve(fileUrl) });
      return fileUrl;
    }

    const baseName = path.basename(filePath, ext).replace(/[^\w.\-]/g, "_");
    const outPath = path.join(app.getPath("temp"), `rtx-player-${Date.now()}-${baseName}.mp4`);
    const outUrl = "file:///" + outPath.replace(/\\/g, "/");

    function runFfmpegWithOptions(options, out) {
      return new Promise((resolve, reject) => {
        try {
          ffmpeg(filePath)
            .outputOptions(options)
            .on("progress", (p) => {
              try {
                let percent = typeof p.percent === "number" && !isNaN(p.percent) ? p.percent : null;
                if (percent == null && duration) {
                  const t = timemarkToSeconds(p.timemark);
                  if (t != null) percent = Math.min(99, (t / duration) * 100);
                }
                event.sender.send("prepare-progress", {
                  original: fileUrl,
                  percent: percent != null ? Math.round(percent) : null,
                  timemark: p.timemark || null,
                });
              } catch (_) {}
            })
            .on("end", () => resolve())
                .on("error", (err) => {
                  try {
                    const msg = err && err.message ? err.message : String(err);
                    console.error('ffmpeg processing error:', msg);
                    appendDebugLog('ffmpeg processing error: ' + msg);
                  } catch (_) {}
                  reject(err);
                })
            .save(out);
        } catch (err) {
          reject(err);
        }
      });
    }

    // Downmix very high channel counts (e.g. 7.1 TrueHD/DTS-HD) which some
    // AAC encoders choke on or which take much longer to encode.
    const audioOpts = audioChannels > 6 ? ["-ac", "2"] : [];

    const jobPromise = (async () => {
      try {
        await runFfmpegWithOptions(["-c:v copy", "-c:a aac", "-b:a 192k", ...audioOpts, "-movflags +faststart", "-y"], outPath);
      } catch (err) {
        // Stream copy of video failed — retry with NVENC transcode if available
        const encoders = await new Promise((res) => ffmpeg.getAvailableEncoders((e, list) => res(e ? {} : list)));
        const hasNvenc = encoders && Object.keys(encoders).some((k) => k.toLowerCase().includes("h264_nvenc"));
        if (hasNvenc) {
          await runFfmpegWithOptions(["-c:v h264_nvenc", "-preset fast", "-rc vbr", "-cq 20", "-c:a aac", "-b:a 192k", ...audioOpts, "-movflags +faststart", "-y"], outPath);
        } else {
          throw err;
        }
      }

      prepareJobs.set(originalKey, { status: "done", outPath, outUrl, promise: Promise.resolve(outUrl) });
      const cache = loadPrepareCache();
      cache[cacheKey] = { outPath, ts: Date.now() };
      savePrepareCache(cache);
      try {
        event.sender.send("prepare-done", { original: fileUrl, outUrl });
      } catch (_) {}
      return outUrl;
    })();

    prepareJobs.set(originalKey, { status: "running", outPath, outUrl, promise: jobPromise });

    try {
      return (await jobPromise) || fileUrl;
    } catch (e) {
      try {
        event.sender.send("prepare-error", { original: fileUrl, error: String((e && e.message) || e) });
      } catch (_) {}
      return fileUrl;
    }
  } catch (e) {
    console.error("prepare-video error", e);
    return fileUrl;
  }
});

// Get installed fonts list
ipcMain.handle("get-installed-fonts", async () => {
  try {
    const fonts = await fontList.getFonts();
    // fonts is an array of family names, e.g., 'Segoe UI'
    return fonts;
  } catch (e) {
    return [];
  }
});


// ---- Subtitle files: encoding detection (UTF-8/16, legacy Persian/Arabic) + SRT/ASS -> WebVTT ----
function decodeSubtitleBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString("utf8");
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.slice(2));
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.slice(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch (_) {}
  const w1256 = new TextDecoder("windows-1256").decode(buf);
  const arabic = (w1256.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabic / Math.max(1, w1256.length) > 0.15) return w1256;
  return new TextDecoder("windows-1252").decode(buf);
}
function assToVtt(text) {
  const toT = (s) => {
    const m = /(\d+):(\d+):(\d+)[.:](\d+)/.exec(s);
    if (!m) return null;
    const ms = m[4].length === 2 ? parseInt(m[4], 10) * 10 : parseInt(m[4].padEnd(3, "0").slice(0, 3), 10);
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + ms / 1000;
  };
  const fmtT = (t) => {
    const h = Math.floor(t / 3600), mi = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(3).padStart(6, "0");
    return String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") + ":" + s;
  };
  let fmt = null;
  const cues = [];
  for (const l of text.split(/\r?\n/)) {
    if (/^Format:/i.test(l) && fmt === null && /Start/i.test(l)) fmt = l.slice(7).split(",").map((x) => x.trim().toLowerCase());
    else if (/^Dialogue:/i.test(l) && fmt) {
      const parts = l.slice(9).split(",");
      const body = parts.slice(fmt.length - 1).join(",");
      const o = {};
      fmt.forEach((k, i) => { if (i < fmt.length - 1) o[k] = (parts[i] || "").trim(); });
      const st = toT(o.start), en = toT(o.end);
      if (st == null || en == null) continue;
      const txt = body.replace(/\{[^}]*\}/g, "").replace(/\\N/g, "\n").replace(/\\n/g, "\n").replace(/\\h/g, " ").trim();
      if (txt) cues.push([st, en, txt]);
    }
  }
  cues.sort((a, b) => a[0] - b[0]);
  return "WEBVTT\n\n" + cues.map((c) => fmtT(c[0]) + " --> " + fmtT(c[1]) + "\n" + c[2]).join("\n\n") + "\n";
}
function subtitleFileToVtt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const text = decodeSubtitleBuffer(fs.readFileSync(filePath)).replace(/^\uFEFF/, "");
  if (ext === ".ass" || ext === ".ssa") return assToVtt(text);
  if (/^\s*WEBVTT/.test(text)) return text;
  return srtTextToVtt(text);
}
ipcMain.handle("select-subtitle-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select subtitle files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa", "sub"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths?.length) return [];
  const out = [];
  for (const p of filePaths) {
    try {
      out.push({ fileName: path.basename(p), content: subtitleFileToVtt(p) });
    } catch (_) {}
  }
  return out;
});
// subtitle files that sit next to the video (same name, optional language suffix, or a Subs folder)
ipcMain.handle("find-sidecar-subs", async (event, fileUrl) => {
  try {
    if (typeof fileUrl !== "string" || /^https?:\/\//i.test(fileUrl)) return [];
    const videoPath = toFfmpegInput(fileUrl);
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
    const exts = new Set([".srt", ".vtt", ".ass", ".ssa"]);
    const found = [];
    const scan = (d, requireBase) => {
      let names = [];
      try { names = fs.readdirSync(d); } catch (_) { return; }
      for (const n of names) {
        const full = path.join(d, n);
        const ext = path.extname(n).toLowerCase();
        if (!exts.has(ext)) continue;
        const low = path.basename(n, ext).toLowerCase();
        if (requireBase && !(low === base || low.startsWith(base + ".") || low.startsWith(base + "_") || low.startsWith(base + " "))) continue;
        try { if (fs.statSync(full).size > 3 * 1024 * 1024) continue; } catch (_) { continue; }
        found.push(full);
      }
    };
    scan(dir, true);
    for (const sub of ["Subs", "Subtitles", "Sub", "subs", "subtitles"]) {
      scan(path.join(dir, sub), true);
      scan(path.join(dir, sub, path.basename(videoPath, path.extname(videoPath))), false);
    }
    const out = [];
    for (const p of [...new Set(found)].slice(0, 8)) {
      try { out.push({ fileName: path.basename(p), content: subtitleFileToVtt(p) }); } catch (_) {}
    }
    return out;
  } catch (_) {
    return [];
  }
});

// IPC: open subtitle file dialog and get content
ipcMain.handle("select-subtitle-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select subtitle file",
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["vtt", "srt", "ass", "ssa", "sub"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths?.length) return null;

  const filePath = filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  let content = fs.readFileSync(filePath, "utf-8");

  if (ext === ".srt") {
    content = srtTextToVtt(content);
  }

  return {
    content,
    fileName: path.basename(filePath),
  };
});

// ---------- Online subtitle search (OpenSubtitles REST API v1) ----------

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_) {}
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

ipcMain.handle("subtitle-search", async (event, params) => {
  try {
    const { query, language, apiKey } = params || {};
    if (!apiKey) return { ok: false, error: "missing_api_key" };
    if (!query || !query.trim()) return { ok: false, error: "empty_query" };

    const url = new URL("https://api.opensubtitles.com/api/v1/subtitles");
    url.searchParams.set("query", query.trim());
    if (language && language !== "all") url.searchParams.set("languages", language);
    url.searchParams.set("order_by", "download_count");
    url.searchParams.set("order_direction", "desc");

    const data = await fetchJson(url.toString(), {
      headers: {
        "Api-Key": apiKey,
        "User-Agent": "RTXVideoPlayer v1.0.0",
        Accept: "application/json",
      },
    });

    const results = (data.data || [])
      .map((item) => {
        const a = item.attributes || {};
        const file = (a.files && a.files[0]) || {};
        return {
          id: item.id,
          fileId: file.file_id,
          release: a.release || file.file_name || "Untitled",
          language: a.language || "",
          downloadCount: a.download_count || 0,
          rating: a.ratings || 0,
          hearingImpaired: !!a.hearing_impaired,
          fps: a.fps || null,
        };
      })
      .filter((r) => r.fileId);

    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle("subtitle-download", async (event, params) => {
  try {
    const { fileId, apiKey, releaseName } = params || {};
    if (!apiKey) return { ok: false, error: "missing_api_key" };
    if (!fileId) return { ok: false, error: "missing_file" };

    const dl = await fetchJson("https://api.opensubtitles.com/api/v1/download", {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "User-Agent": "RTXVideoPlayer v1.0.0",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!dl || !dl.link) throw new Error("No download link returned");

    const fileRes = await fetch(dl.link);
    if (!fileRes.ok) throw new Error(`Download failed (HTTP ${fileRes.status})`);
    const text = await fileRes.text();

    if (text.slice(0, 2) === "PK") {
      throw new Error("Unsupported archive format, try another result");
    }

    const isVtt = /^WEBVTT/.test(text.trim());
    const content = isVtt ? text : srtTextToVtt(text);
    const fileName = (dl.file_name || releaseName || "subtitle") + (isVtt ? ".vtt" : ".srt");

    return { ok: true, content, fileName };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle("open-external", async (event, url) => {
  try {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
  } catch (_) {}
  return false;
});

// ---------- Audio track selection ----------
const audioTrackJobs = new Map();
function getAudioCachePath() {
  return path.join(app.getPath("userData"), "rtx-player-audio-cache.json");
}
function loadAudioCache() {
  try {
    const p = getAudioCachePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {}
  return {};
}
function saveAudioCache(cache) {
  try {
    fs.writeFileSync(getAudioCachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (_) {}
}

function toFfmpegInput(fileUrl) {
  if (typeof fileUrl === "string" && /^https?:\/\//i.test(fileUrl)) return fileUrl;
  let filePath = fileUrl;
  if (typeof fileUrl === "string" && fileUrl.startsWith("file:///")) filePath = fileURLToPath(fileUrl);
  return path.resolve(filePath);
}

ipcMain.handle("probe-tracks", async (event, fileUrl) => {
  try {
    const filePath = toFfmpegInput(fileUrl);
    const probe = await probeFile(filePath);
    const audio = (probe.streams || [])
      .filter((s) => s.codec_type === "audio")
      .map((s, i) => ({
        index: s.index,
        codec: s.codec_name,
        channels: s.channels,
        language: (s.tags && (s.tags.language || s.tags.LANGUAGE)) || null,
        title: (s.tags && (s.tags.title || s.tags.TITLE)) || null,
        isDefault: i === 0,
      }));
    return { ok: true, audio };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle("probe-chapters", async (event, fileUrl) => {
  try {
    const filePath = toFfmpegInput(fileUrl);
    const data = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, ["-show_chapters"], (err, d) => (err ? reject(err) : resolve(d)));
    });
    const chapters = (data.chapters || []).map((c) => ({
      start: parseFloat(c.start_time),
      end: parseFloat(c.end_time),
      title: (c.tags && (c.tags.title || c.tags.TITLE)) || "",
    }));
    return { ok: true, chapters };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle("probe-info", async (event, fileUrl) => {
  try {
    const filePath = toFfmpegInput(fileUrl);
    const probe = await probeFile(filePath);
    const v = (probe.streams || []).find((s) => s.codec_type === "video") || {};
    const a = (probe.streams || []).find((s) => s.codec_type === "audio") || {};
    const fmt = probe.format || {};
    let fps = null;
    if (v.r_frame_rate) {
      const [n, d] = v.r_frame_rate.split("/").map(Number);
      if (d) fps = Math.round((n / d) * 100) / 100;
    }
    return {
      ok: true,
      info: {
        fileName: path.basename(filePath),
        container: fmt.format_long_name || fmt.format_name || "",
        duration: fmt.duration ? parseFloat(fmt.duration) : null,
        size: fmt.size ? parseInt(fmt.size, 10) : null,
        bitRate: fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : null,
        videoCodec: v.codec_name || null,
        width: v.width || null,
        height: v.height || null,
        fps,
        audioCodec: a.codec_name || null,
        audioChannels: a.channels || null,
        audioSampleRate: a.sample_rate || null,
      },
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

const VIDEO_EXTS = new Set([".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"]);
function scanFolder(dir) {
  const node = { name: path.basename(dir), type: "folder", children: [] };
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return node;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = scanFolder(full);
      if (sub.children.length) node.children.push(sub);
    } else if (VIDEO_EXTS.has(path.extname(ent.name).toLowerCase())) {
      node.children.push({ name: ent.name, type: "video", url: "file:///" + full.replace(/\\/g, "/") });
    }
  }
  return node;
}
ipcMain.handle("select-video-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (canceled || !filePaths?.length) return null;
  return scanFolder(filePaths[0]);
});


// ---- Thumbnails (ffmpeg, off the renderer's decoders) + live bitrate ----
const { spawn } = require("child_process");
const crypto = require("crypto");
function binPath(p) {
  if (typeof p === "string" && p.indexOf(".asar") !== -1) {
    const alt = p.replace(/app\.asar([\\/])?/, "app.asar.unpacked$1");
    if (fs.existsSync(alt)) return alt;
  }
  return p;
}
const FFMPEG_BIN = () => binPath(ffmpegStatic);
const FFPROBE_BIN = () => binPath(ffprobeStatic.path);

function runBin(bin, args, { binary = false, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out = [];
    let err = "";
    const t = setTimeout(() => {
      try { p.kill(); } catch (_) {}
      reject(new Error("timeout"));
    }, timeout);
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d.toString().slice(0, 500)));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => {
      clearTimeout(t);
      const buf = Buffer.concat(out);
      if (code !== 0 && !buf.length) return reject(new Error(err || "exit " + code));
      resolve(binary ? buf : buf.toString("utf-8"));
    });
  });
}

// small job queue so folders with thousands of files never swamp the CPU/disk
function makeQueue(limit) {
  let active = 0;
  const q = [];
  const next = () => {
    while (active < limit && q.length) {
      const { fn, res, rej } = q.shift();
      active++;
      fn().then(res, rej).finally(() => { active--; next(); });
    }
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}
const thumbQueue = makeQueue(2);
const thumbDir = () => {
  const d = path.join(app.getPath("userData"), "thumbs");
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
};

ipcMain.handle("get-thumb", async (event, fileUrl) => {
  try {
    if (typeof fileUrl !== "string" || /^https?:\/\//i.test(fileUrl)) return { ok: false };
    const filePath = toFfmpegInput(fileUrl);
    const st = fs.statSync(filePath);
    const key = crypto.createHash("sha1").update(`${filePath}|${st.size}|${st.mtimeMs}|v2`).digest("hex");
    const jpg = path.join(thumbDir(), key + ".jpg");
    const meta = path.join(thumbDir(), key + ".json");
    if (fs.existsSync(jpg) && fs.existsSync(meta)) {
      const { duration } = JSON.parse(fs.readFileSync(meta, "utf-8"));
      return { ok: true, duration, thumb: pathToFileURL(jpg).href.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/'/g, "%27") };
    }
    return await thumbQueue(async () => {
      let duration = null;
      try {
        const o = await runBin(FFPROBE_BIN(), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath], { timeout: 15000 });
        duration = parseFloat(o) || null;
      } catch (_) {}
      const t = duration ? Math.max(1, Math.min(duration * 0.1, 90)) : 1;
      const grab = (ss) =>
        runBin(FFMPEG_BIN(), ["-hide_banner", "-loglevel", "error", "-noaccurate_seek", "-ss", String(ss), "-i", filePath, "-frames:v", "1", "-an", "-sn", "-dn", "-vf", "scale=360:-2", "-q:v", "4", "-threads", "1", "-f", "mjpeg", "pipe:1"], { binary: true, timeout: 25000 });
      let buf;
      try { buf = await grab(t); } catch (_) { buf = await grab(0); }
      if (!buf || !buf.length) buf = await grab(0);
      fs.writeFileSync(jpg, buf);
      fs.writeFileSync(meta, JSON.stringify({ duration }));
      return { ok: true, duration, thumb: pathToFileURL(jpg).href.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/'/g, "%27") };
    });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// Per-second video/audio payload for a time window (read straight from the container index)
const streamIdxCache = new Map();
ipcMain.handle("probe-bitrate", async (event, fileUrl, start, span) => {
  try {
    const input = toFfmpegInput(fileUrl);
    let idx = streamIdxCache.get(input);
    if (!idx) {
      const p = await probeFile(input);
      const v = (p.streams || []).find((s) => s.codec_type === "video");
      const a = (p.streams || []).find((s) => s.codec_type === "audio");
      idx = { v: v ? v.index : -1, a: a ? a.index : -1 };
      streamIdxCache.set(input, idx);
    }
    const s0 = Math.max(0, Math.floor(start));
    const n = Math.max(1, Math.floor(span));
    const out = await runBin(
      FFPROBE_BIN(),
      ["-v", "error", "-read_intervals", `${s0}%+${n + 1}`, "-show_entries", "packet=stream_index,pts_time,size", "-of", "csv=p=0", input],
      { timeout: 25000 }
    );
    const v = new Array(n).fill(0);
    const a = new Array(n).fill(0);
    for (const line of out.split("\n")) {
      const parts = line.trim().split(",");
      if (parts.length < 3) continue;
      const si = parseInt(parts[0], 10);
      const t = parseFloat(parts[1]);
      const sz = parseInt(parts[2], 10);
      if (!isFinite(t) || !isFinite(sz)) continue;
      const k = Math.floor(t) - s0;
      if (k < 0 || k >= n) continue;
      if (si === idx.v) v[k] += sz;
      else if (si === idx.a) a[k] += sz;
    }
    return { ok: true, start: s0, v, a };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});


// ---- Live audio streaming: decode only the audio on demand, never rewrite the file ----
const http = require("http");
const LIVE_COMPAT = COMPAT_AUDIO_CODECS;
let audioServer = null;
const liveProcs = new Set();
function getAudioServer() {
  if (audioServer) return audioServer.ready;
  const token = crypto.randomBytes(16).toString("hex");
  const srv = http.createServer((req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "*" });
      return res.end();
    }
    let u;
    try { u = new URL(req.url, "http://127.0.0.1"); } catch (_) { res.writeHead(400, cors); return res.end(); }
    if (u.pathname !== "/audio" || u.searchParams.get("token") !== token) { res.writeHead(403, cors); return res.end(); }
    let input;
    try { input = toFfmpegInput(u.searchParams.get("src")); } catch (_) { res.writeHead(400, cors); return res.end(); }
    const idx = parseInt(u.searchParams.get("idx"), 10);
    const ss = Math.max(0, parseFloat(u.searchParams.get("ss")) || 0);
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-ss", String(ss), "-probesize", "8M", "-analyzeduration", "4M", "-i", input,
      "-map", isFinite(idx) ? `0:${idx}` : "0:a:0", "-vn", "-sn", "-dn", "-ac", "2", "-c:a", "aac", "-b:a", "192k",
      "-af", "aresample=async=1:first_pts=0", "-f", "mp4", "-movflags", "empty_moov+default_base_moof", "-frag_duration", "500000", "pipe:1"];
    const p = spawn(FFMPEG_BIN(), args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    liveProcs.add(p);
    res.writeHead(200, { ...cors, "Content-Type": "audio/mp4" });
    p.stdout.pipe(res);
    const kill = () => { try { p.kill(); } catch (_) {} };
    res.on("close", kill);
    p.on("close", () => { liveProcs.delete(p); try { res.end(); } catch (_) {} });
    p.on("error", () => { try { res.end(); } catch (_) {} });
  });
  const ready = new Promise((resolve, reject) => {
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${srv.address().port}`, token }));
  });
  audioServer = { srv, ready };
  return ready;
}
app.on("before-quit", () => {
  for (const p of liveProcs) { try { p.kill(); } catch (_) {} }
});
ipcMain.handle("audio-live-info", async () => {
  try { return { ok: true, ...(await getAudioServer()) }; } catch (e) { return { ok: false }; }
});
// Does this file need live audio? (default audio codec the browser can't decode)
ipcMain.handle("audio-live-plan", async (event, fileUrl) => {
  try {
    if (typeof fileUrl !== "string" || /^https?:\/\//i.test(fileUrl)) return { live: false };
    const probe = await probeFile(toFfmpegInput(fileUrl));
    const a = (probe.streams || []).find((s) => s.codec_type === "audio");
    if (!a || !a.codec_name) return { live: false };
    if (LIVE_COMPAT.has(a.codec_name.toLowerCase())) return { live: false };
    return { live: true, track: a.index, codec: a.codec_name };
  } catch (_) {
    return { live: false };
  }
});


// ---- Windows integration: Open with, context menu, default apps ----
const { execFile } = require("child_process");
const PROGID = "RTXVideoPlayer.Video";
const ASSOC_EXTS = [".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"];
const regRun = (args) => new Promise((resolve) => execFile("reg.exe", args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "") })));
function launchCommand() {
  return app.isPackaged ? `"${process.execPath}" "%1"` : `"${process.execPath}" "${app.getAppPath()}" "%1"`;
}
const K = (p) => "HKCU\\Software\\Classes\\" + p;
async function regAdd(key, name, value, type = "REG_SZ") {
  const a = ["add", key, "/f"];
  if (name === null) a.push("/ve");
  else a.push("/v", name);
  a.push("/t", type);
  if (type !== "REG_NONE") a.push("/d", value);
  return regRun(a);
}
const regExists = async (key) => (await regRun(["query", key])).ok;
async function integrationStatus() {
  if (process.platform !== "win32") return { supported: false };
  const [openWith, folderMenu, ...fileMenus] = await Promise.all([
    regExists(K(PROGID)),
    regExists(K("Directory\\shell\\RTXPlay")),
    ...ASSOC_EXTS.map((e) => regExists(K(`SystemFileAssociations\\${e}\\shell\\RTXPlay`))),
  ]);
  return { supported: true, openWith, fileMenu: fileMenus.every(Boolean), folderMenu };
}

// All three integrations are ON by default. The first time the installed app runs
// they are registered once; after that the user's choice is respected. On later
// launches the registered paths are refreshed if the app was moved or updated.
// (Only for the installed app, so a dev build never overwrites the real paths.)
async function syncWinIntegration() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const flag = path.join(app.getPath("userData"), "win-integration.json");
  let initialized = false;
  try {
    initialized = JSON.parse(fs.readFileSync(flag, "utf-8")).initialized === true;
  } catch (_) {}
  if (!initialized) {
    await setOpenWith(true);
    await setFileMenu(true);
    await setFolderMenu(true);
    try {
      fs.writeFileSync(flag, JSON.stringify({ initialized: true }), "utf-8");
    } catch (_) {}
    return;
  }
  const st = await integrationStatus();
  const stale = async (key) => {
    const r = await regRun(["query", key, "/ve"]);
    return r.ok && !r.out.includes(process.execPath);
  };
  if (st.openWith && (await stale(K(PROGID + "\\shell\\open\\command")))) await setOpenWith(true);
  if (st.fileMenu && (await stale(K("SystemFileAssociations\\.mkv\\shell\\RTXPlay\\command")))) await setFileMenu(true);
  if (st.folderMenu && (await stale(K("Directory\\shell\\RTXPlay\\command")))) await setFolderMenu(true);
}
async function setOpenWith(on) {
  if (!on) {
    await regRun(["delete", K(PROGID), "/f"]);
    await regRun(["delete", "HKCU\\Software\\RTXVideoPlayer", "/f"]);
    await regRun(["delete", "HKCU\\Software\\RegisteredApplications", "/v", "RTXVideoPlayer", "/f"]);
    for (const e of ASSOC_EXTS) await regRun(["delete", K(e + "\\OpenWithProgids"), "/v", PROGID, "/f"]);
    return;
  }
  const cmd = launchCommand();
  await regAdd(K(PROGID), null, "Video file");
  await regAdd(K(PROGID), "FriendlyTypeName", "Video file (RTX Video Player)");
  await regAdd(K(PROGID + "\\DefaultIcon"), null, `"${process.execPath}",0`);
  await regAdd(K(PROGID + "\\shell\\open"), "FriendlyAppName", "RTX Video Player");
  await regAdd(K(PROGID + "\\shell\\open\\command"), null, cmd);
  const cap = "HKCU\\Software\\RTXVideoPlayer\\Capabilities";
  await regAdd(cap, "ApplicationName", "RTX Video Player");
  await regAdd(cap, "ApplicationDescription", "Video player with RTX Video enhancement support");
  for (const e of ASSOC_EXTS) {
    await regAdd(K(e + "\\OpenWithProgids"), PROGID, "", "REG_NONE");
    await regAdd(cap + "\\FileAssociations", e, PROGID);
  }
  await regAdd("HKCU\\Software\\RegisteredApplications", "RTXVideoPlayer", "Software\\RTXVideoPlayer\\Capabilities");
}
async function setFileMenu(on) {
  for (const e of ASSOC_EXTS) {
    const key = K(`SystemFileAssociations\\${e}\\shell\\RTXPlay`);
    if (!on) await regRun(["delete", key, "/f"]);
    else {
      await regAdd(key, null, "Play with RTX Video Player");
      await regAdd(key, "Icon", `"${process.execPath}",0`);
      await regAdd(key + "\\command", null, launchCommand());
    }
  }
}
async function setFolderMenu(on) {
  const key = K("Directory\\shell\\RTXPlay");
  if (!on) return regRun(["delete", key, "/f"]);
  await regAdd(key, null, "Open folder in RTX Video Player");
  await regAdd(key, "Icon", `"${process.execPath}",0`);
  await regAdd(key + "\\command", null, launchCommand());
}
ipcMain.handle("win-integration-status", () => integrationStatus());
ipcMain.handle("win-integration-set", async (event, kind, on) => {
  if (process.platform !== "win32") return { supported: false };
  if (kind === "openWith") await setOpenWith(!!on);
  else if (kind === "fileMenu") await setFileMenu(!!on);
  else if (kind === "folderMenu") await setFolderMenu(!!on);
  return integrationStatus();
});
ipcMain.handle("win-open-default-apps", async () => {
  try {
    await shell.openExternal("ms-settings:defaultapps");
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle("file-exists", (event, u) => {
  try {
    if (typeof u !== "string" || /^https?:\/\//i.test(u)) return true;
    return fs.existsSync(toFfmpegInput(u));
  } catch (_) {
    return true;
  }
});
ipcMain.handle("files-missing", (event, list) => {
  const out = [];
  for (const u of Array.isArray(list) ? list : []) {
    try {
      if (typeof u === "string" && !/^https?:\/\//i.test(u) && !fs.existsSync(toFfmpegInput(u))) out.push(u);
    } catch (_) {}
  }
  return out;
});

// ---- Windows taskbar media controls ----
const THUMB_ORDER = [
  ["back", "Back 10s"],
  ["prev", "Previous"],
  ["play", "Play"],
  ["next", "Next"],
  ["fwd", "Forward 10s"],
];
function applyThumbar(win) {
  if (!win || win.isDestroyed() || !win._thumbIcons) return;
  const st = win._thumbState || {};
  const icons = win._thumbIcons;
  const send = (c) => () => win.webContents.send("media-command", c);
  const btns = THUMB_ORDER.map(([key, tip]) => {
    let icon = icons[key];
    let tooltip = tip;
    let cmd = key;
    if (key === "play") {
      icon = st.playing ? icons.pause : icons.play;
      tooltip = st.playing ? "Pause" : "Play";
      cmd = "toggle";
    }
    const flags = [];
    if (!st.hasMedia) flags.push("disabled");
    else if (key === "prev" && !st.hasPrev) flags.push("disabled");
    else if (key === "next" && !st.hasNext) flags.push("disabled");
    return { tooltip, icon, flags, click: send(cmd) };
  });
  try {
    win.setThumbarButtons(btns);
  } catch (_) {}
}
ipcMain.on("thumbar-icons", (event, icons) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win._thumbIcons = {};
  for (const k of Object.keys(icons || {})) win._thumbIcons[k] = nativeImage.createFromDataURL(icons[k]);
  if (!win._thumbHooked) {
    win._thumbHooked = true;
    win.on("restore", () => applyThumbar(win));
    win.on("show", () => applyThumbar(win));
  }
  applyThumbar(win);
});
ipcMain.on("thumbar-state", (event, st) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win._thumbState = st || {};
  applyThumbar(win);
});
ipcMain.on("taskbar-progress", (event, frac, mode) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  try {
    win.setProgressBar(frac < 0 ? -1 : Math.min(1, frac), { mode: mode || "normal" });
  } catch (_) {}
});

ipcMain.handle("switch-audio-track", async (event, params) => {
  try {
    const { fileUrl, audioIndex } = params || {};
    let filePath = fileUrl;
    if (typeof fileUrl === "string" && fileUrl.startsWith("file:///")) filePath = fileURLToPath(fileUrl);
    filePath = path.resolve(filePath);

    const stat = fs.statSync(filePath);
    const jobKey = `${filePath}|a${audioIndex}`;
    const existing = audioTrackJobs.get(jobKey);
    if (existing) {
      if (existing.status === "done") return { ok: true, outUrl: existing.outUrl };
      try {
        await existing.promise;
        return { ok: true, outUrl: existing.outUrl };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    const cacheKey = `${filePath}|${stat.size}|${Math.round(stat.mtimeMs)}|a${audioIndex}`;
    const cache = loadAudioCache();
    const cached = cache[cacheKey];
    if (cached && cached.outPath && fs.existsSync(cached.outPath)) {
      const outUrl = "file:///" + cached.outPath.replace(/\\/g, "/");
      audioTrackJobs.set(jobKey, { status: "done", outUrl, promise: Promise.resolve(outUrl) });
      return { ok: true, outUrl };
    }

    const probe = await probeFile(filePath);
    const stream = (probe.streams || []).find((s) => s.index === audioIndex);
    const codec = stream && stream.codec_name ? stream.codec_name.toLowerCase() : null;
    const channels = (stream && stream.channels) || 2;
    const audioOpts = channels > 6 ? ["-ac", "2"] : [];
    const compatible = codec && COMPAT_AUDIO_CODECS.has(codec);

    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext).replace(/[^\w.\-]/g, "_");
    const outPath = path.join(app.getPath("temp"), `rtx-player-${Date.now()}-${baseName}-a${audioIndex}.mp4`);
    const outUrl = "file:///" + outPath.replace(/\\/g, "/");

    const jobPromise = new Promise((resolve, reject) => {
      const opts = [
        "-map 0:v:0",
        `-map 0:${audioIndex}`,
        "-c:v copy",
        compatible ? "-c:a copy" : "-c:a aac",
        ...(compatible ? [] : ["-b:a 192k"]),
        ...audioOpts,
        "-movflags +faststart",
        "-y",
      ];
      ffmpeg(filePath)
        .outputOptions(opts)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outPath);
    });

    audioTrackJobs.set(jobKey, { status: "running", outUrl, promise: jobPromise });
    await jobPromise;
    audioTrackJobs.set(jobKey, { status: "done", outUrl, promise: Promise.resolve(outUrl) });
    const cache2 = loadAudioCache();
    cache2[cacheKey] = { outPath, ts: Date.now() };
    saveAudioCache(cache2);
    return { ok: true, outUrl };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// ---------- Screenshot ----------
ipcMain.handle("save-screenshot", async (event, dataUrl) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save screenshot",
      defaultPath: `screenshot-${Date.now()}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (canceled || !filePath) return { ok: false };
    const base64 = String(dataUrl).replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// ---------- Conversion cache management ----------
function listCacheFiles() {
  const dir = app.getPath("temp");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("rtx-player-") && f.endsWith(".mp4"))
      .map((f) => path.join(dir, f));
  } catch (_) {
    return [];
  }
}
ipcMain.handle("get-cache-info", async () => {
  const files = listCacheFiles();
  let bytes = 0;
  for (const f of files) {
    try {
      bytes += fs.statSync(f).size;
    } catch (_) {}
  }
  return { count: files.length, bytes };
});
ipcMain.handle("clear-cache", async () => {
  const files = listCacheFiles();
  let removed = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(f);
      removed++;
    } catch (_) {}
  }
  try {
    fs.writeFileSync(getCachePath(), "{}", "utf-8");
  } catch (_) {}
  try {
    fs.writeFileSync(getAudioCachePath(), "{}", "utf-8");
  } catch (_) {}
  prepareJobs.clear();
  audioTrackJobs.clear();
  return { ok: true, removed };
});

// ---------- Hardware decode toggle (requires relaunch) ----------
ipcMain.handle("get-hardware-decode", async () => {
  try {
    const flagPath = path.join(app.getPath("userData"), "hw-accel.flag");
    if (fs.existsSync(flagPath)) return fs.readFileSync(flagPath, "utf-8").trim() !== "off";
  } catch (_) {}
  return true;
});
ipcMain.handle("set-hardware-decode", async (event, enabled) => {
  try {
    const flagPath = path.join(app.getPath("userData"), "hw-accel.flag");
    fs.writeFileSync(flagPath, enabled ? "on" : "off", "utf-8");
    return true;
  } catch (e) {
    return false;
  }
});
ipcMain.handle("relaunch-app", async () => {
  app.relaunch();
  app.exit(0);
});

// Simple JSON store in userData
function getStorePath() {
  const dir = app.getPath("userData");
  return path.join(dir, "rtx-player.json");
}

ipcMain.handle("store-load", async () => {
  try {
    const p = getStorePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
});

ipcMain.handle("store-save", async (event, data) => {
  try {
    const p = getStorePath();
    fs.writeFileSync(p, JSON.stringify(data || {}, null, 2), "utf-8");
    return true;
  } catch (e) {
    return false;
  }
});
