// ---- Config, mirrors the Python script's parameters ----
const CASCADE_URL = 'cascade.xml';   // same directory as this HTML file
const SCALE_FACTOR = 1.3;
const MIN_NEIGHBORS = 5;
const PROCESS_WIDTH = 500; // matches imutils.resize(frame, width=500)

let cvReady = false;
let classifier = null;
let stream = null;
let running = false;
let gunEverDetected = false;
let detectionCount = 0;

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const detectorState = document.getElementById('detectorState');
const gunStatus = document.getElementById('gunStatus');
const detCount = document.getElementById('detCount');
const logEl = document.getElementById('log');
const titlebar = document.getElementById('titlebar');
const scanline = document.getElementById('scanline');
const clockEl = document.getElementById('clock');

startBtn.disabled = true; // enabled once cascade is loaded

setInterval(() => {
  clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
}, 1000);

function logLine(text, isHit = false) {
  const div = document.createElement('div');
  if (isHit) div.className = 'hit';
  const t = new Date().toLocaleTimeString('en-US', { hour12: false });
  div.textContent = `[${t}] ${text}`;
  logEl.prepend(div);
}

// ---- OpenCV.js bootstrap ----
function onOpenCvReady() {
  cv['onRuntimeInitialized'] = () => {
    cvReady = true;
    detectorState.textContent = 'Ready';
    logLine('OpenCV.js runtime initialized.');
    loadCascade();
  };
}

function loadCascade() {
  fetch(CASCADE_URL)
    .then(r => {
      if (!r.ok) throw new Error('cascade.xml not found next to this HTML file');
      return r.arrayBuffer();
    })
    .then(buf => {
      cv.FS_createDataFile('/', 'cascade.xml', new Uint8Array(buf), true, false, false);
      classifier = new cv.CascadeClassifier();
      classifier.load('cascade.xml');
      logLine('Cascade classifier loaded.');
      startBtn.disabled = false;
    })
    .catch(err => {
      logLine('Cascade load failed: ' + err.message, true);
      detectorState.textContent = 'No Model';
    });
}

// ---- Camera + detection loop, mirrors the Python while-loop ----
async function startFeed() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (err) {
    logLine('Camera error: ' + err.message, true);
    return;
  }
  video.srcObject = stream;
  await video.play();

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  running = true;
  gunEverDetected = false;
  detectionCount = 0;
  detCount.textContent = '0';
  gunStatus.textContent = 'Not Detected';
  gunStatus.className = 'value clear';
  titlebar.classList.add('live');
  scanline.style.display = 'block';
  startBtn.disabled = true;
  stopBtn.disabled = false;
  logLine('Feed started.');

  requestAnimationFrame(processFrame);
}

function stopFeed() {
  running = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  titlebar.classList.remove('live');
  scanline.style.display = 'none';
  startBtn.disabled = false;
  stopBtn.disabled = true;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  logLine(gunEverDetected ? 'Feed stopped. Gun was detected during session.' : 'Feed stopped. No gun detected.');
}

function processFrame() {
  if (!running) return;

  if (cvReady && classifier && video.videoWidth > 0) {
    // Draw current video frame to a working canvas at reduced width (like imutils.resize width=500)
    const scale = PROCESS_WIDTH / video.videoWidth;
    const w = PROCESS_WIDTH;
    const h = Math.round(video.videoHeight * scale);

    const work = document.createElement('canvas');
    work.width = w; work.height = h;
    work.getContext('2d').drawImage(video, 0, 0, w, h);

    const src = cv.imread(work);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const detections = new cv.RectVector();
    const msize = new cv.Size(100, 100); // minSize=(100,100)
    classifier.detectMultiScale(gray, detections, SCALE_FACTOR, MIN_NEIGHBORS, 0, msize);

    octx.clearRect(0, 0, overlay.width, overlay.height);
    const drawScale = overlay.width / w;

    if (detections.size() > 0) {
      gunEverDetected = true;
      detectionCount += detections.size();
      detCount.textContent = detectionCount;
      gunStatus.textContent = 'Gun Detected';
      gunStatus.className = 'value alert';
      logLine(`Detection: ${detections.size()} object(s) flagged.`, true);
    } else {
      gunStatus.textContent = gunEverDetected ? 'Gun Detected (session)' : 'Not Detected';
    }

    octx.strokeStyle = '#ff4d33';
    octx.lineWidth = 2;
    for (let i = 0; i < detections.size(); i++) {
      const r = detections.get(i);
      octx.strokeRect(r.x * drawScale, r.y * drawScale, r.width * drawScale, r.height * drawScale);
    }

    src.delete(); gray.delete(); detections.delete();
  }

  requestAnimationFrame(processFrame);
}

startBtn.addEventListener('click', startFeed);
stopBtn.addEventListener('click', stopFeed);
