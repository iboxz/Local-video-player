// Renderer logic
const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const importVideoBtn = document.getElementById("importVideoBtn");
const importSubtitleBtn = document.getElementById("importSubtitleBtn");

// Window control buttons
document.getElementById("minimize-btn").addEventListener("click", () => {
  window.electronAPI.windowControl.minimize();
});

// برای تشخیص حالت ماکسیمایز
let isMaximized = false;

// SVG icons for maximize button (state-based)
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
    }, 1000); // Save time every 1 second of playback
  }
});

// Also save when video is paused or the page is about to unload
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
const loopToggle = document.getElementById("loopToggle");
const mutedToggle = document.getElementById("mutedToggle");
const speedSelect = document.getElementById("speedSelect");
const subtitleToggle = document.getElementById("subtitleToggle");
const subtitleLabel = document.getElementById("subtitleLabel");
const subtitleList = document.getElementById("subtitleList");

// Subtitle settings elements
const subtitleFontFamily = document.getElementById("subtitleFontFamily");
const subtitleFontWeight = document.getElementById("subtitleFontWeight");
const subtitleFontSize = document.getElementById("subtitleFontSize");
const subtitleFontSizeValue = document.getElementById("subtitleFontSizeValue");
const subtitleFontScale = document.getElementById("subtitleFontScale");
const subtitleFontScaleValue = document.getElementById("subtitleFontScaleValue");
const subtitleColor = document.getElementById("subtitleColor");
const subtitleBgColor = document.getElementById("subtitleBgColor");
const subtitleBgEnabled = document.getElementById("subtitleBgEnabled");
const subtitleBgOpacity = document.getElementById("subtitleBgOpacity");
const subtitleBgOpacityValue = document.getElementById("subtitleBgOpacityValue");
const subtitleStrokeWidth = document.getElementById("subtitleStrokeWidth");
const subtitleStrokeWidthValue = document.getElementById("subtitleStrokeWidthValue");
const subtitleStrokeColor = document.getElementById("subtitleStrokeColor");
const subtitlePreview = document.getElementById("subtitlePreview");

if (subtitleFontWeight) {
  subtitleFontWeight.addEventListener("change", (e) => {
    subtitleSettings.fontWeight = e.target.value;
    updateSubtitleStyle();
    scheduleSave();
  });
}

if (subtitleFontSize) {
  subtitleFontSize.addEventListener("input", (e) => {
    subtitleSettings.fontSize = parseInt(e.target.value);
    subtitleFontSizeValue.textContent = subtitleSettings.fontSize + "px";
    updateSubtitleStyle();
    scheduleSave();
  });
}

if (subtitleFontScale) {
  subtitleFontScale.addEventListener("input", (e) => {
    subtitleSettings.fontScale = parseInt(e.target.value);
    subtitleFontScaleValue.textContent = subtitleSettings.fontScale + "%";
    updateSubtitleStyle();
    scheduleSave();
  });
}

const playlistList = document.getElementById("playlistList");
const dropOverlay = document.getElementById("dropOverlay");

// Store variables
let playlist = [];
let currentIndex = -1;
let subtitlesMap = new Map(); // videoSrc -> Array<{label, content, blobUrl}>
let currentSubtitles = [];
let currentSubtitleIndex = -1;
const saveTimer = { current: null };

// Video time tracking
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

// Subtitle style settings
const subtitleSettings = {
  fontFamily: "Arial",
  fontSize: 24,
  fontWeight: "400",
  color: "#ffffff",
  availableFonts: [],
  strokeWidth: 1,
  strokeColor: "#000000",
  bgColor: "#000000",
  bgEnabled: false,
  bgOpacity: 50,
};

// Subtitle toggle handler
subtitleToggle.onclick = toggleSubtitleList;

function toggleSubtitleList(e) {
  const isOpen = subtitleToggle.classList.contains("active");
  if (isOpen) {
    hideSubtitleList();
  } else {
    showSubtitleList();
  }
  e.stopPropagation();
}

function showSubtitleList() {
  subtitleList.style.display = "flex";
  subtitleToggle.classList.add("active");
}

function hideSubtitleList() {
  subtitleList.style.display = "none";
  subtitleToggle.classList.remove("active");
}

// Close subtitle list when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest("#subtitleToggle")) {
    hideSubtitleList();
  }
});

const navButtons = Array.from(document.querySelectorAll(".nav-item"));
const pages = {
  nowPlaying: document.getElementById("page-nowPlaying"),
  settings: document.getElementById("page-settings") || null,
};

function setStatus(text) {
  statusEl.textContent = text || "";
}

function formatTime(t) {
  if (isNaN(t)) return "--:--";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function renderPlaylist() {
  playlistList.innerHTML = "";
  playlist.forEach((src, idx) => {
    const row = document.createElement("div");
    row.className = "item" + (idx === currentIndex ? " active" : "");
    const name = decodeURIComponent(src.split("/").pop());
    row.innerHTML = `<span class="num">${idx + 1}</span><span class="name">${name}</span><button class="remove" title="Remove">✕</button>`;
    row.onclick = () => playIndex(idx);
    const del = row.querySelector(".remove");
    if (del)
      del.onclick = (ev) => {
        ev.stopPropagation();
        removeIndex(idx);
      };
    playlistList.appendChild(row);
  });
}

// Update subtitle select options
function updateSubtitleSelect() {
  // Update label to show current selection
  const activeSubtitle = currentSubtitles[currentSubtitleIndex];
  subtitleLabel.textContent = activeSubtitle ? activeSubtitle.label : "No subtitle";

  // Update subtitle list
  subtitleList.innerHTML = "";

  // Add "No subtitle" option
  const noSubItem = document.createElement("div");
  noSubItem.className = "subtitle-item" + (currentSubtitleIndex === -1 ? " active" : "");
  noSubItem.innerHTML = '<div class="name">No subtitle</div>';
  noSubItem.onclick = () => {
    currentSubtitleIndex = -1;
    applySubtitle("");
    updateSubtitleSelect();
    hideSubtitleList();
  };
  subtitleList.appendChild(noSubItem);

  if (video.src && currentSubtitles.length > 0) {
    // Add separator
    const separator = document.createElement("div");
    separator.className = "subtitle-separator";
    subtitleList.appendChild(separator);

    currentSubtitles.forEach((sub, index) => {
      const item = document.createElement("div");
      item.className = "subtitle-item" + (index === currentSubtitleIndex ? " active" : "");

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = sub.label;
      name.onclick = () => {
        currentSubtitleIndex = index;
        applySubtitle(index.toString());
        updateSubtitleSelect();
        hideSubtitleList();
      };

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "✕";
      removeBtn.title = "Remove subtitle";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeSubtitle(index);
      };

      item.appendChild(name);
      item.appendChild(removeBtn);
      subtitleList.appendChild(item);
    });
  } else {
    const noSubs = document.createElement("div");
    noSubs.className = "subtitle-item no-subs";
    noSubs.textContent = "No subtitles available";
    subtitleList.appendChild(noSubs);
  }
} // Apply selected subtitle
function applySubtitle(index) {
  // Remove any existing subtitle tracks
  const tracks = video.getElementsByTagName("track");
  while (tracks.length > 0) {
    tracks[0].remove();
  }

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

      // Enable track
      const trackElement = video.textTracks[0];
      if (trackElement) {
        trackElement.mode = "showing";
      }

      // Apply current subtitle settings
      updateSubtitleStyle();
    }
  }
}

// Handle subtitle selection change
// Handle subtitle removal
function removeSubtitle(index) {
  if (currentSubtitles[index]) {
    // If this subtitle was active, deactivate it
    if (currentSubtitleIndex === index) {
      currentSubtitleIndex = -1;
      applySubtitle("");
    }

    URL.revokeObjectURL(currentSubtitles[index].blobUrl);
    currentSubtitles.splice(index, 1);
    if (video.src) {
      subtitlesMap.set(video.src, currentSubtitles);
    }
    updateSubtitleSelect();
    setStatus("Subtitle removed");
    scheduleSave();
  }
}

// Handle subtitle import
importSubtitleBtn.onclick = async () => {
  try {
    if (!video.src) {
      setStatus("Please load a video first");
      return;
    }

    const result = await window.electronAPI.selectSubtitleFile();
    if (result) {
      // Create blob from subtitle content
      const blob = new Blob([result.content], { type: "text/vtt;charset=UTF-8" });
      const blobUrl = URL.createObjectURL(blob);

      // Add to subtitles list
      const subtitle = {
        label: result.fileName,
        content: result.content,
        blobUrl: blobUrl,
      };

      currentSubtitles.push(subtitle);
      subtitlesMap.set(video.src, currentSubtitles);

      // Update UI
      currentSubtitleIndex = currentSubtitles.length - 1;
      updateSubtitleSelect();
      applySubtitle(currentSubtitleIndex.toString());

      setStatus("Subtitle loaded successfully");
      scheduleSave();
    }
  } catch (error) {
    setStatus("Error loading subtitle");
  }
};
function playIndex(idx) {
  if (idx < 0 || idx >= playlist.length) return;
  currentIndex = idx;
  video.src = playlist[idx];
  video.currentTime = 0;

  // Load subtitles for this video
  currentSubtitles = subtitlesMap.get(video.src) || [];
  updateSubtitleSelect();

  // Load saved time for this video
  const savedTime = videoTimeStorage.load(video.src);
  if (savedTime > 0) {
    video.currentTime = savedTime;
  }

  video.play().catch(() => {});
  renderPlaylist();
  scheduleSave();
}

function addVideos(filesOrUrls) {
  const items = Array.isArray(filesOrUrls) ? filesOrUrls : [filesOrUrls];
  const valid = items.filter(Boolean);
  if (!valid.length) return;
  const wasEmpty = currentIndex === -1;
  for (let i = valid.length - 1; i >= 0; i--) {
    playlist.unshift(valid[i]);
  }
  if (wasEmpty) {
    currentIndex = 0;
  } else {
    currentIndex += valid.length;
  }
  renderPlaylist();
  if (wasEmpty) {
    playIndex(currentIndex);
  }
  scheduleSave();
}

function removeIndex(idx) {
  if (idx < 0 || idx >= playlist.length) return;
  const removingCurrent = idx === currentIndex;
  playlist.splice(idx, 1);
  if (playlist.length === 0) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    currentIndex = -1;
    renderPlaylist();
    scheduleSave();
    return;
  }
  if (idx < currentIndex) {
    currentIndex -= 1;
  } else if (removingCurrent) {
    if (currentIndex >= playlist.length) currentIndex = playlist.length - 1;
    playIndex(currentIndex);
  }
  renderPlaylist();
  scheduleSave();
}

// Navigation (will work even if settings page removed)
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const page = btn.dataset.page;
    Object.entries(pages).forEach(([key, el]) => {
      if (!el) return;
      if (key === page) el.classList.remove("hidden");
      else el.classList.add("hidden");
    });
  });
});

// Import video via dialog (uses main process)
importVideoBtn.addEventListener("click", async () => {
  const files = await window.electronAPI.selectVideoFiles();
  if (!files || !files.length) return;
  addVideos(files);
});

// Drag & Drop support (videos only)
const playerPanel = document.querySelector(".player-panel");
["dragenter", "dragover"].forEach((evt) =>
  playerPanel.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.remove("hidden");
  })
);
["dragleave", "drop"].forEach((evt) =>
  playerPanel.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (evt === "drop") handleDrop(e);
    dropOverlay.classList.add("hidden");
  })
);

function handleDrop(e) {
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  const vids = [];
  for (const f of dt.files) {
    const name = (f.name || "").toLowerCase();
    if (
      name.endsWith(".mp4") ||
      name.endsWith(".webm") ||
      name.endsWith(".mkv") ||
      name.endsWith(".mov") ||
      name.endsWith(".avi") ||
      name.endsWith(".m4v")
    ) {
      const fileUrl = f.path ? "file:///" + f.path.replace(/\\/g, "/") : URL.createObjectURL(f);
      vids.push(fileUrl);
    }
  }
  if (vids.length) addVideos(vids);
}

// Save/Load state
async function saveState() {
  const subtitlesData = {};
  for (const [videoSrc, subs] of subtitlesMap.entries()) {
    subtitlesData[videoSrc] = subs.map((sub) => ({
      label: sub.label,
      content: sub.content,
    }));
  }

  const state = {
    playlist,
    currentIndex,
    loop: video.loop,
    subtitles: subtitlesData,
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
    currentIndex = state.currentIndex || -1;
    video.loop = loopToggle.checked = !!state.loop;

    // Restore subtitles
    if (state.subtitles) {
      for (const [videoSrc, subs] of Object.entries(state.subtitles)) {
        const subtitlesList = subs.map((sub) => {
          const blob = new Blob([sub.content], { type: "text/vtt;charset=UTF-8" });
          const blobUrl = URL.createObjectURL(blob);
          return {
            label: sub.label,
            content: sub.content,
            blobUrl: blobUrl,
          };
        });
        subtitlesMap.set(videoSrc, subtitlesList);
      }
    }

    renderPlaylist();
    if (currentIndex >= 0) playIndex(currentIndex);
  }
}

// Toggles and playback controls
loopToggle.addEventListener("change", () => {
  video.loop = loopToggle.checked;
  scheduleSave();
});
mutedToggle.addEventListener("change", () => {
  video.muted = mutedToggle.checked;
});
speedSelect.addEventListener("change", () => {
  video.playbackRate = parseFloat(speedSelect.value || "1");
});

video.addEventListener("loadedmetadata", () => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  setStatus(`Source: ${w}x${h}`);
});
video.addEventListener("timeupdate", () => {
  setStatus(`Time: ${formatTime(video.currentTime)} / ${formatTime(video.duration)}`);
});
video.addEventListener("ended", () => {
  if (loopToggle.checked) {
    video.currentTime = 0;
    video.play();
  } else if (currentIndex + 1 < playlist.length) {
    playIndex(currentIndex + 1);
  }
  scheduleSave();
});

// Font weight default
subtitleFontWeight.value = "400";

function updateSubtitleStyle() {
  const style = document.createElement("style");
  const css = `
    ::cue {
      font-family: ${subtitleSettings.fontFamily};
      font-size: ${subtitleSettings.fontSize}px;
      font-weight: ${subtitleSettings.fontWeight};
      color: ${subtitleSettings.color};
      text-shadow: 
        ${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        -${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        ${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        -${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        0 ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        0 -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        ${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor},
        -${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor};
      background-color: ${
        subtitleSettings.bgEnabled
          ? subtitleSettings.bgColor +
            Math.round(subtitleSettings.bgOpacity * 2.55)
              .toString(16)
              .padStart(2, "0")
          : "transparent"
      };
    }
  `;
  style.textContent = css;

  // Remove any existing subtitle style
  const existingStyle = document.querySelector("style[data-subtitle-style]");
  if (existingStyle) existingStyle.remove();

  // Add new style
  style.setAttribute("data-subtitle-style", "");
  document.head.appendChild(style);

  // Update preview
  subtitlePreview.style.fontFamily = subtitleSettings.fontFamily;
  subtitlePreview.style.fontSize = subtitleSettings.fontSize + "px";
  subtitlePreview.style.color = subtitleSettings.color;
  subtitlePreview.style.textShadow = `
    ${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
    -${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
    ${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
    -${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
    0 ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
    0 -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
    ${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor},
    -${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor}
  `;
  subtitlePreview.style.backgroundColor = subtitleSettings.bgEnabled
    ? subtitleSettings.bgColor +
      Math.round(subtitleSettings.bgOpacity * 2.55)
        .toString(16)
        .padStart(2, "0")
    : "transparent";
}

// Subtitle settings event handlers
if (subtitleFontFamily) {
  subtitleFontFamily.addEventListener("change", (e) => {
    subtitleSettings.fontFamily = e.target.value;
    updateSubtitleStyle();
    scheduleSave();
  });
}

subtitleFontSize.addEventListener("input", (e) => {
  subtitleSettings.fontSize = parseInt(e.target.value);
  subtitleFontSizeValue.textContent = subtitleSettings.fontSize + "px";
  updateSubtitleStyle();
  scheduleSave();
});

subtitleColor.addEventListener("input", (e) => {
  subtitleSettings.color = e.target.value;
  updateSubtitleStyle();
  scheduleSave();
});

subtitleStrokeWidth.addEventListener("input", (e) => {
  subtitleSettings.strokeWidth = parseFloat(e.target.value);
  subtitleStrokeWidthValue.textContent = subtitleSettings.strokeWidth + "px";
  updateSubtitleStyle();
  scheduleSave();
});

subtitleStrokeColor.addEventListener("input", (e) => {
  subtitleSettings.strokeColor = e.target.value;
  updateSubtitleStyle();
  scheduleSave();
});

subtitleBgEnabled.addEventListener("change", (e) => {
  subtitleSettings.bgEnabled = e.target.checked;
  subtitleBgColor.disabled = !e.target.checked;
  subtitleBgOpacity.disabled = !e.target.checked;
  updateSubtitleStyle();
  scheduleSave();
});

subtitleBgColor.addEventListener("input", (e) => {
  subtitleSettings.bgColor = e.target.value;
  updateSubtitleStyle();
  scheduleSave();
});

subtitleBgOpacity.addEventListener("input", (e) => {
  subtitleSettings.bgOpacity = parseInt(e.target.value);
  subtitleBgOpacityValue.textContent = subtitleSettings.bgOpacity + "%";
  updateSubtitleStyle();
  scheduleSave();
});

// Update saveState and loadState functions
const originalSaveState = saveState;
saveState = async function () {
  // Build subtitle data from map
  const subtitlesData = {};
  for (const [videoSrc, subs] of subtitlesMap.entries()) {
    subtitlesData[videoSrc] = subs.map((sub) => ({
      label: sub.label,
      content: sub.content,
    }));
  }

  const state = {
    playlist,
    currentIndex,
    loop: video.loop,
    subtitles: subtitlesData,
    subtitleSettings,
  };
  await window.electronAPI.saveStore(state);
};

const originalLoadState = loadState;
loadState = async function () {
  const state = await window.electronAPI.loadStore();
  if (state) {
    playlist = state.playlist || [];
    currentIndex = state.currentIndex || -1;
    video.loop = loopToggle.checked = !!state.loop;

    // Load subtitle settings
    if (state.subtitleSettings) {
      Object.assign(subtitleSettings, state.subtitleSettings);

      // Update UI
      subtitleFontFamily.value = subtitleSettings.fontFamily;
      subtitleFontWeight.value = subtitleSettings.fontWeight;
      subtitleFontSize.value = subtitleSettings.fontSize;
      subtitleFontSizeValue.textContent = subtitleSettings.fontSize + "px";
      subtitleColor.value = subtitleSettings.color;
      subtitleStrokeWidth.value = subtitleSettings.strokeWidth;
      subtitleStrokeWidthValue.textContent = subtitleSettings.strokeWidth + "px";
      subtitleStrokeColor.value = subtitleSettings.strokeColor;
      subtitleBgEnabled.checked = subtitleSettings.bgEnabled;
      subtitleBgColor.value = subtitleSettings.bgColor;
      subtitleBgColor.disabled = !subtitleSettings.bgEnabled;
      subtitleBgOpacity.value = subtitleSettings.bgOpacity;
      subtitleBgOpacity.disabled = !subtitleSettings.bgEnabled;
      subtitleBgOpacityValue.textContent = subtitleSettings.bgOpacity + "%";

      updateSubtitleStyle();
    }

    // Restore subtitles
    if (state.subtitles) {
      for (const [videoSrc, subs] of Object.entries(state.subtitles)) {
        const subtitlesList = subs.map((sub) => {
          const blob = new Blob([sub.content], { type: "text/vtt;charset=UTF-8" });
          const blobUrl = URL.createObjectURL(blob);
          return {
            label: sub.label,
            content: sub.content,
            blobUrl: blobUrl,
          };
        });
        subtitlesMap.set(videoSrc, subtitlesList);
      }
    }

    renderPlaylist();
    if (currentIndex >= 0) playIndex(currentIndex);
  }
};

// Load system fonts
async function loadSystemFonts() {
  try {
    subtitleSettings.availableFonts = (await window.electronAPI.getInstalledFonts()) || [];

    // Clear and rebuild font select
    subtitleFontFamily.innerHTML = "";
    subtitleSettings.availableFonts.forEach((font) => {
      const option = document.createElement("option");
      option.value = font;
      option.textContent = font;
      option.style.fontFamily = font;
      subtitleFontFamily.appendChild(option);
    });

    // Set current font if it exists, otherwise first available font
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

// Font settings event handlers
if (subtitleFontWeight) {
  subtitleFontWeight.addEventListener("change", (e) => {
    subtitleSettings.fontWeight = e.target.value;
    updateSubtitleStyle();
    scheduleSave();
  });
}

// Update subtitle style for both preview and video
function updateSubtitleStyle() {
  // Update preview
  if (subtitlePreview) {
    subtitlePreview.style.fontFamily = subtitleSettings.fontFamily;
    subtitlePreview.style.fontWeight = subtitleSettings.fontWeight;
    subtitlePreview.style.fontSize = subtitleSettings.fontSize + "px";
    subtitlePreview.style.color = subtitleSettings.color;
    subtitlePreview.style.textShadow = `
      ${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
      -${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
      ${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
      -${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
      0 ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
      0 -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
      ${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor},
      -${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor}
    `;
    subtitlePreview.style.backgroundColor = subtitleSettings.bgEnabled
      ? subtitleSettings.bgColor +
        Math.round(subtitleSettings.bgOpacity * 2.55)
          .toString(16)
          .padStart(2, "0")
      : "transparent";
  }

  // Update video subtitles
  const style = document.createElement("style");
  const css = `
    ::cue {
      font-family: ${subtitleSettings.fontFamily};
      font-size: ${subtitleSettings.fontSize}px;
      font-weight: ${subtitleSettings.fontWeight};
      color: ${subtitleSettings.color};
      text-shadow: 
        ${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        -${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        ${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        -${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        0 ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        0 -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
        ${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor},
        -${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor};
      background-color: ${
        subtitleSettings.bgEnabled
          ? subtitleSettings.bgColor +
            Math.round(subtitleSettings.bgOpacity * 2.55)
              .toString(16)
              .padStart(2, "0")
          : "transparent"
      };
    }
  `;
  style.textContent = css;

  // Remove any existing subtitle style
  const existingStyle = document.querySelector("style[data-subtitle-style]");
  if (existingStyle) existingStyle.remove();

  // Add new style
  style.setAttribute("data-subtitle-style", "");
  document.head.appendChild(style);
}

// Default page: Now Playing
(function init() {
  // Initialize video controls
  video.controls = true;
  video.muted = false;
  video.loop = false;
  if (speedSelect) speedSelect.value = "1";

  // Initialize subtitle controls with defaults
  if (subtitleFontWeight) subtitleFontWeight.value = "400";
  if (subtitleFontSize) {
    subtitleFontSize.value = "24";
    if (subtitleFontSizeValue) subtitleFontSizeValue.textContent = "24px";
  }
  loadSystemFonts();
  loadState();
  updateMaximizeIcon();
})();
