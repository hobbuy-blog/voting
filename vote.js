// ============================================
// vote.js - Firebase投票システム（LocalStorage版＋リセット検知拡張）
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDav5Vz9EOrXLXJwlR-FmHZAvKTm05yEM0",
  authDomain: "voting-app-c3be3.firebaseapp.com",
  databaseURL: "https://voting-app-c3be3-default-rtdb.firebaseio.com",
  projectId: "voting-app-c3be3",
  storageBucket: "voting-app-c3be3.firebasestorage.app",
  messagingSenderId: "374537942967",
  appId: "1:374537942967:web:e9706bca99e0abb3ed5a32",
  measurementId: "G-SCZN4F5NB0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const defaultLabels = ["1", "2", "3", "4"];

// --------------------------------------------
// LocalStorage削除（fingerprintから移動）
// --------------------------------------------
function deleteLocalStorage(name) {
  try {
    localStorage.removeItem(name);
  } catch (e) {
    console.error('LocalStorage削除エラー:', e);
  }
}
function setLocalStorage(name, value) {
  try {
    localStorage.setItem(name, value);
  } catch (e) {
    console.error('LocalStorage保存エラー:', e);
  }
}

// --------------------------------------------
// Master初期化
// --------------------------------------------
function initMaster(id) {
  const ref = db.ref(`votes/${id}`);
  
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("サーバーがリセットされました．サーバーを再度作成してください．");
      window.location.href = "index.html";
      return;
    }
    if (!data) {
      ref.set({
        labels: defaultLabels,
        votes: [0,0,0,0],
        lastVoted: Date.now(),
        resetCount: 0 // ★追加：リセットカウンタ初期化
      });
    } else if (data.resetCount === undefined) {
      ref.update({ resetCount: 0 });
    }
  });
  
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    renderMaster(data, id);
  });
  
  document.getElementById('labelForm').onsubmit = e => {
    e.preventDefault();
    const labels = [];
    for (let i=0; i<4; ++i) {
      labels.push(document.getElementById('label'+i).value);
    }
    ref.update({labels});
  };
  
  // --------------------------------------------
  // リセット機能（既存＋リセットカウント追加）
  // --------------------------------------------
  window.resetVotes = async () => {
    if (confirm('投票数をリセットしますか？\n※フィンガープリント記録もクリアされます')) {
      try {
        await ref.transaction(data => {
          if (!data) return data;
          const currentReset = data.resetCount || 0;
          data.votes = [0,0,0,0];
          data.votedFingerprints = null;
          data.resetCount = currentReset + 1; // ★リセット回数インクリメント
          return data;
        });
        alert('投票データがリセットされました。');
      } catch (err) {
        console.error('リセットエラー:', err);
        alert('リセットに失敗しました。');
      }
    }
  };
}

// --------------------------------------------
// HTMLエスケープ
// --------------------------------------------
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, function(match) {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return match;
    }
  });
}

// --------------------------------------------
// Master側画面描画
// --------------------------------------------
function renderMaster(data, id) {
  const labelsDiv = document.getElementById('labels');
  labelsDiv.innerHTML = '';
  for (let i=0; i<4; ++i) {
    labelsDiv.innerHTML += 
      `項目${i+1}: <input type="text" style="font-size: 1em; margin: 1px; height: 22px;" id="label${i}" value="${escapeHtml(data.labels[i]||defaultLabels[i])}"><br>`;
  }
  
  let html = "<h3>投票状況</h3>";
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
  
  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    html += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span>票${percentageText}<br>`;
  }
  
  if (data.votedFingerprints) {
    const votedCount = Object.keys(data.votedFingerprints).length;
    html += `<hr><small>投票済みデバイス数: ${votedCount}</small><br>`;
  }

  html += `<small>リセット回数: ${data.resetCount || 0}</small>`;
  
  document.getElementById('results').innerHTML = html;
}

// --------------------------------------------
// Slave初期化（リセット検知＋既存処理）
// --------------------------------------------
function initSlave(id) {
  const ref = db.ref(`votes/${id}`);

  // ★新規追加：FirebaseとLocalStorageのresetCount比較
  ref.once('value', async snap => {
    const data = snap.val();
    if (!data) return;
    const firebaseReset = data.resetCount || 0;
    const localResetKey = `reset_${id}`;
    const localReset = parseInt(localStorage.getItem(localResetKey) || "0", 10);
    if (firebaseReset !== localReset) {
      console.log("リセット検知: FirebaseとLocalStorageのresetCount不一致", { firebaseReset, localReset });
      deleteLocalStorage(`voted_${id}`);
      setLocalStorage(localResetKey, firebaseReset);
      location.reload();
      return;
    }
  });
  
  // 既存部分：Firebaseデータ存在チェック
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("サーバーがリセットされました．サーバーを再度作成してください．");
      window.location.href = "index.html";
      return;
    }
  });
  
  let previousTotalVotes = null;
  let hadFingerprints = false;
  
  // ★既存リセット検知（votes減少／fingerprints消失）も保持
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById('choices').textContent = "無効な投票IDです。";
      document.getElementById('results').textContent = "";
      return;
    }
    
    const currentTotalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
    const hasFingerprints = data.votedFingerprints && 
                           Object.keys(data.votedFingerprints).length > 0;
    
    const votesDecreased = previousTotalVotes !== null && 
                          currentTotalVotes < previousTotalVotes;
    const fingerprintsCleared = hadFingerprints && !hasFingerprints;
    
    if (votesDecreased || fingerprintsCleared) {
      console.log('リセット検知:', { votesDecreased, fingerprintsCleared });
      deleteLocalStorage(`voted_${id}`);  // LocalStorageをクリア
      location.reload();
      return;
    }
    
    previousTotalVotes = currentTotalVotes;
    hadFingerprints = hasFingerprints;
    
    renderSlave(data, id);
  });
}

// --------------------------------------------
// Slave描画・投票
// --------------------------------------------
function renderSlave(data, id) {
  const alreadyVotedMessage = document.getElementById('already-voted-message');
  const shouldHideButtons = alreadyVotedMessage !== null;
  
  let chtml = '';
  for (let i=0; i<4; ++i) {
    const buttonStyle = shouldHideButtons ? 'style="display:none;"' : '';
    chtml += `<button class="vote-btn" ${buttonStyle} onclick="vote(${i})"><b><u>${escapeHtml(data.labels[i]||defaultLabels[i])}</u></b>に投票</button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;
  
  let rhtml = "<h3>投票状況</h3>";
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
  
  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    rhtml += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span>票${percentageText}<br>`;
  }
  document.getElementById('results').innerHTML = rhtml;
  
  window.vote = async function(idx) {
    if (!window.deviceFingerprint) {
      alert('デバイス情報の取得中です。しばらくお待ちください。');
      return;
    }
    
    // 二重チェック：LocalStorageのみで投票済み判定
    const localStorageKey = `voted_${id}`;
    const alreadyVoted = localStorage.getItem(localStorageKey) === 'true';

    if (alreadyVoted) {
      alert('既に投票済みです');
      return;
    }
    
    const ref = db.ref(`votes/${id}`);
    
    try {
      await ref.child('votes').transaction(arr => {
        if (!arr) arr = [0,0,0,0];
        arr[idx] = (arr[idx]||0)+1;
        return arr;
      });
      
      await ref.update({ lastVoted: Date.now() });
      await recordFingerprint(id, window.deviceFingerprint);
      
      // ★追加：FirebaseのresetCountをLocalStorageに同期
      const snap = await ref.once('value');
      const firebaseReset = snap.val().resetCount || 0;
      setLocalStorage(`reset_${id}`, firebaseReset);
      
      // LocalStorageに記録
      setLocalStorage(`voted_${id}`, 'true');
      
      const buttons = document.querySelectorAll('.vote-btn');
      buttons.forEach(btn => btn.style.display = 'none');
      
      showAlreadyVotedMessage();
      alert('投票が完了しました！');
      
    } catch (error) {
      console.error('投票エラー:', error);
      alert('投票に失敗しました。もう一度お試しください。');
    }
  };
}
