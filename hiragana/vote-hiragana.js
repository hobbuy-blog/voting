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
  
  // リアルタイム監視
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById('choices').textContent = "IDがちがいます．";
      document.getElementById('results').textContent = "";
      return;
    }
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

  let html = "<h3>Voting Status</h3>";
  
  // Calculate total votes
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
  
  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    
    // Show percentage only if there is at least 1 vote
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    
    html += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span>${percentageText}<br>`;
  }
  
  // 投票関数をグローバルに設定
  window.vote = async function(idx) {
    // デバイスフィンガープリントが取得できていない場合
    if (!window.deviceFingerprint) {
      alert('とうひょうのじゅんびちゅうです。しばらくおまちください。');
      return;
    }
    
    // 二重チェック：既に投票済みか確認
    const alreadyVoted = await hasVotedByFingerprint(id, window.deviceFingerprint);
    if (alreadyVoted) {
      alert('すでにとうひょうされています');
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
      
      alert('とうひょうがかんりょうしました！');
      
    } catch (error) {
      console.error('投票エラー:', error);
      alert('とうひょうにしっぱいしました。もう1どとうひょうしください。');
    }
  };
}
