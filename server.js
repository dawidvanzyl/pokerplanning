// server.js
const defaultCardSet = ["1", "2", "3", "5", "8", "13", "21", "?"];

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// List of 30 icons (for estimators)
const estimatorIcons = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
  "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
  "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔"
];

// Fixed icon for observers
const observerIcon = "👀";

// Rooms object: key = sessionId, value = { users: { socketId: userData }, lastActivity: timestamp }
let rooms = {};

// Helper: update lastActivity for a room
function updateRoomActivity(sessionId) {
  if (rooms[sessionId]) {
    rooms[sessionId].lastActivity = Date.now();
  }
}

// Helper: Get list of active sessions
function getActiveSessions() {
  const activeSessions = [];
  for (const sessionId in rooms) {
    activeSessions.push({
      sessionId,
      userCount: Object.keys(rooms[sessionId].users).length,
      cardSet: rooms[sessionId].cardSet || null
    });
  }
  return activeSessions;
}

// Helper: Check if all estimators in a room have voted
function allEstimatorsVoted(roomUsers) {
  const estimators = Object.values(roomUsers).filter(user => user.role === 'estimator');
  if (estimators.length === 0) return false;
  return estimators.every(user => user.vote !== null && user.vote !== undefined);
}

// Periodically check for inactive sessions (10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const sessionId in rooms) {
    if (now - rooms[sessionId].lastActivity > 600000) { // 600000 ms = 10 minutes
      io.to(sessionId).emit('sessionExpired', 'Session expired due to inactivity.');
      // Disconnect all sockets in this room.
      for (const socketId in rooms[sessionId].users) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) {
          sock.disconnect(true);
        }
      }
      console.log(`Session ${sessionId} expired due to inactivity.`);
      delete rooms[sessionId];
      // Broadcast updated session list after removal.
      io.emit('sessionListUpdated', getActiveSessions());
    }
  }
}, 60000); // check every 60 seconds

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Allow observers to get the list of active sessions.
  socket.on('getActiveSessions', () => {
    socket.emit('activeSessions', getActiveSessions());
  });

  // When a client joins, they send name, role, and sessionId.
  socket.on('join', (data) => {
    const { name, role, sessionId, cardSet } = data;
    if (!sessionId) {
      socket.emit('errorMessage', 'Session ID is required.');
      return;
    }
    if (role === 'observer') {
      if (!rooms[sessionId]) {
        rooms[sessionId] = { users: {}, lastActivity: Date.now() };
        // Always store a card set—even if the observer did not pick a custom one.
        // If cardSet was provided (for example, if the observer chose a custom set or an existing option),
        // use that; otherwise, explicitly store the default.
        rooms[sessionId].cardSet = cardSet ? cardSet : defaultCardSet;
        // Inform clients in this session of the defined card set.
        io.to(sessionId).emit('cardSetDefined', rooms[sessionId].cardSet);
        io.emit('sessionListUpdated', getActiveSessions());
      }
    } else if (role === 'estimator') {
      if (!rooms[sessionId]) {
        socket.emit('errorMessage', 'Session does not exist. Ask an observer to create one first.');
        return;
      }
    }
    socket.join(sessionId);
    socket.roomId = sessionId;
    let icon = role === 'observer' ? observerIcon : estimatorIcons[Math.floor(Math.random() * estimatorIcons.length)];
    const user = { name, role, vote: null, icon };
    rooms[sessionId].users[socket.id] = user;
    updateRoomActivity(sessionId);
    if (role === 'estimator' && rooms[sessionId].cardSet) {
      // Send the observer-defined card set to this estimator.
      socket.emit('cardSetDefined', rooms[sessionId].cardSet);
    }
    io.to(sessionId).emit('updateUsers', rooms[sessionId].users);
  }); 

  // When an estimator submits a vote.
  socket.on('vote', (vote) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    if (rooms[roomId].users[socket.id] && rooms[roomId].users[socket.id].role === 'estimator') {
      rooms[roomId].users[socket.id].vote = vote;
      updateRoomActivity(roomId);
      io.to(roomId).emit('updateUsers', rooms[roomId].users);
      if (allEstimatorsVoted(rooms[roomId].users)) {
        io.to(roomId).emit('allVoted');
      }
    }
  });

  // When the observer chooses to reveal votes.
  socket.on('revealVotes', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    updateRoomActivity(roomId);
    io.to(roomId).emit('votesRevealed', rooms[roomId].users);
  });

  // When an observer resets the round.
  socket.on('reset', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    if (rooms[roomId].users[socket.id] && rooms[roomId].users[socket.id].role === 'observer') {
      for (const key in rooms[roomId].users) {
        if (rooms[roomId].users[key].role === 'estimator') {
          rooms[roomId].users[key].vote = null;
        }
      }
      updateRoomActivity(roomId);
      io.to(roomId).emit('updateUsers', rooms[roomId].users);
      io.to(roomId).emit('resetVotes');
    } else {
      console.log('Reset ignored: only observers can reset rounds.');
    }
  });

  // Broadcast celebrate events.
  socket.on('celebrate', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    updateRoomActivity(roomId);
    io.to(roomId).emit('celebrate');
  });

  // On disconnect.
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      io.to(roomId).emit('updateUsers', rooms[roomId].users);
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
        // Broadcast updated session list if the room becomes empty.
        io.emit('sessionListUpdated', getActiveSessions());
      }
    }
    console.log('Disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});