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
  let estimatorVotes = [];
  let resultsHTML = '<h2>Results</h2><ul>';
  Object.values(users).forEach(user => {
    if (user.role === 'estimator') {
      estimatorVotes.push(user.vote);
      resultsHTML += `<li>${user.icon} ${user.name}: ${user.vote}</li>`;
    }
  });
  resultsHTML += '</ul>';

  // Process numeric votes to compute highest, lowest and frequency distribution.
  const numericVotes = estimatorVotes.filter(vote => !isNaN(vote)).map(Number);
  let highest = 'N/A';
  let lowest = 'N/A';
  let rawAvg = 0;
  let distributionStr = '';

  if (numericVotes.length > 0) {
    highest = Math.max(...numericVotes);
    lowest = Math.min(...numericVotes);
    rawAvg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;

    // Build frequency distribution.
    let freq = {};
    numericVotes.forEach(vote => {
      freq[vote] = (freq[vote] || 0) + 1;
    });
    // Sort the vote values in descending order.
    let sortedVotes = Object.keys(freq).map(Number).sort((a, b) => b - a);
    distributionStr = sortedVotes.map(vote => `${vote} (${freq[vote]})`).join(', ');
  }

  // Calculate average using only numeric votes.
  let averageVote = 'N/A';
  if (numericVotes.length > 0) {
    const sum = numericVotes.reduce((acc, val) => acc + val, 0);
    averageVote = (sum / numericVotes.length).toFixed(2);
  }

  const cvs = cardValues.map(Number).sort((a, b) => a - b);
  let normalised = cvs[0];
  let smallestDiff = Infinity;
  for (const v of cvs) {
    const diff = Math.abs(rawAvg - v);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      normalised = v;
    }
  }

  resultsHTML += `<p><strong>Highest Vote:</strong> ${highest} | <strong>Lowest Vote:</strong> ${lowest} | <strong>Average Vote:</strong> ${averageVote}</p>`;
  resultsHTML += `<p><strong>Vote Distribution:</strong> ${distributionStr}</p>`;
  resultsHTML += `<p><strong>Normalised Vote:</strong> ${normalised}</p>`;

  // List non-numeric votes.
  const nonNumericVotes = estimatorVotes.filter(vote => isNaN(vote));
  if (nonNumericVotes.length > 0) {
    resultsHTML += `<p><strong>Excluded Votes:</strong> ${nonNumericVotes.join(', ')}</p>`;
  }

  // Determine if there is consensus.
  const agreement = estimatorVotes.length > 0 && estimatorVotes.every(vote => vote === estimatorVotes[0]) ? 'Yes' : 'No';
  resultsHTML += `<p><strong>Agreement Reached:</strong> ${agreement}</p>`;

  resultsDiv.innerHTML = resultsHTML;
  celebrateBtn.style.display = agreement === 'Yes' ? 'inline-block' : 'none';
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
function animateThumbsUp(color) {
  const thumbsUp = document.createElement('div');
  thumbsUp.className = 'celebration';
  thumbsUp.textContent = '🎉';
  thumbsUp.style.color = color;
  const xPos = Math.random() * (window.innerWidth - 50);
  thumbsUp.style.left = `${xPos}px`;
  thumbsUp.style.top = `${window.innerHeight - 100}px`;
  celebrationContainer.appendChild(thumbsUp);
  setTimeout(() => {
    celebrationContainer.removeChild(thumbsUp);
  }, 2000);
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
      animateThumbsUp(getRandomColor());
    }, i * 300);
  }
});

socket.on('errorMessage', (msg) => {
  alert(msg);
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