// ============================================
// vote-hiragana.js - ひらがな版投票システム（フィンガープリント＋リセット検知統合版）
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

// LocalStorage削除
function deleteLocalStorage(name) {
  try {
    localStorage.removeItem(name);
  } catch (e) {
    console.error('LocalStorage削除エラー:', e);
  }
}

// ============================================
// Master（作成者）画面の初期化
// ============================================
function initMaster(id) {
  const ref = db.ref(`votes/${id}`);

  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("サーバーがリセットされました．サーバーを再度さくせいしてください．");
      window.location.href = "index.html";
      return;
    }
    if (!data) {
      ref.set({
        labels: defaultLabels,
        votes: [0,0,0,0],
        lastVoted: Date.now(),
        resetCount: 0, // ★追加: リセット回数を記録
      });
    } else if (data.resetCount === undefined) {
      ref.update({ resetCount: 0 });
    }
  });

  // リセットボタン
  window.resetVotes = async () => {
    if (confirm('投票データをリセットしますか？\n※すべての記録がけされます')) {
      try {
        await ref.transaction(data => {
          if (!data) return data;
          const currentReset = data.resetCount || 0;
          data.votes = [0,0,0,0];
          data.votedFingerprints = null;
          data.resetCount = currentReset + 1; // ★カウントアップ
          return data;
        });
      } catch (err) {
        console.error('リセットエラー:', err);
        alert("リセットに失敗しました。")
      }
    }
  };
}

// ============================================
// Slave（投票者）画面の初期化
// ============================================
function initSlave(id) {
  const ref = db.ref(`votes/${id}`);

  // ★追加: FirebaseとLocalStorageのresetCount比較
  ref.once('value', async snap => {
    const data = snap.val();
    if (!data) return;

    const firebaseReset = data.resetCount || 0;
    const localResetKey = `reset_${id}`;
    const localReset = parseInt(localStorage.getItem(localResetKey) || "0", 10);

    if (firebaseReset !== localReset) {
      console.log("リセットけんち: FirebaseとLocalStorageのふいっち", { firebaseReset, localReset });
      deleteLocalStorage(`voted_${id}`);
      localStorage.setItem(localResetKey, firebaseReset);
      location.reload();
      return;
    }
  });

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
      console.log('リセットけんち:', { votesDecreased, fingerprintsCleared });
      deleteLocalStorage(`voted_${id}`);  // LocalStorageをクリア
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

// ============================================
// Slave画面の描画
// ============================================
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

    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }

    rhtml += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(voteCount)}</span><ruby>票<rt>ひょう</rt></ruby>${percentageText}<br>`;
  }
  document.getElementById('results').innerHTML = rhtml;

  // 投票関数をグローバルに設定
  window.vote = async function(idx) {
    if (!window.deviceFingerprint) {
      alert('デバイスじょうほうのしゅとくちゅうです。しばらくおまちください。');
      return;
    }

    const alreadyVoted = await hasVotedByFingerprint(id, window.deviceFingerprint);
    if (alreadyVoted) {
      alert('すでに投票ずみです');
      return;
    }

    const ref = db.ref(`votes/${id}`);

    try {
      // ★ FirebaseのresetCountをLocalStorageに同期
      const snap = await ref.once('value');
      const firebaseReset = snap.val().resetCount || 0;
      localStorage.setItem(`reset_${id}`, firebaseReset);

      // 投票数を増やす
      await ref.child('votes').transaction(arr => {
        if (!arr) arr = [0,0,0,0];
        arr[idx] = (arr[idx]||0)+1;
        return arr;
      });

      await ref.update({ lastVoted: Date.now() });
      await recordFingerprint(id, window.deviceFingerprint);

      setLocalStorage(`voted_${id}`, 'true');

      const buttons = document.querySelectorAll('.vote-btn');
      buttons.forEach(btn => btn.style.display = 'none');

      showAlreadyVotedMessage();

      alert('投票がかんりょうしました！');
    } catch (error) {
      console.error('投票エラー:', error);
      alert('投票にしっぱいしました。もういちどおためしください。');
    }
  };
}
