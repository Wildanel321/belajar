const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS so frontend running elsewhere (like file:// or editor server) can connect
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// Serve static files from the workspace directory
app.use(express.static(__dirname));
app.use(express.json());

// Local API routes (mirrors serverless functions for local testing)
app.get('/api/leaderboard', (req, res) => {
  res.json(readScores());
});

app.post('/api/leaderboard', (req, res) => {
  const { username, score } = req.body;
  if (!username || typeof score !== 'number') {
    return res.status(400).json({ error: 'Username and score required' });
  }

  const trimmedUsername = username.trim().substring(0, 20);
  if (!trimmedUsername) return res.status(400).json({ error: 'Invalid username' });

  let scores = readScores();
  const existingIndex = scores.findIndex(s => s.username.toLowerCase() === trimmedUsername.toLowerCase());

  if (existingIndex !== -1) {
    if (score > scores[existingIndex].score) {
      scores[existingIndex].score = score;
      scores[existingIndex].date = new Date().toLocaleDateString('id-ID');
    }
  } else {
    scores.push({
      username: trimmedUsername,
      score: score,
      date: new Date().toLocaleDateString('id-ID')
    });
  }

  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 10);
  writeScores(scores);

  // Sync to socket.io client if connected
  io.emit('leaderboard-update', scores);

  res.json(scores);
});

// Default mock scores for thematic vintage look
const defaultScores = [
  { username: "Ibnu Battuta", score: 950, date: new Date().toLocaleDateString('id-ID') },
  { username: "Cheng Ho", score: 900, date: new Date().toLocaleDateString('id-ID') },
  { username: "Marco Polo", score: 850, date: new Date().toLocaleDateString('id-ID') }
];

// Helper to read scores from file
function readScores() {
  try {
    if (fs.existsSync(SCORES_FILE)) {
      const data = fs.readFileSync(SCORES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading scores file:", err);
  }
  // Initialize file with default scores if it doesn't exist
  writeScores(defaultScores);
  return defaultScores;
}

// Helper to write scores to file
function writeScores(scores) {
  try {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing scores file:", err);
  }
}

// WebSocket logic
io.on('connection', (socket) => {
  console.log(`Explorer connected: ${socket.id}`);

  // Send current leaderboard on connection
  socket.emit('leaderboard-update', readScores());

  // Handle score submission
  socket.on('submit-score', (data) => {
    const { username, score } = data;
    if (!username || typeof score !== 'number') {
      return;
    }

    const trimmedUsername = username.trim().substring(0, 20); // limit length
    if (!trimmedUsername) return;

    let scores = readScores();

    // Check if user already exists
    const existingIndex = scores.findIndex(s => s.username.toLowerCase() === trimmedUsername.toLowerCase());

    if (existingIndex !== -1) {
      // Update only if the new score is higher
      if (score > scores[existingIndex].score) {
        scores[existingIndex].score = score;
        scores[existingIndex].date = new Date().toLocaleDateString('id-ID');
      }
    } else {
      // Add new entry
      scores.push({
        username: trimmedUsername,
        score: score,
        date: new Date().toLocaleDateString('id-ID')
      });
    }

    // Sort descending by score, then alphabetically/date
    scores.sort((a, b) => b.score - a.score);

    // Keep top 10
    scores = scores.slice(0, 10);

    writeScores(scores);

    // Broadcast updated leaderboard to all clients
    io.emit('leaderboard-update', scores);
    console.log(`New score submitted: ${trimmedUsername} - ${score}`);
  });

  socket.on('disconnect', () => {
    console.log(`Explorer disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Atlas Quiz Server is running on port ${PORT}`);
  console.log(`  Open http://localhost:${PORT} in your browser`);
  console.log(`==================================================`);
});
