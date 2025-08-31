const { app, BrowserWindow, dialog, ipcMain, screen, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const fontList = require("font-list");

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
