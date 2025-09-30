// 1. Firebase初期化（自分のプロジェクト情報に書き換えてください）
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

function initMaster(id) {
  const ref = db.ref(`votes/${id}`);
  // 3日経過チェック・自動削除
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("The server had reset. Please create a server again.");
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

  document.getElementById('labelForm').onsubmit = e => {
    e.preventDefault();
    const labels = [];
    for (let i=0; i<4; ++i) {
      labels.push(document.getElementById('label'+i).value);
    }
    ref.update({labels});
  };

  window.resetVotes = () => {
    ref.update({votes:[0,0,0,0]});
  };
}

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

function renderMaster(data, id) {
  const labelsDiv = document.getElementById('labels');
  labelsDiv.innerHTML = '';
  for (let i=0; i<4; ++i) {
    labelsDiv.innerHTML += 
      `Item ${i+1}: <input type="text" style="font-size: 1em; margin: 1px; height: 22px;" id="label${i}" value="${escapeHtml(data.labels[i]||defaultLabels[i])}"><br>`;
  }
  let html = "<h3>Voting Status</h3>";
  for (let i=0; i<4; ++i) {
    html += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(data.votes[i]||0)}</span><br>`;
  }
  document.getElementById('results').innerHTML = html;
}

function initSlave(id) {
  const ref = db.ref(`votes/${id}`);
  // 3日経過チェック・自動削除
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("The server had reset. Please ask the host to create again.");
      window.location.href = "index.html";
      return;
    }
  });

  ref.on('value', snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById('choices').textContent = "Voting ID is invalid.";
      document.getElementById('results').textContent = "";
      return;
    }
    renderSlave(data, id);
  });
}

function renderSlave(data, id) {
  let chtml = '';
  for (let i=0; i<4; ++i) {
    chtml += `<button class="vote-btn" onclick="vote(${i})">Vote <b><u>${escapeHtml(data.labels[i]||defaultLabels[i])}</u></b></button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;
  let rhtml = "<h3>Voting Status</h3>";
  for (let i=0; i<4; ++i) {
    rhtml += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; color: #f20; text-decoration: bold; font-family: Courier;">${escapeHtml(data.votes[i]||0)}</span><br>`;
  }
  document.getElementById('results').innerHTML = rhtml;
  window.vote = idx => {
    const ref = db.ref(`votes/${id}`);
    ref.child('votes').transaction(arr => {
      if (!arr) arr = [0,0,0,0];
      arr[idx] = (arr[idx]||0)+1;
      return arr;
    });
    ref.update({ lastVoted: Date.now() });
  };
}