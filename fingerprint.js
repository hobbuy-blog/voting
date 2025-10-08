// ============================================
// fingerprint.js - デバイスフィンガープリント機能
// ============================================

// デバイスフィンガープリント生成
async function generateFingerprint() {
  const components = [];
  
  // 1. User Agent
  components.push(navigator.userAgent);
  
  // 2. 言語設定
  components.push(navigator.language);
  components.push(navigator.languages.join(','));
  
  // 3. 画面解像度
  components.push(screen.width + 'x' + screen.height);
  components.push(screen.colorDepth);
  components.push(screen.pixelDepth);
  
  // 4. タイムゾーン
  components.push(new Date().getTimezoneOffset());
  
  // 5. プラットフォーム
  components.push(navigator.platform);
  
  // 6. ハードウェア並行性（CPUコア数）
  components.push(navigator.hardwareConcurrency || 0);
  
  // 7. デバイスメモリ
  components.push(navigator.deviceMemory || 0);
  
  // 8. タッチサポート
  components.push(navigator.maxTouchPoints || 0);
  
  // 9. Canvas フィンガープリント
  const canvasFingerprint = await getCanvasFingerprint();
  components.push(canvasFingerprint);
  
  // 10. WebGL フィンガープリント
  const webglFingerprint = getWebGLFingerprint();
  components.push(webglFingerprint);

  // 11. バッテリー残量
  navigator.getBattery().then(function(battery) {
    components.push(battery.level * 100);

    if (battery.charging) {
      components.push('charging');
    } else {
      components.push('using');
    }
  });
  
  // すべてのコンポーネントを結合してハッシュ化
  const fingerprint = await hashString(components.join('|||'));
  return fingerprint;
}

// Canvas フィンガープリント
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

// WebGL フィンガープリント
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

// 文字列をハッシュ化（SHA-256）
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Cookie操作
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

// Cookieを削除する関数
function deleteCookie(name) {
  document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

// Firebaseで投票済みかチェック
async function hasVotedByFingerprint(voteId, fingerprint) {
  try {
    const votedFingerprintsRef = firebase.database().ref(`votes/${voteId}/votedFingerprints`);
    const snapshot = await votedFingerprintsRef.once('value');
    const votedFingerprints = snapshot.val() || {};
    
    // フィンガープリントが既に記録されているかチェック
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

// ローディングメッセージ表示
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

// ローディングメッセージ非表示
function hideLoadingMessage() {
  const msg = document.getElementById('fingerprint-loading');
  if (msg) msg.remove();
}

// 投票済みメッセージ表示
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

// 投票UIの初期化（Cookie + Firebase 両方チェック版）
async function initVotingUIWithFingerprint(voteId) {
  showLoadingMessage();
  
  // フィンガープリント生成
  const fingerprint = await generateFingerprint();
  
  // Cookie チェック
  const cookieVoted = getCookie(`voted_${voteId}`) === 'true';
  
  // Firebase チェック
  const fingerprintVoted = await hasVotedByFingerprint(voteId, fingerprint);
  
  // どちらか一方でも投票済みならブロック
  const hasVoted = cookieVoted || fingerprintVoted;
  
  hideLoadingMessage();
  
  if (hasVoted) {
    showAlreadyVotedMessage();
  }
  
  return { fingerprint, hasVoted };
}
