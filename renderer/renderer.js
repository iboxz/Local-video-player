// Renderer logic
const video = document.getElementById("video");
const videoStage = document.getElementById("videoStage");
const importVideoBtn = document.getElementById("importVideoBtn");
const playerPanel = document.getElementById("playerPanel");
const app = document.getElementById("app");
const nowGrid = document.getElementById("nowGrid");
const toastStack = document.getElementById("toastStack");

// ---------- Toast notifications ----------
function placeToastStack() {
  const page = document.getElementById("page-nowPlaying");
  const stageVisible = videoStage.offsetParent !== null && page && !page.classList.contains("hidden");
  toastStack.classList.toggle("fallback", !stageVisible);
  const home = document.getElementById("videoCornerStack");
  if (stageVisible && toastStack.parentElement !== home) home.insertBefore(toastStack, home.firstChild);
  else if (!stageVisible && toastStack.parentElement !== document.body) document.body.appendChild(toastStack);
}
// One reusable on-screen-display toast: rapid key presses update it instead of stacking
let osdEl = null,
  osdTimer = null;
function osd(text, boosted) {
  placeToastStack();
  if (!osdEl || !osdEl.isConnected) {
    osdEl = document.createElement("div");
    osdEl.className = "toast osd";
    toastStack.appendChild(osdEl);
    requestAnimationFrame(() => osdEl && osdEl.classList.add("show"));
  }
  osdEl.textContent = text;
  osdEl.style.color = boosted ? "#ffd28a" : "";
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => {
    const el = osdEl;
    osdEl = null;
    if (!el) return;
    el.classList.remove("show");
    setTimeout(() => el.remove(), 220);
  }, 1300);
}
function showToast(message, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "toast" + (opts.type ? " toast-" + opts.type : "");
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = opts.actionLabel;
    btn.onclick = () => {
      opts.onAction();
      dismiss();
    };
    el.appendChild(btn);
  }
  function dismiss() {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 220);
  }
  placeToastStack();
  toastStack.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(dismiss, opts.duration || 3500);
}

// Window control buttons
document.getElementById("minimize-btn").addEventListener("click", () => {
  window.electronAPI.windowControl.minimize();
});

let isMaximized = false;

const MAX_ICON_RESTORED_SVG = `<svg x="0px" y="0px" viewBox="0 0 10 10">
<path fill="currentColor" d="M 0 0 L 0 10 L 10 10 L 10 0 L 0 0 z M 1 1 L 9 1 L 9 9 L 1 9 L 1 1 z "/>
</svg>`;

const MAX_ICON_MAXIMIZED_SVG = `<svg x="0px" y="0px" viewBox="0 0 10 10">
<mask id="Mask">
<rect fill="#FFFFFF" width="10" height="10"></rect>
<path fill="#000000" d="M 3 1 L 9 1 L 9 7 L 8 7 L 8 2 L 3 2 L 3 1 z"/>
<path fill="#000000" d="M 1 3 L 7 3 L 7 9 L 1 9 L 1 3 z"/>
</mask>
<path fill="currentColor" d="M 2 0 L 10 0 L 10 8 L 8 8 L 8 10 L 0 10 L 0 2 L 2 2 L 2 0 z" mask="url(#Mask)"/>
</svg>`;

function updateMaximizeIcon() {
  const btn = document.getElementById("maximize-btn");
  if (!btn) return;
  btn.innerHTML = isMaximized ? MAX_ICON_MAXIMIZED_SVG : MAX_ICON_RESTORED_SVG;
}

document.getElementById("maximize-btn").addEventListener("click", () => {
  isMaximized = !isMaximized;
  window.electronAPI.windowControl.maximize();
  updateMaximizeIcon();
});

document.getElementById("close-btn").addEventListener("click", () => {
  window.electronAPI.windowControl.close();
});

// Save video time periodically and before closing
let saveTimeDebounce = null;
video.addEventListener("timeupdate", () => {
  if (video.src) {
    clearTimeout(saveTimeDebounce);
    saveTimeDebounce = setTimeout(() => {
      videoTimeStorage.save(video.src, video.currentTime);
    }, 1000);
  }
});
video.addEventListener("pause", () => {
  if (video.src) {
    videoTimeStorage.save(video.src, video.currentTime);
  }
});
window.addEventListener("beforeunload", () => {
  if (video.src) {
    videoTimeStorage.save(video.src, video.currentTime);
  }
});

const forcedPrepare = new Set();
video.addEventListener("error", () => {
  const original = playlist[currentIndex];
  if (!original || !original.toLowerCase().endsWith(".mkv")) return;
  if (video.src && video.src.startsWith(original)) {
    if (forcedPrepare.has(original)) return;
    forcedPrepare.add(original);
    setPrepStatus("Playback failed, converting...", true);
    playIndex(currentIndex, true);
  }
});

// ---------- Element refs ----------
const playlistToggle = document.getElementById("playlistToggle");
const subtitleToggle = document.getElementById("subtitleToggle");
const railToggle = document.getElementById("railToggle");
const splitter = document.getElementById("splitter");
const playlistPanel = document.getElementById("playlistPanel");
const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const seekBackBtn = document.getElementById("seekBackBtn");
const seekFwdBtn = document.getElementById("seekFwdBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");
const loopBtn = document.getElementById("loopBtn");
const loopState = null;
const enhanceBtn = document.getElementById("enhanceBtn");
const enhanceState = null;
const fullscreenBtn = document.getElementById("fullscreenBtn");
const shortcutsBtn = document.getElementById("shortcutsBtn");
const shortcutsOverlay = document.getElementById("shortcutsOverlay");
const shortcutsClose = document.getElementById("shortcutsClose");
const seekTrack = document.getElementById("seekTrack");
const seekSegs = document.getElementById("seekSegs");
const seekPreviewChapter = document.getElementById("seekPreviewChapter");
const seekThumb = document.getElementById("seekThumb");
const seekPreview = document.getElementById("seekPreview");
const seekPreviewCanvas = document.getElementById("seekPreviewCanvas");
const seekPreviewTime = document.getElementById("seekPreviewTime");
const timeCurrent = document.getElementById("timeCurrent");
const timeDuration = document.getElementById("timeDuration");
const centerPlay = document.getElementById("centerPlay");
const playerBlob = document.getElementById("playerBlob");
const blobThumb = document.getElementById("blobThumb");
const blobTitle = document.getElementById("blobTitle");
const blobSubtitle = document.getElementById("blobSubtitle");
const playlistCount = document.getElementById("playlistCount");
const fitSegmented = document.getElementById("fitSegmented");
const resetLayoutBtn = document.getElementById("resetLayoutBtn");
const pipBtn = document.getElementById("pipBtn");
const screenshotBtn = document.getElementById("screenshotBtn");
const moreBtn = document.getElementById("moreBtn");
const moreWrap = document.getElementById("moreWrap");
const audioTrackBtn = document.getElementById("audioTrackBtn");
const audioTrackWrap = document.getElementById("audioTrackWrap");
const audioTrackList = document.getElementById("audioTrackList");
const zoomSlider = document.getElementById("zoomSlider");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomValue = document.getElementById("zoomValue");
const autoplayOverlay = document.getElementById("autoplayOverlay");
const autoplayThumb = document.getElementById("autoplayThumb");
const autoplayTitle = document.getElementById("autoplayTitle");
const autoplayRing = document.getElementById("autoplayRing");
const autoplayCancel = document.getElementById("autoplayCancel");

// Playlist panel extras
const playlistSearch = document.getElementById("playlistSearch");
const playlistSearchBtn = document.getElementById("playlistSearchBtn");
const playlistSearchRow = document.getElementById("playlistSearchRow");
const playlistSelectBtn = document.getElementById("playlistSelectBtn");
const playlistBulkBar = document.getElementById("playlistBulkBar");
const playlistBulkCount = document.getElementById("playlistBulkCount");
const playlistBulkDelete = document.getElementById("playlistBulkDelete");
const playlistBulkCancel = document.getElementById("playlistBulkCancel");
const playlistEmpty = document.getElementById("playlistEmpty");

// Recent page
const recentList = document.getElementById("recentList");
const recentEmpty = document.getElementById("recentEmpty");
const clearRecentBtn = document.getElementById("clearRecentBtn");

// Settings - subtitle appearance
const subtitleFontFamily = document.getElementById("subtitleFontFamily");
const subtitleFontSize = document.getElementById("subtitleFontSize");
const subtitleFontSizeValue = document.getElementById("subtitleFontSizeValue");
const subtitleBgOpacity = document.getElementById("subtitleBgOpacity");
const subtitleBgOpacityValue = document.getElementById("subtitleBgOpacityValue");
const subtitlePos = document.getElementById("subtitlePos");
const subtitlePosValue = document.getElementById("subtitlePosValue");
const subtitlePreview = document.getElementById("subtitlePreview");
const defaultSubLang = document.getElementById("defaultSubLang");

// Settings - playback
const autoplayEnabledEl = document.getElementById("autoplayEnabled");
const autoplayDelayEl = document.getElementById("autoplayDelay");
const autoplayDelayValue = document.getElementById("autoplayDelayValue");


// Settings - advanced
const defaultFolderText = document.getElementById("defaultFolderText");
const chooseDefaultFolderBtn = document.getElementById("chooseDefaultFolderBtn");
const clearDefaultFolderBtn = document.getElementById("clearDefaultFolderBtn");
const cacheInfoText = document.getElementById("cacheInfoText");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const hwDecodeToggle = document.getElementById("hwDecodeToggle");
const resetAllBtn = document.getElementById("resetAllBtn");

// Command palette
const paletteOverlay = document.getElementById("paletteOverlay");
const paletteInput = document.getElementById("paletteInput");
const paletteList = document.getElementById("paletteList");

const playlistList = document.getElementById("playlistList");
const dropOverlay = document.getElementById("dropOverlay");

// ---------- State ----------
let playlist = []; // the queue: only videos the user chose to play or add
let libraryItems = []; // everything imported
let folders = new Map(); // id -> {name, parentId, expanded}
let itemFolder = new Map(); // src -> folderId
let folderSeq = 0;
let favorites = new Set();
let libReady = false;
let currentIndex = -1;
let subtitlesMap = new Map();
let currentSubtitles = [];
let currentSubtitleIndex = -1;
let subChoice = new Map(); // video -> { label, offset }
let currentAudioIndex = null;
const saveTimer = { current: null };
const playlistMeta = new Map(); // src -> { duration, thumb }
let recentFiles = [];

let uiPrefs = {
  railCollapsed: false,
  playlistCollapsed: false,
  playlistWidth: 320,
  videoFit: "contain",
  enhancementEnabled: true,
};

let settings = {
  autoplayEnabled: true,
  autoplayDelay: 5,
  defaultImportFolder: null,
  nightMode: false,
  nightStrength: 60,
  boostEnabled: false,
  boostMax: 200,
  boostLevel: 1,
  libView: "grid",
  libSort: "order",
  libSize: 220,
  eq: { enabled: false, preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preset: "b:Flat" },
  customEq: {},
};

const videoTimeStorage = {
  save: function (videoSrc, time) {
    const times = JSON.parse(localStorage.getItem("videoTimes") || "{}");
    times[videoSrc] = time;
    localStorage.setItem("videoTimes", JSON.stringify(times));
  },
  load: function (videoSrc) {
    const times = JSON.parse(localStorage.getItem("videoTimes") || "{}");
    return times[videoSrc] || 0;
  },
};

const subtitleSettings = {
  fontFamily: "Arial",
  fontSize: 24,
  fontWeight: "400",
  color: "#ffffff",
  availableFonts: [],
  strokeWidth: 1.5,
  strokeColor: "#000000",
  bgColor: "#000000",
  bgEnabled: false,
  bgOpacity: 60,
  edge: "outline",
  bottom: 8, // legacy (percent), migrated to bottomPx on load
  bottomPx: 40,
  lineHeight: 1,
  lift: true,
};
// restored by "Reset style" (font list is runtime data and stays)
const SUB_STYLE_DEFAULTS = { fontFamily: "Arial", fontSize: 24, fontWeight: "400", color: "#ffffff", strokeWidth: 1.5, strokeColor: "#000000", bgColor: "#000000", bgEnabled: false, bgOpacity: 60, edge: "outline", bottomPx: 40, lineHeight: 1, lift: true };

let prepOverlayEl = document.getElementById("prepOverlay");
let prepTextEl = document.getElementById("prepText");
function setPrepStatus(text, visible) {
  playerPanel.classList.toggle("preparing", !!visible);
  if (prepTextEl) prepTextEl.textContent = text || "";
  if (prepOverlayEl) prepOverlayEl.classList.toggle("hidden", !visible);
}

function formatTime(t) {
  if (isNaN(t) || t == null) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function formatBytes(b) {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

// ---------- Playlist item thumbnails & duration (lazy, client-side) ----------
const rowBySrc = new Map();
const thumbPending = new Set();
const thumbWaiting = [];
let thumbActive = 0;
function updateRowMeta(src) {
  updateLibMeta(src);
  const row = rowBySrc.get(src);
  const meta = playlistMeta.get(src);
  if (!row || !meta) return;
  const t = row.querySelector(".thumb");
  if (t && (meta.thumb || meta.failed)) t.classList.remove("skeleton");
  if (t && meta.thumb) t.style.backgroundImage = `url(${meta.thumb})`;
  const d = row.querySelector(".duration");
  if (d && meta.duration) d.textContent = formatTime(meta.duration);
  if (t && meta.duration) {
    const w = videoTimeStorage.load(src);
    const pct = w ? Math.min(100, (w / meta.duration) * 100) : 0;
    let bar = t.querySelector(".thumb-progress");
    if (pct > 2) {
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "thumb-progress";
        bar.innerHTML = '<div class="thumb-progress-fill"></div>';
        t.appendChild(bar);
      }
      bar.firstChild.style.width = pct + "%";
    }
  }
}
const thumbFails = new Map();
function pumpThumbs() {
  while (thumbActive < 2 && thumbWaiting.length) {
    const src = thumbWaiting.pop(); // newest request first = what is on screen now
    thumbActive++;
    window.electronAPI
      .getThumb(src)
      .then((res) => {
        if (res && res.ok) {
          playlistMeta.set(src, { thumb: res.thumb, duration: res.duration });
          thumbPending.delete(src);
          updateRowMeta(src);
          return;
        }
        throw new Error("thumb");
      })
      .catch(() => {
        const n = (thumbFails.get(src) || 0) + 1;
        thumbFails.set(src, n);
        if (n < 3) {
          setTimeout(() => {
            thumbWaiting.push(src);
            pumpThumbs();
          }, 3000 * n);
        } else {
          playlistMeta.set(src, { thumb: null, duration: null, failed: true });
          thumbPending.delete(src);
          updateRowMeta(src);
        }
      })
      .finally(() => {
        thumbActive--;
        pumpThumbs();
      });
  }
}
function ensurePlaylistMeta(src) {
  if (playlistMeta.has(src) || thumbPending.has(src)) return;
  if (/^https?:\/\//i.test(src)) {
    playlistMeta.set(src, { duration: null, thumb: null, failed: true });
    return;
  }
  thumbPending.add(src);
  thumbWaiting.push(src);
  pumpThumbs();
}
// only rows that are actually on screen request a thumbnail
const thumbObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      thumbObserver.unobserve(e.target);
      if (e.target.dataset.srcs) {
        try {
          JSON.parse(e.target.dataset.srcs).forEach(ensurePlaylistMeta);
        } catch (_) {}
      } else ensurePlaylistMeta(e.target.dataset.src);
    });
  },
  { root: null, rootMargin: "300px" }
);

// ---------- Playlist rendering (thumbnails, duration, search, drag, multi-select) ----------
let playlistFilter = "";
let selectMode = false;
let selectedIndices = new Set();
let dragSrcIndex = null;

function itemFolderChain(src) {
  const chain = [];
  let fid = itemFolder.get(src);
  while (fid != null) {
    chain.unshift(fid);
    fid = folders.get(fid) && folders.get(fid).parentId;
  }
  return chain;
}

function renderPlaylist() {
  renderPlaylistInner();
  libInvalidate();
  updateQuick();
}
function plFolderInfo() {
  const members = new Map();
  libraryItems.forEach((s) => {
    const f = itemFolder.get(s);
    if (f == null || !folders.has(f)) return;
    if (!members.has(f)) members.set(f, []);
    members.get(f).push(s);
  });
  const info = new Map();
  members.forEach((arr, fid) => arr.forEach((s, i) => info.set(s, { fid, pos: i + 1, total: arr.length })));
  return info;
}
function renderPlaylistInner() {
  playlistList.innerHTML = "";
  rowBySrc.clear();
  const filterLower = playlistFilter.trim().toLowerCase();
  const finfo = plFolderInfo();
  let label = null;
  let totalSec = 0;
  const frag = document.createDocumentFragment();

  playlist.forEach((src, idx) => {
    const meta0 = playlistMeta.get(src) || {};
    if (meta0.duration) totalSec += meta0.duration;
    const name = libName(src);
    const fi = finfo.get(src);
    const folderName = fi ? folders.get(fi.fid).name : "";
    if (filterLower && !name.toLowerCase().includes(filterLower) && !folderName.toLowerCase().includes(filterLower)) return;

    const section = idx < currentIndex ? "Played" : idx === currentIndex ? "Now playing" : "Up next";
    if (!filterLower && section !== label) {
      label = section;
      const lab = document.createElement("div");
      lab.className = "pl-label";
      lab.textContent = section;
      frag.appendChild(lab);
    }

    const meta = meta0;
    const watched = videoTimeStorage.load(src);
    const pct = meta.duration && watched ? Math.min(100, (watched / meta.duration) * 100) : 0;
    const row = document.createElement("div");
    row.className = "item pl-row" + (idx === currentIndex ? " active" : "") + (idx < currentIndex ? " played" : "");
    row.draggable = !selectMode;

    let inner = selectMode
      ? `<input type="checkbox" class="select-check" ${selectedIndices.has(idx) ? "checked" : ""} />`
      : `<span class="num">${idx === currentIndex ? '<i class="pl-eq"><b></b><b></b><b></b></i>' : idx + 1}</span>`;
    inner += `<div class="thumb${meta.thumb || meta.failed ? "" : " skeleton"}" style="${meta.thumb ? `background-image:url(${meta.thumb})` : ""}"><span class="duration">${meta.duration ? formatTime(meta.duration) : ""}</span>${pct > 2 ? `<div class="thumb-progress"><div class="thumb-progress-fill" style="width:${pct}%"></div></div>` : ""}</div>`;
    inner += `<div class="body"><div class="name" title="${esc(name)}">${esc(name)}</div><div class="pl-meta">${
      fi ? `<button class="pl-folder" title="${esc(libFolderPath(src))}">${esc(folderName)}<em>${fi.pos}/${fi.total}</em></button>` : '<span class="pl-nofolder">Single video</span>'
    }<span class="duration">${meta.duration ? formatTime(meta.duration) : ""}</span></div></div>`;
    if (!selectMode) {
      const isFav = favorites.has(src);
      inner += `<div class="pl-actions"><button class="fav-btn${isFav ? " active" : ""}" title="Favorite"><svg width="14" height="14" viewBox="0 0 15 15" fill="${isFav ? "currentColor" : "none"}"><path d="M7.5 12.8l-4.2 2.3.8-4.7L1 7.2l4.7-.7L7.5 2l1.8 4.5 4.7.7-3.1 3.2.8 4.7z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg></button><button class="remove" title="Remove from playlist" aria-label="Remove from playlist"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2L2 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></div>`;
    }
    row.innerHTML = inner;

    const favBtn = row.querySelector(".fav-btn");
    if (favBtn)
      favBtn.onclick = (ev) => {
        ev.stopPropagation();
        if (favorites.has(src)) favorites.delete(src);
        else favorites.add(src);
        renderPlaylist();
        scheduleSave();
      };
    const fchip = row.querySelector(".pl-folder");
    if (fchip)
      fchip.onclick = (ev) => {
        ev.stopPropagation();
        openLibrary(fi.fid, src);
      };

    if (selectMode) {
      row.querySelector(".select-check").addEventListener("change", (e) => {
        if (e.target.checked) selectedIndices.add(idx);
        else selectedIndices.delete(idx);
        updateBulkBar();
      });
      row.onclick = () => {
        const cb = row.querySelector(".select-check");
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      };
    } else {
      row.onclick = () => playIndex(idx);
      const del = row.querySelector(".remove");
      if (del)
        del.onclick = (ev) => {
          ev.stopPropagation();
          removeIndex(idx);
        };
      row.addEventListener("dragstart", () => {
        dragSrcIndex = idx;
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        dragSrcIndex = null;
        document.querySelectorAll(".item.drag-over").forEach((x) => x.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over");
        if (dragSrcIndex === null || dragSrcIndex === idx) return;
        const [moved] = playlist.splice(dragSrcIndex, 1);
        let target = idx;
        if (dragSrcIndex < idx) target -= 1;
        playlist.splice(target, 0, moved);
        if (currentIndex === dragSrcIndex) currentIndex = target;
        else if (dragSrcIndex < currentIndex && target >= currentIndex) currentIndex -= 1;
        else if (dragSrcIndex > currentIndex && target <= currentIndex) currentIndex += 1;
        renderPlaylist();
        scheduleSave();
      });
    }

    row.dataset.src = src;
    rowBySrc.set(src, row);
    if (!playlistMeta.has(src)) thumbObserver.observe(row);
    frag.appendChild(row);
  });
  playlistList.appendChild(frag);

  if (playlistCount) playlistCount.textContent = String(playlist.length);
  const tot = document.getElementById("playlistTotal");
  if (tot) {
    const m = Math.round(totalSec / 60);
    tot.textContent = totalSec ? (m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m") : "";
  }
  if (playlistPanel) playlistPanel.classList.toggle("is-empty", playlist.length === 0);
  updateBlobNowPlaying();
}

function updateBlobNowPlaying() {
  if (!blobTitle) return;
  const original = playlist[currentIndex];
  if (!original) {
    blobTitle.textContent = "Nothing playing";
    blobSubtitle.textContent = "—";
    blobThumb.style.backgroundImage = "";
    updateSideNow();
    return;
  }
  const name = decodeURIComponent(original.split("/").pop() || "");
  blobTitle.textContent = name;
  blobSubtitle.textContent = playlist.length > 1 ? `Track ${currentIndex + 1} of ${playlist.length}` : "";
  const meta = playlistMeta.get(original);
  blobThumb.style.backgroundImage = meta && meta.thumb ? `url(${meta.thumb})` : "";
  updateSideNow();
}

function updateBulkBar() {
  playlistBulkCount.textContent = selectedIndices.size + " selected";
}
playlistSelectBtn.addEventListener("click", () => {
  selectMode = !selectMode;
  selectedIndices.clear();
  playlistBulkBar.classList.toggle("hidden", !selectMode);
  playlistSelectBtn.classList.toggle("active", selectMode);
  updateBulkBar();
  renderPlaylist();
});
playlistBulkCancel.addEventListener("click", () => {
  selectMode = false;
  selectedIndices.clear();
  playlistBulkBar.classList.add("hidden");
  playlistSelectBtn.classList.remove("active");
  renderPlaylist();
});
playlistBulkDelete.addEventListener("click", () => {
  const indices = Array.from(selectedIndices).sort((a, b) => b - a);
  if (!indices.length) return;
  indices.forEach((i) => removeIndex(i, true));
  selectedIndices.clear();
  updateBulkBar();
  renderPlaylist();
  scheduleSave();
});
playlistSearch.addEventListener("input", () => {
  playlistFilter = playlistSearch.value;
  renderPlaylist();
});
playlistSearchBtn.addEventListener("click", () => {
  const willShow = playlistSearchRow.classList.contains("hidden");
  playlistSearchRow.classList.toggle("hidden", !willShow);
  playlistSearchBtn.classList.toggle("active", willShow);
  if (willShow) {
    playlistSearch.focus();
  } else {
    playlistSearch.value = "";
    playlistFilter = "";
    renderPlaylist();
  }
});

// ---------- Subtitles ----------
function saveSubChoice() {
  const src = playlist[currentIndex];
  if (!src) return;
  const sub = currentSubtitles[currentSubtitleIndex];
  subChoice.set(src, { label: sub ? sub.label : null, offset: sub ? subtitleOffsetSec : 0 });
  scheduleSave();
}
function restoreSubChoice(original) {
  if (settings.rememberSubtitle === false) return;
  const ch = subChoice.get(original);
  if (!ch || ch.label == null) return;
  const i = currentSubtitles.findIndex((s) => s.label === ch.label);
  if (i < 0) return;
  currentSubtitleIndex = i;
  applySubtitle(String(i));
  if (ch.offset) {
    const t = video.querySelector("track");
    const go = () => nudgeSubtitle(ch.offset);
    if (t) t.readyState === 2 ? go() : t.addEventListener("load", go, { once: true });
  }
}
/* subtitle panel: see the "Subtitles" section below */
function clearSubtitleTracks() {
  // disable first so Chromium drops any cue that is currently on screen, then remove
  for (let i = 0; i < video.textTracks.length; i++) {
    const tt = video.textTracks[i];
    try {
      tt.mode = "disabled";
    } catch (_) {}
  }
  const tracks = video.getElementsByTagName("track");
  while (tracks.length > 0) {
    tracks[0].remove();
  }
}

function applySubtitle(index) {
  clearSubtitleTracks();
  if (index !== "") {
    const subtitle = currentSubtitles[parseInt(index)];
    if (subtitle) {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = subtitle.label;
      track.srclang = "en";
      track.src = subtitle.blobUrl;
      track.default = true;
      video.appendChild(track);
      const trackElement = video.textTracks[0];
      if (trackElement) trackElement.mode = "showing";
      track.addEventListener("load", applyCuePosition);
      updateSubtitleStyle();
    }
  }
}

function subKey(src) {
  try {
    return new URL(src, location.href).href;
  } catch (_) {
    return src;
  }
}
function getSubsFor(src) {
  return subtitlesMap.get(src) || subtitlesMap.get(subKey(src)) || [];
}

function removeSubtitle(index) {
  if (currentSubtitles[index]) {
    if (currentSubtitleIndex === index) {
      currentSubtitleIndex = -1;
      applySubtitle("");
    }
    URL.revokeObjectURL(currentSubtitles[index].blobUrl);
    currentSubtitles.splice(index, 1);
    if (playlist[currentIndex]) subtitlesMap.set(playlist[currentIndex], currentSubtitles);
    updateSubtitleSelect();
    showToast("Subtitle removed");
    scheduleSave();
  }
}

function addSubtitleObject(fileName, content, toastText, target, source) {
  const owner = target || playlist[currentIndex];
  if (!owner) return;
  const blob = new Blob([content], { type: "text/vtt;charset=UTF-8" });
  const blobUrl = URL.createObjectURL(blob);
  const subtitle = { label: fileName, content, blobUrl, source: source || "online" };
  // the video the user was on when they asked - it may have changed while the download ran
  if (owner !== playlist[currentIndex]) {
    const list = getSubsFor(owner).slice();
    list.push(subtitle);
    subtitlesMap.set(owner, list);
    showToast("Subtitle saved for the other video");
    scheduleSave();
    return;
  }
  currentSubtitles.push(subtitle);
  subtitlesMap.set(owner, currentSubtitles);
  currentSubtitleIndex = currentSubtitles.length - 1;
  subtitleOffsetSec = 0;
  syncSubPanelValues();
  applySubtitle(currentSubtitleIndex.toString());
  updateSubtitleSelect();
  saveSubChoice();
  showToast(toastText || "Subtitle loaded");
  scheduleSave();
}

// ======================================================================
// Subtitles: one panel (CC button), one settings page, one style engine
// ======================================================================
const subtitleWrap = document.getElementById("subtitleWrap");
const subTracks = document.getElementById("subTracks");
const subEnabled = document.getElementById("subEnabled");
let lastSubIndex = -1; // the subtitle to bring back when the switch is turned on again
let subtitleLift = true; // raise subtitles while the controls are visible
const fmtOffset = (v) => (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v).toFixed(1) + "s";
function subLangOf(label) {
  const l = (label || "").toLowerCase();
  if (/(^|[\W_])(fa|fas|per|persian|farsi)([\W_]|$)/.test(l)) return "FA";
  if (/(^|[\W_])(en|eng|english)([\W_]|$)/.test(l)) return "EN";
  if (/(^|[\W_])(ar|ara|arabic)([\W_]|$)/.test(l)) return "AR";
  if (/(^|[\W_])(tr|tur|turkish)([\W_]|$)/.test(l)) return "TR";
  if (/(^|[\W_])(es|spa|spanish)([\W_]|$)/.test(l)) return "ES";
  if (/(^|[\W_])(fr|fre|fra|french)([\W_]|$)/.test(l)) return "FR";
  if (/(^|[\W_])(de|ger|deu|german)([\W_]|$)/.test(l)) return "DE";
  return "";
}
const cleanSubName = (l) => String(l || "").replace(/\.(srt|vtt|ass|ssa|sub)$/i, "");
const SUB_EMPTY_HTML =
  '<div class="sub-empty"><svg width="28" height="28" viewBox="0 0 30 30" fill="none"><rect x="3" y="6" width="24" height="18" rx="4" stroke="currentColor" stroke-width="1.5"/><path d="M8 13.5h5M16 13.5h6M8 18h8M19 18h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><b>No subtitles yet</b><span>Add a file or search online.</span></div>';
function updateSubtitleSelect() {
  const active = currentSubtitles[currentSubtitleIndex];
  subtitleToggle.classList.toggle("has-active", !!active);
  subtitleToggle.title = active ? "Subtitles: " + active.label + " (C)" : "Subtitles (C)";
  if (!subTracks) return;
  const has = !!video.src && currentSubtitles.length > 0;
  subEnabled.checked = !!active;
  subEnabled.disabled = !has;
  subTracks.innerHTML = "";
  if (!has) {
    subTracks.innerHTML = SUB_EMPTY_HTML;
  } else {
    const rows = [{ label: "Off", idx: -1 }].concat(currentSubtitles.map((s, i) => ({ label: s.label, idx: i, sub: s })));
    rows.forEach((row) => {
      const el = document.createElement("div");
      const isOn = row.idx === currentSubtitleIndex;
      el.className = "sub-row" + (isOn ? " active" : "");
      el.setAttribute("role", "radio");
      el.setAttribute("aria-checked", isOn ? "true" : "false");
      el.tabIndex = 0;
      const lang = row.sub ? subLangOf(row.label) : "";
      const src = row.sub && row.sub.source ? { auto: "Auto", online: "Online" }[row.sub.source] || "" : "";
      el.innerHTML =
        `<span class="sub-radio"></span><span class="sub-name" dir="auto" title="${esc(row.label)}">${esc(cleanSubName(row.label))}</span>` +
        (lang ? `<span class="sub-badge">${lang}</span>` : "") +
        (src ? `<span class="sub-badge soft">${src}</span>` : "") +
        (row.sub ? `<button class="sub-del" title="Remove" aria-label="Remove subtitle"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>` : "");
      el.onclick = (e) => {
        e.stopPropagation();
        if (e.target.closest(".sub-del")) return removeSubtitle(row.idx);
        selectSubtitle(row.idx);
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          selectSubtitle(row.idx);
          const a = subTracks.querySelector(".sub-row.active");
          if (a) a.focus();
        } else if ((e.key === "Delete" || e.key === "Backspace") && row.sub) {
          e.preventDefault();
          e.stopPropagation();
          removeSubtitle(row.idx);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          const list = [...subTracks.querySelectorAll(".sub-row")];
          const n = list[list.indexOf(el) + (e.key === "ArrowDown" ? 1 : -1)];
          if (n) n.focus();
        }
      };
      subTracks.appendChild(el);
    });
  }
  syncSubPanelValues();
}
function selectSubtitle(i) {
  if (currentSubtitleIndex >= 0) lastSubIndex = currentSubtitleIndex;
  currentSubtitleIndex = i;
  subtitleOffsetSec = 0;
  syncSubPanelValues();
  applySubtitle(i >= 0 ? String(i) : "");
  updateSubtitleSelect();
  saveSubChoice();
}
function toggleSubtitles() {
  if (!video.src || !currentSubtitles.length) return osd("No subtitles");
  if (currentSubtitleIndex >= 0) {
    selectSubtitle(-1);
    osd("Subtitles off");
  } else {
    selectSubtitle(lastSubIndex >= 0 && lastSubIndex < currentSubtitles.length ? lastSubIndex : 0);
    osd("Subtitles on");
  }
}
function nudgeSubtitle(delta) {
  const tt = video.textTracks[0];
  if (!tt || !tt.cues) return;
  for (let i = 0; i < tt.cues.length; i++) {
    tt.cues[i].startTime += delta;
    tt.cues[i].endTime += delta;
  }
  subtitleOffsetSec = Math.round((subtitleOffsetSec + delta) * 10) / 10;
  syncSubPanelValues();
  saveSubChoice();
}
function paintRange(el) {
  if (!el) return;
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  el.style.setProperty("--p", ((el.value - min) / (max - min)) * 100 + "%");
}
const SUB_RULER_RANGE = 5; // the ruler shows +/- 5 s
function syncSubPanelValues() {
  const $ = (id) => document.getElementById(id);
  const on = currentSubtitleIndex >= 0 && !!currentSubtitles[currentSubtitleIndex];
  const off = subtitleOffsetSec || 0;
  if (subOffsetValue) subOffsetValue.textContent = fmtOffset(off);
  const pane = $("subSyncPane");
  if (pane) {
    pane.classList.toggle("is-off", !on);
    pane.querySelectorAll(".sync-btns button").forEach((b) => (b.disabled = !on));
  }
  const reset = $("subOffsetReset");
  if (reset) reset.disabled = !on || off === 0;
  const ruler = $("subRuler");
  if (ruler) {
    ruler.setAttribute("aria-valuenow", String(off));
    ruler.tabIndex = on ? 0 : -1;
  }
  const c = Math.max(-SUB_RULER_RANGE, Math.min(SUB_RULER_RANGE, off));
  const pct = 50 + (c / SUB_RULER_RANGE) * 50;
  const mark = $("subRulerMark");
  const fill = $("subRulerFill");
  if (mark) mark.style.left = pct + "%";
  if (fill) {
    fill.style.left = Math.min(50, pct) + "%";
    fill.style.width = Math.abs(pct - 50) + "%";
  }
}
// WebVTT positioning: percent from the top, aligned by the cue's bottom edge
// The cue box is placed in percent of the picture height, so the user-facing value
// (px from the bottom edge of the picture) is converted using the real picture size.
function subPicture() {
  const r = video.getBoundingClientRect();
  if (!r.height || !r.width) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const h = vw && vh ? Math.min(r.height, (r.width * vh) / vw) : r.height; // object-fit: contain
  return { h, bottom: r.top + (r.height + h) / 2 };
}
function subLiftPx(pic) {
  if (!subtitleLift || subtitleSettings.lift === false) return 0;
  const blob = document.getElementById("playerBlob");
  if (!blob || !blob.offsetHeight) return 0;
  const panel = playerPanel.getBoundingClientRect();
  const blobBottom = parseFloat(getComputedStyle(blob).bottom) || 0;
  // distance from the picture's bottom edge to just above the controls
  return pic.bottom - panel.bottom + blob.offsetHeight + blobBottom + 12;
}
function applyCuePosition() {
  const tt = video.textTracks[0];
  if (!tt || !tt.cues) return;
  const pic = subPicture();
  const want = subtitleSettings.bottomPx == null ? 40 : subtitleSettings.bottomPx;
  const off = pic ? Math.max(want, subLiftPx(pic)) : want;
  const line = pic ? Math.max(25, Math.min(100, 100 - (off / pic.h) * 100)) : 92; // never push cues into the top quarter
  for (let i = 0; i < tt.cues.length; i++) {
    const c = tt.cues[i];
    try {
      c.snapToLines = false;
      c.lineAlign = "end";
      c.line = line;
    } catch (_) {}
  }
}
let subPosRaf = 0;
const queueCuePosition = () => {
  if (subPosRaf) return;
  subPosRaf = requestAnimationFrame(() => {
    subPosRaf = 0;
    applyCuePosition();
  });
};
new ResizeObserver(queueCuePosition).observe(video);
video.addEventListener("loadedmetadata", queueCuePosition);
// ::cue cannot use -webkit-text-stroke / paint-order (only text-shadow is allowed), so the
// outline is a set of zero-blur shadow copies placed on true circles. A square 8-direction
// pattern leaves jagged corners; dense rings (with inner rings for thick strokes) stay round.
function subOutlineShadow(w, color) {
  const radii = [w];
  if (w >= 2) radii.push(w * 0.6);
  if (w >= 3.5) radii.push(w * 0.3);
  const parts = [];
  radii.forEach((r) => {
    const n = Math.max(12, Math.min(48, Math.ceil((2 * Math.PI * r) / 0.5)));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      parts.push(`${(r * Math.cos(a)).toFixed(2)}px ${(r * Math.sin(a)).toFixed(2)}px 0 ${color}`);
    }
  });
  return parts.join(",");
}
function subCueCss(s) {
  const edge = s.edge || "outline";
  const w = Math.max(0.5, s.strokeWidth == null ? 1.5 : s.strokeWidth);
  const outline = subOutlineShadow(w, s.strokeColor);
  const shadow = "0 2px 8px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.9)";
  const textShadow = edge === "outline" ? outline : edge === "shadow" ? shadow : "none";
  const bg = edge === "box" ? s.bgColor + Math.round(s.bgOpacity * 2.55).toString(16).padStart(2, "0") : "transparent";
  return { textShadow, bg };
}
function updateSubtitleStyle() {
  const s = subtitleSettings;
  const { textShadow, bg } = subCueCss(s);
  const lh = s.lineHeight || 1.3;
  let st = document.querySelector("style[data-subtitle-style]");
  if (!st) {
    st = document.createElement("style");
    st.setAttribute("data-subtitle-style", "");
    document.head.appendChild(st);
  }
  st.textContent = `::cue { font-family: ${s.fontFamily}; font-size: ${s.fontSize}px; font-weight: ${s.fontWeight}; color: ${s.color}; text-shadow: ${textShadow}; background-color: ${bg}; line-height: ${lh}; }`;
  document.querySelectorAll(".subtitle-preview").forEach((p) => {
    const ps = p.style;
    const scale = parseFloat(p.dataset.scale) || 0.62; // the preview stage is smaller than the video
    ps.fontFamily = s.fontFamily;
    ps.fontWeight = s.fontWeight;
    ps.fontSize = Math.round(s.fontSize * scale) + "px";
    ps.lineHeight = String(lh);
    ps.color = s.color;
    ps.textShadow = textShadow;
    ps.setProperty("--sub-bg", bg);
    ps.bottom = Math.round((s.bottomPx == null ? 40 : s.bottomPx) * scale) + "px";
    const g = document.getElementById("subGuide");
    if (g) {
      g.style.bottom = ps.bottom;
      g.dataset.px = (s.bottomPx == null ? 40 : s.bottomPx) + "px";
    }
  });
  applyCuePosition();
}

// ---- style presets (same tile language as the interface-style picker) ----
const SUB_PRESET_BASE = { fontSize: 24, fontWeight: "400", color: "#ffffff", strokeWidth: 1.5, strokeColor: "#000000", bgColor: "#000000", bgOpacity: 60, edge: "outline", lineHeight: 1 };
const SUB_PRESETS = [
  { id: "classic", name: "Classic", p: {} },
  { id: "cinema", name: "Cinema", p: { fontWeight: "500", color: "#F3F2DE", edge: "shadow", fontSize: 26 } },
  { id: "bold", name: "Bold", p: { fontWeight: "700", edge: "outline", strokeWidth: 2.5, fontSize: 30 } },
  { id: "yellow", name: "Yellow", p: { fontWeight: "600", color: "#FFE45C", strokeWidth: 2, fontSize: 26 } },
  { id: "boxed", name: "Boxed", p: { fontWeight: "500", edge: "box", bgOpacity: 70 } },
  { id: "large", name: "Large print", p: { fontWeight: "700", edge: "box", bgOpacity: 80, fontSize: 40 } },
];
const subPresetFull = (pr) => Object.assign({}, SUB_PRESET_BASE, pr.p);
function buildSubPresets() {
  const host = document.getElementById("subPresets");
  if (!host) return;
  host.innerHTML = "";
  SUB_PRESETS.forEach((pr) => {
    const m = subPresetFull(pr);
    const { textShadow, bg } = subCueCss(m);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sset-pre";
    b.dataset.id = pr.id;
    const px = Math.round(13 + (m.fontSize - 24) * 0.45);
    b.innerHTML = `<span class="sset-pre-stage"><i style="color:${m.color};font-weight:${m.fontWeight};font-size:${px}px;line-height:${m.lineHeight};text-shadow:${textShadow};background:${bg}">Subtitle</i></span><b>${pr.name}</b>`;
    b.addEventListener("click", () => setSubSetting(Object.assign({ bgEnabled: m.edge === "box" }, m)));
    host.appendChild(b);
  });
}

function syncSubSettingsUi() {
  const s = subtitleSettings;
  const $ = (id) => document.getElementById(id);
  if (subtitleFontFamily.options.length) subtitleFontFamily.value = s.fontFamily;
  const setRange = (id, v, fmt) => {
    const el = $(id);
    if (el) {
      if (String(el.value) !== String(v)) el.value = v;
      paintRange(el);
    }
    const o = $(id + "Value");
    if (o) o.textContent = fmt(v);
  };
  setRange("subtitleFontSize", s.fontSize, (v) => v + "px");
  setRange("subtitleLine", s.lineHeight == null ? 1.3 : s.lineHeight, (v) => Number(v).toFixed(2));
  setRange("subStrokeW", s.strokeWidth == null ? 1.5 : s.strokeWidth, (v) => v + "px");
  setRange("subtitleBgOpacity", s.bgOpacity, (v) => v + "%");
  setRange("subtitlePos", s.bottomPx == null ? 40 : s.bottomPx, (v) => v + "px");
  document.querySelectorAll("#subWeightSeg button").forEach((b) => b.classList.toggle("active", b.dataset.w === String(s.fontWeight)));
  const edge = s.edge || "outline";
  document.querySelectorAll("#subEdgeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.edge === edge));
  // options that only apply to the chosen edge stay in place but go quiet
  document.querySelectorAll(".sset [data-needs]").forEach((row) => {
    const off = row.dataset.needs !== edge;
    row.classList.toggle("is-off", off);
    row.querySelectorAll("input, button").forEach((el) => (el.disabled = off));
  });
  // swatch groups: text color, outline color, box color
  document.querySelectorAll(".sub-swatches[data-key]").forEach((g) => {
    const cur = String(s[g.dataset.key] || "").toLowerCase();
    let preset = false;
    g.querySelectorAll("button[data-c]").forEach((b) => {
      const m = b.dataset.c.toLowerCase() === cur;
      b.classList.toggle("active", m);
      preset = preset || m;
    });
    const cu = g.querySelector(".sub-swatch-custom");
    if (cu) {
      cu.classList.toggle("active", !preset);
      cu.classList.toggle("has-color", !preset);
      cu.style.setProperty("--c", cur);
    }
    if (g._cpSync) g._cpSync(cur);
  });
  const lift = $("subLift");
  if (lift) lift.checked = s.lift !== false;
  document.querySelectorAll("#subPresets .sset-pre").forEach((b) => {
    const pr = SUB_PRESETS.find((x) => x.id === b.dataset.id);
    const m = subPresetFull(pr);
    b.classList.toggle("active", Object.keys(m).every((k) => String(s[k]) === String(m[k])));
    const i = b.querySelector("i");
    if (i) i.style.fontFamily = s.fontFamily;
  });
  document.getElementById("autoLoadSubs").checked = settings.autoLoadSubs !== false;
  syncSubPanelValues();
}
function setSubSetting(patch) {
  Object.assign(subtitleSettings, patch);
  syncSubSettingsUi();
  updateSubtitleStyle();
  scheduleSave();
}

// ---- panel wiring ----
subtitleToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const will = !subtitleWrap.classList.contains("open");
  closeAllPopovers();
  if (will) {
    subtitleWrap.classList.add("open");
    updateSubtitleSelect();
  }
});
subEnabled.addEventListener("change", () => {
  if (subEnabled.checked) selectSubtitle(lastSubIndex >= 0 && lastSubIndex < currentSubtitles.length ? lastSubIndex : 0);
  else selectSubtitle(-1);
});
document.getElementById("subAddFile").addEventListener("click", async () => {
  if (!video.src) return showToast("Load a video first", { type: "error" });
  const target = playlist[currentIndex];
  try {
    const files = await window.electronAPI.selectSubtitleFiles();
    (files || []).forEach((f) => addSubtitleObject(f.fileName, f.content, null, target, "file"));
  } catch (_) {
    showToast("Error loading subtitle", { type: "error" });
  }
});
document.getElementById("subSearchBtn").addEventListener("click", () => {
  closeAllPopovers();
  openSubSearch();
});
const subStep = (id, d) => document.getElementById(id).addEventListener("click", () => currentSubtitleIndex >= 0 && nudgeSubtitle(d));
subStep("subOffsetMinus5", -0.5);
subStep("subOffsetMinus", -0.1);
subStep("subOffsetPlus", 0.1);
subStep("subOffsetPlus5", 0.5);
function resetSubOffset() {
  if (currentSubtitleIndex < 0) return;
  applySubtitle(String(currentSubtitleIndex));
  subtitleOffsetSec = 0;
  syncSubPanelValues();
  saveSubChoice();
}
document.getElementById("subOffsetReset").addEventListener("click", resetSubOffset);

// ---- drag the ruler to shift subtitles (3 px = 0.1 s on the default width) ----
const subRuler = document.getElementById("subRuler");
let subDrag = null;
function subSetOffset(target, lim) {
  target = Math.max(-lim, Math.min(lim, Math.round(target * 10) / 10));
  const d = Math.round((target - subtitleOffsetSec) * 10) / 10;
  if (d) nudgeSubtitle(d);
}
subRuler.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || currentSubtitleIndex < 0) return;
  e.preventDefault();
  subRuler.setPointerCapture(e.pointerId);
  subRuler.focus({ preventScroll: true });
  subDrag = { x: e.clientX, start: subtitleOffsetSec, pps: subRuler.clientWidth / (SUB_RULER_RANGE * 2), lim: Math.max(SUB_RULER_RANGE, Math.abs(subtitleOffsetSec)) };
  subRuler.classList.add("dragging");
});
subRuler.addEventListener("pointermove", (e) => {
  if (!subDrag) return;
  const fine = e.shiftKey ? 0.25 : 1; // hold Shift for fine control
  subSetOffset(subDrag.start + ((e.clientX - subDrag.x) / subDrag.pps) * fine, subDrag.lim);
});
const endSubDrag = () => {
  subDrag = null;
  subRuler.classList.remove("dragging");
};
subRuler.addEventListener("pointerup", endSubDrag);
subRuler.addEventListener("pointercancel", endSubDrag);
subRuler.addEventListener("lostpointercapture", endSubDrag);
subRuler.addEventListener("dblclick", resetSubOffset);
subRuler.addEventListener("keydown", (e) => {
  if (currentSubtitleIndex < 0) return;
  const step = e.shiftKey ? 0.5 : 0.1;
  if (e.key === "ArrowLeft") nudgeSubtitle(-step);
  else if (e.key === "ArrowRight") nudgeSubtitle(step);
  else if (e.key === "Home" || e.key === "Escape") resetSubOffset();
  else return;
  e.preventDefault();
  e.stopPropagation();
});

document.getElementById("subMoreSettings").addEventListener("click", () => {
  closeAllPopovers();
  document.querySelector('.nav-item[data-page="settings"]').click();
  openSettingsTab("subtitles");
});
const edgePatch = (edge) => ({ edge, bgEnabled: edge === "box", strokeWidth: edge === "outline" && !(subtitleSettings.strokeWidth > 0) ? 1.5 : subtitleSettings.strokeWidth });
document.querySelectorAll("#subEdgeSeg button").forEach((b) => b.addEventListener("click", () => setSubSetting(edgePatch(b.dataset.edge))));

// ---- settings page wiring ----
subtitleFontFamily.addEventListener("change", (e) => setSubSetting({ fontFamily: e.target.value }));
const bindSubRange = (id, key, parse) => document.getElementById(id).addEventListener("input", (e) => setSubSetting({ [key]: parse(e.target.value) }));
bindSubRange("subtitleFontSize", "fontSize", (v) => parseInt(v, 10));
bindSubRange("subtitleLine", "lineHeight", parseFloat);
bindSubRange("subStrokeW", "strokeWidth", parseFloat);
bindSubRange("subtitleBgOpacity", "bgOpacity", (v) => parseInt(v, 10));
bindSubRange("subtitlePos", "bottomPx", (v) => parseInt(v, 10));
document.querySelectorAll("#subWeightSeg button").forEach((b) => b.addEventListener("click", () => setSubSetting({ fontWeight: b.dataset.w })));
// ---- inline color picker (replaces the native dialog, which opened outside the card) ----
const clamp01 = (n) => Math.max(0, Math.min(1, n));
function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function initColorPicker(group) {
  const key = group.dataset.key;
  const btn = group.querySelector(".sub-swatch-custom");
  const cp = document.createElement("div");
  cp.className = "cp";
  cp.hidden = true;
  cp.innerHTML =
    '<div class="cp-sv" tabindex="0" role="slider" aria-label="Saturation and brightness"><i class="cp-thumb"></i></div>' +
    '<div class="cp-side"><span class="cp-lbl">Hue</span><input type="range" class="cp-hue" min="0" max="360" step="1" aria-label="Hue" />' +
    '<span class="cp-lbl">Hex</span><div class="cp-hex"><span class="cp-chip"></span><input class="cp-hex-input" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color" /></div></div>';
  group.appendChild(cp);
  const sv = cp.querySelector(".cp-sv");
  const thumb = cp.querySelector(".cp-thumb");
  const hue = cp.querySelector(".cp-hue");
  const chip = cp.querySelector(".cp-chip");
  const hex = cp.querySelector(".cp-hex-input");
  let H = 0, S = 0, V = 1, busy = false, dragging = false, typing = false;
  const paint = () => {
    const c = hsvToHex(H, S, V);
    sv.style.setProperty("--h", H);
    thumb.style.left = S * 100 + "%";
    thumb.style.top = (1 - V) * 100 + "%";
    hue.value = H;
    chip.style.background = c;
    if (!typing) hex.value = c.toUpperCase();
  };
  const apply = () => {
    busy = true; // our own change must not re-derive HSV (it would make the thumb jitter)
    setSubSetting({ [key]: hsvToHex(H, S, V) });
    busy = false;
    paint();
  };
  const fromPointer = (e) => {
    const r = sv.getBoundingClientRect();
    S = clamp01((e.clientX - r.left) / r.width);
    V = 1 - clamp01((e.clientY - r.top) / r.height);
    apply();
  };
  sv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    sv.setPointerCapture(e.pointerId);
    sv.focus({ preventScroll: true });
    dragging = true;
    fromPointer(e);
  });
  sv.addEventListener("pointermove", (e) => dragging && fromPointer(e));
  ["pointerup", "pointercancel"].forEach((ev) => sv.addEventListener(ev, () => (dragging = false)));
  sv.addEventListener("keydown", (e) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") S = clamp01(S - d);
    else if (e.key === "ArrowRight") S = clamp01(S + d);
    else if (e.key === "ArrowUp") V = clamp01(V + d);
    else if (e.key === "ArrowDown") V = clamp01(V - d);
    else return;
    e.preventDefault();
    e.stopPropagation();
    apply();
  });
  hue.addEventListener("input", () => {
    H = parseFloat(hue.value);
    apply();
  });
  hex.addEventListener("input", () => {
    let t = hex.value.trim().replace(/^#?/, "#");
    if (/^#[0-9a-f]{3}$/i.test(t)) t = "#" + t.slice(1).split("").map((c) => c + c).join("");
    const c = hexToHsv(t);
    if (!c) return;
    if (c.s > 0.001 && c.v > 0.001) H = c.h;
    S = c.s;
    V = c.v;
    typing = true; // keep what the user is typing (e.g. a lower-case or 3-digit hex)
    apply();
    typing = false;
  });
  hex.addEventListener("blur", paint);
  hex.addEventListener("keydown", (e) => {
    if (e.key === "Enter") hex.blur();
  });
  const setOpen = (open) => {
    cp.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("open", open);
    if (open) group._cpSync(String(subtitleSettings[key] || "#ffffff"));
  };
  group._cpSync = (c) => {
    if (busy) return;
    const v = hexToHsv(c);
    if (!v) return;
    if (v.s > 0.001 && v.v > 0.001) H = v.h; // keep the hue when the color is gray/black
    S = v.s;
    V = v.v;
    paint();
  };
  group._cpClose = () => setOpen(false);
  btn.addEventListener("click", () => setOpen(cp.hidden));
  cp.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      btn.focus();
    }
  });
}
document.addEventListener("pointerdown", (e) => {
  document.querySelectorAll(".sub-swatches").forEach((g) => {
    if (g._cpClose && !g.contains(e.target)) g._cpClose();
  });
});
document.querySelectorAll(".sub-swatches[data-key]").forEach((g) => {
  const key = g.dataset.key;
  g.querySelectorAll("button[data-c]").forEach((b) => b.addEventListener("click", () => setSubSetting({ [key]: b.dataset.c })));
  initColorPicker(g);
});
document.getElementById("subLift").addEventListener("change", (e) => setSubSetting({ lift: e.target.checked }));
document.getElementById("subStyleReset").addEventListener("click", () => {
  setSubSetting(Object.assign({}, SUB_STYLE_DEFAULTS));
  showToast("Subtitle style reset");
});
document.getElementById("autoLoadSubs").addEventListener("change", (e) => {
  settings.autoLoadSubs = e.target.checked;
  scheduleSave();
});

// preview backdrop: check legibility on dark, colorful and bright scenes
const subStageEl = document.getElementById("subPreviewStage");
function setSubBackdrop(v) {
  subStageEl.dataset.bg = v;
  document.querySelectorAll("#subBackdropSeg button").forEach((b) => b.classList.toggle("active", b.dataset.bg === v));
  try {
    localStorage.setItem("subPreviewBg", v);
  } catch (_) {}
}
document.querySelectorAll("#subBackdropSeg button").forEach((b) => b.addEventListener("click", () => setSubBackdrop(b.dataset.bg)));
let savedBackdrop = "night";
try {
  savedBackdrop = localStorage.getItem("subPreviewBg") || "night";
} catch (_) {}
setSubBackdrop(["night", "scene", "day"].includes(savedBackdrop) ? savedBackdrop : "night");
const subPosSlider = document.getElementById("subtitlePos");
["pointerdown", "focus"].forEach((ev) => subPosSlider.addEventListener(ev, () => subStageEl.classList.add("guiding")));
["pointerup", "pointercancel", "blur"].forEach((ev) => subPosSlider.addEventListener(ev, () => subStageEl.classList.remove("guiding")));
buildSubPresets();
// raise subtitles while the controls are visible, lower them when the controls hide
new MutationObserver(() => {
  const lift = !playerPanel.classList.contains("idle");
  if (lift !== subtitleLift) {
    subtitleLift = lift;
    applyCuePosition();
  }
}).observe(playerPanel, { attributes: true, attributeFilter: ["class"] });

// ---- auto-load subtitle files that sit next to the video ----
async function autoLoadSidecars(original) {
  if (settings.autoLoadSubs === false || /^https?:/i.test(original)) return;
  let found = [];
  try {
    found = (await window.electronAPI.findSidecarSubs(original)) || [];
  } catch (_) {}
  if (!found.length || playlist[currentIndex] !== original) return;
  const had = new Set(currentSubtitles.map((s) => s.label));
  let added = 0;
  found.forEach((f) => {
    if (had.has(f.fileName)) return;
    const blobUrl = URL.createObjectURL(new Blob([f.content], { type: "text/vtt;charset=UTF-8" }));
    currentSubtitles.push({ label: f.fileName, content: f.content, blobUrl, source: "auto" });
    added++;
  });
  if (!added) return;
  subtitlesMap.set(original, currentSubtitles);
  const remembered = settings.rememberSubtitle !== false && subChoice.has(original);
  if (currentSubtitleIndex === -1 && !remembered) {
    currentSubtitleIndex = currentSubtitles.findIndex((s) => s.source === "auto");
    applySubtitle(String(currentSubtitleIndex));
  }
  updateSubtitleSelect();
  scheduleSave();
}

// ---------- Online subtitle search ----------
const subSearchOverlay = document.getElementById("subSearchOverlay");
const subSearchClose = document.getElementById("subSearchClose");
const subSearchKeyEdit = document.getElementById("subSearchKeyEdit");
const subSearchApiKeyRow = document.getElementById("subSearchApiKeyRow");
const subSearchApiKeyInput = document.getElementById("subSearchApiKeyInput");
const subSearchApiKeySave = document.getElementById("subSearchApiKeySave");
const subSearchApiKeyLink = document.getElementById("subSearchApiKeyLink");
const subSearchQuery = document.getElementById("subSearchQuery");
const subSearchLang = document.getElementById("subSearchLang");
const subSearchGo = document.getElementById("subSearchGo");
const subSearchStatus = document.getElementById("subSearchStatus");
const subSearchResults = document.getElementById("subSearchResults");

let subtitleSearchPrefs = { apiKey: "", language: "all" };

function cleanTitleFromFilename(fileName) {
  let name = (fileName || "").replace(/\.[a-z0-9]{2,4}$/i, "");
  name = name.replace(/[._]+/g, " ");
  name = name.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  const junk =
    /\b(1080p|720p|2160p|480p|4k|uhd|hdr10?|bluray|blu-ray|bdrip|brrip|webrip|web-?dl|hdtv|dvdrip|hdrip|x264|x265|h264|h265|hevc|aac\d*|ac3|dts(-?hd)?|dd5\.1|10bit|8bit|remux|extended|proper|repack|multi|dual audio|yify|yts|rarbg)\b/gi;
  name = name.replace(junk, " ");
  name = name.replace(/\s{2,}/g, " ").trim();
  return name;
}

function setSubSearchStatus(text, isError) {
  if (!subSearchStatus) return;
  if (!text) {
    subSearchStatus.classList.add("hidden");
    subSearchStatus.textContent = "";
    return;
  }
  subSearchStatus.textContent = text;
  subSearchStatus.classList.remove("hidden");
  subSearchStatus.classList.toggle("error", !!isError);
}

function applyApiKeyRowVisibility() {
  const hasKey = !!subtitleSearchPrefs.apiKey;
  subSearchApiKeyRow.classList.toggle("hidden", hasKey);
  if (!hasKey) subSearchApiKeyInput.focus();
}

function openSubSearch() {
  if (!video.src || currentIndex < 0) {
    showToast("Load a video first", { type: "error" });
    return;
  }
  shortcutsOverlay.classList.add("hidden");
  paletteOverlay.classList.add("hidden");
  subSearchResults.innerHTML = "";
  setSubSearchStatus("");
  subSearchLang.value = subtitleSearchPrefs.language || "all";
  const original = playlist[currentIndex] || "";
  const fileName = decodeURIComponent(original.split("/").pop() || "");
  subSearchQuery.value = cleanTitleFromFilename(fileName);
  applyApiKeyRowVisibility();
  subSearchOverlay.classList.remove("hidden");
  if (subtitleSearchPrefs.apiKey) subSearchQuery.focus();
}
function closeSubSearch() {
  subSearchOverlay.classList.add("hidden");
}

subSearchClose.addEventListener("click", closeSubSearch);
subSearchOverlay.addEventListener("click", (e) => {
  if (e.target === subSearchOverlay) closeSubSearch();
});
subSearchKeyEdit.addEventListener("click", () => {
  subSearchApiKeyRow.classList.remove("hidden");
  subSearchApiKeyInput.value = subtitleSearchPrefs.apiKey || "";
  subSearchApiKeyInput.focus();
});
subSearchApiKeyLink.addEventListener("click", (e) => {
  e.preventDefault();
  window.electronAPI.openExternal("https://www.opensubtitles.com/en/consumers");
});
subSearchApiKeySave.addEventListener("click", () => {
  const key = subSearchApiKeyInput.value.trim();
  if (!key) return;
  subtitleSearchPrefs.apiKey = key;
  subSearchApiKeyRow.classList.add("hidden");
  scheduleSave();
  setSubSearchStatus("");
  subSearchQuery.focus();
});
subSearchLang.addEventListener("change", () => {
  subtitleSearchPrefs.language = subSearchLang.value;
  if (defaultSubLang) defaultSubLang.value = subSearchLang.value;
  scheduleSave();
});

function renderSkeletons() {
  subSearchResults.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const el = document.createElement("div");
    el.className = "skeleton-row";
    subSearchResults.appendChild(el);
  }
}

function renderSubResults(results) {
  subSearchResults.innerHTML = "";
  if (!results.length) {
    setSubSearchStatus("No subtitles found. Try a shorter or different title.");
    return;
  }
  setSubSearchStatus("");
  results.forEach((r) => {
    const row = document.createElement("div");
    row.className = "sub-result";
    const downloads = r.downloadCount ? r.downloadCount.toLocaleString() + " downloads" : "";
    row.innerHTML = `
      <div class="sub-result-main">
        <div class="sub-result-title" title="${r.release.replace(/"/g, "&quot;")}">${r.release}</div>
        <div class="sub-result-meta">
          <span class="sub-badge">${(r.language || "?").toUpperCase()}</span>
          <span class="sub-meta-text">${downloads}${r.hearingImpaired ? " · HI" : ""}</span>
        </div>
      </div>
      <button class="btn primary sub-result-add">Add</button>
    `;
    const addBtn = row.querySelector(".sub-result-add");
    addBtn.addEventListener("click", async () => {
      row.classList.add("adding");
      addBtn.textContent = "Adding...";
      const subTarget = playlist[currentIndex];
      try {
        const res = await window.electronAPI.downloadSubtitle({
          fileId: r.fileId,
          apiKey: subtitleSearchPrefs.apiKey,
          releaseName: r.release,
        });
        if (res && res.ok) {
          addSubtitleObject(res.fileName, res.content, "Subtitle added: " + res.fileName, subTarget);
          closeSubSearch();
        } else {
          row.classList.remove("adding");
          addBtn.textContent = "Add";
          setSubSearchStatus("Couldn't download that subtitle. Try another result.", true);
        }
      } catch (e) {
        row.classList.remove("adding");
        addBtn.textContent = "Add";
        setSubSearchStatus("Couldn't download that subtitle. Try another result.", true);
      }
    });
    subSearchResults.appendChild(row);
  });
}

async function runSubSearch() {
  if (!subtitleSearchPrefs.apiKey) {
    applyApiKeyRowVisibility();
    setSubSearchStatus("Add your API key first.", true);
    return;
  }
  const query = subSearchQuery.value.trim();
  if (!query) {
    setSubSearchStatus("Enter a title to search.", true);
    return;
  }
  setSubSearchStatus("");
  renderSkeletons();
  try {
    const res = await window.electronAPI.searchSubtitles({
      query,
      language: subSearchLang.value,
      apiKey: subtitleSearchPrefs.apiKey,
    });
    if (res && res.ok) {
      renderSubResults(res.results || []);
    } else {
      subSearchResults.innerHTML = "";
      const err = res && res.error === "missing_api_key" ? "Add your API key first." : "Search failed. Check your API key and connection.";
      setSubSearchStatus(err, true);
      if (res && res.error === "missing_api_key") applyApiKeyRowVisibility();
    }
  } catch (e) {
    subSearchResults.innerHTML = "";
    setSubSearchStatus("Search failed. Check your connection.", true);
  }
}
subSearchGo.addEventListener("click", runSubSearch);
subSearchQuery.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSubSearch();
});

// ---------- Recent files ----------
function pushRecent(src) {
  const name = decodeURIComponent(src.split("/").pop() || "");
  recentFiles = recentFiles.filter((r) => r.src !== src);
  recentFiles.unshift({ src, name, ts: Date.now() });
  recentFiles = recentFiles.slice(0, 40);
  renderRecent();
  scheduleSave();
}
function renderRecent() {
  recentList.innerHTML = "";
  recentEmpty.classList.toggle("hidden", recentFiles.length > 0);
  recentFiles.forEach((r) => {
    const row = document.createElement("div");
    row.className = "recent-item";
    const when = new Date(r.ts).toLocaleString();
    row.innerHTML = `<div class="recent-name">${r.name}</div><div class="recent-time mono">${when}</div>`;
    row.onclick = () => {
      playNow([r.src]);
      const navBtn = document.querySelector('.nav-item[data-page="nowPlaying"]');
      if (navBtn) navBtn.click();
    };
    recentList.appendChild(row);
  });
}
clearRecentBtn.addEventListener("click", () => {
  recentFiles = [];
  renderRecent();
  scheduleSave();
});

// ---------- Autoplay-next (cancellable) ----------
let autoplayTimer = null;
let autoplayInterval = null;
function cancelAutoplay() {
  clearTimeout(autoplayTimer);
  clearInterval(autoplayInterval);
  autoplayTimer = null;
  autoplayInterval = null;
  autoplayOverlay.classList.add("hidden");
}
autoplayCancel.addEventListener("click", cancelAutoplay);

let preparingSet = new Set();

if (window.electronAPI && window.electronAPI.onPrepareProgress) {
  window.electronAPI.onPrepareProgress((data) => {
    try {
      if (!data) return;
      const percent = data.percent != null ? Math.round(data.percent) + "%" : data.timemark || "Preparing...";
      const currentOriginal = playlist[currentIndex];
      if (currentOriginal && currentOriginal === data.original) {
        setPrepStatus("Converting audio: " + percent, true);
      }
    } catch (_) {}
  });
}
if (window.electronAPI && window.electronAPI.onPrepareDone) {
  window.electronAPI.onPrepareDone((data) => {
    try {
      if (!data) return;
      const currentOriginal = playlist[currentIndex];
      if (currentOriginal && currentOriginal === data.original) setPrepStatus("", false);
      if (preparingSet.has(data.original)) preparingSet.delete(data.original);
    } catch (_) {}
  });
}
if (window.electronAPI && window.electronAPI.onPrepareError) {
  window.electronAPI.onPrepareError((data) => {
    try {
      if (!data) return;
      const currentOriginal = playlist[currentIndex];
      if (currentOriginal && currentOriginal === data.original) {
        setPrepStatus("Preparation failed", true);
        setTimeout(() => setPrepStatus("", false), 2500);
      }
      if (preparingSet.has(data.original)) preparingSet.delete(data.original);
    } catch (_) {}
  });
}

// ---------- Play / navigate ----------
const missingOverlay = document.getElementById("missingOverlay");
let missingSrc = null;
function showMissing(src) {
  missingSrc = src;
  let n = src;
  try {
    n = decodeURIComponent(src.replace(/^file:\/+/, ""));
  } catch (_) {}
  document.getElementById("missingName").textContent = n;
  missingOverlay.classList.remove("hidden");
  document.getElementById("missingKeep").focus();
}
document.getElementById("missingKeep").addEventListener("click", () => missingOverlay.classList.add("hidden"));
missingOverlay.addEventListener("click", (e) => {
  if (e.target === missingOverlay) missingOverlay.classList.add("hidden");
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !missingOverlay.classList.contains("hidden")) missingOverlay.classList.add("hidden");
});
document.getElementById("missingRemove").addEventListener("click", () => {
  missingOverlay.classList.add("hidden");
  if (missingSrc) removeSrcs([missingSrc]);
  showToast("Removed from library");
});
document.getElementById("missingAll").addEventListener("click", async () => {
  missingOverlay.classList.add("hidden");
  const list = (await window.electronAPI.filesMissing(playlist.slice())) || [];
  if (list.length) removeSrcs(list);
  showToast(list.length ? "Removed " + list.length + " missing file" + (list.length === 1 ? "" : "s") : "No missing files found");
});
async function playIndex(idx, forcePrepare) {
  if (idx < 0 || idx >= playlist.length) return;
  const probeSrc = playlist[idx];
  if (probeSrc && !/^https?:\/\//i.test(probeSrc)) {
    let exists = true;
    try {
      exists = await window.electronAPI.fileExists(probeSrc);
    } catch (_) {}
    if (!exists) {
      showMissing(probeSrc);
      return;
    }
  }
  cancelAutoplay();
  closeAllPopovers();
  currentIndex = idx;
  currentAudioIndex = null;
  setZoom(1);

  const original = playlist[idx];
  if (!preparingSet.has(original)) preparingSet.add(original);

  clearSubtitleTracks();
  liveAudio.retries = 0;
  setPrepStatus("Preparing...", true);

  liveStop();
  let prepared = original;
  let livePlan = null;
  if (!forcePrepare) {
    try {
      const plan = await window.electronAPI.audioLivePlan(original);
      if (plan && plan.live) livePlan = plan;
    } catch (_) {}
  }
  if (!livePlan) {
    try {
      prepared = (await window.electronAPI.prepareVideo(original, !!forcePrepare)) || original;
    } catch (e) {
      prepared = original;
    }
  }

  if (preparingSet.has(original)) preparingSet.delete(original);

  if (currentIndex !== idx) return; // superseded by a newer navigation

  setPrepStatus("", false);

  video.src = prepared;
  video.currentTime = 0;
  playerPanel.classList.add("has-media");
  updateBlobNowPlaying();
  updateMediaSessionMeta();
  ensureAudioGraph();
  loadChapters(original);
  subtitleOffsetSec = 0;
  syncSubPanelValues();

  currentSubtitles = getSubsFor(original);
  currentSubtitleIndex = -1;
  applySubtitle("");
  restoreSubChoice(original);
  updateSubtitleSelect();
  autoLoadSidecars(original);

  const savedTime = videoTimeStorage.load(original);
  if (savedTime > 5) {
    pendingTimeRestore = savedTime;
    showToast("Resumed from " + formatTime(savedTime));
  } else {
    pendingTimeRestore = null;
  }

  if (livePlan) {
    currentAudioIndex = livePlan.track;
    liveStart(original, livePlan.track, pendingTimeRestore || 0)
      .then((s) => {
        if (s) s.onFail = () => fallbackToConvert(original);
      })
      .catch(() => fallbackToConvert(original));
  }

  video.play().catch(() => {});
  renderPlaylist();
  pushRecent(original);
  scheduleSave();
}
function fallbackToConvert(original) {
  if (playlist[currentIndex] !== original || forcedPrepare.has(original)) return;
  forcedPrepare.add(original);
  setPrepStatus("Live audio unavailable, converting...", true);
  playIndex(currentIndex, true);
}

let pendingTimeRestore = null;
video.addEventListener("loadedmetadata", () => {
  if (pendingTimeRestore != null) {
    try {
      video.currentTime = pendingTimeRestore;
    } catch (_) {}
    pendingTimeRestore = null;
  }
});

// Import = Library only. Nothing enters the playlist until the user picks it.
function libAddItems(urls) {
  const have = new Set(libraryItems);
  let n = 0;
  urls.filter(Boolean).forEach((u) => {
    if (!have.has(u)) {
      libraryItems.push(u);
      have.add(u);
      n++;
    }
  });
  renderPlaylist();
  scheduleSave();
  return n;
}
function addVideos(filesOrUrls) {
  const items = (Array.isArray(filesOrUrls) ? filesOrUrls : [filesOrUrls]).filter(Boolean);
  if (!items.length) return;
  const n = libAddItems(items);
  showToast(n ? n + " added to Library" : "Already in Library");
  const nowPage = document.body.dataset.page;
  if (!playlist.length && nowPage === "nowPlaying") document.querySelector('.nav-item[data-page="library"]').click();
}
// add to the playlist (queue); optionally start the first one
function queueAdd(srcs, opts) {
  const have = new Set(playlist);
  let n = 0;
  srcs.forEach((s) => {
    if (s && !have.has(s)) {
      playlist.push(s);
      have.add(s);
      n++;
    }
  });
  renderPlaylist();
  scheduleSave();
  if (opts && opts.play && srcs[0]) playIndex(playlist.indexOf(srcs[0]));
  return n;
}
// "play now" for drag-and-drop, Explorer and Recent: into the Library and the playlist, then play
function playNow(urls) {
  const list = urls.filter(Boolean);
  if (!list.length) return;
  libAddItems(list);
  queueAdd(list, { play: true });
}

function removeIndex(idx, skipRerender) {
  if (idx < 0 || idx >= playlist.length) return;
  const removingCurrent = idx === currentIndex;
  playlist.splice(idx, 1);
  if (playlist.length === 0) {
    video.pause();
    liveStop();
    clearSubtitleTracks();
    video.removeAttribute("src");
    video.load();
    currentIndex = -1;
    playerPanel.classList.remove("has-media", "is-playing");
    if (!skipRerender) renderPlaylist();
    scheduleSave();
    return;
  }
  if (idx < currentIndex) {
    currentIndex -= 1;
  } else if (removingCurrent) {
    if (currentIndex >= playlist.length) currentIndex = playlist.length - 1;
    playIndex(currentIndex);
  }
  if (!skipRerender) renderPlaylist();
  scheduleSave();
}

// Navigation
const navButtons = Array.from(document.querySelectorAll(".nav-item"));
const pages = {
  nowPlaying: document.getElementById("page-nowPlaying"),
  library: document.getElementById("page-library"),
  recent: document.getElementById("page-recent"),
  settings: document.getElementById("page-settings"),
};
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const prevActive = document.querySelector(".nav-item.active");
    const order = ["nowPlaying", "library", "recent", "settings"];
    const wrap = document.querySelector(".pages");
    if (wrap && prevActive) wrap.dataset.dir = order.indexOf(btn.dataset.page) < order.indexOf(prevActive.dataset.page) ? "back" : "fwd";
    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const page = btn.dataset.page;
    document.body.dataset.page = page;
    Object.entries(pages).forEach(([key, el]) => {
      if (!el) return;
      if (key === page) el.classList.remove("hidden");
      else el.classList.add("hidden");
    });
    if (page === "library") {
      lib.animateNext = true;
      renderLibrary();
    }
    if (page === "recent") renderRecent();
    if (page === "settings") openSettingsTab(document.querySelector(".settings-tab.active")?.dataset.tab || "general");
  });
});

const importWrap = document.getElementById("importWrap");
const importPopover = document.getElementById("importPopover");
const importFilesBtn = document.getElementById("importFilesBtn");
const importFolderBtn = document.getElementById("importFolderBtn");
const importUrlBtn = document.getElementById("importUrlBtn");
const urlOverlay = document.getElementById("urlOverlay");
const urlInput = document.getElementById("urlInput");
const urlAddBtn = document.getElementById("urlAddBtn");
const urlClose = document.getElementById("urlClose");

importVideoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = !importWrap.classList.contains("open");
  closeAllPopovers();
  if (willOpen) importWrap.classList.add("open");
});
importFilesBtn.addEventListener("click", async () => {
  closeAllPopovers();
  const files = await window.electronAPI.selectVideoFiles(settings.defaultImportFolder || undefined);
  if (files && files.length) addVideos(files);
});
importFolderBtn.addEventListener("click", async () => {
  closeAllPopovers();
  const tree = await window.electronAPI.selectVideoFolder();
  if (tree) importFolderTree(tree);
});
importUrlBtn.addEventListener("click", () => {
  closeAllPopovers();
  urlInput.value = "";
  urlOverlay.classList.remove("hidden");
  urlInput.focus();
});
urlClose.addEventListener("click", () => urlOverlay.classList.add("hidden"));
urlOverlay.addEventListener("click", (e) => {
  if (e.target === urlOverlay) urlOverlay.classList.add("hidden");
});
function addStreamUrl() {
  const u = urlInput.value.trim();
  if (!/^https?:\/\//i.test(u)) {
    showToast("Enter a valid http(s) URL", { type: "error" });
    return;
  }
  addVideos([u]);
  urlOverlay.classList.add("hidden");
}
urlAddBtn.addEventListener("click", addStreamUrl);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addStreamUrl();
});

function importFolderTree(rootNode) {
  const urls = collectFolderUrls(rootNode, null);
  if (urls.length) addVideos(urls);
}
function collectFolderUrls(node, parentId) {
  const selfId = node.type === "folder" ? "f" + ++folderSeq : parentId;
  if (node.type === "folder") folders.set(selfId, { name: node.name, parentId, expanded: true });
  const urls = [];
  (node.children || []).forEach((child) => {
    if (child.type === "video") {
      itemFolder.set(child.url, selfId);
      urls.push(child.url);
    } else {
      urls.push(...collectFolderUrls(child, selfId));
    }
  });
  return urls;
}

// Drag & Drop (depth counter: dragenter/dragleave fire for every child element)
let dragDepth = 0;
const dragHasFiles = (e) => !!(e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files"));
function hideDropOverlay() {
  dragDepth = 0;
  dropOverlay.classList.add("hidden");
}
playerPanel.addEventListener("dragenter", (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropOverlay.classList.remove("hidden");
});
playerPanel.addEventListener("dragover", (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
playerPanel.addEventListener("dragleave", (e) => {
  if (!dragHasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.add("hidden");
});
playerPanel.addEventListener("drop", (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  hideDropOverlay();
  handleDrop(e);
});
window.addEventListener("dragend", hideDropOverlay);
window.addEventListener("drop", hideDropOverlay);
// a file dropped outside the player must not navigate the window away
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

function handleDrop(e) {
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  const vids = [];
  for (const f of dt.files) {
    const name = (f.name || "").toLowerCase();
    if (name.endsWith(".mp4") || name.endsWith(".webm") || name.endsWith(".mkv") || name.endsWith(".mov") || name.endsWith(".avi") || name.endsWith(".m4v")) {
      const fileUrl = f.path ? "file:///" + f.path.replace(/\\/g, "/") : URL.createObjectURL(f);
      vids.push(fileUrl);
    }
  }
  if (vids.length) playNow(vids);
}

// ---------- Custom player controls ----------
function updatePlayIcon() {
  const isPaused = video.paused || video.ended;
  playBtn.querySelector(".icon-play").style.display = isPaused ? "" : "none";
  playBtn.querySelector(".icon-pause").style.display = isPaused ? "none" : "";
  playerPanel.classList.toggle("show-center-play", isPaused);
  playerPanel.classList.toggle("is-playing", !isPaused);
}

function togglePlay() {
  if (!video.src) return;
  if (video.paused || video.ended) video.play().catch(() => {});
  else video.pause();
}

playBtn.addEventListener("click", togglePlay);
centerPlay.addEventListener("click", togglePlay);
video.addEventListener("play", updatePlayIcon);
video.addEventListener("pause", updatePlayIcon);

let panMoved = false;
video.addEventListener("click", () => {
  if (panMoved) {
    panMoved = false;
    return;
  }
  togglePlay();
});

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) playIndex(currentIndex - 1);
});
nextBtn.addEventListener("click", () => {
  if (currentIndex + 1 < playlist.length) playIndex(currentIndex + 1);
});
seekBackBtn.addEventListener("click", () => seekBy(-10));
seekFwdBtn.addEventListener("click", () => seekBy(10));

// ----- Volume (0..100% normal, optional boost above 100% through the audio graph) -----
const volWrap = document.getElementById("volWrap");
const volNotch = document.getElementById("volNotch");
const volReadout = document.getElementById("volReadout");
let boostLevel = 1; // gain multiplier applied after the EQ chain (>= 1)
function maxLevelPct() {
  return settings.boostEnabled ? settings.boostMax || 200 : 100;
}
function currentLevelPct() {
  return Math.round(video.volume * 100 * (video.volume >= 0.999 ? boostLevel : 1));
}
function updateVolumeIcon() {
  const off = video.muted || video.volume === 0;
  muteBtn.querySelector(".icon-vol-on").style.display = off ? "none" : "";
  muteBtn.querySelector(".icon-vol-off").style.display = off ? "" : "none";
}
function updateVolumeUI() {
  const max = maxLevelPct();
  const lvl = Math.min(max, currentLevelPct());
  volumeSlider.max = max;
  volumeSlider.value = lvl;
  const fill = (lvl / max) * 100;
  volumeSlider.style.setProperty("--fill", fill + "%");
  volumeSlider.style.setProperty("--p100", (100 / max) * 100 + "%");
  volumeSlider.classList.toggle("boosted", lvl > 100);
  volNotch.style.display = max > 100 ? "block" : "none";
  volNotch.style.left = (100 / max) * 100 + "%";
  const shown = video.muted ? 0 : lvl;
  volReadout.textContent = shown + "%";
  volReadout.classList.toggle("boosted", shown > 100);
  const bc = document.getElementById("boostCurrent");
  if (bc) bc.textContent = shown + "%";
  updateVolumeIcon();
}
function applyBoost() {
  if (!audioCtx || !boostNode) return;
  boostNode.gain.value = boostLevel;
}
function setLevel(pct, quiet) {
  const max = maxLevelPct();
  pct = Math.max(0, Math.min(max, Math.round(pct)));
  if (pct > 100) {
    resumeAudio();
    video.volume = 1;
    boostLevel = pct / 100;
  } else {
    video.volume = pct / 100;
    boostLevel = 1;
  }
  video.muted = pct === 0;
  applyBoost();
  settings.boostLevel = boostLevel;
  updateVolumeUI();
  scheduleSave();
  if (!quiet) osd("Volume " + pct + "%", pct > 100);
}
muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  updateVolumeUI();
  scheduleSave();
});
volumeSlider.addEventListener("input", () => setLevel(parseInt(volumeSlider.value, 10), true));
volumeSlider.addEventListener("pointerdown", () => volWrap.classList.add("drag"));
window.addEventListener("pointerup", () => {
  if (volWrap.classList.contains("drag")) volumeSlider.blur(); // keep keyboard shortcuts global
  volWrap.classList.remove("drag");
});
const volGroup = document.getElementById("volGroup");
muteBtn.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLevel(currentLevelPct() + (e.deltaY < 0 ? 5 : -5), true);
  },
  { passive: false }
);
(volGroup).addEventListener("wheel", (e) => {
  e.preventDefault();
  e.stopPropagation();
  setLevel(currentLevelPct() + (e.deltaY < 0 ? 5 : -5), true);
}, { passive: false });

loopBtn.addEventListener("click", () => {
  video.loop = !video.loop;
  loopBtn.classList.toggle("active", video.loop);
  scheduleSave();
});

// RTX enhancement toggle. There is no public API to flip NVIDIA's driver
// feature directly; what we control is whether Chromium offers this
// element to the hardware overlay compositing path the feature depends
// on - any CSS filter on <video> disqualifies it, so "off" applies a
// visually-imperceptible filter purely to opt out of that path.
// Video effects (effects.js) share the same <video> filter slot. When no effect is active it
// leaves the filter exactly as before (empty = RTX on, brightness(1.001) = RTX off). While an
// effect filter is active, Chromium cannot use the overlay path, so RTX is paused.
function applyEnhancementState() {
  let fxOn = false;
  if (fxReady) fxOn = VideoFX.refresh();
  else video.style.filter = uiPrefs.enhancementEnabled ? "" : "brightness(1.001)";
  enhanceBtn.classList.toggle("active", uiPrefs.enhancementEnabled && !fxOn);
  enhanceBtn.classList.toggle("fx-paused", uiPrefs.enhancementEnabled && fxOn);
  enhanceBtn.title = uiPrefs.enhancementEnabled && fxOn ? "RTX enhancement (E) - paused while video effects are active" : "RTX enhancement (E)";
}
enhanceBtn.addEventListener("click", () => {
  uiPrefs.enhancementEnabled = !uiPrefs.enhancementEnabled;
  applyEnhancementState();
  scheduleSave();
});
let fxReady = false;
try {
  if (window.VideoFX)
    VideoFX.bind({
    video,
    osd: (t) => osd(t),
    toast: (m, o) => showToast(m, o),
    scheduleSave: () => scheduleSave(),
    getSaved: () => settings.videoFx,
    setSaved: (v) => {
      settings.videoFx = v;
    },
    rtxOn: () => uiPrefs.enhancementEnabled,
    getFit: () => uiPrefs.videoFit,
    setFit: (v) => {
      uiPrefs.videoFit = v;
      applyVideoFit();
      scheduleSave();
    },
    getAnalyser: () => (typeof analyserNode !== "undefined" ? analyserNode : null),
    blocked: () => anyModalOpen(),
    closePopovers: () => closeAllPopovers(),
    onState: () => applyEnhancementState(),
  });
  fxReady = !!window.VideoFX;
} catch (err) {
  console.error("Video effects failed to start", err);
}

// ---------- Seek bar (with hover thumbnail preview) ----------
let seekDragging = false;
function seekRatioFromEvent(e) {
  const rect = seekTrack.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return Math.min(1, Math.max(0, x / rect.width));
}
let seekChapters = [];
let seekSegments = [];
let seekHot = -1;
function buildSeekSegments() {
  const D = video.duration;
  seekSegs.innerHTML = "";
  seekSegments = [];
  seekHot = -1;
  let bounds = [];
  if (D && isFinite(D)) {
    const cs = (seekChapters || []).filter((c) => c.start >= 0 && c.start < D - 0.5).sort((a, b) => a.start - b.start);
    cs.forEach((c, i) => {
      const end = i + 1 < cs.length ? cs[i + 1].start : D;
      if (end - c.start >= 0.5) bounds.push({ start: i === 0 ? 0 : c.start, end, title: c.title || "" });
    });
    if (!bounds.length) bounds = [{ start: 0, end: D, title: "" }];
    else bounds[bounds.length - 1].end = D;
  } else bounds = [{ start: 0, end: 0, title: "" }];
  const frag = document.createDocumentFragment();
  bounds.forEach((s) => {
    const el = document.createElement("div");
    el.className = "seg";
    el.style.flex = Math.max(0.001, s.end - s.start) + " 1 0";
    el.innerHTML = '<div class="seg-bar"><div class="seg-buf"></div><div class="seg-hover"></div><div class="seg-fill"></div></div>';
    s.el = el;
    s.buf = el.querySelector(".seg-buf");
    s.hov = el.querySelector(".seg-hover");
    s.fill = el.querySelector(".seg-fill");
    s.cache = { f: -1, b: -1, h: -1 };
    frag.appendChild(el);
    seekSegments.push(s);
  });
  seekSegs.appendChild(frag);
  updateSeekUI();
}
function segPct(s, t) {
  const len = s.end - s.start;
  return len > 0 ? Math.min(100, Math.max(0, ((t - s.start) / len) * 100)) : 0;
}
function setSegW(s, key, el, pct) {
  const v = Math.round(pct * 10) / 10;
  if (s.cache[key] === v) return;
  s.cache[key] = v;
  el.style.width = v + "%";
}
function seekSegIndexAt(t) {
  for (let i = 0; i < seekSegments.length; i++) if (t < seekSegments[i].end || i === seekSegments.length - 1) return i;
  return 0;
}
function updateSeekUI() {
  if (!video.duration) return;
  const D = video.duration;
  const t = video.currentTime;
  seekThumb.style.left = (t / D) * 100 + "%";
  timeCurrent.textContent = formatTime(t);
  timeDuration.textContent = formatTime(D);
  let bufEnd = 0;
  try {
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= t + 0.5 && video.buffered.end(i) >= t) bufEnd = video.buffered.end(i);
  } catch (_) {}
  seekSegments.forEach((s) => {
    setSegW(s, "f", s.fill, segPct(s, t));
    setSegW(s, "b", s.buf, segPct(s, bufEnd));
  });
  seekTrack.setAttribute("aria-valuenow", String(Math.round(t)));
  seekTrack.setAttribute("aria-valuemax", String(Math.round(D)));
}
function setSeekHover(e) {
  if (!video.duration || !seekSegments.length) return;
  const ratio = seekRatioFromEvent(e);
  const t = ratio * video.duration;
  const idx = seekSegIndexAt(t);
  if (idx !== seekHot) {
    if (seekSegments[seekHot]) seekSegments[seekHot].el.classList.remove("hot");
    seekSegments[idx].el.classList.add("hot");
    seekHot = idx;
  }
  seekSegments.forEach((s, i) => setSegW(s, "h", s.hov, i < idx ? 100 : i === idx ? segPct(s, t) : 0));
  const rect = seekTrack.getBoundingClientRect();
  const pw = seekPreview.offsetWidth || 248;
  const px = Math.min(rect.width - pw / 2, Math.max(pw / 2, ratio * rect.width));
  seekPreview.style.left = px + "px";
  seekPreviewTime.textContent = formatTime(t);
  seekPreviewChapter.textContent = seekSegments[idx].title;
  return t;
}
function clearSeekHover() {
  if (seekDragging) return;
  if (seekSegments[seekHot]) seekSegments[seekHot].el.classList.remove("hot");
  seekHot = -1;
  seekSegments.forEach((s) => setSegW(s, "h", s.hov, 0));
}

const previewVideo = document.createElement("video");
previewVideo.muted = true;
previewVideo.preload = "auto";
let previewReadyFor = null;
let previewSeekTimer = null;
function fitSeekPreview() {
  const vw = previewVideo.videoWidth || video.videoWidth;
  const vh = previewVideo.videoHeight || video.videoHeight;
  if (!vw || !vh) return;
  const s = Math.min(248 / vw, 150 / vh);
  const w = Math.max(40, Math.round(vw * s));
  const h = Math.max(40, Math.round(vh * s));
  const key = w + "x" + h;
  if (seekPreviewCanvas.dataset.fit === key) return;
  seekPreviewCanvas.dataset.fit = key;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  seekPreviewCanvas.width = Math.round(w * dpr);
  seekPreviewCanvas.height = Math.round(h * dpr);
  seekPreviewCanvas.style.width = w + "px";
  seekPreviewCanvas.style.height = h + "px";
}
previewVideo.addEventListener("loadedmetadata", fitSeekPreview);
previewVideo.addEventListener("seeked", () => {
  try {
    fitSeekPreview();
    seekPreviewCanvas.getContext("2d").drawImage(previewVideo, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
  } catch (_) {}
});

function seekPreviewAt(e) {
  const t = setSeekHover(e);
  if (t == null) return;
  fitSeekPreview();
  if (previewReadyFor !== video.src) {
    seekPreviewCanvas.dataset.fit = "";
    previewVideo.src = video.src;
    previewReadyFor = video.src;
  }
  clearTimeout(previewSeekTimer);
  previewSeekTimer = setTimeout(() => {
    try {
      previewVideo.currentTime = t;
    } catch (_) {}
  }, 90);
}
seekTrack.addEventListener("mousemove", seekPreviewAt);
seekTrack.addEventListener("mouseleave", clearSeekHover);

function beginSeek(e) {
  seekDragging = true;
  seekTrack.classList.add("dragging");
  doSeek(e);
}
function doSeek(e) {
  if (!video.duration) return;
  const ratio = seekRatioFromEvent(e);
  video.currentTime = ratio * video.duration;
  updateSeekUI();
}
function endSeek() {
  if (!seekDragging) return;
  seekDragging = false;
  seekTrack.classList.remove("dragging");
  if (!seekTrack.matches(":hover")) clearSeekHover();
}
seekTrack.addEventListener("mousedown", beginSeek);
window.addEventListener("mousemove", (e) => {
  if (seekDragging) {
    doSeek(e);
    seekPreviewAt(e);
  }
});
window.addEventListener("mouseup", endSeek);
seekTrack.addEventListener("touchstart", beginSeek, { passive: true });
window.addEventListener("touchmove", (e) => {
  if (seekDragging) doSeek(e);
});
window.addEventListener("touchend", endSeek);

video.addEventListener("timeupdate", updateSeekUI);
video.addEventListener("progress", updateSeekUI);
video.addEventListener("loadedmetadata", buildSeekSegments);
video.addEventListener("durationchange", buildSeekSegments);
video.addEventListener("emptied", () => {
  seekChapters = [];
  buildSeekSegments();
});
buildSeekSegments();
video.addEventListener("progress", updateSeekUI);
video.addEventListener("loadedmetadata", () => {
  updateSeekUI();
  playerPanel.classList.add("has-media");
});

// Safety net: if the video is actually flowing, the preparing overlay has
// no reason to still be up.
["playing", "timeupdate", "canplay"].forEach((evt) =>
  video.addEventListener(evt, () => {
    if (!video.paused && video.currentTime > 0) setPrepStatus("", false);
  })
);

// ---------- Autoplay next (ended) ----------
video.addEventListener("ended", () => {
  if (video.loop) {
    video.currentTime = 0;
    video.play();
    return;
  }
  const hasNext = currentIndex + 1 < playlist.length;
  scheduleSave();
  if (!hasNext || !settings.autoplayEnabled) return;

  const nextSrc = playlist[currentIndex + 1];
  const name = decodeURIComponent(nextSrc.split("/").pop() || "");
  autoplayTitle.textContent = name;
  const meta = playlistMeta.get(nextSrc);
  autoplayThumb.style.backgroundImage = meta && meta.thumb ? `url(${meta.thumb})` : "";
  autoplayOverlay.classList.remove("hidden");

  const total = Math.max(2, settings.autoplayDelay || 5);
  let remaining = total;
  const circumference = 2 * Math.PI * 14;
  autoplayRing.style.strokeDasharray = String(circumference);
  autoplayRing.style.strokeDashoffset = "0";
  autoplayInterval = setInterval(() => {
    remaining -= 0.1;
    const frac = Math.max(0, remaining / total);
    autoplayRing.style.strokeDashoffset = String(circumference * (1 - frac));
    if (remaining <= 0) clearInterval(autoplayInterval);
  }, 100);
  autoplayTimer = setTimeout(() => {
    autoplayOverlay.classList.add("hidden");
    playIndex(currentIndex + 1);
  }, total * 1000);
});

// ---------- Theater mode (everything around the player folds away, window fits the video) ----------
const theaterBtn = document.getElementById("theaterBtn");
let theaterOn = false;
function setTheater(on) {
  if (on === theaterOn) return;
  if (on) document.querySelector('.nav-item[data-page="nowPlaying"]').click();
  theaterOn = on;
  document.body.classList.toggle("theater", on);
  theaterBtn.classList.toggle("active", on);
  theaterBtn.title = on ? "Exit theater mode (T)" : "Theater mode (T)";
}
theaterBtn.addEventListener("click", () => setTheater(!theaterOn));

// ---------- Fullscreen ----------
function updateFullscreenIcon() {
  const fs = !!document.fullscreenElement;
  fullscreenBtn.querySelector(".icon-fs-enter").style.display = fs ? "none" : "";
  fullscreenBtn.querySelector(".icon-fs-exit").style.display = fs ? "" : "none";
}
fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else playerPanel.requestFullscreen().catch(() => {});
});
document.addEventListener("fullscreenchange", updateFullscreenIcon);

// Double-click video to toggle fullscreen
video.addEventListener("dblclick", () => {
  fullscreenBtn.click();
});

// ---------- Auto-hide blob ----------
let idleTimer = null;
let cursorTimer = null;
function markActive() {
  playerPanel.classList.remove("idle", "cursor-hidden");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    if (!playerPanel.querySelector(".popover-wrap.open")) playerPanel.classList.add("cursor-hidden");
  }, 2800);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!video.paused && !video.ended) playerPanel.classList.add("idle");
  }, 2800);
}
["mousemove", "mousedown", "touchstart"].forEach((evt) => playerPanel.addEventListener(evt, markActive));
video.addEventListener("play", markActive);
video.addEventListener("pause", () => {
  playerPanel.classList.remove("idle");
  clearTimeout(idleTimer);
});
playerPanel.addEventListener("mouseleave", () => playerPanel.classList.remove("cursor-hidden"));

// ---------- Popovers (audio track, zoom, subtitle) ----------
function closeAllPopovers() {
  document.querySelectorAll(".popover-wrap.open").forEach((w) => w.classList.remove("open"));
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".popover-wrap")) closeAllPopovers();
});

moreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = !moreWrap.classList.contains("open");
  closeAllPopovers();
  if (willOpen) moreWrap.classList.add("open");
});
audioTrackBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeAllPopovers();
  audioTrackWrap.classList.add("open");
  loadAudioTracks();
});

async function loadAudioTracks() {
  audioTrackList.innerHTML = '<div class="subtitle-item no-subs">Loading...</div>';
  const original = playlist[currentIndex];
  if (!original) return;
  let res = null;
  try {
    res = await window.electronAPI.probeTracks(original);
  } catch (_) {}
  audioTrackList.innerHTML = "";
  if (!res || !res.ok || !res.audio || res.audio.length <= 1) {
    const msg = res && res.audio && res.audio.length === 1 ? "Only one audio track" : "No extra tracks found";
    audioTrackList.innerHTML = `<div class="subtitle-item no-subs">${msg}</div>`;
    return;
  }
  res.audio.forEach((t) => {
    const isActive = currentAudioIndex === t.index || (currentAudioIndex === null && t.isDefault);
    const item = document.createElement("div");
    item.className = "subtitle-item" + (isActive ? " active" : "");
    const label = (t.title || t.language || "Track " + t.index) + " · " + (t.codec || "").toUpperCase() + (t.channels ? " · " + t.channels + "ch" : "");
    item.innerHTML = `<div class="name">${label}</div>`;
    item.onclick = async () => {
      closeAllPopovers();
      const native = t.isDefault && LIVE_NATIVE.has((t.codec || "").toLowerCase());
      try {
        if (native) {
          liveStop();
        } else {
          const s = await liveStart(original, t.index, video.currentTime);
          if (s) s.onFail = () => showToast("Audio stream failed", { type: "error" });
        }
        currentAudioIndex = t.index;
        showToast("Audio track switched");
      } catch (_) {
        showToast("Could not switch audio track", { type: "error" });
      }
    };
    audioTrackList.appendChild(item);
  });
}

// ---------- Zoom & pan ----------
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

function clampPan() {
  const maxOffset = (zoomLevel - 1) * 60;
  panX = Math.max(-maxOffset, Math.min(maxOffset, panX));
  panY = Math.max(-maxOffset, Math.min(maxOffset, panY));
}
function applyZoomTransform() {
  clampPan();
  videoStage.style.transform = zoomLevel === 1 ? "" : `scale(${zoomLevel}) translate(${panX}px, ${panY}px)`;
  videoStage.classList.toggle("zoomed", zoomLevel !== 1);
  zoomValue.textContent = Math.round(zoomLevel * 100) + "%";
  zoomSlider.value = Math.round(zoomLevel * 100);
}
function setZoom(z) {
  zoomLevel = Math.max(1, Math.min(4, Math.round(z * 100) / 100));
  if (zoomLevel === 1) {
    panX = 0;
    panY = 0;
  }
  applyZoomTransform();
}
zoomSlider.addEventListener("input", () => {
  setZoom(parseInt(zoomSlider.value, 10) / 100);
});
zoomResetBtn.addEventListener("click", () => {
  setZoom(1);
  closeAllPopovers();
});

videoStage.addEventListener("mousedown", (e) => {
  if (zoomLevel === 1) return;
  isPanning = true;
  panMoved = false;
  panStartX = e.clientX - panX;
  panStartY = e.clientY - panY;
  videoStage.classList.add("panning");
});
window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  panMoved = true;
  panX = e.clientX - panStartX;
  panY = e.clientY - panStartY;
  applyZoomTransform();
});
window.addEventListener("mouseup", () => {
  isPanning = false;
  videoStage.classList.remove("panning");
});

// ---------- Scroll: volume, or zoom with Ctrl held ----------
playerPanel.addEventListener(
  "wheel",
  (e) => {
    if (!video.src) return;
    if (e.target.closest && e.target.closest(".popover, .subtitle-container, .volume-group")) return;
    e.preventDefault();
    if (e.ctrlKey) {
      setZoom(zoomLevel + (e.deltaY < 0 ? 0.1 : -0.1));
    } else {
      setVolumeBy(e.deltaY < 0 ? 5 : -5);
      markActive();
    }
  },
  { passive: false }
);

// ---------- Picture-in-Picture ----------
pipBtn.addEventListener("click", async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (video.requestPictureInPicture) await video.requestPictureInPicture();
  } catch (e) {
    showToast("Picture-in-Picture not available", { type: "error" });
  }
});

// ---------- Screenshot ----------
async function takeScreenshot() {
  if (!video.src || !video.videoWidth) {
    showToast("No video playing", { type: "error" });
    return;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const res = await window.electronAPI.saveScreenshot(dataUrl);
    if (res && res.ok) showToast("Screenshot saved");
  } catch (e) {
    showToast("Screenshot failed", { type: "error" });
  }
}
screenshotBtn.addEventListener("click", takeScreenshot);

// ---------- Keyboard shortcut helpers ----------
function seekBy(sec) {
  if (!video.duration) return;
  video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + sec));
}
function setVolumeBy(deltaPercent) {
  setLevel((video.muted ? 0 : currentLevelPct()) + deltaPercent);
}
const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16];
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 8, 16];
const fmtSpeed = (s) => String(Math.round(s * 100) / 100) + "\u00d7";
function renderSpeedUi() {
  const s = video.playbackRate || 1;
  document.querySelectorAll(".speed-val").forEach((v) => (v.textContent = fmtSpeed(s)));
  const rl = document.getElementById("railSpeedLabel");
  if (rl) rl.textContent = fmtSpeed(s);
  document.querySelectorAll(".speed-chip").forEach((c) => c.classList.toggle("active", Math.abs(parseFloat(c.dataset.s) - s) < 0.001));
}
function buildSpeedChips(container) {
  SPEED_PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.className = "speed-chip";
    b.dataset.s = p;
    b.textContent = p + "\u00d7";
    b.onclick = (e) => {
      e.stopPropagation();
      setSpeed(p);
    };
    container.appendChild(b);
  });
}
buildSpeedChips(document.getElementById("railChips"));
function setSpeed(s, quiet) {
  s = Math.round(Math.min(16, Math.max(0.25, s)) * 100) / 100;
  video.playbackRate = s;
  renderSpeedUi();
  if (!quiet) osd("Speed " + fmtSpeed(s));
}
document.getElementById("railVal").addEventListener("click", (e) => (e.stopPropagation(), setSpeed(1)));
document.getElementById("railMinus").addEventListener("click", (e) => (e.stopPropagation(), setSpeed((video.playbackRate || 1) - 0.05)));
document.getElementById("railPlus").addEventListener("click", (e) => (e.stopPropagation(), setSpeed((video.playbackRate || 1) + 0.05)));
const railPop = document.getElementById("railPop");
document.getElementById("railSpeed").addEventListener("click", (e) => {
  e.stopPropagation();
  railPop.hidden = !railPop.hidden;
  document.getElementById("railSpeed").classList.toggle("active", !railPop.hidden);
});
document.addEventListener("click", (e) => {
  if (!railPop.hidden && !e.target.closest("#railPop, #railSpeed")) {
    railPop.hidden = true;
    document.getElementById("railSpeed").classList.remove("active");
  }
});
video.addEventListener("ratechange", renderSpeedUi);
renderSpeedUi();
function changeSpeed(dir) {
  const cur = video.playbackRate || 1;
  let next;
  if (dir > 0) next = SPEED_STEPS.find((x) => x > cur + 0.001) || 16;
  else next = [...SPEED_STEPS].reverse().find((x) => x < cur - 0.001) || 0.25;
  setSpeed(next);
}
function anyModalOpen() {
  return (
    (subSearchOverlay && !subSearchOverlay.classList.contains("hidden")) ||
    (shortcutsOverlay && !shortcutsOverlay.classList.contains("hidden")) ||
    (paletteOverlay && !paletteOverlay.classList.contains("hidden"))
  );
}

// ---------- Command palette ----------
function paletteCommands() {
  return [
    { label: "Import video", action: () => importVideoBtn.click() },
    { label: "Add subtitle file", action: () => document.getElementById("subAddFile").click() },
    { label: "Search subtitles online", action: () => openSubSearch() },
    { label: "Toggle subtitles", action: () => toggleSubtitles() },
    { label: "Find subtitle online", action: openSubSearch },
    { label: "Play / Pause", action: togglePlay },
    { label: "Next video", action: () => currentIndex + 1 < playlist.length && playIndex(currentIndex + 1) },
    { label: "Previous video", action: () => currentIndex > 0 && playIndex(currentIndex - 1) },
    { label: "Toggle loop", action: () => loopBtn.click() },
    { label: "Toggle RTX enhancement", action: () => enhanceBtn.click() },
    { label: "Toggle video effects", action: () => window.VideoFX && VideoFX.toggle() },
    { label: "Open video effects settings", action: () => window.VideoFX && VideoFX.openSettings() },
    { label: "Reset video effects", action: () => window.VideoFX && VideoFX.reset() },
    { label: "Toggle mute", action: () => muteBtn.click() },
    { label: "Toggle fullscreen", action: () => fullscreenBtn.click() },
    { label: "Toggle theater mode", action: () => theaterBtn.click() },
    { label: "Toggle Picture-in-Picture", action: () => pipBtn.click() },
    { label: "Take screenshot", action: takeScreenshot },
    { label: "Zoom in", action: () => setZoom(zoomLevel + 0.25) },
    { label: "Zoom out", action: () => setZoom(zoomLevel - 0.25) },
    { label: "Reset zoom", action: () => setZoom(1) },
    { label: "Open Now Playing", action: () => document.querySelector('.nav-item[data-page="nowPlaying"]').click() },
    { label: "Open Library", action: () => document.querySelector('.nav-item[data-page="library"]').click() },
    { label: "Open Recent files", action: () => document.querySelector('.nav-item[data-page="recent"]').click() },
    { label: "Open Settings", action: () => document.querySelector('.nav-item[data-page="settings"]').click() },
    { label: "Clear conversion cache", action: () => clearCacheBtn.click() },
    { label: "Reset layout", action: () => resetLayoutBtn.click() },
    { label: "Keyboard shortcuts", action: toggleShortcuts },
    { label: "Toggle sidebar", action: () => railToggle.click() },
    { label: "Toggle playlist panel", action: () => playlistToggle.click() },
  ];
}
function openPalette() {
  subSearchOverlay.classList.add("hidden");
  shortcutsOverlay.classList.add("hidden");
  paletteOverlay.classList.remove("hidden");
  paletteInput.value = "";
  renderPaletteList("");
  paletteInput.focus();
}
function closePalette() {
  paletteOverlay.classList.add("hidden");
}
function renderPaletteList(q) {
  const items = paletteCommands().filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  paletteList.innerHTML = "";
  items.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "palette-item" + (i === 0 ? " active" : "");
    row.textContent = c.label;
    row.onclick = () => {
      c.action();
      closePalette();
    };
    paletteList.appendChild(row);
  });
}
paletteInput.addEventListener("input", () => renderPaletteList(paletteInput.value));
paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const active = paletteList.querySelector(".palette-item.active") || paletteList.firstChild;
    if (active) active.click();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = Array.from(paletteList.children);
    let idx = items.findIndex((i) => i.classList.contains("active"));
    if (idx >= 0) items[idx].classList.remove("active");
    idx = e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (items[idx]) {
      items[idx].classList.add("active");
      items[idx].scrollIntoView({ block: "nearest" });
    }
  }
});
paletteOverlay.addEventListener("click", (e) => {
  if (e.target === paletteOverlay) closePalette();
});
// Layout-independent key: Latin letters follow the layout, anything else (Persian, Russian, ...) falls back to the physical key
function normKey(e) {
  const k = e.key;
  if (k && k.length === 1 && /[a-z0-9,.\[\]]/i.test(k)) return k.toLowerCase();
  const c = e.code || "";
  if (/^Key[A-Z]$/.test(c)) return c[3].toLowerCase();
  if (/^Digit\d$/.test(c)) return c[5];
  if (/^Numpad\d$/.test(c)) return c[6];
  const map = { Comma: ",", Period: ".", BracketLeft: "[", BracketRight: "]", Slash: "/" };
  return map[c] || k;
}
const fmtSec = (s) => (s > 0 ? "+" : "\u2212") + Math.abs(s) + " s";
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && normKey(e) === "k") {
    e.preventDefault();
    if (paletteOverlay.classList.contains("hidden")) openPalette();
    else closePalette();
  }
});

// ---------- Keyboard shortcuts ----------
window.addEventListener("keydown", (e) => {
  const ae = document.activeElement;
  const tag = (ae && ae.tagName) || "";
  const typing = tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["range", "checkbox", "button"].includes(ae.type));
  if (typing) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = normKey(e);
  const code = e.code;
  if (key === "?" || (code === "Slash" && e.shiftKey) || (key === "/" && e.shiftKey)) {
    e.preventDefault();
    toggleShortcuts();
    return;
  }
  if (anyModalOpen()) return;
  if (!video.src) return;

  const arrow = code === "ArrowRight" || code === "ArrowLeft" || code === "ArrowUp" || code === "ArrowDown";
  if (arrow) e.preventDefault();
  if (code === "Space" || key === "k") {
    e.preventDefault();
    togglePlay();
    osd(video.paused ? "Paused" : "Playing");
  } else if (key === "j") {
    seekBy(-10);
    osd(fmtSec(-10));
  } else if (key === "l") {
    seekBy(10);
    osd(fmtSec(10));
  } else if (code === "ArrowRight") {
    const s = e.shiftKey ? 30 : 5;
    seekBy(s);
    osd(fmtSec(s));
  } else if (code === "ArrowLeft") {
    const s = e.shiftKey ? -30 : -5;
    seekBy(s);
    osd(fmtSec(s));
  } else if (code === "ArrowUp") {
    setVolumeBy(5);
  } else if (code === "ArrowDown") {
    setVolumeBy(-5);
  } else if (key === "m") {
    muteBtn.click();
    osd(video.muted ? "Muted" : "Unmuted");
  } else if (key === "t") {
    theaterBtn.click();
    osd(theaterOn ? "Theater mode" : "Theater mode off");
  } else if (key === "f") {
    fullscreenBtn.click();
  } else if (key === "r") {
    loopBtn.click();
    osd(video.loop ? "Loop on" : "Loop off");
  } else if (key === "e") {
    enhanceBtn.click();
    osd(uiPrefs.enhancementEnabled ? "RTX enhancement on" : "RTX enhancement off");
  } else if (key === "i") {
    pipBtn.click();
    osd("Picture in picture");
  } else if (key === "s") {
    takeScreenshot();
  } else if (key === "n" || code === "PageDown") {
    if (currentIndex + 1 < playlist.length) {
      playIndex(currentIndex + 1);
      osd("Next video");
    }
  } else if (key === "p" || code === "PageUp") {
    if (currentIndex > 0) {
      playIndex(currentIndex - 1);
      osd("Previous video");
    }
  } else if (code === "Home") {
    video.currentTime = 0;
    osd("Start");
  } else if (code === "End") {
    if (video.duration) video.currentTime = Math.max(0, video.duration - 0.2);
    osd("End");
  } else if (/^[0-9]$/.test(key)) {
    if (video.duration) video.currentTime = (parseInt(key, 10) / 10) * video.duration;
    osd("Jump to " + parseInt(key, 10) * 10 + "%");
  } else if (key === ",") {
    video.pause();
    video.currentTime = Math.max(0, video.currentTime - 1 / 24);
    osd("Previous frame");
  } else if (key === ".") {
    video.pause();
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 1 / 24);
    osd("Next frame");
  } else if (key === "c") {
    toggleSubtitles();
  } else if (key === "g" || key === "h") {
    if (currentSubtitleIndex >= 0) {
      nudgeSubtitle(key === "g" ? -0.1 : 0.1);
      osd("Subtitle delay " + fmtOffset(subtitleOffsetSec));
    } else osd("No subtitle selected");
  } else if (key === "]") {
    changeSpeed(1);
  } else if (key === "[") {
    changeSpeed(-1);
  } else if (key === "\\" || code === "Backslash") {
    setSpeed(1);
  }
});

// Mouse side buttons: read straight from the renderer (reliable), with the main-process app-command as a fallback
let lastMouseNav = 0;
function mouseNav(dir) {
  const now = Date.now();
  if (now - lastMouseNav < 250) return;
  lastMouseNav = now;
  if (!video.src) return;
  const s = dir === "backward" ? -5 : 5;
  seekBy(s);
  osd(fmtSec(s));
}
["mousedown", "mouseup", "auxclick", "pointerdown", "pointerup"].forEach((ev) =>
  window.addEventListener(
    ev,
    (e) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      e.stopPropagation();
      if (ev === "mouseup") mouseNav(e.button === 3 ? "backward" : "forward");
    },
    true
  )
);
if (window.electronAPI && window.electronAPI.onMouseNav) window.electronAPI.onMouseNav(mouseNav);

// ---------- Shortcuts: one list, shown in the ? window and in Settings > General ----------
// "+" and "–" are shown as plain text, items starting with "~" are plain text, everything else is a key cap.
const SHORTCUT_GROUPS = [
  {
    col: 0,
    title: "Playback",
    rows: [
      ["Play / pause", ["Space", "K"]],
      ["Seek ±5 s", ["←", "→"]],
      ["Seek ±10 s", ["J", "L"]],
      ["Seek ±30 s", ["Shift", "+", "←", "→"]],
      ["Seek ±5 s (mouse)", ["~Back / Forward buttons"]],
      ["Frame step (paused)", [",", "."]],
      ["Jump to 0–90%", ["0", "–", "9"]],
      ["Start / end", ["Home", "End"]],
      ["Speed ±0.25×", ["[", "]"]],
      ["Normal speed", ["\\"]],
      ["Next / previous video", ["N", "P"]],
    ],
  },
  {
    col: 1,
    title: "Picture",
    rows: [
      ["Fullscreen", ["F"]],
      ["Fullscreen (video)", ["~Double-click"]],
      ["Theater mode", ["T"]],
      ["Zoom in / out", ["Ctrl", "+", "~Scroll"]],
      ["Picture in picture", ["I"]],
      ["Screenshot", ["S"]],
      ["Loop", ["R"]],
      ["RTX enhancement", ["E"]],
      ["Video effects on / off", ["X"]],
      ["Compare with original (hold)", ["V"]],
    ],
  },
  {
    col: 1,
    title: "Sound and subtitles",
    rows: [
      ["Volume ±5%", ["↑", "↓"]],
      ["Volume (over the video)", ["~Scroll wheel"]],
      ["Mute", ["M"]],
      ["Subtitles on / off", ["C"]],
      ["Subtitle delay −0.1 s / +0.1 s", ["G", "H"]],
    ],
  },
  {
    col: 0,
    title: "App",
    rows: [
      ["Command palette", ["Ctrl", "+", "K"]],
      ["Shortcuts list", ["?"]],
      ["Close a window / leave theater", ["Esc"]],
    ],
  },
];
function renderShortcuts(target) {
  if (!target) return;
  target.textContent = "";
  const cols = [document.createElement("div"), document.createElement("div")];
  cols.forEach((c) => c.classList.add("shortcuts-col"));
  SHORTCUT_GROUPS.forEach((g) => {
    const col = cols[g.col];
    const title = document.createElement("div");
    title.className = "shortcuts-group-title";
    title.textContent = g.title;
    col.appendChild(title);
    g.rows.forEach(([label, keys]) => {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const name = document.createElement("span");
      name.textContent = label;
      const kc = document.createElement("span");
      kc.className = "keys";
      keys.forEach((k) => {
        if (k === "+" || k === "–" || k[0] === "~") {
          const t = document.createElement("span");
          t.className = "key-text";
          t.textContent = k[0] === "~" ? k.slice(1) : k;
          kc.appendChild(t);
        } else {
          const kb = document.createElement("kbd");
          kb.textContent = k;
          kc.appendChild(kb);
        }
      });
      row.append(name, kc);
      col.appendChild(row);
    });
  });
  cols.forEach((c) => target.appendChild(c));
}
renderShortcuts(document.getElementById("shortcutsGrid"));
renderShortcuts(document.getElementById("shortcutsInline"));

function toggleShortcuts() {
  if (shortcutsOverlay.classList.contains("hidden")) {
    subSearchOverlay.classList.add("hidden");
    paletteOverlay.classList.add("hidden");
    shortcutsOverlay.classList.remove("hidden");
  } else {
    shortcutsOverlay.classList.add("hidden");
  }
}
shortcutsBtn.addEventListener("click", toggleShortcuts);
shortcutsClose.addEventListener("click", () => shortcutsOverlay.classList.add("hidden"));
shortcutsOverlay.addEventListener("click", (e) => {
  if (e.target === shortcutsOverlay) shortcutsOverlay.classList.add("hidden");
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  let closed = false;
  if (!subSearchOverlay.classList.contains("hidden")) (closeSubSearch(), (closed = true));
  if (!shortcutsOverlay.classList.contains("hidden")) (shortcutsOverlay.classList.add("hidden"), (closed = true));
  if (!paletteOverlay.classList.contains("hidden")) (closePalette(), (closed = true));
  if (!closed && theaterOn && !document.fullscreenElement) setTheater(false);
});

// ---------- Sidebar / playlist collapse, resizable splitter ----------
railToggle.addEventListener("click", () => {
  uiPrefs.railCollapsed = !uiPrefs.railCollapsed;
  applyRailState();
  scheduleSave();
});
function applyRailState() {
  app.classList.toggle("rail-collapsed", uiPrefs.railCollapsed);
}

playlistToggle.addEventListener("click", () => {
  uiPrefs.playlistCollapsed = !uiPrefs.playlistCollapsed;
  applyPlaylistCollapsed();
  scheduleSave();
});
function applyPlaylistCollapsed() {
  nowGrid.classList.toggle("playlist-collapsed", uiPrefs.playlistCollapsed);
}

let splitDragging = false;
splitter.addEventListener("mousedown", (e) => {
  splitDragging = true;
  splitter.classList.add("active");
  e.preventDefault();
});
window.addEventListener("mousemove", (e) => {
  if (!splitDragging) return;
  const rect = nowGrid.getBoundingClientRect();
  let w = rect.right - e.clientX;
  w = Math.min(560, Math.max(220, w));
  uiPrefs.playlistWidth = w;
  nowGrid.style.setProperty("--playlist-w", w + "px");
});
window.addEventListener("mouseup", () => {
  if (!splitDragging) return;
  splitDragging = false;
  splitter.classList.remove("active");
  scheduleSave();
});

// ---------- Video fit ----------
if (fitSegmented) {
  fitSegmented.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiPrefs.videoFit = btn.dataset.fit;
      applyVideoFit();
      scheduleSave();
    });
  });
}
function applyVideoFit() {
  playerPanel.style.setProperty("--video-fit", uiPrefs.videoFit);
  if (window.VideoFX && VideoFX.fitChanged) VideoFX.fitChanged();
  if (fitSegmented) {
    fitSegmented.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.fit === uiPrefs.videoFit);
    });
  }
}

if (resetLayoutBtn) {
  resetLayoutBtn.addEventListener("click", () => {
    uiPrefs.railCollapsed = false;
    uiPrefs.playlistCollapsed = false;
    uiPrefs.playlistWidth = 320;
    uiPrefs.videoFit = "contain";
    applyRailState();
    applyPlaylistCollapsed();
    nowGrid.style.setProperty("--playlist-w", uiPrefs.playlistWidth + "px");
    applyVideoFit();
    showToast("Layout reset");
    scheduleSave();
  });
}

// ---------- Settings tabs ----------
// Five sections: General, Subtitles, Audio, Video effects, Appearance.
// Old tab names are mapped so any caller that still uses them lands in General.
const SETTINGS_TAB_ALIAS = { playback: "general", system: "general", shortcuts: "general", advanced: "general", fx: "effects" };
function openSettingsTab(name) {
  name = SETTINGS_TAB_ALIAS[name] || name;
  const tabs = document.querySelectorAll(".settings-tab");
  if (![...tabs].some((t) => t.dataset.tab === name)) name = "general";
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".settings-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
  const pages = document.querySelector(".pages");
  if (pages) pages.scrollTop = 0;
  if (name === "general") {
    refreshCacheInfo();
    refreshSys();
  }
  if (name === "audio") setTimeout(startEqAnim, 0);
}
document.querySelectorAll(".settings-tab").forEach((tab) => tab.addEventListener("click", () => openSettingsTab(tab.dataset.tab)));

// ---------- Interface style (Classic / Studio Black / Studio White / Studio Sand) ----------
const styleGrid = document.getElementById("styleGrid");
const navGlider = document.getElementById("navGlider");
const accentHue = document.getElementById("accentHue");
const accentChip = document.getElementById("accentChip");
const STYLE_NAMES = { classic: "Classic", "glass-dark": "Studio Black", "glass-light": "Studio White", sand: "Studio Sand" };
function autoFx() {
  return (navigator.hardwareConcurrency || 4) >= 8 && (navigator.deviceMemory || 8) >= 8 ? "rich" : "lite";
}
function moveGlider() {
  const act = document.querySelector("#nav .nav-item.active");
  if (!act || !navGlider) return;
  navGlider.style.setProperty("--gy", act.offsetTop + "px");
  navGlider.style.height = act.offsetHeight + "px";
}
// Classic accent: one hue bar limited to hues that sit well on the dark canvas
function applyAccent() {
  const root = document.documentElement;
  const h = uiPrefs.accentHue;
  const custom = typeof h === "number" && (uiPrefs.style || "classic") === "classic";
  ["--accent", "--accent-strong", "--accent-soft", "--primary-fg"].forEach((p) => root.style.removeProperty(p));
  if (custom) {
    root.style.setProperty("--accent", `hsl(${h} 70% 46%)`);
    root.style.setProperty("--accent-strong", `hsl(${h} 78% 58%)`);
    root.style.setProperty("--accent-soft", `hsl(${h} 70% 46% / 0.16)`);
    root.style.setProperty("--primary-fg", h >= 190 ? "#ffffff" : "#0b1400");
  }
  if (accentHue && custom) accentHue.value = h;
  if (accentChip) accentChip.style.background = custom ? `hsl(${h} 70% 46%)` : "";
}
function applyStyle() {
  const root = document.documentElement;
  const style = uiPrefs.style || "classic";
  const fixed = style !== "classic"; // fixed palettes: no accent picker
  root.setAttribute("data-style", style);
  if (fixed) root.setAttribute("data-mono", "");
  else root.removeAttribute("data-mono");
  const fx = uiPrefs.fx || (fixed ? autoFx() : "lite"); // Classic defaults to the light profile
  root.setAttribute("data-fx", fx);
  try {
    localStorage.setItem("rtx.uiStyle", style);
    localStorage.setItem("rtx.uiFx", fx);
  } catch (_) {}
  if (styleGrid) styleGrid.querySelectorAll(".style-card").forEach((c) => c.classList.toggle("active", c.dataset.style === style));
  document.querySelectorAll("#fxSeg button").forEach((b) => b.classList.toggle("active", b.dataset.fx === fx));
  const accentRow = document.getElementById("accentRow");
  if (accentRow) accentRow.classList.toggle("hidden", fixed);
  applyAccent();
  requestAnimationFrame(moveGlider);
}
if (styleGrid)
  styleGrid.querySelectorAll(".style-card").forEach((c) =>
    c.addEventListener("click", () => {
      uiPrefs.style = c.dataset.style;
      applyStyle();
      scheduleSave();
      osd(STYLE_NAMES[c.dataset.style] || "Style");
    })
  );
document.querySelectorAll("#fxSeg button").forEach((b) =>
  b.addEventListener("click", () => {
    uiPrefs.fx = b.dataset.fx;
    applyStyle();
    scheduleSave();
  })
);
if (accentHue) {
  accentHue.addEventListener("input", () => {
    uiPrefs.accentHue = parseInt(accentHue.value, 10);
    applyAccent();
    scheduleSave();
  });
  document.getElementById("accentReset").addEventListener("click", () => {
    delete uiPrefs.accentHue;
    accentHue.value = 77;
    applyAccent();
    scheduleSave();
  });
}
document.querySelectorAll("#nav .nav-item").forEach((b) => b.addEventListener("click", () => requestAnimationFrame(moveGlider)));
window.addEventListener("resize", moveGlider);
railToggle.addEventListener("click", () => setTimeout(moveGlider, 220));
// pause the ambient animation when the window is not visible
const syncPaused = () => document.documentElement.toggleAttribute("data-paused", document.hidden || !document.hasFocus());
document.addEventListener("visibilitychange", syncPaused);
window.addEventListener("blur", syncPaused);
window.addEventListener("focus", syncPaused);
// light reflection that follows the cursor on glass controls (Rich only)
let sheenRaf = 0;
window.addEventListener("pointermove", (e) => {
  const root = document.documentElement;
  if (root.getAttribute("data-fx") !== "rich") return;
  if (sheenRaf) return;
  sheenRaf = requestAnimationFrame(() => {
    sheenRaf = 0;
    const t = e.target.closest && e.target.closest(".btn, .nav-item, .menu-row, .settings-tab, .lib-seg button, .item, .quick-item");
    if (!t) return;
    const rc = t.getBoundingClientRect();
    t.style.setProperty("--mx", e.clientX - rc.left + "px");
    t.style.setProperty("--my", e.clientY - rc.top + "px");
  });
});

// ---------- Studio extras: mini now-playing, quick access, title pill, tool rail, hero ----------
const sideNow = document.getElementById("sideNow");
const snThumb = document.getElementById("snThumb");
const snTitle = document.getElementById("snTitle");
const snSub = document.getElementById("snSub");
const snBar = document.getElementById("snBar");
const titlePillText = document.getElementById("titlePillText");
function updateSideNow() {
  const src = playlist[currentIndex];
  sideNow.classList.toggle("empty", !src);
  if (titlePillText) titlePillText.textContent = src ? libName(src) : "Nothing playing";
  if (!src) return;
  snTitle.textContent = libName(src);
  const meta = playlistMeta.get(src);
  snThumb.style.backgroundImage = meta && meta.thumb ? `url('${meta.thumb}')` : "";
  tickSideNow();
}
function tickSideNow() {
  sideNow.classList.toggle("playing", !!video.src && !video.paused && !video.ended);
  const d = video.duration;
  if (d && isFinite(d)) {
    snBar.style.width = Math.min(100, (video.currentTime / d) * 100) + "%";
    snSub.textContent = "-" + formatTime(Math.max(0, d - video.currentTime));
  } else {
    snBar.style.width = "0%";
    snSub.textContent = "";
  }
}
let snLast = 0;
video.addEventListener("timeupdate", () => {
  const n = Date.now();
  if (n - snLast < 900) return;
  snLast = n;
  tickSideNow();
});
["play", "pause", "ended", "loadedmetadata", "emptied"].forEach((ev) => video.addEventListener(ev, tickSideNow));
sideNow.addEventListener("click", (e) => {
  if (e.target.closest("#snPlay")) return;
  document.querySelector('.nav-item[data-page="nowPlaying"]').click();
});
document.getElementById("snPlay").addEventListener("click", () => {
  if (video.src) togglePlay();
});
document.body.dataset.page = "nowPlaying";

function updateQuick() {
  let times = {};
  try {
    times = JSON.parse(localStorage.getItem("videoTimes") || "{}");
  } catch (_) {}
  let progress = 0,
    fresh = 0;
  libraryItems.forEach((s) => {
    const w = times[s] || 0;
    if (w > 5) {
      const d = (playlistMeta.get(s) || {}).duration;
      if (!d || w < d * 0.95) progress++;
    } else fresh++;
  });
  document.getElementById("qProgress").textContent = progress;
  document.getElementById("qFav").textContent = favorites.size;
  document.getElementById("qNew").textContent = fresh;
}
function openLibraryFilter(f) {
  openLibrary(null);
  lib.filter = f;
  libFilterButtons();
  renderLibrary();
}
document.querySelectorAll("#sideQuick .quick-item").forEach((b) => b.addEventListener("click", () => openLibraryFilter(b.dataset.q)));

// floating quick-tool rail over the video: proxies the real buttons and mirrors their state
const toolRail = document.getElementById("toolRail");
const syncPip = () => pipBtn.classList.toggle("active", !!document.pictureInPictureElement);
video.addEventListener("enterpictureinpicture", syncPip);
video.addEventListener("leavepictureinpicture", syncPip);

// hero banner for the library home
function libHeroPick() {
  for (const rc of recentFiles) if (libraryItems.includes(rc.src) && videoTimeStorage.load(rc.src) > 5) return rc.src;
  return playlist[currentIndex] || libraryItems[0];
}
function libHero() {
  const src = libHeroPick();
  const meta = playlistMeta.get(src) || {};
  ensurePlaylistMeta(src);
  const w = videoTimeStorage.load(src);
  const pct = libWatchPct(src, meta);
  const el = document.createElement("div");
  el.className = "lib-hero" + (meta.thumb ? "" : " nothumb");
  el.style.setProperty("--i", 0);
  const where = libFolderPath(src);
  el.innerHTML =
    `<div class="lib-hero-bg"${meta.thumb ? ` style="background-image:url('${meta.thumb}')"` : ""}></div>` +
    `<div class="lib-hero-body"><span class="lib-hero-kicker">${w > 5 ? "CONTINUE WATCHING" : "START WATCHING"}</span>` +
    `<h2 class="lib-hero-title">${esc(libName(src))}</h2>` +
    `<p class="lib-hero-sub">${w > 5 ? "Resume at " + formatTime(w) + (pct > 1 ? " · " + Math.round(pct) + "% watched" : "") : "Not watched yet"}${where ? " · " + esc(where) : ""}</p>` +
    `<div class="lib-hero-actions"><button class="btn primary">${w > 5 ? "Resume" : "Play"}</button>${w > 5 ? '<button class="btn" data-start>Play from start</button>' : ""}</div></div>` +
    (pct > 1 ? `<div class="lib-hero-progress"><i style="width:${pct}%"></i></div>` : "");
  el.querySelector(".btn.primary").onclick = () => libPlay(src);
  const st = el.querySelector("[data-start]");
  if (st)
    st.onclick = () => {
      videoTimeStorage.save(src, 0);
      libPlay(src);
    };
  lib.heroEl = el;
  lib.heroSrc = src;
  return el;
}

// pointer-driven motion (Rich only): spotlight, card tilt, hero parallax, magnetic buttons
(function setupStudioMotion() {
  let raf = 0,
    last = null;
  const active = () => document.documentElement.getAttribute("data-fx") === "rich";
  window.addEventListener("pointermove", (e) => {
    if (!active()) return;
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const ev = last;
      const amb = document.querySelector(".ambient");
      amb.style.setProperty("--cx", ev.clientX + "px");
      amb.style.setProperty("--cy", ev.clientY + "px");
      const card = ev.target.closest && ev.target.closest(".lib-card:not(.lib-folder)");
      if (card) {
        const t = card.querySelector(".lib-thumb");
        const rc = t.getBoundingClientRect();
        const px = (ev.clientX - rc.left) / rc.width - 0.5;
        const py = (ev.clientY - rc.top) / rc.height - 0.5;
        t.style.setProperty("--ry", (px * 10).toFixed(2) + "deg");
        t.style.setProperty("--rx", (-py * 10).toFixed(2) + "deg");
      }
      const hero = ev.target.closest && ev.target.closest(".lib-hero");
      if (hero) {
        const rc = hero.getBoundingClientRect();
        hero.style.setProperty("--hx", (-((ev.clientX - rc.left) / rc.width - 0.5) * 22).toFixed(1) + "px");
        hero.style.setProperty("--hy", (-((ev.clientY - rc.top) / rc.height - 0.5) * 14).toFixed(1) + "px");
      }
      const mag = ev.target.closest && ev.target.closest(".btn.primary");
      if (mag) {
        const rc = mag.getBoundingClientRect();
        mag.style.setProperty("--tx", ((ev.clientX - (rc.left + rc.width / 2)) * 0.12).toFixed(1) + "px");
        mag.style.setProperty("--ty", ((ev.clientY - (rc.top + rc.height / 2)) * 0.2).toFixed(1) + "px");
      }
    });
  });
  document.addEventListener(
    "pointerout",
    (e) => {
      const m = e.target.closest && e.target.closest(".btn.primary");
      if (m) {
        m.style.setProperty("--tx", "0px");
        m.style.setProperty("--ty", "0px");
      }
      const t = e.target.closest && e.target.closest(".lib-card:not(.lib-folder)");
      if (t && !t.contains(e.relatedTarget)) {
        const th = t.querySelector(".lib-thumb");
        th.style.setProperty("--rx", "0deg");
        th.style.setProperty("--ry", "0deg");
      }
    },
    true
  );
})();
updateQuick();

// ---------- Advanced: default folder ----------
if (chooseDefaultFolderBtn) {
  chooseDefaultFolderBtn.addEventListener("click", async () => {
    const dir = await window.electronAPI.selectDefaultFolder();
    if (dir) {
      settings.defaultImportFolder = dir;
      defaultFolderText.textContent = dir;
      scheduleSave();
    }
  });
}
if (clearDefaultFolderBtn) {
  clearDefaultFolderBtn.addEventListener("click", () => {
    settings.defaultImportFolder = null;
    defaultFolderText.textContent = "Not set";
    scheduleSave();
  });
}

// ---------- Advanced: conversion cache ----------
async function refreshCacheInfo() {
  if (!cacheInfoText) return;
  try {
    const info = await window.electronAPI.getCacheInfo();
    if (info) cacheInfoText.textContent = info.count ? info.count + (info.count === 1 ? " file, " : " files, ") + formatBytes(info.bytes) + "." : "Empty.";
  } catch (_) {}
}
if (clearCacheBtn) {
  clearCacheBtn.addEventListener("click", async () => {
    clearCacheBtn.disabled = true;
    try {
      const res = await window.electronAPI.clearCache();
      if (res && res.ok) {
        showToast("Cache cleared (" + res.removed + " files)");
        refreshCacheInfo();
      }
    } catch (_) {}
    clearCacheBtn.disabled = false;
  });
}

// ---------- Advanced: hardware decode ----------
if (hwDecodeToggle) {
  window.electronAPI.getHardwareDecode().then((v) => {
    hwDecodeToggle.checked = v !== false;
  });
  hwDecodeToggle.addEventListener("change", async () => {
    const enabled = hwDecodeToggle.checked;
    await window.electronAPI.setHardwareDecode(enabled);
    showToast("Restart required to apply", {
      actionLabel: "Restart now",
      onAction: () => window.electronAPI.relaunchApp(),
      duration: 8000,
    });
  });
}

// ---------- Reset all settings (the library, playlist and favorites stay) ----------
if (resetAllBtn) {
  resetAllBtn.addEventListener("click", async () => {
    if (!(await askConfirm({ title: "Reset all settings?", message: "Every preference goes back to its default. Your library, playlist, favorites and video files are kept.", okText: "Reset" }))) return;
    resetAllBtn.disabled = true;
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const old = (await window.electronAPI.loadStore()) || {};
      const keep = {};
      ["playlist", "library", "currentIndex", "favorites", "folders", "itemFolder", "recentFiles", "subtitles", "subtitleChoices", "volume", "muted", "loop"].forEach((k) => {
        if (old[k] !== undefined) keep[k] = old[k];
      });
      // custom equalizer presets are user-made content, so they survive the reset
      if (old.settings && old.settings.customEq) keep.settings = { customEq: old.settings.customEq };
      await window.electronAPI.saveStore(keep);
      // System options go back to their defaults, which are all on
      const hwWasOff = (await window.electronAPI.getHardwareDecode()) === false;
      await window.electronAPI.setHardwareDecode(true);
      const st = await window.electronAPI.winIntegrationStatus();
      if (st && st.supported) for (const kind of ["openWith", "fileMenu", "folderMenu"]) await window.electronAPI.winIntegrationSet(kind, true);
      try {
        localStorage.removeItem("rtx.uiStyle");
        localStorage.removeItem("rtx.uiFx");
      } catch (_) {}
      if (hwWasOff) window.electronAPI.relaunchApp();
      else location.reload();
    } catch (_) {
      resetAllBtn.disabled = false;
      showToast("Could not reset settings", { type: "error" });
    }
  });
}

// ---------- Playback settings: autoplay ----------
if (autoplayEnabledEl) {
  autoplayEnabledEl.addEventListener("change", () => {
    settings.autoplayEnabled = autoplayEnabledEl.checked;
    scheduleSave();
  });
}
if (autoplayDelayEl) {
  autoplayDelayEl.addEventListener("input", () => {
    settings.autoplayDelay = parseInt(autoplayDelayEl.value, 10);
    autoplayDelayValue.textContent = settings.autoplayDelay + "s";
    paintRange(autoplayDelayEl);
    scheduleSave();
  });
}
// reflect saved values in the General tab
function syncGeneralUi() {
  if (autoplayEnabledEl) autoplayEnabledEl.checked = settings.autoplayEnabled !== false;
  if (autoplayDelayEl) {
    autoplayDelayEl.value = settings.autoplayDelay || 5;
    autoplayDelayValue.textContent = (settings.autoplayDelay || 5) + "s";
    paintRange(autoplayDelayEl);
  }
  if (defaultFolderText) defaultFolderText.textContent = settings.defaultImportFolder || "Not set";
  applyVideoFit();
}

// ---------- Default subtitle search language (settings mirror) ----------
function populateDefaultSubLang() {
  if (!defaultSubLang) return;
  defaultSubLang.innerHTML = subSearchLang.innerHTML;
  defaultSubLang.value = subtitleSearchPrefs.language || "all";
}
if (defaultSubLang) {
  defaultSubLang.addEventListener("change", () => {
    subtitleSearchPrefs.language = defaultSubLang.value;
    scheduleSave();
  });
}

// ---------- Save / Load state ----------
async function saveState() {
  const subtitlesData = {};
  for (const [videoSrc, subs] of subtitlesMap.entries()) {
    subtitlesData[videoSrc] = subs.map((sub) => ({ label: sub.label, content: sub.content, source: sub.source }));
  }
  const state = {
    playlist,
    library: libraryItems,
    currentIndex,
    loop: video.loop,
    volume: video.volume,
    muted: video.muted,
    subtitles: subtitlesData,
    subtitleSettings,
    uiPrefs,
    subtitleSearchPrefs,
    settings,
    recentFiles,
    favorites: Array.from(favorites),
    subtitleChoices: Array.from(subChoice),
    folders: Array.from(folders.entries()),
    itemFolder: Array.from(itemFolder.entries()),
  };
  await window.electronAPI.saveStore(state);
}

function scheduleSave() {
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(saveState, 1000);
}

async function loadState() {
  const state = await window.electronAPI.loadStore();
  if (state) {
    playlist = state.playlist || [];
    libraryItems = Array.isArray(state.library) ? state.library : playlist.slice(); // older saves: library = playlist
    currentIndex = state.currentIndex || -1;
    video.loop = !!state.loop;
    loopBtn.classList.toggle("active", video.loop);
    if (typeof state.volume === "number") video.volume = state.volume;
    video.muted = !!state.muted;
    boostLevel = settings.boostEnabled && video.volume >= 0.999 ? Math.max(1, settings.boostLevel || 1) : 1;
    updateVolumeUI();

    if (state.uiPrefs) {
      uiPrefs = Object.assign(uiPrefs, state.uiPrefs);
    }
    if (state.subtitleSearchPrefs) {
      subtitleSearchPrefs = Object.assign(subtitleSearchPrefs, state.subtitleSearchPrefs);
    }
    if (state.settings) {
      settings = Object.assign(settings, state.settings);
    }
    if (Array.isArray(state.recentFiles)) {
      recentFiles = state.recentFiles;
    }
    if (Array.isArray(state.favorites)) favorites = new Set(state.favorites);
    if (Array.isArray(state.subtitleChoices)) subChoice = new Map(state.subtitleChoices);
    if (!libraryItems.length && playlist.length) libraryItems = playlist.slice();
    if (Array.isArray(state.folders)) {
      folders = new Map(state.folders);
      let maxSeq = 0;
      for (const id of folders.keys()) {
        const n = parseInt(String(id).replace("f", ""), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
      folderSeq = maxSeq;
    }
    if (Array.isArray(state.itemFolder)) itemFolder = new Map(state.itemFolder);

    if (eqBandsEl) {
      refreshPresetSelect();
      syncEqUi();
    }
    syncAudUi();
    if (audioCtx) {
      applyAud();
      applyOutputDevice(true);
    }
    syncBoostUi();
    document.getElementById("rememberSubtitle").checked = settings.rememberSubtitle !== false;
    applyStats();
    libApplyPrefs();

    applyRailState();
    applyPlaylistCollapsed();
    nowGrid.style.setProperty("--playlist-w", uiPrefs.playlistWidth + "px");
    applyVideoFit();
    if (fxReady) VideoFX.load();
    applyEnhancementState();
    applyStyle();

    syncGeneralUi();

    populateDefaultSubLang();
    renderRecent();

    if (state.subtitleSettings) {
      Object.assign(subtitleSettings, state.subtitleSettings);
      if (state.subtitleSettings.bottomPx == null && state.subtitleSettings.bottom != null) subtitleSettings.bottomPx = Math.max(0, Math.min(160, Math.round(state.subtitleSettings.bottom * 6)));
      if (!state.subtitleSettings.edge) subtitleSettings.edge = subtitleSettings.bgEnabled ? "box" : subtitleSettings.strokeWidth > 0 ? "outline" : "none";
    }
    syncSubSettingsUi();
    updateSubtitleStyle();

    if (state.subtitles) {
      for (const [videoSrc, subs] of Object.entries(state.subtitles)) {
        const subtitlesList = subs.map((sub) => {
          const blob = new Blob([sub.content], { type: "text/vtt;charset=UTF-8" });
          const blobUrl = URL.createObjectURL(blob);
          return { label: sub.label, content: sub.content, blobUrl, source: sub.source };
        });
        subtitlesMap.set(videoSrc, subtitlesList);
      }
    }

    renderPlaylist();
    if (currentIndex >= 0) playIndex(currentIndex);
  } else {
    applyStyle();
    populateDefaultSubLang();
    syncGeneralUi();
  }
}

// ---------- System fonts ----------
async function loadSystemFonts() {
  try {
    subtitleSettings.availableFonts = (await window.electronAPI.getInstalledFonts()) || [];
    subtitleFontFamily.innerHTML = "";
    subtitleSettings.availableFonts.forEach((font) => {
      const option = document.createElement("option");
      option.value = font;
      option.textContent = font;
      option.style.fontFamily = font;
      subtitleFontFamily.appendChild(option);
    });
    if (subtitleSettings.availableFonts.includes(subtitleSettings.fontFamily)) {
      subtitleFontFamily.value = subtitleSettings.fontFamily;
    } else if (subtitleSettings.availableFonts.length > 0) {
      subtitleSettings.fontFamily = subtitleSettings.availableFonts[0];
      subtitleFontFamily.value = subtitleSettings.fontFamily;
      updateSubtitleStyle();
    }
  } catch (error) {
    console.error("Failed to load system fonts:", error);
  }
}

/* subtitle style engine: see the "Subtitles" section below */

// ---------- Chapters (drive the seek bar partitions) ----------
async function loadChapters(original) {
  seekChapters = [];
  buildSeekSegments();
  try {
    const res = await window.electronAPI.probeChapters(original);
    if (playlist[currentIndex] !== original) return;
    if (res && res.ok && res.chapters && res.chapters.length) {
      seekChapters = res.chapters;
      buildSeekSegments();
    }
  } catch (_) {}
}

/* subtitle timing: see the "Subtitles" section below */
let subtitleOffsetSec = 0;
const subOffsetValue = document.getElementById("subOffsetValue");

// ---------- Live video info overlay ----------
const statsToggle = document.getElementById("statsToggle");
const statsOverlay = document.getElementById("statsOverlay");
const statsInfoCache = new Map(); // src -> info
const statsChunks = new Map(); // src -> Map(chunkIdx -> {v:[],a:[]})
const statsPending = new Set();
let statsTimer = null;
let statsPrevFrames = null;
let statsPrevTime = 0;
let statsFps = 0;
const STATS_CHUNK = 10;
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function fmtRate(kbps) {
  if (kbps == null) return "…";
  return kbps >= 1000 ? (kbps / 1000).toFixed(2) + " Mbps" : Math.round(kbps) + " kbps";
}
function statsEnsureChunk(src, chunk) {
  const key = src + "|" + chunk;
  let m = statsChunks.get(src);
  if (!m) statsChunks.set(src, (m = new Map()));
  if (m.has(chunk) || statsPending.has(key)) return;
  statsPending.add(key);
  window.electronAPI
    .probeBitrate(src, chunk * STATS_CHUNK, STATS_CHUNK)
    .then((res) => {
      if (res && res.ok) m.set(chunk, { v: res.v, a: res.a });
      else m.set(chunk, { v: [], a: [] });
    })
    .catch(() => m.set(chunk, { v: [], a: [] }))
    .finally(() => statsPending.delete(key));
}
function statsRateAt(src, sec) {
  const m = statsChunks.get(src);
  const c = m && m.get(Math.floor(sec / STATS_CHUNK));
  if (!c || !c.v.length) return null;
  const k = sec - Math.floor(sec / STATS_CHUNK) * STATS_CHUNK;
  return { v: (c.v[k] * 8) / 1000, a: (c.a[k] * 8) / 1000 };
}
function drawStatsSpark(src, sec) {
  const cv = statsOverlay.querySelector("canvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = cv.width,
    H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const vals = [];
  for (let s = sec - 29; s <= sec + 10; s++) {
    const r = s >= 0 ? statsRateAt(src, s) : null;
    vals.push(r ? r.v : null);
  }
  const max = Math.max(1, ...vals.filter((x) => x != null));
  const step = W / (vals.length - 1);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#76b900";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  vals.forEach((v, i) => {
    if (v == null) return;
    const y = H - 2 - (v / max) * (H - 4);
    if (!started) {
      ctx.moveTo(i * step, y);
      started = true;
    } else ctx.lineTo(i * step, y);
  });
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(29 * step, 0);
  ctx.lineTo(29 * step, H);
  ctx.stroke();
}
function statsTick() {
  const src = playlist[currentIndex];
  if (!src || !video.src) {
    statsOverlay.innerHTML = '<div class="stats-title">Nothing playing</div>';
    return;
  }
  if (!statsInfoCache.has(src)) {
    statsInfoCache.set(src, null);
    window.electronAPI.probeInfo(src).then((res) => statsInfoCache.set(src, res && res.ok ? res.info : {})).catch(() => statsInfoCache.set(src, {}));
  }
  const info = statsInfoCache.get(src) || {};
  const sec = Math.floor(video.currentTime || 0);
  const chunk = Math.floor(sec / STATS_CHUNK);
  statsEnsureChunk(src, chunk);
  if (sec % STATS_CHUNK >= 6) statsEnsureChunk(src, chunk + 1);
  if (chunk > 0 && sec % STATS_CHUNK < 2) statsEnsureChunk(src, chunk - 1);
  const rate = statsRateAt(src, sec);
  let q = null;
  try {
    q = video.getVideoPlaybackQuality();
  } catch (_) {}
  const now = performance.now();
  if (q) {
    if (statsPrevFrames != null && now > statsPrevTime && !video.paused) statsFps = ((q.totalVideoFrames - statsPrevFrames) * 1000) / (now - statsPrevTime);
    else if (video.paused) statsFps = 0;
    statsPrevFrames = q.totalVideoFrames;
    statsPrevTime = now;
  }
  let ahead = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) ahead = video.buffered.end(i) - video.currentTime;
  }
  const name = decodeURIComponent(src.split("/").pop() || "");
  const avg = info.bitRate ? info.bitRate / 1000 : null;
  const total = rate ? rate.v + rate.a : null;
  const rows = [
    ["Resolution", `${video.videoWidth || "—"}×${video.videoHeight || "—"}${info.fps ? " @ " + info.fps : ""}`],
    ["Video", info.videoCodec ? info.videoCodec.toUpperCase() : "—"],
    ["Audio", info.audioCodec ? info.audioCodec.toUpperCase() + (info.audioChannels ? " " + info.audioChannels + "ch" : "") + (info.audioSampleRate ? " " + Math.round(info.audioSampleRate / 1000) + "kHz" : "") : "—"],
    ["Container", info.container ? info.container.split(",")[0] : "—"],
    ["Video bitrate", `<b>${fmtRate(rate ? rate.v : null)}</b>`],
    ["Audio bitrate", fmtRate(rate ? rate.a : null)],
    ["Total now", fmtRate(total)],
    ["File average", fmtRate(avg)],
    ["Render FPS", statsFps ? statsFps.toFixed(1) : "—"],
    ["Dropped", q ? `${q.droppedVideoFrames} / ${q.totalVideoFrames}` : "—"],
    ["Buffered", ahead.toFixed(1) + " s"],
    ["Speed / Vol", `${video.playbackRate}× / ${Math.round(video.volume * 100)}%${video.muted ? " (muted)" : ""}`],
    ["Size", info.size ? formatBytes(info.size) : "—"],
    ["Source", video.currentSrc && video.currentSrc.indexOf("rtx-player-") !== -1 ? "Converted audio" : "Direct"],
  ];
  statsOverlay.innerHTML =
    `<div class="stats-title" title="${esc(name)}">${esc(name)}</div>` +
    rows.map(([k, v]) => `<div class="stats-row"><span>${k}</span><span>${v}</span></div>`).join("") +
    '<canvas width="240" height="34"></canvas>';
  drawStatsSpark(src, sec);
}
function applyStats() {
  const on = !!settings.showStats;
  if (statsToggle) {
    statsToggle.classList.toggle("active", on);
    document.getElementById("statsState").textContent = on ? "On" : "Off";
  }
  statsOverlay.classList.toggle("hidden", !on);
  clearInterval(statsTimer);
  statsTimer = null;
  if (on) {
    statsPrevFrames = null;
    statsTick();
    statsTimer = setInterval(statsTick, 1000);
  }
}
if (statsToggle)
  statsToggle.addEventListener("click", () => {
    settings.showStats = !settings.showStats;
    applyStats();
    scheduleSave();
  });
video.addEventListener("seeked", () => {
  if (settings.showStats) statsTick();
});

// ---------- Media Session ----------
function updateMediaSessionMeta() {
  if (!("mediaSession" in navigator)) return;
  const src = playlist[currentIndex];
  if (!src) return;
  const name = decodeURIComponent(src.split("/").pop() || "RTX Video Player");
  navigator.mediaSession.metadata = new MediaMetadata({ title: name, artist: "RTX Video Player" });
}
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => video.play().catch(() => {}));
  navigator.mediaSession.setActionHandler("pause", () => video.pause());
  navigator.mediaSession.setActionHandler("previoustrack", () => playIndex(Math.max(0, currentIndex - 1)));
  navigator.mediaSession.setActionHandler("nexttrack", () => playIndex(Math.min(playlist.length - 1, currentIndex + 1)));
  navigator.mediaSession.setActionHandler("seekbackward", () => (video.currentTime = Math.max(0, video.currentTime - 10)));
  navigator.mediaSession.setActionHandler("seekforward", () => (video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)));
}

// ---------- Live audio (decode audio only, on demand; the file is never rewritten) ----------
const LIVE_NATIVE = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);
const LIVE_MIME = 'audio/mp4; codecs="mp4a.40.2"';
const liveAudio = { el: new Audio(), session: null, server: null, seq: 0, source: null, retries: 0 };
liveAudio.el.preload = "auto";
const liveSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// While a live track plays, the <video>'s own audio must stay silent but NOT unplugged:
// a MediaElementSource that is pulled by nothing stalls the element's audio clock, which
// freezes the picture. So it is routed into a muted gain that still ends at the destination.
function liveSetGraph(on) {
  if (!audioCtx || !sourceNode) return;
  try {
    sourceNode.disconnect();
    if (on) {
      if (!muteSinkNode) {
        muteSinkNode = audioCtx.createGain();
        muteSinkNode.gain.value = 0;
        muteSinkNode.connect(audioCtx.destination);
      }
      sourceNode.connect(muteSinkNode);
    } else if (preampNode) sourceNode.connect(preampNode);
    else sourceNode.connect(audioCtx.destination);
  } catch (_) {}
}
function liveSyncVolume() {
  liveAudio.el.volume = video.volume;
  liveAudio.el.muted = video.muted;
  liveAudio.el.playbackRate = video.playbackRate || 1;
  try { liveAudio.el.preservesPitch = video.preservesPitch; } catch (_) {}
}
function liveBufferedEnd(s) {
  const b = s.sb && s.sb.buffered;
  return b && b.length ? b.end(b.length - 1) : s.fetchStart;
}
function liveInBuffered(t) {
  const b = liveAudio.el.buffered;
  for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.05 && t <= b.end(i) - 0.1) return true;
  return false;
}
function liveStop(keepGraph) {
  const s = liveAudio.session;
  if (!s) return;
  s.dead = true;
  s.gen++;
  clearInterval(s.timer);
  clearTimeout(s.seekTimer);
  try { if (s.abort) s.abort.abort(); } catch (_) {}
  const el = s.el || liveAudio.el;
  try { el.pause(); } catch (_) {}
  try { if (s.node) s.node.disconnect(); } catch (_) {}
  el.removeAttribute("src");
  try { el.load(); } catch (_) {}
  if (s.url) URL.revokeObjectURL(s.url);
  liveAudio.session = null;
  if (!keepGraph) liveSetGraph(false);
}
// A far seek rebuilds the whole MediaSource (same path as a fresh start, which is known-good)
function liveRestart(s, t) {
  if (s.dead || liveAudio.session !== s) return;
  const { original, track, onFail } = s;
  liveStop(true);
  liveStart(original, track, t, true)
    .then((ns) => {
      if (ns) ns.onFail = onFail;
    })
    .catch((e) => onFail && onFail(e));
}
function liveFail(s, err) {
  if (s.dead || liveAudio.session !== s) return;
  const { original, track, onFail } = s;
  liveStop();
  if (liveAudio.retries < 3 && playlist[currentIndex] === original) {
    liveAudio.retries++;
    liveStart(original, track, video.currentTime, true)
      .then((ns) => { if (ns) ns.onFail = onFail; })
      .catch((e) => onFail && onFail(e));
  } else if (onFail) onFail(err);
}
const liveIdle = (sb) => (sb.updating ? new Promise((r) => sb.addEventListener("updateend", r, { once: true })) : Promise.resolve());
// every SourceBuffer operation goes through ONE queue so seeks can never interleave with appends
function liveQueue(s, fn) {
  const p = (s.q = s.q.then(() => (s.dead ? undefined : fn())).catch((e) => liveFail(s, e)));
  return p;
}
function liveAppend(s, gen, chunk) {
  return liveQueue(s, async () => {
    if (gen !== s.gen) return;
    await liveIdle(s.sb);
    if (gen !== s.gen) return;
    try {
      s.sb.appendBuffer(chunk);
    } catch (e) {
      if (e && e.name === "QuotaExceededError") {
        s.sb.remove(0, Math.max(0.5, liveAudio.el.currentTime - 10));
        await liveIdle(s.sb);
        s.sb.appendBuffer(chunk);
      } else throw e;
    }
    await liveIdle(s.sb);
  });
}
async function liveStream(s, gen, t) {
  const ac = new AbortController();
  s.abort = ac;
  s.streaming = true;
  try {
    const { base, token } = liveAudio.server;
    const url = `${base}/audio?token=${token}&src=${encodeURIComponent(s.original)}&idx=${s.track}&ss=${t}`;
    const resp = await fetch(url, { signal: ac.signal });
    if (!resp.ok || !resp.body) throw new Error("stream " + resp.status);
    const reader = resp.body.getReader();
    for (;;) {
      while (gen === s.gen && !s.dead && liveBufferedEnd(s) - liveAudio.el.currentTime > 40) await liveSleep(400);
      if (gen !== s.gen || s.dead) {
        ac.abort();
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      await liveAppend(s, gen, value);
    }
  } catch (e) {
    if ((e && e.name === "AbortError") || gen !== s.gen || s.dead) return;
    liveFail(s, e);
  } finally {
    if (gen === s.gen) s.streaming = false;
  }
}
// (re)start the stream at time t: invalidate everything in flight, reset the buffer in-queue, then stream
function liveFetch(s, t) {
  if (s.dead) return;
  const gen = ++s.gen;
  if (s.abort) {
    try { s.abort.abort(); } catch (_) {}
  }
  s.fetchStart = t;
  s.streaming = false;
  liveQueue(s, async () => {
    await liveIdle(s.sb);
    if (s.ms.readyState !== "open") throw new Error("mediasource closed");
    try { s.sb.abort(); } catch (_) {}
    if (s.sb.buffered.length) {
      s.sb.remove(0, s.sb.buffered.end(s.sb.buffered.length - 1) + 1);
      await liveIdle(s.sb);
    }
    s.sb.timestampOffset = t;
  }).then(() => {
    if (gen === s.gen && !s.dead) liveStream(s, gen, t);
  });
}
function liveOnSeek() {
  const s = liveAudio.session;
  if (!s) return;
  if (!s.sb) {
    s.wantSeek = true;
    return;
  }
  clearTimeout(s.seekTimer);
  s.seekTimer = setTimeout(() => {
    if (liveAudio.session !== s) return;
    const t = video.currentTime;
    try { liveAudio.el.currentTime = t; } catch (_) {}
    if (liveInBuffered(t)) return;
    // the running stream will reach it very soon (it is ~45x realtime)
    if (s.streaming && t >= s.fetchStart - 0.1 && t - liveBufferedEnd(s) < 4) return;
    liveRestart(s, t);
  }, 160);
}
function liveTick(s) {
  if (s.dead || liveAudio.session !== s) return;
  const el = liveAudio.el;
  const now = Date.now();
  if (!video.paused && el.readyState < 3) {
    // nudge over a tiny gap at the start of a freshly-appended range
    const b = el.buffered;
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) > el.currentTime && b.start(i) - el.currentTime < 3) {
        el.currentTime = b.start(i) + 0.01;
        break;
      }
    }
    // watchdog: stalled for too long with nothing arriving -> restart the stream here
    if (!liveInBuffered(video.currentTime)) {
      if (!s.stallSince) s.stallSince = now;
      else if (now - s.stallSince > 3500) {
        s.stallSince = 0;
        try { el.currentTime = video.currentTime; } catch (_) {}
        liveRestart(s, video.currentTime);
        return;
      }
    } else s.stallSince = 0;
  } else s.stallSince = 0;
  if (video.paused || el.paused || el.readyState < 3) return;
  const d = el.currentTime - video.currentTime;
  const rate = video.playbackRate || 1;
  if (Math.abs(d) > 0.25) {
    if (liveInBuffered(video.currentTime)) el.currentTime = video.currentTime;
  } else if (Math.abs(d) > 0.04) {
    el.playbackRate = rate * (d > 0 ? 0.97 : 1.03);
  } else if (el.playbackRate !== rate) {
    el.playbackRate = rate;
  }
}
async function liveStart(original, track, startTime, isRetry) {
  try {
    return await liveStartCore(original, track, startTime, isRetry);
  } catch (e) {
    // a failed start must never leave the video muted with no live audio behind it
    if (!liveAudio.session) liveSetGraph(false);
    throw e;
  }
}
async function liveStartCore(original, track, startTime, isRetry) {
  liveStop(true); // keep the graph as it is, so there is no audible gap while the new stream spins up
  if (!isRetry) liveAudio.retries = 0;
  if (!window.MediaSource || !MediaSource.isTypeSupported(LIVE_MIME)) throw new Error("MSE unsupported");
  if (!liveAudio.server) {
    const info = await window.electronAPI.audioLiveInfo();
    if (!info || !info.ok) throw new Error("audio server");
    liveAudio.server = info;
  }
  resumeAudio();
  if (!audioCtx || !sourceNode || !preampNode) throw new Error("audio engine");
  const el = new Audio();
  el.preload = "auto";
  try { el.preservesPitch = audState().pitch !== false; } catch (_) {}
  liveAudio.el = el;
  let node = null;
  if (audioCtx && preampNode) {
    try {
      node = audioCtx.createMediaElementSource(el);
      node.connect(preampNode);
    } catch (_) {}
  }
  const ms = new MediaSource();
  const s = { id: ++liveAudio.seq, el, node, original, track, ms, sb: null, abort: null, gen: 0, q: Promise.resolve(), streaming: false, fetchStart: startTime || 0, dead: false, timer: null, seekTimer: null, stallSince: 0, wantSeek: false, url: null, onFail: null };
  liveAudio.session = s;
  s.url = URL.createObjectURL(ms);
  el.addEventListener("error", () => {
    if (!s.dead && liveAudio.session === s && el.error && el.error.code !== 1) liveFail(s, new Error("audio element"));
  });
  ["progress", "loadedmetadata", "canplay", "stalled", "waiting"].forEach((ev) => el.addEventListener(ev, () => liveNudge(s)));
  el.src = s.url;
  await new Promise((res, rej) => {
    ms.addEventListener("sourceopen", res, { once: true });
    setTimeout(() => rej(new Error("sourceopen timeout")), 6000);
  });
  if (s.dead) return s;
  s.sb = ms.addSourceBuffer(LIVE_MIME);
  s.sb.mode = "segments";
  s.sb.addEventListener("error", () => liveFail(s, new Error("sourcebuffer")));
  liveSetGraph(true);
  liveSyncVolume();
  const t0 = s.wantSeek ? video.currentTime : startTime || 0;
  try { liveAudio.el.currentTime = t0; } catch (_) {}
  liveFetch(s, t0);
  s.timer = setInterval(() => liveTick(s), 400);
  if (!video.paused) liveAudio.el.play().catch(() => {});
  return s;
}
function liveNudge(s) {
  // jump into a freshly appended range that starts a hair after the playhead
  if (s.dead || liveAudio.session !== s) return;
  const el = s.el;
  const b = el.buffered;
  if (el.readyState >= 3 && liveInBuffered(el.currentTime)) return;
  for (let i = 0; i < b.length; i++) {
    if (b.end(i) - b.start(i) > 0.3 && (el.currentTime < b.start(i) || el.currentTime > b.end(i))) {
      const target = Math.max(b.start(i) + 0.02, Math.min(video.currentTime, b.end(i) - 0.3));
      try { el.currentTime = target; } catch (_) {}
      break;
    }
  }
  if (!video.paused && el.paused) el.play().catch(() => {});
}
video.addEventListener("play", () => liveAudio.session && liveAudio.el.play().catch(() => {}));
video.addEventListener("playing", () => liveAudio.session && liveAudio.el.play().catch(() => {}));
video.addEventListener("pause", () => liveAudio.session && liveAudio.el.pause());
video.addEventListener("waiting", () => liveAudio.session && liveAudio.el.pause());
video.addEventListener("ended", () => liveAudio.session && liveAudio.el.pause());
video.addEventListener("seeking", liveOnSeek);
video.addEventListener("ratechange", () => liveAudio.session && liveSyncVolume());
video.addEventListener("volumechange", () => liveAudio.session && liveSyncVolume());

// ---------- Audio engine: equalizer, dynamics, stereo, reverb, filters ----------
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const EQ_BUILTIN = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Movie: [4, 3, 1, 0, 0, 1, 2, 3, 2, 1],
  Dialogue: [-3, -2, -1, 1, 3, 4, 4, 2, 0, -1],
  Music: [3, 2, 1, 0, -1, 0, 1, 2, 3, 3],
  "Bass boost": [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  "Treble boost": [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  Rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5],
  Classical: [0, 0, 0, 0, 0, 0, -2, -3, -3, -4],
  Jazz: [3, 2, 1, 2, -2, -2, 0, 1, 2, 3],
  Club: [0, 0, 3, 4, 4, 4, 3, 0, 0, 0],
  Dance: [6, 5, 3, 0, 0, -2, -4, -4, 0, 0],
  Live: [-3, 0, 2, 3, 3, 3, 2, 1, 1, 1],
  Headphones: [3, 6, 3, -1, -2, 1, 3, 5, 6, 6],
  Soft: [3, 1, 0, -1, -1, 1, 3, 4, 5, 5],
  Techno: [5, 4, 1, -3, -2, 1, 4, 5, 5, 4],
  Party: [4, 4, 0, 0, 0, 0, 0, 0, 4, 4],
  Reggae: [0, 0, -1, -4, 0, 3, 3, 0, 0, 0],
  "Large hall": [6, 6, 3, 3, 0, -2, -2, -2, 0, 0],
  "Full bass": [6, 6, 6, 4, 1, -3, -5, -6, -6, -6],
  "Full treble": [-6, -6, -6, -3, 2, 6, 9, 10, 10, 10],
};
// icon per built-in equalizer preset (custom presets use a bookmark)
const EQ_ICONS = {
  Flat: "flat", Movie: "film", Dialogue: "chat", Music: "note", "Bass boost": "bars-down", "Treble boost": "bars-up", Rock: "bolt", Pop: "spark", Electronic: "wave", Classical: "keys",
  Jazz: "keys", Club: "spark", Dance: "bolt", Live: "wave", Headphones: "note", Soft: "flat", Techno: "bars-up", Party: "spark", Reggae: "bars-down", "Large hall": "film", "Full bass": "bars-down", "Full treble": "bars-up",
};
let audioCtx = null,
  sourceNode = null,
  muteSinkNode = null,
  preampNode = null,
  hpNode = null,
  lpNode = null,
  eqNodes = [],
  compressorNode = null,
  makeupNode = null,
  advCompNode = null,
  advMakeNode = null,
  stIn = null,
  stM = null,
  stXfL = null,
  stXfR = null,
  revIn = null,
  revDry = null,
  revWet = null,
  revConv = null,
  revOut = null,
  boostNode = null,
  limiterNode = null,
  analyserNode = null,
  delayNode = null,
  meterL = null,
  meterR = null;
let revConnected = false,
  revSizeApplied = 0,
  revTimer = null;

const audById = (id) => document.getElementById(id);
const nightModeToggle = audById("nightModeToggle");
const nightStrength = audById("nightStrength");
const nightStrengthValue = audById("nightStrengthValue");
const nightCard = audById("nightCard");
const eqEnabled = audById("eqEnabled");
const eqPresetSelect = audById("eqPresetSelect");
const eqSaveBtn = audById("eqSaveBtn");
const eqDeleteBtn = audById("eqDeleteBtn");
const eqResetBtn = audById("eqResetBtn");
const eqBandsEl = audById("eqBands");
const eqPreamp = audById("eqPreamp");
const eqPreampValue = audById("eqPreampValue");
const eqCanvas = audById("eqCanvas");
const eqMeter = audById("eqMeter");
const eqGraph = audById("eqGraph");
const eqTip = audById("eqTip");
const eqCard = audById("eqCard");

function eqState() {
  if (!settings.eq) settings.eq = { enabled: false, preamp: 0, gains: EQ_BUILTIN.Flat.slice(), preset: "b:Flat" };
  if (!settings.customEq) settings.customEq = {};
  return settings.eq;
}

// everything in "Advanced options" lives in settings.aud
const AUD_DEFAULTS = {
  mode: "stereo", // stereo | mono | left | right | swap | karaoke
  width: 100,
  bal: 0,
  xf: 0,
  rev: { on: false, size: 1.8, mix: 25 },
  comp: { on: false, thr: -24, ratio: 4, atk: 10, rel: 250, gain: 0 },
  hp: 20,
  lp: 20000,
  delay: 0,
  pitch: true,
  lim: true,
  ceil: -1.5,
  dev: "",
  open: false,
};
function audState() {
  const s = settings.aud && typeof settings.aud === "object" ? settings.aud : (settings.aud = {});
  for (const k in AUD_DEFAULTS) {
    const d = AUD_DEFAULTS[k];
    if (d && typeof d === "object") s[k] = Object.assign({}, d, s[k]);
    else if (s[k] === undefined) s[k] = d;
  }
  return s;
}
function audParam(p, v, tc) {
  try {
    p.setTargetAtTime(v, audioCtx.currentTime, tc || 0.02);
  } catch (_) {
    p.value = v;
  }
}

function ensureAudioGraph() {
  if (audioCtx) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx = ctx;
    sourceNode = ctx.createMediaElementSource(video);
    const gain = () => ctx.createGain();
    preampNode = gain();
    hpNode = ctx.createBiquadFilter();
    hpNode.type = "highpass";
    hpNode.Q.value = 0.707;
    hpNode.frequency.value = 10;
    lpNode = ctx.createBiquadFilter();
    lpNode.type = "lowpass";
    lpNode.Q.value = 0.707;
    lpNode.frequency.value = Math.min(22000, ctx.sampleRate / 2 - 1);
    eqNodes = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
      b.frequency.value = f;
      b.Q.value = 1.1;
      return b;
    });
    compressorNode = ctx.createDynamicsCompressor(); // night mode
    makeupNode = gain();
    advCompNode = ctx.createDynamicsCompressor(); // manual compressor
    advCompNode.knee.value = 10;
    advMakeNode = gain();

    // stereo stage: 2x2 matrix (+ crossfeed) between a forced-stereo input and the reverb
    stIn = gain();
    stIn.channelCount = 2;
    stIn.channelCountMode = "explicit";
    stIn.channelInterpretation = "speakers";
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    stM = { ll: gain(), lr: gain(), rl: gain(), rr: gain() };
    split.connect(stM.ll, 0);
    stM.ll.connect(merge, 0, 0);
    split.connect(stM.lr, 0);
    stM.lr.connect(merge, 0, 1);
    split.connect(stM.rl, 1);
    stM.rl.connect(merge, 0, 0);
    split.connect(stM.rr, 1);
    stM.rr.connect(merge, 0, 1);
    const crossfeed = (from, to) => {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      const dl = ctx.createDelay(0.01);
      dl.delayTime.value = 0.0003;
      const g = gain();
      g.gain.value = 0;
      split.connect(lp, from);
      lp.connect(dl);
      dl.connect(g);
      g.connect(merge, 0, to);
      return g;
    };
    stXfL = crossfeed(0, 1);
    stXfR = crossfeed(1, 0);
    const stOut = gain();
    stIn.connect(split);
    merge.connect(stOut);

    // reverb: dry + convolver wet (the convolver is only wired in while reverb is on)
    revIn = gain();
    revDry = gain();
    revWet = gain();
    revOut = gain();
    revConv = ctx.createConvolver();
    revIn.connect(revDry);
    revDry.connect(revOut);
    revConv.connect(revWet);
    revWet.connect(revOut);
    stOut.connect(revIn);

    boostNode = gain();
    limiterNode = ctx.createDynamicsCompressor();
    limiterNode.threshold.value = -1.5;
    limiterNode.knee.value = 0;
    limiterNode.ratio.value = 20;
    limiterNode.attack.value = 0.002;
    limiterNode.release.value = 0.1;
    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;
    delayNode = ctx.createDelay(5);

    let chain = sourceNode;
    [preampNode, hpNode, lpNode, ...eqNodes, compressorNode, makeupNode, advCompNode, advMakeNode, stIn].forEach((n) => {
      chain.connect(n);
      chain = n;
    });
    chain = revOut;
    [boostNode, limiterNode, analyserNode, delayNode].forEach((n) => {
      chain.connect(n);
      chain = n;
    });
    delayNode.connect(ctx.destination);

    // stereo level meters (pure read-outs, they never feed the output)
    const msplit = ctx.createChannelSplitter(2);
    analyserNode.connect(msplit);
    meterL = ctx.createAnalyser();
    meterR = ctx.createAnalyser();
    meterL.fftSize = meterR.fftSize = 1024;
    meterL.smoothingTimeConstant = meterR.smoothingTimeConstant = 0;
    msplit.connect(meterL, 0);
    msplit.connect(meterR, 1);

    applyEqState();
    applyNightMode();
    applyBoost();
    applyAud();
    applyOutputDevice(true);
  } catch (_) {
    // never leave the <video> without an output path, or it would freeze
    try {
      if (sourceNode && audioCtx) sourceNode.connect(audioCtx.destination);
    } catch (__) {}
  }
}
function applyEqState() {
  if (!audioCtx || !preampNode) return;
  const s = eqState();
  preampNode.gain.value = s.enabled ? Math.pow(10, s.preamp / 20) : 1;
  eqNodes.forEach((n, i) => (n.gain.value = s.enabled ? s.gains[i] : 0));
}
function applyNightMode() {
  if (!compressorNode) return;
  const on = !!settings.nightMode;
  const k = (settings.nightStrength != null ? settings.nightStrength : 60) / 100;
  if (on) {
    compressorNode.threshold.value = -20 - 30 * k;
    compressorNode.ratio.value = 2 + 10 * k;
    compressorNode.knee.value = 14;
    compressorNode.attack.value = 0.005;
    compressorNode.release.value = 0.25;
    makeupNode.gain.value = Math.pow(10, (8 * k) / 20);
  } else {
    compressorNode.threshold.value = 0;
    compressorNode.ratio.value = 1;
    makeupNode.gain.value = 1;
  }
}

// ---- advanced audio ----
// out L = ll*L + rl*R, out R = lr*L + rr*R
function stereoMatrix(a) {
  let ll = 1, lr = 0, rl = 0, rr = 1;
  switch (a.mode) {
    case "mono": ll = lr = rl = rr = 0.5; break;
    case "left": ll = 1; lr = 1; rl = 0; rr = 0; break;
    case "right": ll = 0; lr = 0; rl = 1; rr = 1; break;
    case "swap": ll = 0; lr = 1; rl = 1; rr = 0; break;
    case "karaoke": ll = 0.7; lr = 0.7; rl = -0.7; rr = -0.7; break;
    default: {
      const w = a.width / 100;
      ll = rr = (1 + w) / 2;
      lr = rl = (1 - w) / 2;
    }
  }
  const bal = a.bal / 100;
  const gl = bal > 0 ? 1 - bal : 1;
  const gr = bal < 0 ? 1 + bal : 1;
  const k = a.xf / 100;
  const d = 1 - 0.3 * k; // keep the overall level steady while crossfeeding
  return { ll: ll * gl * d, rl: rl * gl * d, lr: lr * gr * d, rr: rr * gr * d, xf: 0.55 * k };
}
function applyAud() {
  applyPitch();
  if (!audioCtx || !stM) return;
  const a = audState();
  const m = stereoMatrix(a);
  audParam(stM.ll.gain, m.ll);
  audParam(stM.lr.gain, m.lr);
  audParam(stM.rl.gain, m.rl);
  audParam(stM.rr.gain, m.rr);
  audParam(stXfL.gain, m.xf);
  audParam(stXfR.gain, m.xf);
  audParam(hpNode.frequency, a.hp > 20 ? a.hp : 10);
  audParam(lpNode.frequency, a.lp < 20000 ? a.lp : Math.min(22000, audioCtx.sampleRate / 2 - 1));
  const c = a.comp;
  advCompNode.threshold.value = c.on ? c.thr : 0;
  advCompNode.ratio.value = c.on ? c.ratio : 1;
  advCompNode.attack.value = c.atk / 1000;
  advCompNode.release.value = c.rel / 1000;
  advMakeNode.gain.value = c.on ? Math.pow(10, c.gain / 20) : 1;
  limiterNode.threshold.value = a.lim ? a.ceil : 0;
  limiterNode.ratio.value = a.lim ? 20 : 1;
  audParam(delayNode.delayTime, a.delay / 1000);
  applyReverb();
}
function applyPitch() {
  const on = audState().pitch !== false;
  try {
    video.preservesPitch = on;
    if (liveAudio && liveAudio.el) liveAudio.el.preservesPitch = on;
  } catch (_) {}
}
function makeImpulse(sec) {
  const sr = audioCtx.sampleRate;
  const len = Math.max(1, Math.floor(sec * sr));
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      y += (0.85 - 0.7 * t) * ((Math.random() * 2 - 1) - y); // darker as the tail dies away
      d[i] = y * Math.pow(1 - t, 2.2);
    }
  }
  return buf;
}
function applyReverb() {
  if (!audioCtx || !revConv) return;
  const r = audState().rev;
  const m = r.on ? r.mix / 100 : 0;
  if (m > 0 && !revConnected) {
    revIn.connect(revConv);
    revConnected = true;
  } else if (m === 0 && revConnected) {
    try { revIn.disconnect(revConv); } catch (_) {}
    revConnected = false;
  }
  audParam(revDry.gain, 1 - 0.5 * m, 0.03);
  audParam(revWet.gain, 0.9 * m, 0.03);
  if (m > 0 && Math.abs(r.size - revSizeApplied) > 0.01) {
    clearTimeout(revTimer);
    revTimer = setTimeout(
      () => {
        if (!audioCtx) return;
        revSizeApplied = audState().rev.size;
        revConv.buffer = makeImpulse(revSizeApplied);
      },
      revSizeApplied ? 140 : 0
    );
  }
}
async function applyOutputDevice(silent) {
  if (!audioCtx || typeof audioCtx.setSinkId !== "function") return;
  const id = audState().dev || "";
  try {
    await audioCtx.setSinkId(id);
  } catch (_) {
    if (id) {
      audState().dev = "";
      syncAudUi();
      scheduleSave();
      if (!silent) showToast("Output device unavailable, using the default", { type: "error" });
      try { await audioCtx.setSinkId(""); } catch (__) {}
    }
  }
}
async function refreshDevices() {
  const sel = audById("aDevice");
  const row = audById("aDevRow");
  if (!sel || !row) return;
  const supported = typeof AudioContext !== "undefined" && typeof AudioContext.prototype.setSinkId === "function" && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices;
  row.classList.toggle("hidden", !supported);
  if (!supported) return;
  let list = [];
  try {
    list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications");
  } catch (_) {}
  let n = 0;
  sel.innerHTML = '<option value="">System default</option>' + list.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || "Output device " + ++n)}</option>`).join("");
  const want = audState().dev || "";
  sel.value = want;
  if (sel.value !== want) sel.value = "";
}

// ---- equalizer + advanced UI ----
function fmtDb(v) {
  return (v > 0 ? "+" : "") + (Math.round(v * 10) / 10) + " dB";
}
function fmtDbShort(v) {
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? "+" : "") + r;
}
function paintFader(fader, v) {
  const p = ((Math.max(-12, Math.min(12, v)) + 12) / 24) * 100;
  fader.style.setProperty("--lo", String(Math.min(p, 50)));
  fader.style.setProperty("--hi", String(Math.max(p, 50)));
  fader.classList.toggle("neg", v < 0);
}
function paintBand(i) {
  const strip = eqBandsEl.children[i];
  if (!strip) return;
  const v = eqState().gains[i];
  const inp = strip.querySelector("input");
  if (parseFloat(inp.value) !== v) inp.value = v;
  strip.querySelector(".eqx-db").textContent = fmtDbShort(v);
  strip.classList.toggle("live", v !== 0);
  paintFader(strip.querySelector(".eqx-fader"), v);
}
function paintPreamp() {
  const v = eqState().preamp;
  if (parseFloat(eqPreamp.value) !== v) eqPreamp.value = v;
  eqPreampValue.textContent = fmtDb(v);
  eqPreampValue.parentElement.classList.toggle("live", v !== 0);
  paintFader(audById("eqPreampFader"), v);
}
function setBandGain(i, g) {
  const s = eqState();
  g = Math.max(-12, Math.min(12, g));
  if (s.gains[i] === g) return;
  s.gains[i] = g;
  markEqCustom();
  resumeAudio();
  applyEqState();
  paintBand(i);
  scheduleSave();
}
function buildEqUi() {
  if (!eqBandsEl) return;
  eqBandsEl.innerHTML = "";
  EQ_FREQS.forEach((f, i) => {
    const band = document.createElement("div");
    band.className = "eqx-strip";
    band.innerHTML = `<span class="eqx-db mono">0</span><div class="eqx-fader"><span class="eqx-rail"></span><span class="eqx-fill"></span><input type="range" min="-12" max="12" step="0.5" value="0" data-i="${i}" aria-label="${EQ_LABELS[i]} Hz" /></div><span class="eqx-hz">${EQ_LABELS[i]}</span>`;
    const inp = band.querySelector("input");
    inp.addEventListener("input", () => setBandGain(i, parseFloat(inp.value)));
    inp.addEventListener("dblclick", () => setBandGain(i, 0));
    eqBandsEl.appendChild(band);
  });
  refreshPresetSelect();
  syncEqUi();
}
function refreshPresetSelect() {
  const s = eqState();
  let html = `<optgroup label="Built-in">${Object.keys(EQ_BUILTIN).map((n) => `<option value="b:${n}" data-icon="${EQ_ICONS[n] || "sliders"}">${n}</option>`).join("")}</optgroup>`;
  const customs = Object.keys(settings.customEq);
  if (customs.length) html += `<optgroup label="Custom">${customs.map((n) => `<option value="c:${esc(n)}" data-icon="bookmark">${esc(n)}</option>`).join("")}</optgroup>`;
  html += `<option value="custom" data-icon="sliders" hidden>Custom</option>`;
  eqPresetSelect.innerHTML = html;
  eqPresetSelect.value = s.preset || "b:Flat";
  if (eqPresetSelect.value !== s.preset) eqPresetSelect.value = "custom";
}
function syncNightUi() {
  if (!nightModeToggle) return;
  nightModeToggle.checked = !!settings.nightMode;
  nightCard.classList.toggle("open", !!settings.nightMode);
  nightStrength.value = settings.nightStrength != null ? settings.nightStrength : 60;
  nightStrength.style.setProperty("--p", nightStrength.value + "%");
  nightStrengthValue.textContent = nightStrength.value + "%";
}
function syncEqUi() {
  const s = eqState();
  if (!eqBandsEl) return;
  eqEnabled.checked = !!s.enabled;
  eqCard.classList.toggle("off", !s.enabled);
  for (let i = 0; i < EQ_FREQS.length; i++) paintBand(i);
  paintPreamp();
  eqPresetSelect.value = s.preset || "custom";
  if (eqPresetSelect.value !== (s.preset || "custom")) eqPresetSelect.value = "custom";
  eqDeleteBtn.disabled = !(s.preset || "").startsWith("c:");
  syncNightUi();
}
function markEqCustom() {
  const s = eqState();
  s.preset = "custom";
  eqPresetSelect.value = "custom";
  eqDeleteBtn.disabled = true;
}
if (eqBandsEl) {
  buildEqUi();
  eqEnabled.addEventListener("change", () => {
    eqState().enabled = eqEnabled.checked;
    eqCard.classList.toggle("off", !eqEnabled.checked);
    resumeAudio();
    applyEqState();
    scheduleSave();
  });
  eqPreamp.addEventListener("input", () => {
    eqState().preamp = parseFloat(eqPreamp.value);
    paintPreamp();
    resumeAudio();
    applyEqState();
    scheduleSave();
  });
  eqPreamp.addEventListener("dblclick", () => {
    eqState().preamp = 0;
    paintPreamp();
    applyEqState();
    scheduleSave();
  });
  eqPresetSelect.addEventListener("change", () => {
    const v = eqPresetSelect.value;
    const s = eqState();
    let g = null;
    if (v.startsWith("b:")) g = EQ_BUILTIN[v.slice(2)];
    else if (v.startsWith("c:")) g = settings.customEq[v.slice(2)];
    if (!g) return;
    s.gains = g.slice();
    s.preset = v;
    if (!s.enabled) s.enabled = true;
    syncEqUi();
    resumeAudio();
    applyEqState();
    scheduleSave();
  });
  eqResetBtn.addEventListener("click", () => {
    const s = eqState();
    s.gains = EQ_BUILTIN.Flat.slice();
    s.preamp = 0;
    s.preset = "b:Flat";
    syncEqUi();
    applyEqState();
    scheduleSave();
  });
  let nameInput = null;
  eqSaveBtn.addEventListener("click", () => {
    if (!nameInput) {
      nameInput = document.createElement("input");
      nameInput.className = "ctrl";
      nameInput.placeholder = "Preset name";
      nameInput.style.width = "140px";
      eqSaveBtn.parentElement.insertBefore(nameInput, eqSaveBtn);
      eqSaveBtn.textContent = "Save";
      nameInput.focus();
      nameInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") eqSaveBtn.click();
        if (e.key === "Escape") finish();
      });
      return;
    }
    const name = nameInput.value.trim();
    if (name) {
      settings.customEq[name] = eqState().gains.slice();
      eqState().preset = "c:" + name;
      refreshPresetSelect();
      syncEqUi();
      scheduleSave();
      showToast('Saved preset "' + name + '"');
    }
    finish();
  });
  function finish() {
    if (nameInput) nameInput.remove();
    nameInput = null;
    eqSaveBtn.textContent = "Save as…";
  }
  eqDeleteBtn.addEventListener("click", () => {
    const p = eqState().preset || "";
    if (!p.startsWith("c:")) return;
    delete settings.customEq[p.slice(2)];
    eqState().preset = "custom";
    refreshPresetSelect();
    syncEqUi();
    scheduleSave();
  });
  nightModeToggle.addEventListener("change", () => {
    settings.nightMode = nightModeToggle.checked;
    nightCard.classList.toggle("open", nightModeToggle.checked);
    resumeAudio();
    applyNightMode();
    scheduleSave();
  });
  nightStrength.addEventListener("input", () => {
    settings.nightStrength = parseInt(nightStrength.value, 10);
    nightStrength.style.setProperty("--p", nightStrength.value + "%");
    nightStrengthValue.textContent = nightStrength.value + "%";
    applyNightMode();
    scheduleSave();
  });
}

// ---- advanced options UI ----
const AUD_SLIDERS = {
  aWidth: ["width", (v) => v + "%"],
  aBal: ["bal", (v) => (v === 0 ? "Centre" : (v < 0 ? "L " + -v : "R " + v) + "%")],
  aXf: ["xf", (v) => (v ? v + "%" : "Off")],
  aRevSize: ["rev.size", (v) => v.toFixed(1) + " s"],
  aRevMix: ["rev.mix", (v) => v + "%"],
  aCompThr: ["comp.thr", (v) => v + " dB"],
  aCompRatio: ["comp.ratio", (v) => v + " : 1"],
  aCompAtk: ["comp.atk", (v) => v + " ms"],
  aCompRel: ["comp.rel", (v) => v + " ms"],
  aCompGain: ["comp.gain", (v) => "+" + v + " dB"],
  aHp: ["hp", (v) => (v <= 20 ? "Off" : v + " Hz")],
  aLp: ["lp", (v) => (v >= 20000 ? "Off" : (v / 1000).toFixed(1) + " kHz")],
  aDelay: ["delay", (v) => v + " ms"],
  aCeil: ["ceil", (v) => v + " dB"],
};
const AUD_TOGGLES = { aRevOn: "rev.on", aCompOn: "comp.on", aPitch: "pitch", aLimOn: "lim" };
function audGet(a, path) {
  return path.split(".").reduce((o, k) => o[k], a);
}
function audSet(a, path, v) {
  const ks = path.split(".");
  const last = ks.pop();
  ks.reduce((o, k) => o[k], a)[last] = v;
}
function paintRng(el) {
  const mn = parseFloat(el.min), mx = parseFloat(el.max);
  el.style.setProperty("--p", ((parseFloat(el.value) - mn) / (mx - mn)) * 100 + "%");
}
function syncAudUi() {
  if (!audById("audAdv")) return;
  const a = audState();
  for (const id in AUD_SLIDERS) {
    const el = audById(id);
    if (!el) continue;
    el.value = audGet(a, AUD_SLIDERS[id][0]);
    paintRng(el);
    audById(id + "V").textContent = AUD_SLIDERS[id][1](parseFloat(el.value));
  }
  for (const id in AUD_TOGGLES) audById(id).checked = !!audGet(a, AUD_TOGGLES[id]);
  document.querySelectorAll("#aMode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === a.mode));
  audById("aWidthRow").classList.toggle("is-off", a.mode !== "stereo");
  const dep = { rev: a.rev.on, comp: a.comp.on, lim: a.lim };
  document.querySelectorAll("#audAdv [data-dep]").forEach((r) => r.classList.toggle("is-off", !dep[r.dataset.dep]));
  audById("audAdv").classList.toggle("open", !!a.open);
  audById("audAdvToggle").setAttribute("aria-expanded", a.open ? "true" : "false");
  const devSel = audById("aDevice");
  if (devSel && [...devSel.options].some((o) => o.value === (a.dev || ""))) devSel.value = a.dev || "";
  applyPitch();
}
function audChanged() {
  resumeAudio();
  applyAud();
  scheduleSave();
}
if (audById("audAdv")) {
  for (const id in AUD_SLIDERS) {
    const el = audById(id);
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      audSet(audState(), AUD_SLIDERS[id][0], v);
      audById(id + "V").textContent = AUD_SLIDERS[id][1](v);
      paintRng(el);
      audChanged();
    });
  }
  audById("aBal").addEventListener("dblclick", () => {
    audState().bal = 0;
    syncAudUi();
    audChanged();
  });
  for (const id in AUD_TOGGLES) {
    audById(id).addEventListener("change", () => {
      audSet(audState(), AUD_TOGGLES[id], audById(id).checked);
      syncAudUi();
      audChanged();
    });
  }
  document.querySelectorAll("#aMode button").forEach((b) =>
    b.addEventListener("click", () => {
      audState().mode = b.dataset.mode;
      syncAudUi();
      audChanged();
    })
  );
  audById("aDevice").addEventListener("change", () => {
    audState().dev = audById("aDevice").value;
    resumeAudio();
    applyOutputDevice(false);
    scheduleSave();
  });
  audById("audAdvToggle").addEventListener("click", () => {
    const a = audState();
    a.open = !a.open;
    syncAudUi();
    if (a.open) refreshDevices();
    scheduleSave();
  });
  audById("aReset").addEventListener("click", () => {
    const open = audState().open;
    settings.aud = JSON.parse(JSON.stringify(AUD_DEFAULTS));
    settings.aud.open = open;
    refreshDevices();
    syncAudUi();
    audChanged();
    applyOutputDevice(true);
    showToast("Advanced audio options reset");
  });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
  refreshDevices();
  syncAudUi();
}
function resumeAudio() {
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

// ---- live graph: response curve, spectrum, draggable nodes, level meters ----
const EQ_DB = 14;
const EQ_TOP = 14;
const EQ_BOT = 24;
const EQ_N = 200;
const EQ_FONT = '600 10px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
let eqAnimOn = false,
  eqW = 0,
  eqH = 0,
  eqMW = 0,
  eqMH = 0,
  eqDpr = 1,
  eqDrag = null,
  eqHover = -1,
  eqTipKey = "",
  eqBins = null;
const eqPeaks = new Float32Array(72);
const eqFreqs = new Float32Array(EQ_N).map((_, i) => 20 * Math.pow(1000, i / (EQ_N - 1)));
const eqTot = new Float32Array(EQ_N),
  eqMag = new Float32Array(EQ_N),
  eqPh = new Float32Array(EQ_N),
  eqTD = new Float32Array(1024);
const eqLv = [-90, -90],
  eqPk = [-90, -90],
  eqPkT = [0, 0];
const eqPix = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.getContext("2d", { willReadFrequently: true });
})();
const eqPal = { key: "", c: null };
function eqParse(css) {
  eqPix.clearRect(0, 0, 1, 1);
  eqPix.fillStyle = "#000";
  eqPix.fillStyle = css;
  eqPix.fillRect(0, 0, 1, 1);
  const d = eqPix.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
function eqPalette() {
  const cs = getComputedStyle(document.documentElement);
  const parts = ["--accent", "--text-1", "--text-3"].map((v) => cs.getPropertyValue(v).trim());
  const key = parts.join("|");
  if (eqPal.key !== key) {
    eqPal.key = key;
    eqPal.c = { a: eqParse(parts[0] || "#76b900"), t: eqParse(parts[1] || "#ffffff"), m: eqParse(parts[2] || "#888888") };
  }
  return eqPal.c;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const eqX = (f) => (Math.log(f / 20) / Math.log(1000)) * eqW;
const eqY = (db) => {
  const gh = eqH - EQ_TOP - EQ_BOT;
  return EQ_TOP + gh / 2 - (db / EQ_DB) * (gh / 2);
};
function sizeEqCanvas() {
  if (!eqCanvas || !eqGraph) return;
  const r = eqGraph.getBoundingClientRect();
  if (r.width < 10) return;
  eqDpr = Math.min(2, window.devicePixelRatio || 1);
  eqW = r.width;
  eqH = r.height;
  eqCanvas.width = Math.round(eqW * eqDpr);
  eqCanvas.height = Math.round(eqH * eqDpr);
  if (eqMeter) {
    eqMW = 40;
    eqMH = 168;
    eqMeter.width = Math.round(eqMW * eqDpr);
    eqMeter.height = Math.round(eqMH * eqDpr);
  }
}
function drawEqGraph() {
  const ctx = eqCanvas.getContext("2d");
  const W = eqW,
    H = eqH;
  ctx.setTransform(eqDpr, 0, 0, eqDpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const P = eqPalette(),
    s = eqState(),
    on = !!s.enabled;
  const gh = H - EQ_TOP - EQ_BOT;

  // grid
  ctx.font = EQ_FONT;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  [-12, -6, 0, 6, 12].forEach((d) => {
    const y = Math.round(eqY(d)) + 0.5;
    ctx.strokeStyle = rgba(P.t, d === 0 ? 0.2 : 0.07);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = rgba(P.m, 0.85);
    ctx.textAlign = "left";
    ctx.fillText((d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d), 8, y - 8);
  });
  ctx.textAlign = "center";
  EQ_FREQS.forEach((f, i) => {
    const x = Math.round(eqX(f)) + 0.5;
    ctx.strokeStyle = rgba(P.t, 0.045);
    ctx.beginPath();
    ctx.moveTo(x, EQ_TOP);
    ctx.lineTo(x, EQ_TOP + gh);
    ctx.stroke();
    ctx.fillStyle = rgba(P.m, 0.9);
    ctx.fillText(EQ_LABELS[i], x, H - 10);
  });

  // spectrum bars with peak caps
  if (analyserNode && audioCtx) {
    const N = analyserNode.frequencyBinCount;
    if (!eqBins || eqBins.length !== N) eqBins = new Uint8Array(N);
    analyserNode.getByteFrequencyData(eqBins);
    const nyq = audioCtx.sampleRate / 2,
      nb = eqPeaks.length,
      bw = W / nb,
      base = EQ_TOP + gh;
    const sg = ctx.createLinearGradient(0, base, 0, EQ_TOP);
    sg.addColorStop(0, rgba(P.a, 0.03));
    sg.addColorStop(1, rgba(P.a, on ? 0.5 : 0.22));
    for (let b = 0; b < nb; b++) {
      const f0 = 20 * Math.pow(1000, b / nb),
        f1 = 20 * Math.pow(1000, (b + 1) / nb);
      const i0 = Math.max(1, Math.floor((f0 / nyq) * N)),
        i1 = Math.max(i0 + 1, Math.ceil((f1 / nyq) * N));
      let m = 0;
      for (let i = i0; i < i1 && i < N; i++) if (eqBins[i] > m) m = eqBins[i];
      const v = Math.pow(m / 255, 1.25);
      const h = v * (gh + 4);
      ctx.fillStyle = sg;
      ctx.fillRect(b * bw + 1, base - h, Math.max(1, bw - 2), h);
      eqPeaks[b] = Math.max(v, eqPeaks[b] - 0.013);
      if (eqPeaks[b] > 0.02) {
        ctx.fillStyle = rgba(P.a, on ? 0.85 : 0.35);
        ctx.fillRect(b * bw + 1, base - eqPeaks[b] * (gh + 4) - 2, Math.max(1, bw - 2), 2);
      }
    }
  }

  // combined response curve
  eqTot.fill(1);
  if (eqNodes.length) {
    [hpNode, lpNode, ...eqNodes].forEach((n) => {
      n.getFrequencyResponse(eqFreqs, eqMag, eqPh);
      for (let i = 0; i < EQ_N; i++) eqTot[i] *= eqMag[i];
    });
  }
  const pre = on ? s.preamp : 0;
  const y0 = eqY(0);
  const pts = new Array(EQ_N);
  for (let i = 0; i < EQ_N; i++) {
    const db = Math.max(-EQ_DB, Math.min(EQ_DB, 20 * Math.log10(eqTot[i] || 1) + pre));
    pts[i] = [eqX(eqFreqs[i]), eqY(db)];
  }
  const fg = ctx.createLinearGradient(0, eqY(EQ_DB), 0, eqY(-EQ_DB));
  fg.addColorStop(0, rgba(P.a, on ? 0.34 : 0.1));
  fg.addColorStop(0.5, rgba(P.a, 0.03));
  fg.addColorStop(1, rgba(P.a, on ? 0.24 : 0.07));
  ctx.beginPath();
  ctx.moveTo(pts[0][0], y0);
  pts.forEach((p) => ctx.lineTo(p[0], p[1]));
  ctx.lineTo(pts[EQ_N - 1][0], y0);
  ctx.closePath();
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rgba(P.a, on ? 1 : 0.45);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  ctx.restore();

  // band nodes
  let tipI = -1;
  for (let i = 0; i < EQ_FREQS.length; i++) {
    const x = eqX(EQ_FREQS[i]),
      y = eqY(s.gains[i]);
    const hot = eqDrag ? eqDrag.i === i : eqHover === i;
    if (hot) tipI = i;
    ctx.strokeStyle = rgba(P.a, on ? 0.3 : 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (hot) {
      ctx.fillStyle = rgba(P.a, on ? 0.22 : 0.1);
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, 6.2832);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, hot ? 7.5 : 5.5, 0, 6.2832);
    ctx.fillStyle = on ? rgba(P.a, 1) : rgba(P.m, 0.9);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(P.t, 0.9);
    ctx.stroke();
  }
  if (tipI >= 0) {
    const x = eqX(EQ_FREQS[tipI]),
      y = eqY(s.gains[tipI]);
    const key = tipI + "|" + s.gains[tipI] + "|" + (x | 0) + "|" + (y | 0);
    if (key !== eqTipKey) {
      eqTipKey = key;
      eqTip.textContent = (EQ_FREQS[tipI] >= 1000 ? EQ_FREQS[tipI] / 1000 + " kHz" : EQ_FREQS[tipI] + " Hz") + "  " + fmtDb(s.gains[tipI]);
      eqTip.style.left = Math.max(54, Math.min(W - 54, x)) + "px";
      eqTip.style.top = y + "px";
    }
    eqTip.classList.add("show");
  } else {
    eqTip.classList.remove("show");
    eqTipKey = "";
  }
}
function drawEqMeter() {
  if (!eqMeter || !eqMW) return;
  const ctx = eqMeter.getContext("2d");
  ctx.setTransform(eqDpr, 0, 0, eqDpr, 0, 0);
  ctx.clearRect(0, 0, eqMW, eqMH);
  const P = eqPalette();
  const segs = 30,
    segH = eqMH / segs,
    bw = 15,
    gap = 6,
    x0 = (eqMW - (bw * 2 + gap)) / 2,
    now = performance.now();
  [meterL, meterR].forEach((an, ch) => {
    let pk = 0;
    if (an) {
      an.getFloatTimeDomainData(eqTD);
      for (let i = 0; i < eqTD.length; i++) {
        const v = Math.abs(eqTD[i]);
        if (v > pk) pk = v;
      }
    }
    const db = pk > 0.00003 ? 20 * Math.log10(pk) : -90;
    eqLv[ch] = Math.max(db, eqLv[ch] - 1.4);
    if (db >= eqPk[ch]) {
      eqPk[ch] = db;
      eqPkT[ch] = now;
    } else if (now - eqPkT[ch] > 900) eqPk[ch] = Math.max(-90, eqPk[ch] - 1.2);
    const peakSeg = Math.min(segs - 1, Math.max(-1, Math.floor(((eqPk[ch] + 60) / 60) * segs)));
    const x = x0 + ch * (bw + gap);
    for (let k = 0; k < segs; k++) {
      const kdb = -60 + (60 * (k + 1)) / segs;
      const lit = eqLv[ch] >= kdb - 1;
      const col = kdb > -3 ? [255, 90, 80] : kdb > -12 ? [245, 165, 36] : P.a;
      ctx.fillStyle = lit ? rgba(col, 0.95) : k === peakSeg ? rgba(col, 0.8) : rgba(P.t, 0.07);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, eqMH - (k + 1) * segH + 1, bw, segH - 2.4, 2) : ctx.rect(x, eqMH - (k + 1) * segH + 1, bw, segH - 2.4);
      ctx.fill();
    }
  });
}
function eqPanelVisible() {
  const p = document.querySelector('.settings-panel[data-panel="audio"]');
  return !!(p && !p.classList.contains("hidden") && p.offsetParent && !document.hidden);
}
function drawEq() {
  if (!eqAnimOn) return;
  if (!eqPanelVisible()) {
    eqAnimOn = false;
    eqTip.classList.remove("show");
    return;
  }
  if (eqW < 10) sizeEqCanvas();
  if (eqW >= 10) {
    drawEqGraph();
    drawEqMeter();
  }
  requestAnimationFrame(drawEq);
}
function startEqAnim() {
  if (!eqCanvas || !eqPanelVisible()) return;
  resumeAudio();
  sizeEqCanvas();
  if (eqAnimOn) return;
  eqAnimOn = true;
  requestAnimationFrame(drawEq);
}

// direct manipulation: press or drag anywhere on the graph to shape the nearest band
function eqPos(e) {
  const r = eqCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function eqNearest(x) {
  let b = 0,
    bd = 1e9;
  EQ_FREQS.forEach((f, i) => {
    const d = Math.abs(x - eqX(f));
    if (d < bd) {
      bd = d;
      b = i;
    }
  });
  return b;
}
function eqNodeAt(x, y) {
  const g = eqState().gains;
  let best = -1,
    bd = 20 * 20;
  EQ_FREQS.forEach((f, i) => {
    const dx = x - eqX(f),
      dy = y - eqY(g[i]);
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
function eqSetFromY(i, y) {
  const gh = eqH - EQ_TOP - EQ_BOT;
  const db = (EQ_TOP + gh / 2 - y) / (gh / 2) * EQ_DB;
  setBandGain(i, Math.round(db * 2) / 2);
}
if (eqCanvas) {
  eqCanvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = eqPos(e);
    const hit = eqNodeAt(p.x, p.y);
    eqDrag = { i: hit >= 0 ? hit : eqNearest(p.x) };
    eqGraph.classList.add("drag");
    try { eqCanvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (!eqState().enabled) {
      eqState().enabled = true;
      eqEnabled.checked = true;
      eqCard.classList.remove("off");
      scheduleSave();
    }
    eqSetFromY(eqDrag.i, p.y);
    e.preventDefault();
  });
  eqCanvas.addEventListener("pointermove", (e) => {
    const p = eqPos(e);
    if (eqDrag) {
      eqSetFromY(eqDrag.i, p.y);
      return;
    }
    eqHover = eqNodeAt(p.x, p.y);
    eqGraph.classList.toggle("hover", eqHover >= 0);
  });
  const endDrag = (e) => {
    if (!eqDrag) return;
    eqDrag = null;
    eqGraph.classList.remove("drag");
    try { eqCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    applyEqState();
    scheduleSave();
  };
  eqCanvas.addEventListener("pointerup", endDrag);
  eqCanvas.addEventListener("pointercancel", endDrag);
  eqCanvas.addEventListener("pointerleave", () => {
    if (!eqDrag) {
      eqHover = -1;
      eqGraph.classList.remove("hover");
    }
  });
  eqCanvas.addEventListener("dblclick", (e) => {
    const p = eqPos(e);
    const i = eqNodeAt(p.x, p.y);
    if (i >= 0) setBandGain(i, 0);
  });
  if (window.ResizeObserver) new ResizeObserver(() => sizeEqCanvas()).observe(eqGraph);
  const audioPanel = document.querySelector('.settings-panel[data-panel="audio"]');
  if (audioPanel) new MutationObserver(() => setTimeout(startEqAnim, 0)).observe(audioPanel, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) startEqAnim();
  });
}
document.querySelectorAll("#nav .nav-item").forEach((b) => b.addEventListener("click", () => setTimeout(startEqAnim, 60)));

// ---------- Windows taskbar media controls ----------
(function setupTaskbarControls() {
  const api = window.electronAPI;
  if (!api || !api.setThumbarIcons) return;
  function icon(draw) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    draw(x);
    return c.toDataURL("image/png");
  }
  const tri = (x, cx, cy, s, dir) => {
    x.beginPath();
    x.moveTo(cx + dir * s, cy);
    x.lineTo(cx - dir * s, cy - s * 1.1);
    x.lineTo(cx - dir * s, cy + s * 1.1);
    x.closePath();
    x.fill();
  };
  api.setThumbarIcons({
    play: icon((x) => tri(x, 16, 16, 8, 1)),
    pause: icon((x) => {
      x.fillRect(8, 6, 6, 20);
      x.fillRect(18, 6, 6, 20);
    }),
    prev: icon((x) => {
      x.fillRect(6, 6, 4, 20);
      tri(x, 19, 16, 9, -1);
    }),
    next: icon((x) => {
      x.fillRect(22, 6, 4, 20);
      tri(x, 13, 16, 9, 1);
    }),
    back: icon((x) => {
      tri(x, 10, 16, 7, -1);
      tri(x, 22, 16, 7, -1);
    }),
    fwd: icon((x) => {
      tri(x, 10, 16, 7, 1);
      tri(x, 22, 16, 7, 1);
    }),
  });
  let lastKey = "";
  function pushState() {
    const st = {
      hasMedia: currentIndex >= 0 && !!playlist[currentIndex] && !!video.src,
      playing: !video.paused && !video.ended,
      hasPrev: currentIndex > 0,
      hasNext: currentIndex >= 0 && currentIndex < playlist.length - 1,
    };
    const key = JSON.stringify(st);
    if (key !== lastKey) {
      lastKey = key;
      api.setThumbarState(st);
    }
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = video.paused ? "paused" : "playing";
  }
  let lastProg = 0;
  function pushProgress(force) {
    const now = Date.now();
    if (!force && now - lastProg < 800) return;
    lastProg = now;
    if (!video.duration || !isFinite(video.duration) || !video.src) return api.setTaskbarProgress(-1);
    api.setTaskbarProgress(video.currentTime / video.duration, video.paused ? "paused" : "normal");
    if ("mediaSession" in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({ duration: video.duration, position: video.currentTime, playbackRate: video.playbackRate || 1 });
      } catch (_) {}
    }
  }
  ["play", "pause", "ended", "loadedmetadata", "emptied"].forEach((ev) =>
    video.addEventListener(ev, () => {
      pushState();
      pushProgress(true);
    })
  );
  video.addEventListener("timeupdate", () => pushProgress(false));
  setInterval(pushState, 1500);
  pushState();
  api.onMediaCommand((cmd) => {
    if (cmd === "toggle") video.paused ? video.play().catch(() => {}) : video.pause();
    else if (cmd === "back") video.currentTime = Math.max(0, video.currentTime - 10);
    else if (cmd === "fwd") video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
    else if (cmd === "prev" && currentIndex > 0) playIndex(currentIndex - 1);
    else if (cmd === "next" && currentIndex < playlist.length - 1) playIndex(currentIndex + 1);
  });
})();

document.getElementById("rememberSubtitle").addEventListener("change", (e) => {
  settings.rememberSubtitle = e.target.checked;
  scheduleSave();
});

// ---------- In-app confirm dialog (replaces window.confirm everywhere) ----------
const confirmOverlay = document.getElementById("confirmOverlay");
function askConfirm({ title, message, okText }) {
  return new Promise((resolve) => {
    document.getElementById("confirmTitle").textContent = title || "Are you sure?";
    document.getElementById("confirmMsg").textContent = message || "";
    const ok = document.getElementById("confirmOk");
    const cancel = document.getElementById("confirmCancel");
    ok.textContent = okText || "Remove";
    confirmOverlay.classList.remove("hidden");
    cancel.focus();
    const done = (v) => {
      confirmOverlay.classList.add("hidden");
      ok.onclick = cancel.onclick = confirmOverlay.onclick = null;
      window.removeEventListener("keydown", onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      } else if (e.key === "Enter" && document.activeElement === ok) done(true);
    };
    window.addEventListener("keydown", onKey, true);
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    confirmOverlay.onclick = (e) => e.target === confirmOverlay && done(false);
  });
}

// ---------- Volume boost settings ----------
const boostToggle = document.getElementById("boostToggle");
const boostCard = document.getElementById("boostCard");
const boostOverlay = document.getElementById("boostOverlay");
function syncBoostUi() {
  boostToggle.checked = !!settings.boostEnabled;
  boostCard.classList.toggle("on", !!settings.boostEnabled);
  document.querySelectorAll("#boostMaxSeg button").forEach((b) => b.classList.toggle("active", parseInt(b.dataset.max, 10) === (settings.boostMax || 200)));
  updateVolumeUI();
}
boostToggle.addEventListener("change", () => {
  if (boostToggle.checked) {
    boostToggle.checked = false;
    boostOverlay.classList.remove("hidden");
    document.getElementById("boostCancel").focus();
  } else {
    settings.boostEnabled = false;
    if (boostLevel > 1) setLevel(100, true);
    syncBoostUi();
    scheduleSave();
    osd("Volume boost off");
  }
});
document.getElementById("boostCancel").addEventListener("click", () => boostOverlay.classList.add("hidden"));
boostOverlay.addEventListener("click", (e) => {
  if (e.target === boostOverlay) boostOverlay.classList.add("hidden");
});
document.getElementById("boostConfirm").addEventListener("click", () => {
  boostOverlay.classList.add("hidden");
  resumeAudio();
  if (!audioCtx) return showToast("Audio engine unavailable, boost can't be enabled", { type: "error" });
  settings.boostEnabled = true;
  syncBoostUi();
  scheduleSave();
  osd("Volume boost on, up to " + (settings.boostMax || 200) + "%");
});
document.querySelectorAll("#boostMaxSeg button").forEach((b) =>
  b.addEventListener("click", () => {
    settings.boostMax = parseInt(b.dataset.max, 10);
    if (currentLevelPct() > settings.boostMax) setLevel(settings.boostMax, true);
    syncBoostUi();
    scheduleSave();
  })
);
syncBoostUi();

// ---------- Windows integration (Settings > System) + files opened from Explorer ----------
const SYS_ITEMS = [
  ["sysOpenWith", "openWith", "Added to “Open with”", "Removed from “Open with”"],
  ["sysFileMenu", "fileMenu", "Right-click menu added for videos", "Right-click menu removed for videos"],
  ["sysFolderMenu", "folderMenu", "Right-click menu added for folders", "Right-click menu removed for folders"],
];
async function refreshSys() {
  let st = null;
  try {
    st = await window.electronAPI.winIntegrationStatus();
  } catch (_) {}
  const ok = !!(st && st.supported);
  document.querySelectorAll("#sysCard .win-only").forEach((row) => row.classList.toggle("hidden", !ok)); // Windows only
  if (!ok) return;
  SYS_ITEMS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.disabled = false;
    el.checked = !!st[key];
  });
}
SYS_ITEMS.forEach(([id, key, onMsg, offMsg]) => {
  const el = document.getElementById(id);
  el.addEventListener("change", async () => {
    const want = el.checked;
    el.disabled = true;
    try {
      await window.electronAPI.winIntegrationSet(key, want);
      showToast(want ? onMsg : offMsg);
    } catch (_) {
      showToast("Could not update Windows settings", { type: "error" });
    }
    await refreshSys();
  });
});
document.getElementById("sysDefaultApps").addEventListener("click", () => window.electronAPI.winOpenDefaultApps());
refreshSys();

function firstVideoUrl(node) {
  if (!node) return null;
  if (node.type === "video") return node.url;
  for (const c of node.children || []) {
    const u = firstVideoUrl(c);
    if (u) return u;
  }
  return null;
}
function playOpened(url) {
  libAddItems([url]);
  queueAdd([url], { play: true });
  document.querySelector('.nav-item[data-page="nowPlaying"]').click();
}
if (window.electronAPI && window.electronAPI.onOpenTargets)
  window.electronAPI.onOpenTargets((items) => {
    let first = null;
    const files = [];
    items.forEach((it) => {
      if (it.type === "file") {
        if (!first) first = it.url;
        files.push(it.url);
      } else if (it.type === "folder" && it.tree) {
        const u = firstVideoUrl(it.tree);
        if (u && !first) first = u;
        if (u) importFolderTree(it.tree);
      }
    });
    if (files.length) libAddItems(files);
    if (first) setTimeout(() => playOpened(first), 60);
  });

// ---------- Touch gestures ----------
(function setupTouchGestures() {
  const stage = document.querySelector(".video-stage") || playerPanel;
  if (!stage) return;
  let touchStartX = 0,
    touchStartY = 0,
    touchStartTime = 0,
    touchStartVolume = 0,
    touchMode = null;
  stage.addEventListener(
    "touchstart",
    (e) => {
      if (zoomLevel > 1 || e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = video.currentTime;
      touchStartVolume = video.volume;
      touchMode = null;
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchmove",
    (e) => {
      if (zoomLevel > 1 || e.touches.length !== 1 || !video.duration) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (!touchMode && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        touchMode = Math.abs(dx) > Math.abs(dy) ? "seek" : "volume";
      }
      if (touchMode === "seek") {
        const deltaSec = (dx / stage.clientWidth) * video.duration * 0.6;
        video.currentTime = Math.min(video.duration, Math.max(0, touchStartTime + deltaSec));
      } else if (touchMode === "volume") {
        const deltaVol = -dy / stage.clientHeight;
        setLevel(Math.min(100, Math.max(0, (touchStartVolume + deltaVol) * 100)), true);
      }
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchend",
    () => {
      touchMode = null;
    },
    { passive: true }
  );
})();

// ---------- Library (full-screen view over its own item list; the playlist only holds what the user picks) ----------
const libEl = document.getElementById("lib");
const libTree = document.getElementById("libTree");
const libScroll = document.getElementById("libScroll");
const libContent = document.getElementById("libContent");
const libSentinel = document.getElementById("libSentinel");
const libEmpty = document.getElementById("libEmpty");
const libHead = document.getElementById("libHead");
const libSearch = document.getElementById("libSearch");
const libSearchClear = document.getElementById("libSearchClear");
const libSort = document.getElementById("libSort");
const libSize = document.getElementById("libSize");
const libSelectBtn = document.getElementById("libSelectBtn");
const libBulk = document.getElementById("libBulk");
const libBulkCount = document.getElementById("libBulkCount");
const libAddWrap = document.getElementById("libAddWrap");
const lib = { node: null, query: "", filter: "all", select: false, selected: new Set(), queue: [], rendered: 0, batch: 120, scopeKey: "", dirty: true };
const libBySrc = new Map();
const libTileBySrc = new Map();
let libRaf = 0;
const LIB_ICON = {
  play: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.8l7 4.2-7 4.2z" fill="currentColor"/></svg>',
  plus: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  rm: '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2L2 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  star: '<svg width="13" height="13" viewBox="0 0 15 15" fill="currentColor"><path d="M7.5 12.8l-4.2 2.3.8-4.7L1 7.2l4.7-.7L7.5 2l1.8 4.5 4.7.7-3.1 3.2.8 4.7z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  starO: '<svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 12.8l-4.2 2.3.8-4.7L1 7.2l4.7-.7L7.5 2l1.8 4.5 4.7.7-3.1 3.2.8 4.7z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.4 2.4 4.6-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M2.5 1l3.8 3.5L2.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1.5 3.5a1 1 0 011-1h3l1.3 1.5h4.7a1 1 0 011 1v5.5a1 1 0 01-1 1h-9a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
};
function libVisible() {
  return libReady && !pages.library.classList.contains("hidden");
}
function libInvalidate() {
  if (!libReady) return;
  lib.dirty = true;
  if (libVisible()) {
    cancelAnimationFrame(libRaf);
    libRaf = requestAnimationFrame(renderLibrary);
  }
}
function libName(src) {
  let n = (src.split("?")[0].split("/").pop() || "").replace(/\.[^.]+$/, "");
  try {
    n = decodeURIComponent(n);
  } catch (_) {}
  return n || src;
}
function libFolderPath(src) {
  return itemFolderChain(src)
    .map((id) => folders.get(id) && folders.get(id).name)
    .filter(Boolean)
    .join(" / ");
}
function libStats() {
  const counts = new Map(),
    first = new Map(),
    prev = new Map();
  libraryItems.forEach((s, i) => {
    itemFolderChain(s).forEach((f) => {
      counts.set(f, (counts.get(f) || 0) + 1);
      if (!first.has(f)) first.set(f, i);
      const p = prev.get(f) || [];
      if (p.length < 4) p.push(s);
      prev.set(f, p);
    });
  });
  return { counts, first, prev };
}
function libSubfolders(fid, st) {
  const out = [];
  folders.forEach((f, id) => {
    const isChild = fid == null ? f.parentId == null : f.parentId === fid;
    if (isChild && st.counts.get(id) > 0) out.push(id);
  });
  return out;
}
function libWatchPct(src, meta) {
  const w = videoTimeStorage.load(src);
  const d = (meta || playlistMeta.get(src) || {}).duration;
  return w && d ? Math.min(100, (w / d) * 100) : 0;
}
function libPass(src) {
  if (lib.query) {
    const q = lib.query.toLowerCase();
    if (!libName(src).toLowerCase().includes(q) && !libFolderPath(src).toLowerCase().includes(q)) return false;
  }
  if (lib.filter === "all") return true;
  if (lib.filter === "fav") return favorites.has(src);
  const w = videoTimeStorage.load(src);
  const d = (playlistMeta.get(src) || {}).duration;
  if (lib.filter === "progress") return w > 5 && (!d || w < d * 0.95);
  if (lib.filter === "new") return !(w > 5);
  return true;
}
function libSortItems(arr) {
  const mode = settings.libSort || "order";
  const cmpName = (a, b) => libName(a.src).localeCompare(libName(b.src), undefined, { numeric: true, sensitivity: "base" });
  if (mode === "name") arr.sort(cmpName);
  else if (mode === "nameDesc") arr.sort((a, b) => cmpName(b, a));
  else if (mode === "duration") arr.sort((a, b) => ((playlistMeta.get(b.src) || {}).duration || 0) - ((playlistMeta.get(a.src) || {}).duration || 0));
  else if (mode === "recent") {
    const rank = new Map(recentFiles.map((r, i) => [r.src, i]));
    arr.sort((a, b) => (rank.has(a.src) ? rank.get(a.src) : 1e9 + a.idx) - (rank.has(b.src) ? rank.get(b.src) : 1e9 + b.idx));
  } else arr.sort((a, b) => a.idx - b.idx);
  return arr;
}
function libInScope(src) {
  return lib.node == null || itemFolderChain(src).includes(lib.node);
}
function libScopeSrcs() {
  return libraryItems.filter(libInScope);
}

function renderLibTree(st) {
  libTree.innerHTML = '<div class="lib-tree-title">Library</div>';
  const mk = (id, name, count, depth) => {
    const f = id == null ? null : folders.get(id);
    const kids = id == null ? [] : libSubfolders(id, st);
    const node = document.createElement("div");
    node.className = "lib-node" + (lib.node === id ? " active" : "") + (f && f.expanded && kids.length ? " open" : "");
    node.innerHTML = `<span class="chev${kids.length ? "" : " none"}">${LIB_ICON.chev}</span><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="ct">${count}</span>`;
    node.onclick = () => libOpen(id);
    const chev = node.querySelector(".chev");
    chev.onclick = (ev) => {
      ev.stopPropagation();
      if (!f) return;
      f.expanded = !f.expanded;
      renderPlaylistInner();
      renderLibTree(libStats());
      scheduleSave();
    };
    libTree.appendChild(node);
    if (f && f.expanded && kids.length) {
      const wrap = document.createElement("div");
      wrap.className = "lib-children";
      libTree.appendChild(wrap);
      const save = libTree;
      kids.sort((a, b) => st.first.get(a) - st.first.get(b));
      kids.forEach((k) => {
        const n2 = mk2(k, depth + 1, wrap);
      });
    }
    return node;
  };
  // folder rows nest inside their parent's wrapper
  function mk2(id, depth, parentWrap) {
    const f = folders.get(id);
    const kids = libSubfolders(id, st);
    const node = document.createElement("div");
    node.className = "lib-node" + (lib.node === id ? " active" : "") + (f.expanded && kids.length ? " open" : "");
    node.innerHTML = `<span class="chev${kids.length ? "" : " none"}">${LIB_ICON.chev}</span><span class="nm" title="${esc(f.name)}">${esc(f.name)}</span><span class="ct">${st.counts.get(id)}</span>`;
    node.onclick = () => libOpen(id);
    node.querySelector(".chev").onclick = (ev) => {
      ev.stopPropagation();
      f.expanded = !f.expanded;
      renderPlaylistInner();
      renderLibTree(libStats());
      scheduleSave();
    };
    parentWrap.appendChild(node);
    if (f.expanded && kids.length) {
      const wrap = document.createElement("div");
      wrap.className = "lib-children";
      parentWrap.appendChild(wrap);
      kids.sort((a, b) => st.first.get(a) - st.first.get(b));
      kids.forEach((k) => mk2(k, depth + 1, wrap));
    }
  }
  const rootNode = mk(null, "All videos", libraryItems.length, 0);
  // top-level folders (children of the root) live right under "All videos"
  const roots = libSubfolders(null, st).sort((a, b) => st.first.get(a) - st.first.get(b));
  const wrap = document.createElement("div");
  wrap.className = "lib-children";
  libTree.appendChild(wrap);
  roots.forEach((id) => mk2(id, 1, wrap));
}

function libOpen(fid) {
  lib.animateNext = true;
  lib.node = fid == null ? null : fid;
  let f = fid != null ? folders.get(fid) : null;
  while (f && f.parentId != null) {
    const p = folders.get(f.parentId);
    if (p) p.expanded = true;
    f = p;
  }
  renderPlaylistInner();
  renderLibrary();
}
function openLibrary(fid, revealSrc) {
  document.querySelector('.nav-item[data-page="library"]').click();
  lib.query = "";
  libSearch.value = "";
  libSearchClear.classList.add("hidden");
  lib.filter = "all";
  libFilterButtons();
  libOpen(fid == null ? null : fid);
  if (revealSrc) libReveal(revealSrc);
}
function libReveal(src) {
  const i = lib.queue.findIndex((it) => it.src === src);
  if (i < 0) return;
  if (i >= lib.rendered) libRenderMore(i - lib.rendered + lib.batch);
  const el = libBySrc.get(src);
  if (el) el.scrollIntoView({ block: "center" });
}
function libFilterButtons() {
  document.querySelectorAll("#libFilters button").forEach((b) => b.classList.toggle("active", b.dataset.filter === lib.filter));
}

function libCard(it) {
  const { src, idx } = it;
  const meta = playlistMeta.get(src) || {};
  const name = libName(src);
  const fav = favorites.has(src);
  const pct = libWatchPct(src, meta);
  const el = document.createElement("div");
  el.className = "lib-card" + (src === playlist[currentIndex] ? " active" : "") + (lib.selected.has(src) ? " selected" : "");
  el.dataset.src = src;
  const sub = libFolderPath(src) || (/^https?:/i.test(src) ? "Stream" : "");
  el.innerHTML =
    `<div class="lib-thumb${meta.thumb ? "" : meta.failed ? " nothumb" : " skeleton"}"${meta.thumb ? ` style="background-image:url('${meta.thumb}')"` : ""}>` +
    `<span class="lib-check">${LIB_ICON.check}</span>` +
    `<button class="lib-play" title="Play">${LIB_ICON.play}</button>` +
    `<button class="lib-add" title="Add to playlist">${LIB_ICON.plus}</button>` +
    `<button class="lib-rm" title="Remove from library">${LIB_ICON.rm}</button>` +
    `<button class="lib-fav${fav ? " active" : ""}" title="Favorite">${fav ? LIB_ICON.star : LIB_ICON.starO}</button>` +
    `<span class="lib-playing"><i></i><i></i><i></i></span>` +
    `<span class="lib-dur">${meta.duration ? formatTime(meta.duration) : ""}</span>` +
    `<div class="lib-progress"${pct > 2 ? "" : ' style="display:none"'}><i style="width:${pct}%"></i></div></div>` +
    `<div class="lib-body"><div class="lib-title" title="${esc(name)}">${esc(name)}</div><div class="lib-sub">${esc(sub)}</div></div>` +
    `<div class="lib-actions"><button class="lib-fav${fav ? " active" : ""}" title="Favorite">${fav ? LIB_ICON.star : LIB_ICON.starO}</button><button class="lib-add" title="Add to playlist">${LIB_ICON.plus}</button><button class="lib-rm" title="Remove from library">${LIB_ICON.rm}</button></div>`;
  libBySrc.set(src, el);
  if (!playlistMeta.has(src)) thumbObserver.observe(el);
  return el;
}
function libFolderTile(id, st) {
  const f = folders.get(id);
  const srcs = st.prev.get(id) || [];
  const count = st.counts.get(id) || 0;
  const subs = libSubfolders(id, st).length;
  const el = document.createElement("div");
  el.className = "lib-card lib-folder";
  el.dataset.folder = id;
  el.dataset.srcs = JSON.stringify(srcs);
  el._srcs = srcs;
  let mosaic = "";
  for (let i = 0; i < 4; i++) {
    const m = srcs[i] && playlistMeta.get(srcs[i]);
    mosaic += `<div class="m${!srcs[i] || (m && m.thumb) ? "" : m && m.failed ? " nothumb" : " skeleton"}"${m && m.thumb ? ` style="background-image:url('${m.thumb}')"` : ""}></div>`;
  }
  el.innerHTML =
    `<div class="lib-thumb"><div class="lib-mosaic">${mosaic}</div><span class="lib-check">${LIB_ICON.check}</span><button class="lib-play" title="Play folder">${LIB_ICON.play}</button><button class="lib-add" title="Add folder to playlist">${LIB_ICON.plus}</button>` +
    `<span class="lib-folder-badge">${LIB_ICON.folder}${count}</span></div>` +
    `<div class="lib-body"><div class="lib-title" title="${esc(f.name)}">${esc(f.name)}</div><div class="lib-sub">${count} video${count === 1 ? "" : "s"}${subs ? " · " + subs + " folder" + (subs === 1 ? "" : "s") : ""}</div></div><div class="lib-actions"></div>`;
  srcs.forEach((s) => {
    if (!libTileBySrc.has(s)) libTileBySrc.set(s, new Set());
    libTileBySrc.get(s).add(el);
  });
  thumbObserver.observe(el);
  return el;
}
function updateLibMeta(src) {
  if (!libReady) return;
  const meta = playlistMeta.get(src);
  if (!meta) return;
  if (lib.heroEl && lib.heroSrc === src && meta.thumb) {
    lib.heroEl.classList.remove("nothumb");
    lib.heroEl.querySelector(".lib-hero-bg").style.backgroundImage = `url('${meta.thumb}')`;
  }
  const card = libBySrc.get(src);
  if (card) {
    const t = card.querySelector(".lib-thumb");
    t.classList.remove("skeleton");
    t.classList.toggle("nothumb", !meta.thumb);
    if (meta.thumb) t.style.backgroundImage = `url('${meta.thumb}')`;
    const d = card.querySelector(".lib-dur");
    if (meta.duration) d.textContent = formatTime(meta.duration);
    const pct = libWatchPct(src, meta);
    const bar = card.querySelector(".lib-progress");
    if (pct > 2) {
      bar.style.display = "";
      bar.firstChild.style.width = pct + "%";
    }
  }
  const tiles = libTileBySrc.get(src);
  if (tiles)
    tiles.forEach((tile) => {
      const i = tile._srcs.indexOf(src);
      const m = tile.querySelectorAll(".m")[i];
      if (!m) return;
      m.classList.remove("skeleton");
      m.classList.toggle("nothumb", !meta.thumb);
      if (meta.thumb) m.style.backgroundImage = `url('${meta.thumb}')`;
    });
}
function libRenderMore(n) {
  if (!lib.grid) return;
  const end = Math.min(lib.queue.length, lib.rendered + n);
  const frag = document.createDocumentFragment();
  for (let i = lib.rendered; i < end; i++) {
    const c = libCard(lib.queue[i]);
    c.style.setProperty("--i", Math.min(24, i - lib.rendered));
    frag.appendChild(c);
  }
  lib.grid.appendChild(frag);
  lib.rendered = end;
  libSentinelObs.unobserve(libSentinel);
  if (lib.rendered < lib.queue.length) libSentinelObs.observe(libSentinel);
}
const libSentinelObs = new IntersectionObserver(
  (es) => {
    if (es.some((e) => e.isIntersecting)) libRenderMore(lib.batch);
  },
  { root: libScroll, rootMargin: "700px" }
);

function renderLibrary() {
  if (!libReady) return;
  lib.dirty = false;
  const st = libStats();
  if (lib.node != null && !(st.counts.get(lib.node) > 0)) lib.node = null;
  renderLibTree(st);

  const flat = !!lib.query || lib.filter !== "all";
  const all = libraryItems.map((src, idx) => ({ src, idx }));
  let videos, subs = [];
  if (flat) videos = all.filter((it) => libInScope(it.src) && libPass(it.src));
  else {
    videos = all.filter((it) => (itemFolder.has(it.src) ? itemFolder.get(it.src) : null) === lib.node);
    subs = libSubfolders(lib.node, st);
    if ((settings.libSort || "order") === "name") subs.sort((a, b) => folders.get(a).name.localeCompare(folders.get(b).name, undefined, { numeric: true }));
    else if (settings.libSort === "nameDesc") subs.sort((a, b) => folders.get(b).name.localeCompare(folders.get(a).name, undefined, { numeric: true }));
    else subs.sort((a, b) => st.first.get(a) - st.first.get(b));
  }
  libSortItems(videos);

  // head
  const chain = [];
  for (let f = lib.node; f != null; f = folders.get(f) && folders.get(f).parentId) chain.unshift(f);
  let crumbs = chain.length || flat ? '<a data-n="">Library</a>' : "<b>Library</b>";
  chain.forEach((id, i) => {
    const nm = esc(folders.get(id).name);
    crumbs += `<span class="sep">›</span>` + (i === chain.length - 1 && !flat ? `<b>${nm}</b>` : `<a data-n="${id}">${nm}</a>`);
  });
  if (flat) crumbs += `<span class="sep">›</span><b>${lib.query ? "Search results" : { fav: "Favorites", progress: "In progress", new: "Unwatched" }[lib.filter]}</b>`;
  const scopeCount = flat ? videos.length : libScopeSrcs().length;
  libHead.innerHTML =
    `<div class="lib-crumbs">${crumbs}</div><span class="lib-head-count">${scopeCount} video${scopeCount === 1 ? "" : "s"}</span>` +
    `<div class="lib-head-actions">${scopeCount ? '<button class="btn" id="libPlayAll">Play all</button>' : ""}${lib.node != null && !flat ? '<button class="btn" id="libRemoveFolder">Remove folder</button>' : ""}</div>`;
  libHead.querySelectorAll("a[data-n]").forEach((a) => (a.onclick = () => {
    if (flat) {
      lib.query = "";
      libSearch.value = "";
      libSearchClear.classList.add("hidden");
      lib.filter = "all";
      libFilterButtons();
    }
    libOpen(a.dataset.n === "" ? null : a.dataset.n);
  }));
  const pa = document.getElementById("libPlayAll");
  if (pa) pa.onclick = () => libPlayMany(flat ? videos.slice().sort((a, b) => a.idx - b.idx).map((v) => v.src) : libScopeSrcs());
  const rf = document.getElementById("libRemoveFolder");
  if (rf)
    rf.onclick = async () => {
      const f = folders.get(lib.node);
      const srcs = libScopeSrcs();
      if (!(await askConfirm({ title: "Remove folder?", message: `"${f.name}" and its ${srcs.length} video${srcs.length === 1 ? "" : "s"} will be removed from the library. Files on disk are not touched.`, okText: "Remove folder" }))) return;
      lib.node = f.parentId == null ? null : f.parentId;
      removeSrcs(srcs);
    };

  // content
  const scopeKey = [lib.node, lib.query, lib.filter, settings.libSort].join("|");
  const keepScroll = scopeKey === lib.scopeKey ? libScroll.scrollTop : 0;
  const keepCount = scopeKey === lib.scopeKey ? lib.rendered : 0;
  lib.scopeKey = scopeKey;
  libBySrc.clear();
  libTileBySrc.clear();
  libContent.innerHTML = "";
  libContent.classList.toggle("enter", !!lib.animateNext);
  lib.animateNext = false;
  lib.grid = null;
  lib.heroEl = null;
  lib.heroSrc = null;
  if (!flat && lib.node == null && libraryItems.length) libContent.appendChild(libHero());
  lib.queue = videos;
  lib.rendered = 0;
  libEmpty.classList.toggle("hidden", videos.length + subs.length > 0);
  if (!libraryItems.length) libEmpty.innerHTML = "<b>Your library is empty</b>Add video files, a folder, or a stream URL with the Add button.";
  else libEmpty.innerHTML = "<b>No matches</b>Try another search or filter.";
  if (subs.length) {
    const h = document.createElement("div");
    h.className = "lib-section has-seeall";
    h.innerHTML = "<span>Folders</span>";
    const g = document.createElement("div");
    g.className = "lib-grid shelf" + (lib.shelfOpen ? " expanded" : "");
    const see = document.createElement("button");
    see.className = "lib-seeall";
    see.textContent = lib.shelfOpen ? "Show less" : "See all";
    see.onclick = () => {
      lib.shelfOpen = !lib.shelfOpen;
      g.classList.toggle("expanded", lib.shelfOpen);
      see.textContent = lib.shelfOpen ? "Show less" : "See all";
    };
    h.appendChild(see);
    subs.forEach((id, i) => {
      const t = libFolderTile(id, st);
      t.style.setProperty("--i", Math.min(24, i));
      g.appendChild(t);
    });
    libContent.append(h, g);
  }
  if (videos.length) {
    if (subs.length) {
      const h = document.createElement("div");
      h.className = "lib-section";
      h.textContent = "Videos";
      libContent.appendChild(h);
    }
    lib.grid = document.createElement("div");
    lib.grid.className = "lib-grid";
    libContent.appendChild(lib.grid);
    libRenderMore(Math.max(lib.batch, keepCount));
  }
  if (keepScroll) libScroll.scrollTop = keepScroll;
  libRefreshSel();
}

// ----- actions (all mutate the shared playlist state, then both views refresh) -----
function libPlay(src) {
  queueAdd([src], { play: true });
  document.querySelector('.nav-item[data-page="nowPlaying"]').click();
}
function libPlayMany(srcs) {
  if (!srcs.length) return;
  queueAdd(srcs, { play: true });
  document.querySelector('.nav-item[data-page="nowPlaying"]').click();
}
function libToPlaylist(srcs) {
  const n = queueAdd(srcs);
  showToast(n ? n + " added to playlist" : "Already in playlist");
}
function removeSrcs(srcs) {
  const set = new Set(srcs);
  Array.from(set)
    .map((s) => playlist.indexOf(s))
    .filter((i) => i >= 0)
    .sort((a, b) => b - a)
    .forEach((i) => removeIndex(i, true));
  libraryItems = libraryItems.filter((s) => !set.has(s));
  set.forEach((s) => {
    itemFolder.delete(s);
    favorites.delete(s);
    lib.selected.delete(s);
  });
  const st = libStats();
  Array.from(folders.keys()).forEach((id) => {
    if (!(st.counts.get(id) > 0)) folders.delete(id);
  });
  renderPlaylist();
  scheduleSave();
}
function libFolderSrcs(fid) {
  return libraryItems.filter((s) => itemFolderChain(s).includes(fid));
}
function libToggleItems(srcs) {
  const all = srcs.length && srcs.every((s) => lib.selected.has(s));
  srcs.forEach((s) => (all ? lib.selected.delete(s) : lib.selected.add(s)));
}
function libRangeSelect(toSrc) {
  const a = lib.queue.findIndex((it) => it.src === lib.anchor);
  const b = lib.queue.findIndex((it) => it.src === toSrc);
  if (a < 0 || b < 0) return libToggleItems([toSrc]);
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) lib.selected.add(lib.queue[i].src);
}
function libRefreshSel() {
  libContent.querySelectorAll(".lib-card").forEach((card) => {
    if (card.dataset.folder !== undefined) {
      const fs = card._fs || (card._fs = libFolderSrcs(card.dataset.folder));
      let n = 0;
      fs.forEach((s) => lib.selected.has(s) && n++);
      card.classList.toggle("selected", n > 0 && n === fs.length);
      card.classList.toggle("partial", n > 0 && n < fs.length);
    } else card.classList.toggle("selected", lib.selected.has(card.dataset.src));
  });
  libUpdateBulk();
}
function libSetSelect(on) {
  lib.select = on;
  if (!on) {
    lib.selected.clear();
    lib.anchor = null;
  }
  libEl.classList.toggle("select-mode", on);
  libSelectBtn.classList.toggle("primary", on);
  libSelectBtn.textContent = on ? "Done" : "Select";
  libRefreshSel();
}
function libUpdateBulk() {
  libBulk.classList.toggle("hidden", !lib.select);
  const n = lib.selected.size;
  libBulkCount.textContent = n ? n + " selected" : "Select videos or folders";
  ["libBulkPlay", "libBulkQueue", "libBulkFav", "libBulkRemove", "libBulkClear"].forEach((id) => (document.getElementById(id).disabled = !n));
  const total = libraryItems.filter((s) => libInScope(s) && libPass(s)).length;
  document.getElementById("libBulkAll").textContent = n && n >= total ? "Deselect all" : "Select all";
}
libContent.addEventListener("click", (e) => {
  const card = e.target.closest(".lib-card");
  if (!card) return;
  const isFolder = card.dataset.folder !== undefined;
  const srcs = isFolder ? card._fs || (card._fs = libFolderSrcs(card.dataset.folder)) : [card.dataset.src];
  const multi = e.ctrlKey || e.metaKey || e.shiftKey;
  if (e.target.closest(".lib-check")) {
    if (!lib.select) libSetSelect(true);
    if (e.shiftKey && lib.anchor && !isFolder) libRangeSelect(srcs[0]);
    else libToggleItems(srcs);
    if (!isFolder) lib.anchor = srcs[0];
    libRefreshSel();
    return;
  }
  if (isFolder) {
    if (e.target.closest(".lib-play")) {
      libPlayMany(srcs);
    } else if (e.target.closest(".lib-add")) {
      libToPlaylist(srcs);
    } else if (lib.select || multi) {
      if (!lib.select) libSetSelect(true);
      libToggleItems(srcs);
      libRefreshSel();
    } else libOpen(card.dataset.folder);
    return;
  }
  const src = srcs[0];
  if (e.target.closest(".lib-fav")) {
    if (favorites.has(src)) favorites.delete(src);
    else favorites.add(src);
    renderPlaylist();
    scheduleSave();
    return;
  }
  if (e.target.closest(".lib-add")) {
    libToPlaylist([src]);
    return;
  }
  if (e.target.closest(".lib-rm")) {
    removeSrcs([src]);
    return;
  }
  if (lib.select || multi) {
    if (!lib.select) libSetSelect(true);
    if (e.shiftKey && lib.anchor) libRangeSelect(src);
    else libToggleItems([src]);
    lib.anchor = src;
    libRefreshSel();
    return;
  }
  libPlay(src);
});
libContent.addEventListener("dblclick", (e) => {
  const card = e.target.closest(".lib-card");
  if (lib.select && card && card.dataset.folder !== undefined && !e.target.closest(".lib-check")) libOpen(card.dataset.folder);
});
document.getElementById("libBulkAll").addEventListener("click", () => {
  const all = libraryItems.filter((s) => libInScope(s) && libPass(s));
  if (all.length && all.every((s) => lib.selected.has(s))) lib.selected.clear();
  else all.forEach((s) => lib.selected.add(s));
  libRefreshSel();
});
document.getElementById("libBulkClear").addEventListener("click", () => {
  lib.selected.clear();
  libRefreshSel();
});
window.addEventListener("keydown", (e) => {
  if (!libVisible()) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || (ae.tagName === "INPUT" && ae.type === "text" && ae.value))) {
    if (!(e.key === "Escape" && ae === libSearch)) return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") {
    e.preventDefault();
    if (!lib.select) libSetSelect(true);
    libraryItems.filter((s) => libInScope(s) && libPass(s)).forEach((s) => lib.selected.add(s));
    libRefreshSel();
  } else if (e.key === "Escape" && lib.select && boostOverlay.classList.contains("hidden")) {
    libSetSelect(false);
  } else if (e.key === "Delete" && lib.select && lib.selected.size) {
    document.getElementById("libBulkRemove").click();
  }
});

// ----- toolbar wiring -----
let libSearchTimer = null;
libSearch.addEventListener("input", () => {
  libSearchClear.classList.toggle("hidden", !libSearch.value);
  clearTimeout(libSearchTimer);
  libSearchTimer = setTimeout(() => {
    lib.query = libSearch.value.trim();
    renderLibrary();
  }, 120);
});
libSearch.addEventListener("keydown", (e) => {
  if (e.key === "Escape") libSearchClear.click();
});
libSearchClear.addEventListener("click", () => {
  libSearch.value = "";
  libSearchClear.classList.add("hidden");
  lib.query = "";
  renderLibrary();
});
document.querySelectorAll("#libFilters button").forEach((b) =>
  b.addEventListener("click", () => {
    lib.animateNext = true;
    lib.filter = b.dataset.filter;
    libFilterButtons();
    renderLibrary();
  })
);
libSort.addEventListener("change", () => {
  lib.animateNext = true;
  settings.libSort = libSort.value;
  scheduleSave();
  renderLibrary();
});
document.querySelectorAll("#libViewSeg button").forEach((b) =>
  b.addEventListener("click", () => {
    settings.libView = b.dataset.view;
    libApplyPrefs();
    scheduleSave();
  })
);
libSize.addEventListener("input", () => {
  settings.libSize = parseInt(libSize.value, 10);
  libEl.style.setProperty("--lib-card", settings.libSize + "px");
  scheduleSave();
});
libSelectBtn.addEventListener("click", () => libSetSelect(!lib.select));
document.getElementById("libBulkDone").addEventListener("click", () => libSetSelect(false));
document.getElementById("libBulkQueue").addEventListener("click", () => libToPlaylist(libraryItems.filter((s) => lib.selected.has(s))));
document.getElementById("libBulkPlay").addEventListener("click", () => {
  libPlayMany(libraryItems.filter((s) => lib.selected.has(s)));
});
document.getElementById("libBulkFav").addEventListener("click", () => {
  const sel = Array.from(lib.selected);
  if (!sel.length) return;
  const allFav = sel.every((s) => favorites.has(s));
  sel.forEach((s) => (allFav ? favorites.delete(s) : favorites.add(s)));
  renderPlaylist();
  scheduleSave();
});
document.getElementById("libBulkRemove").addEventListener("click", async () => {
  const sel = Array.from(lib.selected);
  if (!sel.length) return;
  if (!(await askConfirm({ title: "Remove from library?", message: `${sel.length} video${sel.length === 1 ? "" : "s"} will be removed from the library. Files on disk are not touched.`, okText: "Remove" }))) return;
  removeSrcs(sel);
  libUpdateBulk();
});
document.getElementById("libAddBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !libAddWrap.classList.contains("open");
  closeAllPopovers();
  if (open) libAddWrap.classList.add("open");
});
document.getElementById("libAddFiles").addEventListener("click", () => importFilesBtn.click());
document.getElementById("libAddFolder").addEventListener("click", () => importFolderBtn.click());
document.getElementById("libAddUrl").addEventListener("click", () => importUrlBtn.click());
document.getElementById("playlistLibBtn").addEventListener("click", () => openLibrary(null));
document.getElementById("plOpenLib").addEventListener("click", () => openLibrary(null));
document.getElementById("playlistClearBtn").addEventListener("click", async () => {
  if (!playlist.length) return;
  if (!(await askConfirm({ title: "Clear playlist?", message: `All ${playlist.length} video${playlist.length === 1 ? "" : "s"} leave the playlist. They stay in your Library.`, okText: "Clear" }))) return;
  video.pause();
  liveStop();
  clearSubtitleTracks();
  video.removeAttribute("src");
  video.load();
  playlist = [];
  currentIndex = -1;
  playerPanel.classList.remove("has-media", "is-playing");
  renderPlaylist();
  updateBlobNowPlaying();
  scheduleSave();
});
function libApplyPrefs() {
  const view = settings.libView === "list" ? "list" : "grid";
  libEl.classList.toggle("list", view === "list");
  document.querySelectorAll("#libViewSeg button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  libSort.value = settings.libSort || "order";
  libSize.value = settings.libSize || 220;
  libEl.style.setProperty("--lib-card", (settings.libSize || 220) + "px");
}
libReady = true;
libApplyPrefs();

// ======================= Custom dropdowns =======================
// Replaces every native <select> (its popup is drawn by the OS, so it ignores the skin and
// shows a white list with white text). The <select> stays in the DOM as the source of truth:
// ids, .value, change listeners and option rebuilds keep working unchanged.
// Options may carry data-icon="<key>" (see DD_ICONS); selects may set data-dd="lang|font".
const DD_ICONS = {
  chev: '<path d="M4 6.5l4 4 4-4"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  search: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3.2 3.2"/>',
  globe: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.8 1.6 2.7 3.4 2.7 5.5S9.8 11.9 8 13.5C6.2 11.9 5.3 10.1 5.3 8S6.2 4.1 8 2.5z"/>',
  // equalizer presets
  flat: '<path d="M2 8h12"/><path d="M5 5.5v5M8 5.5v5M11 5.5v5" opacity=".45"/>',
  film: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5.5 3v10M10.5 3v10M2 6.5h3.5M2 9.5h3.5M10.5 6.5H14M10.5 9.5H14"/>',
  chat: '<path d="M3 3.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8.2L5 13.2v-2.7H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z"/><path d="M5 6.2h6M5 8.2h3.5"/>',
  note: '<path d="M6 11.5V3.5l7-1.5v8"/><circle cx="4.5" cy="11.5" r="1.7"/><circle cx="11.5" cy="10" r="1.7"/>',
  "bars-down": '<path d="M4 13V3.5M8 13V7M12 13V10"/>',
  "bars-up": '<path d="M4 13V10M8 13V7M12 13V3.5"/>',
  bolt: '<path d="M9 1.8L4 9h3.5L7 14.2 12 7H8.5z"/>',
  spark: '<path d="M8 2l1.4 4.1L13.5 7.5 9.4 8.9 8 13 6.6 8.9 2.5 7.5 6.6 6.1z"/>',
  wave: '<path d="M1.5 8h2l1.5-4.5 2.5 9 2-7 1.5 2.5h3.5"/>',
  keys: '<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M5.3 13V8.5M8 13V8.5M10.7 13V8.5"/><rect x="4.4" y="3" width="1.8" height="5" rx=".5" fill="currentColor"/><rect x="9.8" y="3" width="1.8" height="5" rx=".5" fill="currentColor"/>',
  bookmark: '<path d="M4.5 2.5h7v11L8 10.8 4.5 13.5z"/>',
  sliders: '<path d="M3 5h5M11 5h2M3 11h2M8 11h5"/><circle cx="9.5" cy="5" r="1.5"/><circle cx="6.5" cy="11" r="1.5"/>',
  // library sort
  list: '<path d="M2.5 4h11M2.5 8h11M2.5 12h7"/>',
  az: '<path d="M2.5 12.5l2.7-7.5 2.7 7.5M3.5 10.4h3.4"/><path d="M10 5h3.6L10 12.5h3.6"/>',
  za: '<path d="M2.5 5h3.6L2.5 12.5h3.6"/><path d="M9.5 12.5l2.7-7.5 2.7 7.5M10.5 10.4h3.4"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
  history: '<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.7M2.8 3v2.6h2.6"/><path d="M8 5.5V8l1.8 1.2"/>',
};
const ddSvg = (k, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DD_ICONS[k] || ""}</svg>`;

let ddOpen = null; // the one open dropdown: { close() }
function enhanceSelect(sel) {
  if (sel._dd) return sel._dd;
  const kind = sel.dataset.dd || "";
  const wrap = document.createElement("div");
  wrap.className = "dd" + (sel.classList.contains("full") ? " full" : "");
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add("dd-native");
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dd-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  if (sel.getAttribute("aria-label")) btn.setAttribute("aria-label", sel.getAttribute("aria-label"));
  btn.innerHTML = '<span class="dd-lead" hidden></span><span class="dd-label"></span><span class="dd-chev">' + ddSvg("chev", 14) + "</span>";
  wrap.appendChild(btn);
  const lead = btn.querySelector(".dd-lead");
  const label = btn.querySelector(".dd-label");

  const fontOf = (v) => `"${String(v).replace(/"/g, "")}"`;
  const leadHtml = (o) => {
    if (kind === "lang") return o.value === "all" ? ddSvg("globe", 16) : `<span class="dd-code">${esc(o.value.slice(0, 3))}</span>`;
    return o.dataset.icon ? ddSvg(o.dataset.icon, 16) : "";
  };
  function refresh() {
    const o = sel.options[sel.selectedIndex];
    lead.innerHTML = o ? leadHtml(o) : "";
    lead.hidden = !lead.innerHTML;
    label.textContent = o ? o.textContent.trim() : "";
    label.style.fontFamily = kind === "font" && o ? fontOf(o.value) : "";
    btn.disabled = sel.disabled;
    wrap.classList.toggle("disabled", sel.disabled);
  }

  // programmatic changes (sel.value = ..., rebuilt options) keep the button in sync
  ["value", "selectedIndex"].forEach((prop) => {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    Object.defineProperty(sel, prop, {
      configurable: true,
      get() {
        return d.get.call(sel);
      },
      set(v) {
        d.set.call(sel, v);
        refresh();
      },
    });
  });

  let menu = null;
  let list = null;
  let search = null;
  let items = [];
  let active = -1;
  let typed = "";
  let typedTimer = 0;

  function renderList(filter) {
    const f = (filter || "").trim().toLowerCase();
    list.innerHTML = "";
    items = [];
    const addOpt = (o) => {
      if (o.hidden || (f && !o.textContent.toLowerCase().includes(f))) return;
      const el = document.createElement("div");
      el.className = "dd-opt";
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", o.selected ? "true" : "false");
      if (o.disabled) el.setAttribute("aria-disabled", "true");
      const l = leadHtml(o);
      el.innerHTML = (l ? `<span class="dd-lead">${l}</span>` : "") + `<span class="dd-label"${kind === "font" ? ` style="font-family:${fontOf(o.value)}"` : ""}>${esc(o.textContent.trim())}</span><span class="dd-check">${ddSvg("check", 14)}</span>`;
      el.addEventListener("pointermove", () => {
        const i = items.findIndex((x) => x.el === el);
        if (i !== active) setActive(i, false);
      });
      el.addEventListener("click", () => choose(o));
      items.push({ el, o });
      list.appendChild(el);
    };
    [...sel.children].forEach((ch) => {
      if (ch.tagName === "OPTGROUP") {
        const head = document.createElement("div");
        head.className = "dd-group";
        head.textContent = ch.label;
        list.appendChild(head);
        const before = items.length;
        ch.querySelectorAll("option").forEach(addOpt);
        if (items.length === before) head.remove();
      } else addOpt(ch);
    });
    if (!items.length) list.innerHTML = '<div class="dd-empty">No matches</div>';
    const sIdx = items.findIndex((x) => x.o.selected);
    setActive(f ? 0 : sIdx >= 0 ? sIdx : 0, true);
  }
  function setActive(i, scroll) {
    items.forEach((x, k) => x.el.classList.toggle("kb", k === i));
    active = i;
    if (scroll && items[i]) items[i].el.scrollIntoView({ block: "nearest" });
  }
  function choose(o) {
    if (!o || o.disabled) return;
    const changed = sel.value !== o.value;
    sel.value = o.value;
    close(true);
    if (changed) {
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  function place() {
    if (!menu) return;
    const r = btn.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return close(false); // scrolled out of view
    const vw = innerWidth;
    const vh = innerHeight;
    menu.style.minWidth = Math.max(r.width, 210) + "px";
    menu.style.maxWidth = Math.min(380, vw - 24) + "px";
    menu.style.maxHeight = "none";
    const natural = Math.min(menu.offsetHeight, 430);
    const below = vh - r.bottom - 14;
    const above = r.top - 14;
    const up = below < Math.min(natural, 220) && above > below;
    const room = Math.max(140, Math.min(430, (up ? above : below) - 6));
    menu.style.maxHeight = room + "px";
    const h = Math.min(natural, room);
    const w = menu.offsetWidth;
    menu.style.left = Math.max(12, Math.min(r.left, vw - w - 12)) + "px";
    menu.style.top = (up ? r.top - h - 6 : r.bottom + 6) + "px";
    menu.classList.toggle("up", up);
  }
  const onDown = (e) => {
    if (menu && !menu.contains(e.target) && !wrap.contains(e.target)) close(false);
  };
  const onScroll = (e) => {
    if (menu && !menu.contains(e.target)) place();
  };
  const onKey = (e) => {
    if (!menu) return;
    const k = e.key;
    const typing = e.target === search;
    const move = (d) => {
      if (!items.length) return;
      setActive(((active < 0 ? 0 : active) + d + items.length) % items.length, true);
    };
    if (k === "ArrowDown") move(1);
    else if (k === "ArrowUp") move(-1);
    else if (k === "PageDown") move(6);
    else if (k === "PageUp") move(-6);
    else if (k === "Home" && !typing) setActive(0, true);
    else if (k === "End" && !typing) setActive(items.length - 1, true);
    else if (k === "Enter" || (k === " " && !typing)) choose(items[active] && items[active].o);
    else if (k === "Escape") {
      close(true);
    } else if (k === "Tab") {
      close(false);
      return;
    } else if (!search && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type-ahead for short lists
      clearTimeout(typedTimer);
      typed += k.toLowerCase();
      typedTimer = setTimeout(() => (typed = ""), 650);
      const start = typed.length === 1 ? active + 1 : active;
      const order = items.map((_, i) => (start + i) % items.length);
      const hit = order.find((i) => items[i].o.textContent.trim().toLowerCase().startsWith(typed));
      if (hit != null) setActive(hit, true);
    } else {
      if (typing) e.stopPropagation(); // let the search box type, but keep player shortcuts quiet
      return;
    }
    e.preventDefault();
    e.stopPropagation(); // never let Space / arrows reach the player shortcuts
  };
  function open() {
    if (menu || sel.disabled) return;
    if (ddOpen) ddOpen.close(false);
    menu = document.createElement("div");
    menu.className = "dd-menu";
    menu.setAttribute("role", "listbox");
    const searchable = [...sel.options].filter((o) => !o.hidden).length > 12;
    menu.innerHTML = (searchable ? `<div class="dd-search">${ddSvg("search", 14)}<input type="text" placeholder="Search" spellcheck="false" autocomplete="off" aria-label="Filter options" /></div>` : "") + '<div class="dd-list"></div>';
    list = menu.querySelector(".dd-list");
    search = menu.querySelector("input");
    if (search) search.addEventListener("input", () => renderList(search.value));
    document.body.appendChild(menu);
    renderList("");
    place();
    requestAnimationFrame(() => menu && menu.classList.add("show"));
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    ddOpen = { close };
    if (search) search.focus({ preventScroll: true });
  }
  function close(refocus) {
    if (!menu) return;
    const m = menu;
    menu = null;
    m.classList.remove("show");
    setTimeout(() => m.remove(), 140);
    btn.setAttribute("aria-expanded", "false");
    wrap.classList.remove("is-open");
    document.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", onScroll, true);
    if (ddOpen && ddOpen.close === close) ddOpen = null;
    if (refocus) btn.focus({ preventScroll: true });
  }
  btn.addEventListener("click", () => (menu ? close(true) : open()));
  btn.addEventListener("keydown", (e) => {
    if (menu) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open();
    }
  });
  new MutationObserver(() => {
    refresh();
    if (menu) renderList(search ? search.value : "");
  }).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden", "label", "data-icon"] });

  sel._dd = { refresh, open, close };
  refresh();
  return sel._dd;
}
document.querySelectorAll("select").forEach(enhanceSelect);

// ---------- Init ----------
(function init() {
  video.muted = false;
  video.loop = false;
  renderSpeedUi();
  updatePlayIcon();
  updateVolumeIcon();
  updateFullscreenIcon();
  applyEnhancementState();
  applyZoomTransform();
  loadSystemFonts();
  loadState();
  updateMaximizeIcon();
})();
