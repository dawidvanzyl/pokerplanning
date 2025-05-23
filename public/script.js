const socket = io();

// DOM element references
const loginDiv = document.getElementById('login');
const sessionDiv = document.getElementById('session');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const roleSelect = document.getElementById('roleSelect');
const sessionDropdownDiv = document.getElementById('sessionDropdownDiv');
const sessionSelect = document.getElementById('sessionSelect');
const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');
const displaySessionId = document.getElementById('displaySessionId');

const observerCardSetDiv = document.getElementById('observerCardSetDiv');
const cardSetSelect = document.getElementById('cardSetSelect');
const customCardSetDiv = document.getElementById('customCardSetDiv');
const customCardSetInput = document.getElementById('customCardSetInput');

const estimatorView = document.getElementById('estimatorView');
const observerView = document.getElementById('observerView');
const observerStatus = document.getElementById('observerStatus');
const cardsDiv = document.getElementById('cards');
const revealBtn = document.getElementById('revealBtn');
const resetBtn = document.getElementById('resetBtn');
const celebrateBtn = document.getElementById('celebrateBtn');
const resultsDiv = document.getElementById('results');
const usersUl = document.getElementById('users');
const celebrationContainer = document.getElementById('celebration-container');
const unicornContainer = document.getElementById('unicorn-container');

let role = null;
let votesAreRevealed = false;
let currentSelection = null;
const defaultCardSet = ["1", "3", "6", "9", "12", "18", "24", "30"];

// The card deck will come from the session's defined card set.
let cardValues = defaultCardSet.slice();

// We'll store the latest sessions list for populating sessionSelect.
let sessionsList = [];

// Utility function to generate a session ID (using three random words).
function generateSessionId() {
  const adjectives = ["red", "blue", "green", "happy", "brave", "calm", "eager", "fancy", "gentle", "jolly"];
  const nouns = ["apple", "tiger", "sky", "river", "forest", "mountain", "ocean", "rain", "sun", "star"];
  const word1 = adjectives[Math.floor(Math.random() * adjectives.length)];
  const word2 = adjectives[Math.floor(Math.random() * adjectives.length)];
  const word3 = nouns[Math.floor(Math.random() * nouns.length)];
  return `${word1}-${word2}-${word3}`;
}

// Request active sessions from the server.
function requestActiveSessions() {
  socket.emit('getActiveSessions');
}

// Populate the session dropdown.
socket.on('activeSessions', (sessions) => {
  sessionsList = sessions;
  sessionSelect.innerHTML = '';
  if (role === 'observer') {
    // Observers can create a new session.
    const newOption = document.createElement('option');
    newOption.value = 'new';
    newOption.textContent = 'Create New Session';
    sessionSelect.appendChild(newOption);
  }
  sessions.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.sessionId;
    opt.textContent = `Session ${item.sessionId} (${item.userCount} user${item.userCount === 1 ? '' : 's'})`;
    sessionSelect.appendChild(opt);
  });
});

// Also update the session list automatically.
socket.on('sessionListUpdated', (sessions) => {
  sessionsList = sessions;
  sessionSelect.innerHTML = '';
  if (role === 'observer') {
    const newOption = document.createElement('option');
    newOption.value = 'new';
    newOption.textContent = 'Create New Session';
    sessionSelect.appendChild(newOption);
  }
  sessions.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.sessionId;
    opt.textContent = `Session ${item.sessionId} (${item.userCount} user${item.userCount === 1 ? '' : 's'})`;
    sessionSelect.appendChild(opt);
  });
});

// When role changes, update UI.
roleSelect.addEventListener('change', () => {
  role = roleSelect.value;
  requestActiveSessions();
  // Always show the session dropdown.
  sessionDropdownDiv.style.display = 'block';

  if (role === 'observer') {
    // For observers, default the session dropdown to "new" and immediately show card set options.
    // We wait a brief moment to ensure the session list has been populated.
    setTimeout(() => {
      sessionSelect.value = 'new';
      observerCardSetDiv.style.display = 'block';
      // Make sure the card set dropdown defaults to "default".
      cardSetSelect.value = 'default';
      customCardSetDiv.style.display = 'none';
    }, 100);
  } else {
    // For estimators, hide observer-specific UI.
    observerCardSetDiv.style.display = 'none';
  }
});

// When the session dropdown changes (for observers).
sessionSelect.addEventListener('change', () => {
  if (role !== 'observer') return;
  if (sessionSelect.value === 'new') {
    // When creating a new session, show the card set selection UI.
    observerCardSetDiv.style.display = 'block';
    cardSetSelect.value = 'default';
    customCardSetDiv.style.display = 'none';
  } else {
    // When joining an existing session, hide the card set selection UI.
    observerCardSetDiv.style.display = 'none';
  }
});

// When the card set selection changes.
cardSetSelect.addEventListener('change', () => {
  if (cardSetSelect.value === 'custom') {
    customCardSetDiv.style.display = 'block';
  } else {
    customCardSetDiv.style.display = 'none';
  }
});

// Join button handler.
joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  role = roleSelect.value;
  let sessionId = sessionSelect.value;

  if (!name || !sessionId) {
    alert('Please enter your name and select a session.');
    return;
  }

  // For observers creating a new session, gather the card set.
  let joinData = { name, role, sessionId };
  if (role === 'observer') {
    if (sessionId === 'new') {
      // Generate a new session ID.
      sessionId = generateSessionId();
      joinData.sessionId = sessionId;
      // Determine card set.
      if (cardSetSelect.value === 'custom') {
        const customCards = customCardSetInput.value.split(",").map(s => s.trim()).filter(s => s !== "");
        if (customCards.length === 0) {
          alert("Please enter at least one card value for your custom card set.");
          return;
        }
        joinData.cardSet = customCards;
      } else {
        // Default card set.
        joinData.cardSet = defaultCardSet;
      }
    }
    // For observers joining an existing session, no card set is provided.
    socket.emit('join', joinData);
  } else {
    // Estimators must join an existing session.
    if (sessionId === 'new') {
      alert("Please select an active session.");
      return;
    }
    socket.emit('join', { name, role, sessionId });
  }

  // Hide the login view and show the session view.
  loginDiv.style.display = 'none';
  sessionDiv.style.display = 'block';
  displaySessionId.textContent = sessionId;

  // Show the appropriate panel based on role.
  if (role === 'estimator') {
    estimatorView.style.display = 'block';
    renderCards();
    resetBtn.style.display = 'none';
  } else {
    observerView.style.display = 'block';
    resetBtn.style.display = 'inline-block';
    observerStatus.textContent = 'Waiting for all estimators to vote...';
  }
};

// Render card buttons (for estimators) using the current cardValues array.
function renderCards() {
  cardsDiv.innerHTML = '';
  cardValues.forEach(value => {
    const card = document.createElement('div');
    card.className = 'card';
    card.textContent = value;
    card.onclick = () => {
      if (votesAreRevealed) return;
      document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentSelection = value;
      socket.emit('vote', value);
    };
    cardsDiv.appendChild(card);
  });
}

// Observer reveal button.
revealBtn.onclick = () => {
  socket.emit('revealVotes');
};

// Reset round button (only for observers).
resetBtn.onclick = () => {
  resultsDiv.innerHTML = '';
  celebrateBtn.style.display = 'none';
  votesAreRevealed = false;
  currentSelection = null;
  socket.emit('reset');
  observerStatus.textContent = 'Waiting for all estimators to vote...';
};

// Update the users list.
socket.on('updateUsers', (users) => {
  usersUl.innerHTML = '';
  Object.values(users).forEach(user => {
    const li = document.createElement('li');
    li.textContent = `${user.icon} ${user.name} (${user.role}) - ${user.role === 'estimator' ? (user.vote !== null ? 'Voted' : 'Not voted') : ''}`;
    usersUl.appendChild(li);
  });
});

// Notify observer when all estimators have voted.
socket.on('allVoted', () => {
  if (role === 'observer') {
    observerStatus.textContent = 'All estimators have voted. You may reveal the votes.';
  }
});

socket.on('waitingForVotes', () => {
  document.getElementById('observerStatus').textContent = 'Waiting for all estimators to vote...';
});

// When votes are revealed, display results.
socket.on('votesRevealed', (users) => {
  votesAreRevealed = true;

  // 1) collect all estimator votes (as values)
  const votes = Object.values(users)
    .filter(u => u.role === 'estimator')
    .map(u => u.vote);

  // 2) map to indexes
  const idxVotes = votes
    .map(v => {
      const i = cardValues.indexOf(v);
      return i >= 0 ? i : null;
    })
    .filter(i => i !== null);

  // early exit
  if (idxVotes.length === 0) {
    resultsDiv.innerHTML = '<p>No votes to show.</p>';
    return;
  }

  // 3) compute stats on indexes
  const maxIdx = Math.max(...idxVotes);
  const minIdx = Math.min(...idxVotes);
  const avgIdxRaw = idxVotes.reduce((a,b)=>a+b,0) / idxVotes.length;

  // round to nearest integer index
  const avgIdxRounded = Math.round(avgIdxRaw);

  // 4) distribution by index
  const freq = {};
  idxVotes.forEach(i => freq[i] = (freq[i]||0) + 1);
  const distStr = Object.keys(freq)
    .sort((a,b)=>b-a)
    .map(i => `${cardValues[i]} (${freq[i]})`)
    .join(', ');

  // 5) agreement checks
  const matchCount = idxVotes.filter(i => i === avgIdxRounded).length;
  const matchPct = Math.round(matchCount / idxVotes.length * 100);
  const teamAgreement = matchPct >= 65;
  const strictConsensus = idxVotes.every(i => i === idxVotes[0]);

  let resultsHTML = `
    <h2>Results</h2>
    <ul>
      ${Object.values(users).map(u =>
        u.role==='estimator'
          ? `<li>${u.icon} ${u.name}: ${u.vote}</li>`
          : ''
      ).join('')}
    </ul>`;

  resultsHTML += 
    `<p>
      <strong>Highest Vote:</strong> ${cardValues[maxIdx]} |
      <strong>Lowest Vote:</strong> ${cardValues[minIdx]}
    </p>`;
  resultsHTML += `<p><strong>Vote Distribution:</strong> ${distStr}</p>`;
  resultsHTML += `<p><strong>Average Vote:</strong> ${cardValues[avgIdxRounded]}</p>`;

  if (votes.length > 2) {
    if (strictConsensus) {
      resultsHTML += `<p><strong>A mythical alignment unfolded 🦄</strong></p>`;
      for (let i = 0; i < 15; i++) {
        setTimeout(() => {
          animateUnicorn(getRandomColor());
        }, i * 500);
      }
    }

    resultsHTML += `<p><strong>Team Agreement (${matchPct}% on ${cardValues[avgIdxRounded]}):</strong> ${teamAgreement? 'Yes':'No'}</p>`;

    celebrateBtn.style.display = teamAgreement ? 'inline-block' : 'none';
  }

  resultsDiv.innerHTML = resultsHTML;
});

// Clear results on reset.
socket.on('resetVotes', () => {
  resultsDiv.innerHTML = '';
  votesAreRevealed = false;
  if (role === 'estimator') {
    currentSelection = null;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
  }
  celebrateBtn.style.display = 'none';
  if (role === 'observer') {
    observerStatus.textContent = 'Waiting for all estimators to vote...';
  }
});

// Celebration animation.
function animateCelebration(color) {
  const celebration = document.createElement('div');
  celebration.className = 'celebration';
  celebration.textContent = '🎉';
  celebration.style.color = color;
  const xPos = Math.random() * (window.innerWidth - 50);
  celebration.style.left = `${xPos}px`;
  celebration.style.top = `${window.innerHeight - 100}px`;
  celebrationContainer.appendChild(celebration);
  setTimeout(() => {
    celebrationContainer.removeChild(celebration);
  }, 2000);
}

// Unicorn animation.
function animateUnicorn(color) {
  const unicorn = document.createElement('div');
  unicorn.className = 'unicorn';
  unicorn.textContent = '🦄';
  unicorn.style.color = color;
  const xPos = Math.random() * (window.innerWidth - 50);
  unicorn.style.left = `${xPos}px`;
  unicorn.style.top = `${window.innerHeight - 100}px`;
  celebrationContainer.appendChild(unicorn);
  setTimeout(() => {
    celebrationContainer.removeChild(unicorn);
  }, 4000);
}

function getRandomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

celebrateBtn.onclick = () => {
  socket.emit('celebrate');
};

socket.on('celebrate', () => {
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      animateCelebration(getRandomColor());
    }, i * 300);
  }
});

socket.on('errorMessage', (msg) => {
  alert(msg);

  if (msg.includes('already been revealed')) {
    location.reload();
  }
});

socket.on('sessionExpired', (msg) => {
  alert(msg);
  location.reload();
});

socket.on('cardSetDefined', (newCardSet) => {
  cardValues = newCardSet;
  if (role === 'estimator') {
    renderCards();
  }
});

socket.on('sessionEnded', (msg) => {
  alert(msg);
  // Return to join screen by reloading the page (or you can show/hide appropriate UI elements)
  location.reload();
});

// Automatically refresh active sessions on page load.
window.addEventListener("load", () => {
  requestActiveSessions();
});