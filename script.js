const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

let model;
const ESP32_IP = "http://192.168.1.100";  // <-- Replace with your ESP32 IP

// Initialize webcam
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
  });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

// Load model
async function loadModel() {
  statusEl.innerText = "Loading weed detection model...";
  model = await tf.loadGraphModel('model/model.json');
  statusEl.innerText = "Model loaded. Starting detection...";
}

// Run detection
async function detectFrame() {
  tf.engine().startScope();

  const input = tf.browser.fromPixels(video).expandDims(0);
  const predictions = await model.executeAsync(input);

  // === Example format (depends on your model) ===
  // Suppose your model outputs [boxes, scores, classes]
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
    if (scores[i] > 0.6 && classes[i] === 1) { // class 1 = weed
      const [ymin, xmin, ymax, xmax] = boxes[i];
      const x = xmin * canvas.width;
      const y = ymin * canvas.height;
      const width = (xmax - xmin) * canvas.width;
      const height = (ymax - ymin) * canvas.height;

      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      ctx.font = '16px Arial';
      ctx.fillStyle = 'red';
      ctx.fillText('Weed', x, y > 10 ? y - 5 : 10);
      weedDetected = true;
    }
  }

  if (weedDetected) {
    sendPumpSignal(true);
    statusEl.innerText = "🚨 Weed detected! Pump ON";
  } else {
    sendPumpSignal(false);
    statusEl.innerText = "✅ No weed detected";
  }
}

// Send signal to ESP32
let lastState = null;
async function sendPumpSignal(on) {
  if (on === lastState) return;
  lastState = on;
  const url = `${ESP32_IP}/pump/${on ? 'on' : 'off'}`;
  try {
    await fetch(url);
    console.log(`Pump ${on ? 'ON' : 'OFF'}`);
  } catch (e) {
    console.error("ESP32 not reachable:", e);
  }
}

// Initialize app
(async function init() {
  await setupCamera();
  video.play();
  await loadModel();
  detectFrame();
})();
