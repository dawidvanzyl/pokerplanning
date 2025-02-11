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

// Observer-only card set UI elements
const observerCardSetDiv = document.getElementById('observerCardSetDiv');
const newCardSetDiv = document.getElementById('newCardSetDiv');
const cardSetSelect = document.getElementById('cardSetSelect');
const customCardSetInput = document.getElementById('customCardSetInput');
const existingCardSetDiv = document.getElementById('existingCardSetDiv');
const existingCardSetLabel = document.getElementById('existingCardSetLabel');

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
// Use a mutable card deck array; it will be updated if a session defines one.
let cardValues = defaultCardSet.slice();

// We'll store the latest sessions list for use in populating card set options.
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

function populateCardSetDropdown() {
  const selectElem = document.getElementById('cardSetSelect');
  selectElem.innerHTML = '';

  // Option 1: Default
  const defaultOption = document.createElement('option');
  defaultOption.value = defaultCardSet.join(', ');
  defaultOption.textContent = `Default (${defaultCardSet.join(', ')})`;
  selectElem.appendChild(defaultOption);

  // Option 2: Custom sets from active sessions (deduplicated, excluding default)
  const uniqueSets = new Set();
  sessionsList.forEach(sess => {
    if (sess.cardSet && sess.cardSet.join(', ') !== defaultCardSet.join(', ')) {
      uniqueSets.add(sess.cardSet.join(', '));
    }
  });
  uniqueSets.forEach(setStr => {
    const option = document.createElement('option');
    option.value = setStr;
    option.textContent = setStr;
    selectElem.appendChild(option);
  });

  // Option 3: "Custom"
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom';
  selectElem.appendChild(customOption);

  // Default selection is the default option.
  selectElem.value = defaultCardSet.join(', ');

  // Hide the custom edit area initially.
  document.getElementById('customEditDiv').style.display = 'none';
}

document.getElementById('cardSetSelect').addEventListener('change', function () {
  const value = this.value;
  const customEditDiv = document.getElementById('customEditDiv');
  const customInput = document.getElementById('customCardSetInput');

  if (value === 'custom') {
    // When "Custom" is selected, show an empty text box for input.
    customInput.value = "";
    customEditDiv.style.display = 'block';
  } else if (value !== defaultCardSet.join(', ')) {
    // If a custom option (previously defined) is selected, show it for editing.
    customInput.value = value;
    customEditDiv.style.display = 'block';
  } else {
    // Default option selected; hide custom edit.
    customEditDiv.style.display = 'none';
  }
});

document.getElementById('deleteCustomBtn').addEventListener('click', function () {
  const selectElem = document.getElementById('cardSetSelect');
  const currentValue = selectElem.value;
  if (currentValue !== defaultCardSet.join(', ') && currentValue !== 'custom') {
    // Remove the option matching the current custom value.
    for (let i = 0; i < selectElem.options.length; i++) {
      if (selectElem.options[i].value === currentValue) {
        selectElem.remove(i);
        break;
      }
    }
  }
  // Reset the dropdown to default.
  selectElem.value = defaultCardSet.join(', ');
  document.getElementById('customEditDiv').style.display = 'none';
});

// Request active sessions from the server.
function requestActiveSessions() {
  socket.emit('getActiveSessions');
}

// When receiving active sessions, update our sessionsList and populate the session dropdown.
socket.on('activeSessions', (sessions) => {
  sessionsList = sessions;
  sessionSelect.innerHTML = '';
  if (role === 'observer') {
    // Always include the "Create New Session" option for observers.
    const newOption = document.createElement('option');
    newOption.value = 'new';
    newOption.textContent = 'Create New Session';
    sessionSelect.appendChild(newOption);
  }
  sessions.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.sessionId;
    opt.textContent = `Session ${item.sessionId} (${item.userCount} user${item.userCount === 1 ? '' : 's'})`;
    // If this session has a card set defined, attach it as a data attribute.
    if (item.cardSet && item.cardSet.length) {
      opt.dataset.cardSet = item.cardSet.join(', ');
    }
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
    if (item.cardSet && item.cardSet.length) {
      opt.dataset.cardSet = item.cardSet.join(', ');
    }
    sessionSelect.appendChild(opt);
  });
});

// When role changes, update UI immediately.
roleSelect.addEventListener('change', () => {
  role = roleSelect.value;
  requestActiveSessions();
  if (role === 'observer') {
    sessionDropdownDiv.style.display = 'block';
    observerCardSetDiv.style.display = 'block';
    // Force the session dropdown to "new" and trigger change.
    setTimeout(() => {
      if (sessionSelect.options.length > 0) {
        sessionSelect.value = 'new';
        sessionSelect.dispatchEvent(new Event('change'));
      }
    }, 100);
  } else {
    observerCardSetDiv.style.display = 'none';
  }
});


// When the session dropdown changes (only for observers), update the card set selection UI.
sessionSelect.addEventListener('change', () => {
  if (role !== 'observer') return;
  if (sessionSelect.value === 'new') {
    // "Create New Session" selected: show the new card set dropdown.
    newCardSetDiv.style.display = 'block';
    existingCardSetDiv.style.display = 'none';
    populateCardSetDropdown();
  } else {
    // For an existing session, hide new session controls and display a label.
    newCardSetDiv.style.display = 'none';
    document.getElementById('customEditDiv').style.display = 'none';
    existingCardSetDiv.style.display = 'block';
    const selectedOption = sessionSelect.options[sessionSelect.selectedIndex];
    const cs = selectedOption.dataset.cardSet || defaultCardSet.join(', ');
    existingCardSetLabel.textContent = cs;
  }
});

// Populate the new card set dropdown with the default, any previously defined sets, and a "Custom" option.
function populateNewCardSetOptions() {
  // Clear previous options.
  cardSetSelect.innerHTML = '';
  // Always include the default option.
  const defOpt = document.createElement('option');
  defOpt.value = 'default';
  defOpt.textContent = `Default (${defaultCardSet.join(', ')})`;
  cardSetSelect.appendChild(defOpt);
  // Extract any unique card sets from the active sessions (excluding the default).
  const uniqueSets = new Set();
  sessionsList.forEach(sess => {
    if (sess.cardSet && sess.cardSet.join(', ') !== defaultCardSet.join(', ')) {
      uniqueSets.add(sess.cardSet.join(', '));
    }
  });
  uniqueSets.forEach(setStr => {
    const opt = document.createElement('option');
    opt.value = setStr;
    opt.textContent = setStr;
    cardSetSelect.appendChild(opt);
  });
  // Always add the "Custom" option.
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom';
  cardSetSelect.appendChild(customOpt);
}

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
    let cardSet;
    if (sessionId === 'new') {
      // Generate a new session id.
      sessionId = generateSessionId();
      const selectedValue = document.getElementById('cardSetSelect').value;
      if (selectedValue === 'custom') {
        cardSet = customCardSetInput.value.split(",").map(s => s.trim()).filter(s => s !== "");
        if (cardSet.length === 0) {
          alert("Please enter at least one card value for your custom card set.");
          return;
        }
      } else {
        cardSet = selectedValue.split(",").map(s => s.trim());
      }
    }
    socket.emit('join', { name, role, sessionId, cardSet });
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
    // Ensure the observer view is visible.
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
  // Reset observer status text.
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