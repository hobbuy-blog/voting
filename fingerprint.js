// ============================================
// fingerprint.js - デバイスフィンガープリント機能 (LocalStorage版)
// ============================================

// デバイスフィンガープリント生成
async function generateFingerprint() {
  const components = [];
  
  components.push(navigator.userAgent);
  components.push(navigator.language);
  components.push(navigator.languages.join(','));
  components.push(screen.width + 'x' + screen.height);
  components.push(screen.colorDepth);
  components.push(screen.pixelDepth);
  components.push(new Date().getTimezoneOffset());
  components.push(navigator.platform);
  components.push(navigator.hardwareConcurrency || 0);
  components.push(navigator.deviceMemory || 0);
  components.push(navigator.maxTouchPoints || 0);
  
  const canvasFingerprint = await getCanvasFingerprint();
  components.push(canvasFingerprint);
  
  const webglFingerprint = getWebGLFingerprint();
  components.push(webglFingerprint);
  
  const fingerprint = await hashString(components.join('|||'));
  return fingerprint;
}

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

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// LocalStorage操作
function setLocalStorage(name, value) {
  try {
    localStorage.setItem(name, value);
  } catch (e) {
    console.error('LocalStorage保存エラー:', e);
  }
}

function getLocalStorage(name) {
  try {
    return localStorage.getItem(name);
  } catch (e) {
    console.error('LocalStorage取得エラー:', e);
    return null;
  }
}

function deleteLocalStorage(name) {
  try {
    localStorage.removeItem(name);
  } catch (e) {
    console.error('LocalStorage削除エラー:', e);
  }
}

// Firebaseで投票済みかチェック
async function hasVotedByFingerprint(voteId, fingerprint) {
  try {
    const votedFingerprintsRef = firebase.database().ref(`votes/${voteId}/votedFingerprints`);
    const snapshot = await votedFingerprintsRef.once('value');
    const votedFingerprints = snapshot.val() || {};
    
    for (let key in votedFingerprints) {
      if (votedFingerprints[key].fingerprint === fingerprint) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('投票チェックエラー:', error);
    return false;
  }
}

// フィンガープリントを記録
async function recordFingerprint(voteId, fingerprint) {
  try {
    const votedFingerprintsRef = firebase.database().ref(`votes/${voteId}/votedFingerprints`);
    await votedFingerprintsRef.push({
      fingerprint: fingerprint,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('フィンガープリント記録エラー:', error);
  }
}

function showLoadingMessage() {
  const msg = document.createElement('div');
  msg.id = 'fingerprint-loading';
  msg.textContent = '投票状況を確認中...';
  const choices = document.getElementById('choices');
  if (choices) {
    choices.parentElement.insertBefore(msg, choices);
  } else {
    document.body.appendChild(msg);
  }
}

function hideLoadingMessage() {
  const msg = document.getElementById('fingerprint-loading');
  if (msg) msg.remove();
}

function showAlreadyVotedMessage() {
  const message = document.createElement('div');
  message.id = 'already-voted-message';
  message.innerHTML = `
    ⚠️ 既に投票済みです<br>
    <small style="font-weight: normal; font-size: 0.9em;">
      このデバイスから既に投票が完了しています
    </small>
  `;
  const choices = document.getElementById('choices');
  if (choices && choices.parentElement) {
    choices.parentElement.insertBefore(message, choices);
  } else {
    document.body.appendChild(message);
  }
}

// 投票UIの初期化（LocalStorage優先版）
async function initVotingUIWithFingerprint(voteId) {
  showLoadingMessage();
  
  // フィンガープリント生成
  const fingerprint = await generateFingerprint();
  
  // LocalStorage チェック（優先）
  const localStorageVoted = getLocalStorage(`voted_${voteId}`) === 'true';
  
  // Firebase チェック（補助）
  const fingerprintVoted = await hasVotedByFingerprint(voteId, fingerprint);
  
  // LocalStorageを優先：LocalStorageが投票済みなら必ずブロック
  // LocalStorageが未投票でもFirebaseが投票済みならブロック
  const hasVoted = localStorageVoted;
  
  hideLoadingMessage();
  
  if (hasVoted) {
    showAlreadyVotedMessage();
  }
  
  return { fingerprint, hasVoted };
}
