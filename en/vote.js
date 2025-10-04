// ============================================
// vote-en.js - English Version with Fingerprint
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

function initMaster(id) {
  const ref = db.ref(`votes/${id}`);
  // Check for 3-day expiration and auto-delete
  ref.once('value', snap => {
    const data = snap.val();
    if (data && data.lastVoted && Date.now() - data.lastVoted > 3*24*60*60*1000) {
      ref.remove();
      alert("The server had reset. Please create a server again.");
      window.location.href = "index.html";
      return;
    }
    // Create initial data if not exists
    if (!data) {
      ref.set({
        labels: defaultLabels,
        votes: [0,0,0,0],
        lastVoted: Date.now()
      });
    }
  });

  // Real-time monitoring
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
    if (confirm('Reset vote counts?\n※Fingerprint records will also be cleared')) {
      ref.update({
        votes: [0,0,0,0],
        votedFingerprints: null
      });
    }
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
  
  // Display voted device count
  if (data.votedFingerprints) {
    const votedCount = Object.keys(data.votedFingerprints).length;
    html += `<hr><small>Voted devices: ${votedCount}</small>`;
  }
  
  document.getElementById('results').innerHTML = html;
}

function initSlave(id) {
  const ref = db.ref(`votes/${id}`);
  // Check for 3-day expiration and auto-delete
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
  // Control button visibility
  const alreadyVotedMessage = document.getElementById('already-voted-message');
  const shouldHideButtons = alreadyVotedMessage !== null;
  
  let chtml = '';
  for (let i=0; i<4; ++i) {
    const buttonStyle = shouldHideButtons ? 'style="display:none;"' : '';
    chtml += `<button class="vote-btn" ${buttonStyle} onclick="vote(${i})">Vote <b><u>${escapeHtml(data.labels[i]||defaultLabels[i])}</u></b></button><br>`;
  }
  document.getElementById('choices').innerHTML = chtml;
  
  // Render voting status with percentage
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
  
  document.getElementById('results').innerHTML = html;
  
  window.vote = async function(idx) {
    // Check if device fingerprint is ready
    if (!window.deviceFingerprint) {
      alert('Device information is being retrieved. Please wait a moment.');
      return;
    }
    
    // Double check: already voted?
    const alreadyVoted = await hasVotedByFingerprint(id, window.deviceFingerprint);
    if (alreadyVoted) {
      alert('You have already voted');
      return;
    }
    
    // Voting process
    const ref = db.ref(`votes/${id}`);
    
    try {
      // Increment vote count
      await ref.child('votes').transaction(arr => {
        if (!arr) arr = [0,0,0,0];
        arr[idx] = (arr[idx]||0)+1;
        return arr;
      });
      
      // Update timestamp
      await ref.update({ lastVoted: Date.now() });
      
      // Record fingerprint
      await recordFingerprint(id, window.deviceFingerprint);
      
      // Also record in cookie (double defense)
      setCookie(`voted_${id}`, 'true', 365);
      
      // Update UI (hide buttons)
      const buttons = document.querySelectorAll('.vote-btn');
      buttons.forEach(btn => btn.style.display = 'none');
      
      showAlreadyVotedMessage();
      
      alert('Vote completed!');
      
    } catch (error) {
      console.error('Voting error:', error);
      alert('Failed to vote. Please try again.');
    }
  };
}
