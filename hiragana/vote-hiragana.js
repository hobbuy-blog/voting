// ============================================
// vote-hiragana.js - ひらがな版投票システム（フィンガープリント統合版）
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

// Delete cookie function
function deleteCookie(name) {
  document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

// Slave（投票者）画面の初期化
function initSlave(id) {
  const ref = db.ref(`votes/${id}`);
  
  // 3日経過チェック・自動削除
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("サーバーがリセットされました．サーバーにはいりなおしてください．");
      window.location.href = "index.html";
      return;
    }
  });

  // --- Cookieとの比較処理 ---
  ref.once('value', snap => {
    const data = snap.val();
    if (!data) return;

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
      document.getElementById('choices').textContent = "IDがちがいます．";
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
      delateCookie(`voted_${voteId}`);
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
    chtml += `<button class="vote-btn" ${buttonStyle} onclick="vote(${i})"><b><u>${escapeHtml(data.labels[i]||defaultLabels[i])}</u></b>に<ruby>投票<rt>とうひょう</rt></ruby></button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;
  
  // 投票状況表示
  let rhtml = "<h3><ruby>投票<rt>とうひょう</rt></ruby>の<ruby>様子<rt>ようす</rt></ruby></h3>";
  
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
    
    rhtml += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span><ruby>票<rt>ひょう</rt></ruby>${percentageText}<br>`;
  }
  document.getElementById('results').innerHTML = rhtml;
  
  // 投票関数をグローバルに設定
  window.vote = async function(idx) {
    // デバイスフィンガープリントが取得できていない場合
    if (!window.deviceFingerprint) {
      alert('デバイスじょうほうのしゅとくちゅうです。しばらくおまちください。');
      return;
    }
    
    // 二重チェック：既に投票済みか確認
    const alreadyVoted = await hasVotedByFingerprint(id, window.deviceFingerprint);
    if (alreadyVoted) {
      alert('すでに投票ずみです');
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
      
      alert('投票がかんりょうしました！');
      
    } catch (error) {
      console.error('投票エラー:', error);
      alert('投票にしっぱいしました。もういちどおためしください。');
    }
  };
}
