const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const settingsBtn = document.getElementById('settingsBtn');
const modal = document.getElementById('settingsModal');
const closeModal = document.getElementById('closeModal');
const checkBtn = document.getElementById('checkBtn');
const espStatusEl = document.getElementById('espStatus');
const espIpEl = document.getElementById('espIp');
const pumpStatusEl = document.getElementById('pumpStatus');

let model;
let detectionRunning = false;
let pumpOn = false;
const ESP32_IP = "http://192.168.1.100"; // Replace with your ESP32 IP
const ESP_NAME = "ESP32_WeedPump";

// Setup camera
async function setupCamera() {
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  video.play();
}

// Load TensorFlow.js model
async function loadModel() {
  statusEl.innerText = "Loading weed detection model...";
  model = await tf.loadGraphModel('model/model.json');
  statusEl.innerText = "✅ Model loaded. Press Start Detection.";
}

// Main detection loop
async function detectFrame() {
  if (!detectionRunning) return;
  tf.engine().startScope();

  const input = tf.browser.fromPixels(video).expandDims(0);
  const predictions = await model.executeAsync(input);

  const boxes = predictions[0].arraySync();
  const scores = predictions[1].arraySync();
  const classes = predictions[2].arraySync();

  drawResults(boxes, scores, classes);

  tf.engine().endScope();
  if (detectionRunning) requestAnimationFrame(detectFrame);
}

// Draw results on canvas
function drawResults(boxes, scores, classes) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let weedDetected = false;

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > 0.6 && classes[i] === 1) {
      const [ymin, xmin, ymax, xmax] = boxes[i];
      const x = xmin * canvas.width;
      const y = ymin * canvas.height;
      const width = (xmax - xmin) * canvas.width;
      const height = (ymax - ymin) * canvas.height;

      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = 'red';
      ctx.font = '16px Arial';
      ctx.fillText('Weed', x, y > 10 ? y - 5 : 10);

      weedDetected = true;
    }
  }

  if (weedDetected) {
    sendPumpSignal(true);
    statusEl.innerText = "🚨 Weed detected! Pump ON";
    statusEl.style.color = "red";
  } else {
    sendPumpSignal(false);
    statusEl.innerText = "✅ No weed detected";
    statusEl.style.color = "#2e7d32";
  }
}

// Send signal to ESP32
let lastState = null;
async function sendPumpSignal(on) {
  if (on === lastState) return;
  lastState = on;
  pumpOn = on;
  updateModalPumpStatus();

  try {
    await fetch(`${ESP32_IP}/pump/${on ? 'on' : 'off'}`);
  } catch (e) {
    console.warn("ESP32 not reachable:", e);
  }
}

// ESP connection check
async function checkESPConnection() {
  espIpEl.innerText = ESP32_IP;
  espStatusEl.innerText = "⏳ Checking...";
  try {
    const res = await fetch(`${ESP32_IP}`);
    if (res.ok) {
      espStatusEl.innerText = "✅ Online";
      espStatusEl.style.color = "green";
    } else {
      espStatusEl.innerText = "❌ Offline";
      espStatusEl.style.color = "red";
    }
  } catch (e) {
    espStatusEl.innerText = "❌ Offline";
    espStatusEl.style.color = "red";
  }
  updateModalPumpStatus();
}

// Modal functions
function openModal() {
  modal.style.display = 'block';
  document.getElementById('espName').innerText = ESP_NAME;
  checkESPConnection();
}

function closeModalWindow() {
  modal.style.display = 'none';
}

function updateModalPumpStatus() {
  pumpStatusEl.innerText = pumpOn ? "ON" : "OFF";
  pumpStatusEl.style.color = pumpOn ? "red" : "black";
}

// Event listeners
settingsBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalWindow);
checkBtn.addEventListener('click', checkESPConnection);

startBtn.addEventListener('click', async () => {
  if (detectionRunning) {
    detectionRunning = false;
    startBtn.innerText = "▶️ Start Detection";
    statusEl.innerText = "⏸ Detection stopped.";
    sendPumpSignal(false);
  } else {
    detectionRunning = true;
    startBtn.innerText = "⏹ Stop Detection";
    statusEl.innerText = "Starting camera...";
    await setupCamera();
    await loadModel();
    detectFrame();
  }
});

// Close modal when clicking outside
window.onclick = function(event) {
  if (event.target == modal) modal.style.display = "none";
};
