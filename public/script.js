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
const defaultCardSet = ["1", "2", "3", "5", "8", "13", "21", "?"];
// The card deck will always be the default.
let cardValues = defaultCardSet.slice();

// We'll store the latest sessions list for use in populating sessionSelect.
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

// When receiving active sessions, update our sessionsList and populate the session dropdown.
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

// Also update the session list automatically if the server broadcasts an update.
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

// When role changes, update UI immediately.
roleSelect.addEventListener('change', () => {
  role = roleSelect.value;
  requestActiveSessions();
  // No custom card set UI needed; simply show the session dropdown.
  sessionDropdownDiv.style.display = 'block';
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
  
  if (role === 'observer') {
    // If creating a new session, generate a new session ID.
    if (sessionId === 'new') {
      sessionId = generateSessionId();
    }
    socket.emit('join', { name, role, sessionId });
  } else {
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

// When votes are revealed, display results (with average and excluded votes).
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
  // Calculate average using only numeric votes.
  const numericVotes = estimatorVotes.filter(vote => !isNaN(vote));
  let averageVote = 'N/A';
  if (numericVotes.length > 0) {
    const sum = numericVotes.reduce((acc, val) => acc + Number(val), 0);
    averageVote = (sum / numericVotes.length).toFixed(2);
  }
  resultsHTML += `<p><strong>Average Vote:</strong> ${averageVote}</p>`;
  // List non-numeric votes.
  const nonNumericVotes = estimatorVotes.filter(vote => isNaN(vote));
  if (nonNumericVotes.length > 0) {
    resultsHTML += `<p><strong>Excluded Votes:</strong> ${nonNumericVotes.join(', ')}</p>`;
  }
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
  thumbsUp.textContent = '👍';
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

// Automatically refresh active sessions on page load.
window.addEventListener("load", () => {
  requestActiveSessions();
});