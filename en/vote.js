// ============================================
// vote-en.js - (English Version with Fingerprint + Reset Detection)
// ============================================

// 1. Firebase initialization
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

// Utility: delete localStorage
function deleteLocalStorage(name) {
  try {
    localStorage.removeItem(name);
  } catch (e) {
    console.error('LocalStorage delete error:', e);
  }
}

// Utility: set localStorage
function setLocalStorage(name, value) {
  try {
    localStorage.setItem(name, value);
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
}

// ============================================
// Master screen initialization
// ============================================
function initMaster(id) {
  const ref = db.ref(`votes/${id}`);
  
  // 3-day expiration check
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("The server had reset. Please create a server again.");
      window.location.href = "index.html";
      return;
    }
    if (!data) {
      ref.set({
        labels: defaultLabels,
        votes: [0,0,0,0],
        lastVoted: Date.now(),
        resetCount: 0
      });
    } else if (data.resetCount === undefined) {
      ref.update({ resetCount: 0 });
    }
  });

  // Live monitoring
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    renderMaster(data, id);
  });

  // Label editing
  document.getElementById('labelForm').onsubmit = e => {
    e.preventDefault();
    const labels = [];
    for (let i=0; i<4; ++i) {
      labels.push(document.getElementById('label'+i).value);
    }
    ref.update({labels});
  };

  // Reset votes (increment resetCount)
  window.resetVotes = async () => {
    if (confirm('Reset vote counts?\n※Fingerprint records will also be cleared')) {
      const snapshot = await ref.once('value');
      const currentResetCount = (snapshot.val()?.resetCount || 0) + 1;

      await ref.update({
        votes: [0,0,0,0],
        votedFingerprints: null,
        resetCount: currentResetCount,
        lastVoted: Date.now()
      });

      alert('Votes have been reset.');
    }
  };
}

// Escape HTML
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

// Render Master
function renderMaster(data, id) {
  const labelsDiv = document.getElementById('labels');
  labelsDiv.innerHTML = '';
  for (let i=0; i<4; ++i) {
    labelsDiv.innerHTML += 
      `Item ${i+1}: <input type="text" style="font-size: 1em; margin: 1px; height: 22px;" id="label${i}" value="${escapeHtml(data.labels[i]||defaultLabels[i])}"><br>`;
  }
  
  let html = "<h3>Voting Status</h3>";
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
  
  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    html += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; text-decoration: bold; font-family: Courier; color: #f20;">${escapeHtml(voteCount)}</span>${percentageText}<br>`;
  }
  
  if (data.votedFingerprints) {
    const votedCount = Object.keys(data.votedFingerprints).length;
    html += `<hr><small>Voted devices: ${votedCount}</small><br>`;
  }
  
  document.getElementById('results').innerHTML = html;
}

// ============================================
// Slave screen initialization
// ============================================
async function initSlave(id) {
  const ref = db.ref(`votes/${id}`);

  // Load reset count from Firebase
  const snapshot = await ref.once('value');
  const data = snapshot.val();
  if (!data) {
    alert("Invalid voting ID.");
    return;
  }

  const firebaseResetCount = data.resetCount || 0;
  const localResetCountKey = `reset_${id}`;
  const localResetCount = parseInt(localStorage.getItem(localResetCountKey) || "0");

  // Check reset difference
  if (firebaseResetCount !== localResetCount) {
    console.log("Reset detected (by reset count). Clearing vote record...");
    deleteLocalStorage(`voted_${id}`);
    setLocalStorage(localResetCountKey, firebaseResetCount);
    location.reload();
    return;
  }

  // Save Firebase resetCount locally
  setLocalStorage(localResetCountKey, firebaseResetCount);

  // Continue normal listener
  let previousTotalVotes = null;
  let hadFingerprints = false;

  ref.on('value', snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById('choices').textContent = "Invalid voting ID.";
      document.getElementById('results').textContent = "";
      return;
    }

    // Check for live reset (votes decreased or cleared)
    const currentTotalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);
    const hasFingerprints = data.votedFingerprints && Object.keys(data.votedFingerprints).length > 0;

    const votesDecreased = previousTotalVotes !== null && currentTotalVotes < previousTotalVotes;
    const fingerprintsCleared = hadFingerprints && !hasFingerprints;

    if (votesDecreased || fingerprintsCleared) {
      console.log('Live reset detected. Clearing local vote record...');
      deleteLocalStorage(`voted_${id}`);
      location.reload();
      return;
    }

    previousTotalVotes = currentTotalVotes;
    hadFingerprints = hasFingerprints;

    renderSlave(data, id);
  });
}

// Render Slave
function renderSlave(data, id) {
  const alreadyVotedMessage = document.getElementById('already-voted-message');
  const shouldHideButtons = alreadyVotedMessage !== null;

  let chtml = '';
  for (let i=0; i<4; ++i) {
    const buttonStyle = shouldHideButtons ? 'style="display:none;"' : '';
    chtml += `<button class="vote-btn" ${buttonStyle} onclick="vote(${i})">Vote <b><u>${escapeHtml(data.labels[i]||defaultLabels[i])}</u></b></button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;

  let html = "<h3>Voting Status</h3>";
  const totalVotes = data.votes.reduce((sum, count) => sum + (count || 0), 0);

  for (let i=0; i<4; ++i) {
    const voteCount = data.votes[i] || 0;
    let percentageText = '';
    if (totalVotes > 0) {
      const percentage = (voteCount / totalVotes * 100).toFixed(1);
      percentageText = ` | ${percentage}%`;
    }
    html += `${escapeHtml(data.labels[i]||defaultLabels[i])} : <span style="font-size: 2em; text-decoration: bold; font-family: Courier; color: #f20;">${escapeHtml(voteCount)}</span>${percentageText}<br>`;
  }

  document.getElementById('results').innerHTML = html;

  // Voting process
  window.vote = async function(idx) {
    if (!window.deviceFingerprint) {
      alert('Device information is being retrieved. Please wait a moment.');
      return;
    }

    const localStorageKey = `voted_${id}`;
    const alreadyVoted = localStorage.getItem(localStorageKey) === 'true';
    if (alreadyVoted) {
      alert('You have already voted.');
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

      setLocalStorage(localStorageKey, 'true');

      document.querySelectorAll('.vote-btn').forEach(btn => btn.style.display = 'none');
      showAlreadyVotedMessage();
      alert('Vote completed!');
    } catch (error) {
      console.error('Voting error:', error);
      alert('Failed to vote. Please try again.');
    }
  };
}
