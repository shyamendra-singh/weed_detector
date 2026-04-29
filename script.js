const screens = {
  splash: document.getElementById("screenSplash"),
  home: document.getElementById("screenHome"),
  history: document.getElementById("screenHistory"),
  report: document.getElementById("screenReport")
};

const navItems = [...document.querySelectorAll(".nav-item")];
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeModal = document.getElementById("closeModal");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

const progressBar = document.getElementById("progressBar");
const progressValue = document.getElementById("progressValue");
const splashHint = document.getElementById("splashHint");

const video = document.getElementById("video");
const analysisCanvas = document.getElementById("analysisCanvas");
const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true });
const cameraFrame = document.getElementById("cameraFrame");
const feedOverlay = document.getElementById("feedOverlay");
const boxesLayer = document.getElementById("boxesLayer");
const fpsBadge = document.getElementById("fpsBadge");

const weedCountEl = document.getElementById("weedCount");
const pumpCountEl = document.getElementById("pumpCount");
const uptimeValueEl = document.getElementById("uptimeValue");
const pumpPill = document.getElementById("pumpPill");
const toggleDetectionBtn = document.getElementById("toggleDetectionBtn");
const stopSessionBtn = document.getElementById("stopSessionBtn");

const historyList = document.getElementById("historyList");

const reportTimestamp = document.getElementById("reportTimestamp");
const reportWeeds = document.getElementById("reportWeeds");
const reportPumps = document.getElementById("reportPumps");
const reportRuntime = document.getElementById("reportRuntime");
const reportArea = document.getElementById("reportArea");
const avgConfidence = document.getElementById("avgConfidence");
const confidenceLabel = document.getElementById("confidenceLabel");
const highPct = document.getElementById("highPct");
const midPct = document.getElementById("midPct");
const lowPct = document.getElementById("lowPct");
const confidenceRing = document.getElementById("confidenceRing");
const reportChart = document.getElementById("reportChart");
const downloadReportBtn = document.getElementById("downloadReportBtn");
const newSessionBtn = document.getElementById("newSessionBtn");

const ipInput = document.getElementById("ipInput");
const ipLabel = document.getElementById("ipLabel");
const connectionStatus = document.getElementById("connectionStatus");
const pingValue = document.getElementById("pingValue");
const confidenceSlider = document.getElementById("confidenceSlider");
const confidenceValue = document.getElementById("confidenceValue");
const maxDetectionsInput = document.getElementById("maxDetections");

const state = {
  currentScreen: "screenHome",
  sessionStartedAt: null,
  sessionEndedAt: null,
  elapsedMs: 0,
  running: true,
  paused: false,
  stream: null,
  detections: [],
  detectionCount: 0,
  pumpCount: 0,
  pumpOn: false,
  history: [],
  chartPoints: [0, 14, 18, 26, 35, 31, 39, 47, 49, 37, 46, 53, 44],
  confidenceSamples: [],
  frameCounter: 0,
  lastAnalyzeAt: 0,
  fps: 18.6,
  settings: {
    ip: ipInput.value,
    threshold: Number(confidenceSlider.value),
    maxDetections: Number(maxDetectionsInput.value)
  }
};

const splashMessages = [
  "Calibrating field vision pipeline...",
  "Synchronizing ESP32 pump control...",
  "Building crop and weed profile map...",
  "Optimizing detection thresholds..."
];

function setActiveScreen(screenId) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  if (screenId === "screenSplash") {
    screens.splash.classList.add("active");
  } else if (screenId === "screenHome") {
    screens.home.classList.add("active");
  } else if (screenId === "screenHistory") {
    screens.history.classList.add("active");
  } else if (screenId === "screenReport") {
    screens.report.classList.add("active");
  }

  navItems.forEach((item) => {
    const active = item.dataset.screen === screenId;
    item.classList.toggle("active", active);
  });

  if (screenId === "screenSplash") {
    navItems.forEach((item) => item.classList.remove("active"));
  }

  state.currentScreen = screenId;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function setPumpState(on) {
  if (state.pumpOn === on) {
    return;
  }

  state.pumpOn = on;
  pumpPill.classList.toggle("active", on);
  pumpPill.innerHTML = `<span class="drop">DROP</span><strong>PUMP: ${on ? "ON" : "OFF"}</strong>`;

  if (on) {
    state.pumpCount += 1;
    addHistoryEvent("Pump Triggered", "Spray pulse fired on dense weed patch");
  }

  updateStats();
}

function updateStats() {
  weedCountEl.textContent = state.detectionCount;
  pumpCountEl.textContent = state.pumpCount;
  uptimeValueEl.textContent = formatDuration(state.elapsedMs);
}

function addHistoryEvent(title, detail) {
  const item = {
    title,
    detail,
    time: formatDate(new Date())
  };
  state.history.unshift(item);
  renderHistory();
}

function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = `
      <div class="history-item">
        <div>
          <strong>Session booted</strong>
          <span>Device handshake and demo pipeline initialized.</span>
        </div>
        <span>${formatDate(new Date())}</span>
      </div>
    `;
    return;
  }

  historyList.innerHTML = state.history
    .slice(0, 8)
    .map(
      (item) => `
        <div class="history-item">
          <div>
            <strong>${item.title}</strong>
            <span>${item.detail}</span>
          </div>
          <span>${item.time}</span>
        </div>
      `
    )
    .join("");
}

function updateReport() {
  const sampleCount = state.confidenceSamples.length || 1;
  const averageConfidence =
    state.confidenceSamples.reduce((sum, value) => sum + value, 0) / sampleCount;
  const high = state.confidenceSamples.filter((v) => v >= 0.75).length;
  const med = state.confidenceSamples.filter((v) => v >= state.settings.threshold && v < 0.75).length;
  const low = Math.max(0, state.confidenceSamples.length - high - med);
  const areaCovered = Math.max(0.08, state.elapsedMs / 1000 / 190);

  reportTimestamp.textContent = formatDate(state.sessionEndedAt || new Date());
  reportWeeds.textContent = state.detectionCount;
  reportPumps.textContent = state.pumpCount;
  reportRuntime.textContent = formatDuration(state.elapsedMs);
  reportArea.textContent = `${areaCovered.toFixed(2)} ha`;
  avgConfidence.textContent = averageConfidence.toFixed(2);

  let label = "Medium";
  if (averageConfidence >= 0.75) {
    label = "High";
  } else if (averageConfidence < 0.5) {
    label = "Low";
  }
  confidenceLabel.textContent = label;

  const highShare = Math.round((high / sampleCount) * 100);
  const medShare = Math.round((med / sampleCount) * 100);
  const lowShare = Math.max(0, 100 - highShare - medShare);
  highPct.textContent = `${highShare}%`;
  midPct.textContent = `${medShare}%`;
  lowPct.textContent = `${lowShare}%`;

  const progressAngle = Math.max(10, Math.min(averageConfidence * 360, 360));
  confidenceRing.style.background = `conic-gradient(#23932c 0deg ${progressAngle}deg, #e8eee7 ${progressAngle}deg 360deg)`;

  renderChart();
}

function renderChart() {
  const values = state.chartPoints.slice(-13);
  const width = 360;
  const height = 150;
  const paddingX = 18;
  const paddingY = 16;
  const max = Math.max(60, ...values);
  const stepX = (width - paddingX * 2) / Math.max(values.length - 1, 1);

  const points = values
    .map((value, index) => {
      const x = paddingX + index * stepX;
      const y = height - paddingY - (value / max) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const circles = values
    .map((value, index) => {
      const x = paddingX + index * stepX;
      const y = height - paddingY - (value / max) * (height - paddingY * 2);
      return `<circle cx="${x}" cy="${y}" r="3.4" fill="#17792f"></circle>`;
    })
    .join("");

  const grid = [0, 15, 30, 45, 60]
    .map((value) => {
      const y = height - paddingY - (value / max) * (height - paddingY * 2);
      return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="#dfe8de" stroke-dasharray="3 3"></line>
      <text x="2" y="${y + 4}" font-size="10" fill="#66756d">${value}</text>`;
    })
    .join("");

  reportChart.innerHTML = `
    ${grid}
    <polyline points="${points}" fill="none" stroke="#17792f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${circles}
  `;
}

function renderDetections(detections) {
  state.detections = detections;
  boxesLayer.innerHTML = detections
    .map(
      (detection, index) => {
        const left = Math.max(0, Math.min(100, detection.x));
        const top = Math.max(0, Math.min(100, detection.y));
        const width = Math.max(4, Math.min(100 - left, detection.w));
        const height = Math.max(4, Math.min(100 - top, detection.h));
        const confidence = detection.confidence.toFixed(2);

        return `
        <div class="detection-box" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;">
          <div class="detection-label">weed ${index + 1} | ${confidence}</div>
          <div class="detection-corners" aria-hidden="true"></div>
          <div class="detection-center" aria-hidden="true"></div>
        </div>
      `;
      }
    )
    .join("");
}

function analyzeFallbackScene() {
  const base = [
    { x: 2, y: 40, w: 22, h: 17, confidence: 0.94 },
    { x: 33, y: 14, w: 24, h: 16, confidence: 0.92 },
    { x: 69, y: 27, w: 22, h: 18, confidence: 0.89 },
    { x: 34, y: 54, w: 20, h: 22, confidence: 0.96 },
    { x: 69, y: 76, w: 20, h: 18, confidence: 0.9 }
  ];

  const offset = Math.sin(state.frameCounter / 8) * 1.2;
  return base.slice(0, state.settings.maxDetections).map((box, index) => ({
    ...box,
    x: box.x + ((index % 2 === 0 ? 1 : -1) * offset),
    y: box.y + ((index % 3 === 0 ? -1 : 1) * offset * 0.4)
  }));
}

function analyzeVideoForGreenZones() {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    return [];
  }

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  analysisCtx.drawImage(video, 0, 0, width, height);

  const cols = 4;
  const rows = 5;
  const tileWidth = Math.floor(width / cols);
  const tileHeight = Math.floor(height / rows);
  const candidates = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const sx = col * tileWidth;
      const sy = row * tileHeight;
      const sw = col === cols - 1 ? width - sx : tileWidth;
      const sh = row === rows - 1 ? height - sy : tileHeight;
      const { data } = analysisCtx.getImageData(sx, sy, sw, sh);

      let greenScore = 0;
      let brightness = 0;
      for (let i = 0; i < data.length; i += 32) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        brightness += (r + g + b) / 3;
        greenScore += Math.max(0, g - (r * 0.72 + b * 0.5));
      }

      const sampleCount = data.length / 32;
      const normalizedGreen = greenScore / sampleCount / 255;
      const normalizedBrightness = brightness / sampleCount / 255;

      if (normalizedGreen > 0.08 && normalizedBrightness > 0.16) {
        const confidence = Math.min(0.98, 0.5 + normalizedGreen * 1.55);
        candidates.push({
          x: (sx / width) * 100,
          y: (sy / height) * 100,
          w: (sw / width) * 100,
          h: (sh / height) * 100,
          confidence
        });
      }
    }
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate) => candidate.confidence >= state.settings.threshold)
    .slice(0, state.settings.maxDetections);
}

function updateDetectionLoop(now) {
  if (!state.running) {
    return;
  }

  if (state.paused) {
    requestAnimationFrame(updateDetectionLoop);
    return;
  }

  state.frameCounter += 1;

  if (!state.lastAnalyzeAt) {
    state.lastAnalyzeAt = now;
  }

  const delta = now - state.lastAnalyzeAt;
  if (delta > 600) {
    const detections =
      state.stream && video.readyState >= 2 ? analyzeVideoForGreenZones() : analyzeFallbackScene();
    state.lastAnalyzeAt = now;
    state.fps = 17 + Math.random() * 3.6;
    fpsBadge.textContent = `FPS: ${state.fps.toFixed(1)}`;

    renderDetections(detections);

    if (detections.length) {
      state.detectionCount += detections.length;
      const average = detections.reduce((sum, item) => sum + item.confidence, 0) / detections.length;
      state.confidenceSamples.push(average);
      state.chartPoints.push(Math.min(58, Math.round(average * 52 + detections.length * 3)));
      addHistoryEvent(
        `${detections.length} weed cluster${detections.length > 1 ? "s" : ""} detected`,
        `Confidence ${average.toFixed(2)} across active crop frame`
      );
      setPumpState(true);
    } else {
      state.chartPoints.push(Math.max(4, state.chartPoints[state.chartPoints.length - 1] - 5));
      setPumpState(false);
    }

    updateStats();
    updateReport();
  }

  requestAnimationFrame(updateDetectionLoop);
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 960 },
        height: { ideal: 720 }
      }
    });
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    cameraFrame.classList.add("camera-live");
    addHistoryEvent("Camera Live", "Using rear camera feed for green-density analysis");
  } catch (error) {
    state.stream = null;
    cameraFrame.classList.remove("camera-live");
    addHistoryEvent("Fallback Simulation", "Camera unavailable, running demo field playback");
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  video.srcObject = null;
  cameraFrame.classList.remove("camera-live");
}

function resetSession() {
  state.sessionStartedAt = new Date();
  state.sessionEndedAt = null;
  state.elapsedMs = 0;
  state.running = true;
  state.paused = false;
  state.detectionCount = 0;
  state.pumpCount = 0;
  state.pumpOn = false;
  state.detections = [];
  state.chartPoints = [0, 14, 18, 26, 35, 31, 39, 47, 49, 37, 46, 53, 44];
  state.confidenceSamples = [0.78, 0.82, 0.85];
  state.lastAnalyzeAt = 0;
  state.frameCounter = 0;
  boxesLayer.innerHTML = "";
  feedOverlay.classList.add("hidden");
  updateStats();
  updateReport();
}

function finishSession() {
  state.running = false;
  state.paused = true;
  state.sessionEndedAt = new Date();
  renderDetections([]);
  setPumpState(false);
  stopCamera();
  updateReport();
  setActiveScreen("screenReport");
}

function startUptimeClock() {
  setInterval(() => {
    if (!state.sessionStartedAt) {
      return;
    }

    if (!state.running || state.paused) {
      return;
    }

    state.elapsedMs = Date.now() - state.sessionStartedAt.getTime();
    updateStats();
  }, 1000);
}

function beginSplashSequence() {
  let step = 0;
  const sequence = window.setInterval(() => {
    step += 1;
    const progress = Math.min(100, step * 14);
    progressBar.style.width = `${progress}%`;
    progressValue.textContent = `${progress}%`;
    splashHint.textContent = splashMessages[Math.min(splashMessages.length - 1, Math.floor(step / 2))];

    if (progress >= 100) {
      window.clearInterval(sequence);
      setTimeout(async () => {
        setActiveScreen("screenHome");
        feedOverlay.classList.remove("hidden");
        await startCamera();
        resetSession();
        addHistoryEvent("System Ready", "Autonomous weed detection session started");
        requestAnimationFrame(updateDetectionLoop);
      }, 400);
    }
  }, 340);
}

function openSettings() {
  settingsModal.classList.add("open");
}

function closeSettings() {
  settingsModal.classList.remove("open");
}

function saveSettings() {
  state.settings.ip = ipInput.value.trim() || "192.168.4.1";
  state.settings.threshold = Number(confidenceSlider.value);
  state.settings.maxDetections = Math.max(1, Math.min(10, Number(maxDetectionsInput.value) || 5));
  ipLabel.textContent = state.settings.ip;
  pingValue.textContent = `Last ping: ${28 + Math.floor(Math.random() * 12)} ms`;
  connectionStatus.textContent = "Connected";
  addHistoryEvent("Settings Saved", `Threshold ${state.settings.threshold.toFixed(2)}, max detections ${state.settings.maxDetections}`);
  closeSettings();
}

function bindEvents() {
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      if (item.dataset.screen === "settings") {
        openSettings();
        return;
      }
      setActiveScreen(item.dataset.screen);
    });
  });

  settingsBtn.addEventListener("click", openSettings);
  closeModal.addEventListener("click", closeSettings);
  cancelSettingsBtn.addEventListener("click", closeSettings);
  saveSettingsBtn.addEventListener("click", saveSettings);

  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
      closeSettings();
    }
  });

  confidenceSlider.addEventListener("input", () => {
    confidenceValue.value = Number(confidenceSlider.value).toFixed(2);
  });

  toggleDetectionBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    toggleDetectionBtn.innerHTML = state.paused
      ? `<span>PLAY</span><span>Resume Detection</span>`
      : `<span>||</span><span>Pause Detection</span>`;

    feedOverlay.classList.toggle("hidden", !state.paused);
    if (state.paused) {
      renderDetections([]);
      feedOverlay.innerHTML = `<img src="logo1.png" alt="VARDAN" /><p>Detection paused. Resume when the field is back in view.</p>`;
      setPumpState(false);
      addHistoryEvent("Detection Paused", "Operator paused real-time scan");
    } else {
      feedOverlay.innerHTML = `<img src="logo1.png" alt="VARDAN" /><p>Starting field camera and weed model...</p>`;
      feedOverlay.classList.add("hidden");
      state.sessionStartedAt = new Date(Date.now() - state.elapsedMs);
      addHistoryEvent("Detection Resumed", "Real-time scan returned to active state");
    }
  });

  stopSessionBtn.addEventListener("click", finishSession);

  newSessionBtn.addEventListener("click", async () => {
    stopCamera();
    resetSession();
    await startCamera();
    addHistoryEvent("New Session", "Fresh run launched after report review");
    toggleDetectionBtn.innerHTML = `<span>||</span><span>Pause Detection</span>`;
    feedOverlay.innerHTML = `<img src="logo1.png" alt="VARDAN" /><p>Starting field camera and weed model...</p>`;
    setActiveScreen("screenHome");
    requestAnimationFrame(updateDetectionLoop);
  });

  downloadReportBtn.addEventListener("click", () => {
    addHistoryEvent("Report Downloaded", "Dummy PDF export requested by operator");
    downloadReportBtn.textContent = "Report Saved";
    setTimeout(() => {
      downloadReportBtn.textContent = "Download Report";
    }, 1800);
  });
}

renderHistory();
updateStats();
updateReport();
bindEvents();
startUptimeClock();
beginSplashSequence();
