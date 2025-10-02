// ============================================
// fingerprint-en.js - Device Fingerprint (English Version)
// ============================================

// Generate device fingerprint
async function generateFingerprint() {
  const components = [];
  
  // 1. User Agent
  components.push(navigator.userAgent);
  
  // 2. Language settings
  components.push(navigator.language);
  components.push(navigator.languages.join(','));
  
  // 3. Screen resolution
  components.push(screen.width + 'x' + screen.height);
  components.push(screen.colorDepth);
  components.push(screen.pixelDepth);
  
  // 4. Timezone
  components.push(new Date().getTimezoneOffset());
  
  // 5. Platform
  components.push(navigator.platform);
  
  // 6. Hardware concurrency (CPU cores)
  components.push(navigator.hardwareConcurrency || 0);
  
  // 7. Device memory
  components.push(navigator.deviceMemory || 0);
  
  // 8. Touch support
  components.push(navigator.maxTouchPoints || 0);
  
  // 9. Canvas fingerprint
  const canvasFingerprint = await getCanvasFingerprint();
  components.push(canvasFingerprint);
  
  // 10. WebGL fingerprint
  const webglFingerprint = getWebGLFingerprint();
  components.push(webglFingerprint);
  
  // Combine all components and hash
  const fingerprint = await hashString(components.join('|||'));
  return fingerprint;
}

// Canvas fingerprint
async function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Canvas Fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Canvas Fingerprint', 4, 17);
    
    const dataURL = canvas.toDataURL();
    return await hashString(dataURL);
  } catch (e) {
    return 'canvas-error';
  }
}

// WebGL fingerprint
function getWebGLFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) return 'no-webgl';
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    return vendor + '|||' + renderer;
  } catch (e) {
    return 'webgl-error';
  }
}

// Hash string (SHA-256)
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Cookie operations
function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + date.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// Check if already voted via Firebase
async function hasVotedByFingerprint(voteId, fingerprint) {
  try {
    const votedFingerprintsRef = firebase.database().ref(`votes/${voteId}/votedFingerprints`);
    const snapshot = await votedFingerprintsRef.once('value');
    const votedFingerprints = snapshot.val() || {};
    
    // Check if fingerprint is already recorded
    for (let key in votedFingerprints) {
      if (votedFingerprints[key].fingerprint === fingerprint) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Vote check error:', error);
    return false;
  }
}

// Record fingerprint
async function recordFingerprint(voteId, fingerprint) {
  try {
    const votedFingerprintsRef = firebase.database().ref(`votes/${voteId}/votedFingerprints`);
    await votedFingerprintsRef.push({
      fingerprint: fingerprint,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Fingerprint record error:', error);
  }
}

// Show loading message
function showLoadingMessage() {
  const msg = document.createElement('div');
  msg.id = 'fingerprint-loading';
  msg.textContent = 'Checking voting status...';
  const choices = document.getElementById('choices');
  if (choices) {
    choices.parentElement.insertBefore(msg, choices);
  } else {
    document.body.appendChild(msg);
  }
}

// Hide loading message
function hideLoadingMessage() {
  const msg = document.getElementById('fingerprint-loading');
  if (msg) msg.remove();
}

// Show already voted message
function showAlreadyVotedMessage() {
  const message = document.createElement('div');
  message.id = 'already-voted-message';
  message.innerHTML = `
    ⚠️ You have already voted<br>
    <small style="font-weight: normal; font-size: 0.9em;">
      This device has already completed voting
    </small>
  `;
  const choices = document.getElementById('choices');
  if (choices && choices.parentElement) {
    choices.parentElement.insertBefore(message, choices);
  } else {
    document.body.appendChild(message);
  }
}

// Initialize voting UI with fingerprint
async function initVotingUIWithFingerprint(voteId) {
  showLoadingMessage();
  
  // Generate fingerprint
  const fingerprint = await generateFingerprint();
  
  // Cookie check (fast)
  const cookieVoted = getCookie(`voted_${voteId}`) === 'true';
  
  // Firebase check (reliable)
  const fingerprintVoted = await hasVotedByFingerprint(voteId, fingerprint);
  
  const hasVoted = cookieVoted || fingerprintVoted;
  
  hideLoadingMessage();
  
  if (hasVoted) {
    showAlreadyVotedMessage();
  }
  
  return { fingerprint, hasVoted };
}
