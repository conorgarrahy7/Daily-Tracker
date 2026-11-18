/* Daily Tracker v3.1 experimental iOS PWA camera patch
   Add this AFTER html5-qrcode and AFTER your existing app script, or merge the functions below.
*/
let dtNativeStream = null;
let dtNativeVideo = null;
let dtNativeTimer = null;

function dtIsStandaloneIOS() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return ios && standalone;
}

async function dtStopNativeCamera() {
  if (dtNativeTimer) { clearTimeout(dtNativeTimer); dtNativeTimer = null; }
  if (dtNativeVideo) {
    try { dtNativeVideo.pause(); } catch (_) {}
    dtNativeVideo.srcObject = null;
    dtNativeVideo.remove();
    dtNativeVideo = null;
  }
  if (dtNativeStream) {
    dtNativeStream.getTracks().forEach(t => t.stop());
    dtNativeStream = null;
  }
}

async function dtStartIOSCamera() {
  const status = document.getElementById('liveStatus');
  const host = document.getElementById('reader');
  await dtStopNativeCamera();
  host.innerHTML = '';
  status.textContent = 'Starting iPhone rear camera...';

  try {
    // This call is deliberately made directly from the user's tap handler.
    dtNativeStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.autoplay = true;
    video.controls = false;
    video.style.width = '100%';
    video.style.minHeight = '260px';
    video.style.objectFit = 'cover';
    video.style.background = '#000';
    video.style.borderRadius = '12px';
    video.srcObject = dtNativeStream;
    host.appendChild(video);
    dtNativeVideo = video;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Camera video timeout')), 2500);
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          clearTimeout(timeout);
          resolve();
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      };
    });

    // iOS can report a live MediaStream while rendering no video.
    await new Promise(r => setTimeout(r, 350));
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      throw new Error('Camera stream opened but video did not become playable');
    }

    status.textContent = 'Camera ready. Starting barcode reader...';

    // Release direct probe first. html5-qrcode now gets a clean camera session.
    await dtStopNativeCamera();
    await new Promise(r => setTimeout(r, 250));

    scanner = scanner || new Html5Qrcode('reader');
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 8,
        qrbox: { width: 280, height: 150 },
        aspectRatio: 1.777778,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ]
      },
      async code => {
        status.textContent = 'Barcode: ' + code;
        await stopLive();
        lookupProduct(code, 'live');
      },
      () => {}
    );

    // If WebKit kills the stream shortly after startup, fall back rather than hang.
    dtNativeTimer = setTimeout(() => {
      const videoEl = host.querySelector('video');
      if (!videoEl || videoEl.readyState < 2) dtCameraFallback();
    }, 2200);
  } catch (err) {
    console.warn('iOS PWA camera probe failed:', err);
    await dtStopNativeCamera();
    dtCameraFallback();
  }
}

function dtCameraFallback() {
  const status = document.getElementById('liveStatus');
  status.textContent = 'iOS stopped the live camera. Opening the reliable photo scanner instead...';
  try { if (liveDlg.open) liveDlg.close(); } catch (_) {}
  setTimeout(() => openPhotoScan(), 250);
}

// Override v3 live-camera button behavior.
async function startLive() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    dtCameraFallback();
    return;
  }
  if (dtIsStandaloneIOS()) {
    await dtStartIOSCamera();
    return;
  }
  if (typeof Html5Qrcode === 'undefined') {
    liveStatus.textContent = 'Scanner library unavailable.';
    return;
  }
  try {
    scanner = scanner || new Html5Qrcode('reader');
    liveStatus.textContent = 'Starting camera...';
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 150 } },
      async code => {
        liveStatus.textContent = 'Barcode: ' + code;
        await stopLive();
        lookupProduct(code, 'live');
      },
      () => {}
    );
  } catch (e) {
    liveStatus.textContent = 'Live camera failed. Opening photo scanner...';
    setTimeout(dtCameraFallback, 500);
  }
}

// Wrap existing stopLive so every possible camera track is destroyed.
const dtOldStopLive = typeof stopLive === 'function' ? stopLive : null;
stopLive = async function() {
  await dtStopNativeCamera();
  if (dtOldStopLive) {
    try { await dtOldStopLive(); } catch (_) {}
  }
};
