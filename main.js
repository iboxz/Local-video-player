const { app, BrowserWindow, dialog, ipcMain, screen, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const fontList = require("font-list");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");
const { fileURLToPath } = require("url");

// Configure fluent-ffmpeg with static binaries
try {
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
  if (ffprobeStatic && ffprobeStatic.path) ffmpeg.setFfprobePath(ffprobeStatic.path);
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

// Hardware acceleration is enabled by default in Electron.

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

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
ipcMain.handle("select-video-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select video file(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Videos", extensions: ["mp4", "webm", "mkv", "mov", "avi", "m4v"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths?.length) return [];
  return filePaths.map((p) => "file:///" + p.replace(/\\/g, "/"));
});

// Prepare a video for playback: for MKV files with unsupported audio codecs
const prepareJobs = new Map(); // originalFile -> { promise, outPath, status }

ipcMain.handle("prepare-video", async (event, fileUrl, force) => {
  try {
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
            .on("error", (err) => reject(err))
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

  // If SRT, convert content to VTT format
  if (ext === ".srt") {
    // Clean up line endings
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let vttContent = "WEBVTT\n\n";
    const blocks = content.split("\n\n");

    for (let block of blocks) {
      const lines = block.split("\n");
      if (lines.length >= 3) {
        // Valid subtitle block must have at least 3 lines
        // Skip the subtitle number
        const timecode = lines[1].trim();
        // Convert timecode format from ',' to '.'
        const vttTimecode = timecode.replace(/,/g, ".");

        // Process subtitle text, preserve HTML tags but clean up font tags
        const subtitleText = lines
          .slice(2)
          .map((line) =>
            line
              // Remove font color tags
              .replace(/<font[^>]*>/gi, "")
              .replace(/<\/font>/gi, "")
              // Keep other HTML formatting if present
              .trim()
          )
          .filter((line) => line.length > 0)
          .join("\n");

        if (subtitleText) {
          vttContent += vttTimecode + "\n" + subtitleText + "\n\n";
        }
      }
    }
    content = vttContent;
  }

  return {
    content,
    fileName: path.basename(filePath),
  };
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
