const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

let model;
const ESP32_IP = "http://192.168.1.100"; // Replace with your ESP32 IP

// Setup camera
async function setupCamera() {
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" }, // Use rear camera on mobile
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await new Promise(resolve => (video.onloadedmetadata = resolve));
    video.play();
  } catch (err) {
    alert("⚠️ Unable to access camera. Please allow camera permissions.");
    console.error("Camera error:", err);
  }
}

// Load model
async function loadModel() {
  statusEl.innerText = "Loading weed detection model...";
  model = await tf.loadGraphModel('model/model.json');
  statusEl.innerText = "✅ Model loaded. Starting detection...";
}

// Run detection
async function detectFrame() {
  tf.engine().startScope();

  const input = tf.browser.fromPixels(video).expandDims(0);
  const predictions = await model.executeAsync(input);

  // Update below based on your model output
  const boxes = predictions[0].arraySync();
  const scores = predictions[1].arraySync();
  const classes = predictions[2].arraySync();

  drawResults(boxes, scores, classes);

  tf.engine().endScope();
  requestAnimationFrame(detectFrame);
}

// Draw bounding boxes
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
  try {
    await fetch(`${ESP32_IP}/pump/${on ? 'on' : 'off'}`);
    console.log(`Pump ${on ? 'ON' : 'OFF'}`);
  } catch (e) {
    console.warn("ESP32 not reachable:", e);
  }
}

// Init
(async function init() {
  await setupCamera();
  await loadModel();
  detectFrame();
})();
