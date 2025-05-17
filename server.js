const defaultCardSet = ["1", "3", "6", "9", "12", "18", "24", "30"];

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

// Rooms object: key = sessionId, value = { users: { socketId: userData }, lastActivity: timestamp, cardSet, votesRevealed: bool }
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
    if (now - rooms[sessionId].lastActivity > 600000) { // 10 minutes
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
      io.emit('sessionListUpdated', getActiveSessions());
    }
  }
}, 60000); // every 60 seconds

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Allow clients to get the list of active sessions.
  socket.on('getActiveSessions', () => {
    socket.emit('activeSessions', getActiveSessions());
  });

  // When a client joins, they send name, role, sessionId, and (optionally) cardSet.
  socket.on('join', (data) => {
    const { name, role, sessionId, cardSet } = data;
    if (!sessionId) {
      socket.emit('errorMessage', 'Session ID is required.');
      return;
    }

    socket.join(sessionId);
    if (role === 'observer') {
      if (!rooms[sessionId]) {
        // Create a new session.
        // If a cardSet was provided (for a new session), use it; otherwise use the default.
        rooms[sessionId] = {
          users: {},
          lastActivity: Date.now(),
          cardSet: cardSet ? cardSet : defaultCardSet,
          votesRevealed: false
        };
        io.to(sessionId).emit('cardSetDefined', rooms[sessionId].cardSet);
        io.emit('sessionListUpdated', getActiveSessions());
      }
    } else if (role === 'estimator') {
      if (!rooms[sessionId]) {
        socket.emit('errorMessage', 'Session does not exist. Ask an observer to create one first.');
        return;
      }

      if (rooms[sessionId].votesRevealed) {
        socket.emit('errorMessage', 'Cannot join: votes have already been revealed.');
        return;
      }
    }
    
    socket.roomId = sessionId;
    let icon = role === 'observer' ? observerIcon : estimatorIcons[Math.floor(Math.random() * estimatorIcons.length)];
    const user = { name, role, vote: null, icon };
    rooms[sessionId].users[socket.id] = user;
    updateRoomActivity(sessionId);
    if (role === 'estimator') {
      // Send the session's card set to the estimator.
      socket.emit('cardSetDefined', rooms[sessionId].cardSet);

      // Notify observers that we are waiting for new vote(s) again
      io.to(sessionId).emit('waitingForVotes');
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
    rooms[roomId].votesRevealed = true;
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
      rooms[roomId].votesRevealed = false;
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
      // Remove the disconnected user from the room.
      delete rooms[roomId].users[socket.id];

      // Check if any observers remain.
      const observersRemaining = Object.values(rooms[roomId].users).some(
        (user) => user.role === 'observer'
      );

      if (!observersRemaining) {
        // No observers remain: emit an event and disconnect all sockets in the room.
        io.to(roomId).emit('sessionEnded', 'All observers have left. Session ended.');

        // Disconnect all sockets in the room.
        for (const socketId in rooms[roomId].users) {
          const sock = io.sockets.sockets.get(socketId);
          if (sock) {
            sock.disconnect(true);
          }
        }
        delete rooms[roomId];
        io.emit('sessionListUpdated', getActiveSessions());
      } else {
        const roomUsers = rooms[roomId].users;

        // Emit updated user list
        io.to(roomId).emit('updateUsers', roomUsers);

        // If estimators remain, check voting status
        const estimatorsRemaining = Object.values(roomUsers).some(u => u.role === 'estimator');
        if (estimatorsRemaining) {
          if (allEstimatorsVoted(roomUsers)) {
            io.to(roomId).emit('allVoted');
          } else {
            io.to(roomId).emit('waitingForVotes');
          }
        }
      }
    }
    console.log('Disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});