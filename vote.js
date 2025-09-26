// 1. Firebase初期化（自分のプロジェクト情報に書き換えてください）
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MSG_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 2. 初期状態
const defaultLabels = ["1", "2", "3", "4"];

function initMaster(id) {
  const ref = db.ref(`votes/${id}`);
  // 初期データがなければ作成
  ref.once('value', snap => {
    if (!snap.exists()) {
      ref.set({
        labels: defaultLabels,
        votes: [0,0,0,0]
      });
    }
  });

  // リアルタイム監視
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    renderMaster(data, id);
  });

  // ラベル編集
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

function renderMaster(data, id) {
  // ラベルフォーム
  const labelsDiv = document.getElementById('labels');
  labelsDiv.innerHTML = '';
  for (let i=0; i<4; ++i) {
    labelsDiv.innerHTML += 
      `項目${i+1}: <input type="text" id="label${i}" value="${data.labels[i]||defaultLabels[i]}"><br>`;
  }
  // 投票状況
  let html = "<h3>投票状況</h3>";
  for (let i=0; i<4; ++i) {
    html += `${data.labels[i]||defaultLabels[i]} : ${data.votes[i]||0}票<br>`;
  }
  document.getElementById('results').innerHTML = html;
}

function initSlave(id) {
  const ref = db.ref(`votes/${id}`);
  // 投票UI
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById('choices').textContent = "無効な投票IDです。";
      document.getElementById('results').textContent = "";
      return;
    }
    renderSlave(data, id);
  });
}

function renderSlave(data, id) {
  // 投票ボタン
  let chtml = '';
  for (let i=0; i<4; ++i) {
    chtml += `<button class="vote-btn" onclick="vote(${i})">${data.labels[i]||defaultLabels[i]} に投票</button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;
  // 投票状況
  let rhtml = "<h3>投票状況</h3>";
  for (let i=0; i<4; ++i) {
    rhtml += `${data.labels[i]||defaultLabels[i]} : ${data.votes[i]||0}票<br>`;
  }
  document.getElementById('results').innerHTML = rhtml;
  // 投票関数
  window.vote = idx => {
    const ref = db.ref(`votes/${id}/votes`);
    ref.transaction(arr => {
      if (!arr) arr = [0,0,0,0];
      arr[idx] = (arr[idx]||0)+1;
      return arr;
    });
  };
}
