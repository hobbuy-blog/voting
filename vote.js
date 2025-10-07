// ============================================
// vote.js - Firebase投票システム（フィンガープリント統合版）
// ============================================

// 1. Firebase初期化
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

// Cookie削除
function deleteCookie(name) {
  document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

// Cookie取得
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Cookie設定
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days*24*60*60*1000));
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}

// 全Cookie削除
function clearAllCookies() {
  document.cookie.split(";").forEach(function(c) {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/");
  });
}


// ============================================
// Master（管理者）画面の初期化
// ============================================
function initMaster(id) {
  const ref = db.ref(`votes/${id}`);
  
  // 3日経過チェック・自動削除
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("サーバーがリセットされました．サーバーを再度作成してください．");
      window.location.href = "index.html";
      return;
    }
    // 初期データがなければ作成
    if (!data) {
      ref.set({
        labels: defaultLabels,
        votes: [0,0,0,0],
        lastVoted: Date.now()
      });
    }
  });
  
  // リアルタイム監視
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    renderMaster(data, id);
  });
  
  // ラベル更新フォーム
  document.getElementById('labelForm').onsubmit = e => {
    e.preventDefault();
    const labels = [];
    for (let i=0; i<4; ++i) {
      labels.push(document.getElementById('label'+i).value);
    }
    ref.update({labels});
  };
  
  // 投票リセット
  window.resetVotes = () => {
    if (confirm('投票数をリセットしますか？\n※フィンガープリント記録もクリアされます')) {
      ref.update({
        votes: [0,0,0,0],
        votedFingerprints: null
      });
    }
  };
}

// HTMLエスケープ
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

// Master画面の描画
function renderMaster(data, id) {
  const labelsDiv = document.getElementById('labels');
  labelsDiv.innerHTML = '';
  for (let i=0; i<4; ++i) {
    labelsDiv.innerHTML += 
      `項目${i+1}: <input type="text" style="font-size: 1em; margin: 1px; height: 22px;" id="label${i}" value="${escapeHtml(data.labels[i]||defaultLabels[i])}"><br>`;
  }
  
  let html = "<h3>投票状況</h3>";
  
  // 総投票数を計算
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
  
  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    
    // 投票が1以上ある場合のみパーセンテージを表示
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    
    html += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span>票${percentageText}<br>`;
  }
  
  // 投票済みデバイス数を表示
  if (data.votedFingerprints) {
    const votedCount = Object.keys(data.votedFingerprints).length;
    html += `<hr><small>投票済みデバイス数: ${votedCount}</small>`;
  }
  
  document.getElementById('results').innerHTML = html;
}

// ============================================
// Slave（投票者）画面の初期化
// ============================================
function initSlave(id) {
  const ref = db.ref(`votes/${id}`);
  
  // 3日経過チェック・自動削除
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      clearAllCookies()
      alert("サーバーがリセットされました．サーバーを再度作成してください．");
      window.location.href = "index.html";
      return;
    }
  });

  // Cookieとの比較処理
  ref.once('value', snap => {
    const data = snap.val();
    if (!data) {
      clearAllCookies();
      setCookie(`totalVotes_${id}`, 0, 365);
      return;
    }

    const totalVotesNow = data.votes.reduce((sum, v) => sum + (v || 0), 0);
    const storedTotal = parseInt(getCookie(`totalVotes_${id}`) || '0', 10);

    // Cookieの値が現在の投票数より少ない場合 → Cookieを全削除してリロード
    if (storedTotal > totalVotesNow) {
      console.log('Cookieリセット検知: CookieのtotalVotesが現在より少ない');
      clearAllCookies();
      location.reload();
      return;
    }

    // 初回記録（Cookieが存在しない場合）
    if (!getCookie(`totalVotes_${id}`)) {
      setCookie(`totalVotes_${id}`, totalVotesNow, 365);
    }
  });

  
  // リセット検知用の変数
  let previousTotalVotes = null;
  let hadFingerprints = false;
  
  // リアルタイム監視
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById('choices').textContent = "無効な投票IDです。";
      document.getElementById('results').textContent = "";
      return;
    }
    
    // 現在の状態を取得
    const currentTotalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
    const hasFingerprints = data.votedFingerprints && 
                           Object.keys(data.votedFingerprints).length > 0;
    
    // リセット検知: 投票数が減少 または フィンガープリントが削除
    const votesDecreased = previousTotalVotes !== null && 
                          currentTotalVotes < previousTotalVotes;
    const fingerprintsCleared = hadFingerprints && !hasFingerprints;
    
    if (votesDecreased || fingerprintsCleared) {
      console.log('リセット検知:', { votesDecreased, fingerprintsCleared });
      deleteCookie(`voted_${voteId}`);
      location.reload();
      return;
    }
    
    // 状態を記録
    previousTotalVotes = currentTotalVotes;
    hadFingerprints = hasFingerprints;
    
    // 通常の描画
    renderSlave(data, id);
  });
}

// Slave画面の描画
function renderSlave(data, id) {
  // 投票ボタンの表示制御
  const alreadyVotedMessage = document.getElementById('already-voted-message');
  const shouldHideButtons = alreadyVotedMessage !== null;
  
  let chtml = '';
  for (let i=0; i<4; ++i) {
    const buttonStyle = shouldHideButtons ? 'style="display:none;"' : '';
    chtml += `<button class="vote-btn" ${buttonStyle} onclick="vote(${i})"><b><u>${escapeHtml(data.labels[i]||defaultLabels[i])}</u></b>に投票</button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;
  
  // 投票状況表示
  let rhtml = "<h3>投票状況</h3>";
  
  // 総投票数を計算
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
  
  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    
    // 投票が1以上ある場合のみパーセンテージを表示
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    
    rhtml += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span>票${percentageText}<br>`;
  }
  document.getElementById('results').innerHTML = rhtml;
  
  // 投票関数をグローバルに設定
  window.vote = async function(idx) {
    // デバイスフィンガープリントが取得できていない場合
    if (!window.deviceFingerprint) {
      alert('デバイス情報の取得中です。しばらくお待ちください。');
      return;
    }
    
    // 二重チェック：既に投票済みか確認
    const alreadyVoted = await hasVotedByFingerprint(id, window.deviceFingerprint);
    if (alreadyVoted) {
      alert('既に投票済みです');
      return;
    }
    
    // 投票処理
    const ref = db.ref(`votes/${id}`);
    
    try {
      // 投票数を増やす
      await ref.child('votes').transaction(arr => {
        if (!arr) arr = [0,0,0,0];
        arr[idx] = (arr[idx]||0)+1;
        return arr;
      });
      
      // タイムスタンプ更新
      await ref.update({ lastVoted: Date.now() });
      
      // フィンガープリントを記録
      await recordFingerprint(id, window.deviceFingerprint);
      
      // Cookieにも記録（二重防御）
      setCookie(`voted_${id}`, 'true', 365);
      
      // UIを更新（ボタンを非表示に）
      const buttons = document.querySelectorAll('.vote-btn');
      buttons.forEach(btn => btn.style.display = 'none');
      
      showAlreadyVotedMessage();

      // 総投票数をCookieに更新
      const updatedSnap = await ref.once('value');
      const updatedData = updatedSnap.val();
      const totalVotesNow = updatedData.votes.reduce((sum, v) => sum + (v || 0), 0);
      setCookie(`totalVotes_${id}`, totalVotesNow, 365);
      
      alert('投票が完了しました！');
      
    } catch (error) {
      console.error('投票エラー:', error);
      alert('投票に失敗しました。もう一度お試しください。');
    }
  };
}
