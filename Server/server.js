// server.js
// Minimal Socket.IO relay for TriviaApp (rooms + host/user pairing)
// Run: npm i express socket.io
// Start: node server.js
// Open big screen: http://localhost:3000/index.html
// Open phone:      http://localhost:3000/user.html

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // tighten later if needed
    methods: ["GET", "POST"],
  },
});

app.use(express.static(path.join(__dirname))); // serves index.html + user.html from same folder

// In-memory room registry (no DB)
const rooms = new Map();
/*
rooms.get(roomCode) => {
  hostId: string,
  createdAt: number,
  lastHostState: object | null,
}
*/

function normalizeCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function makeUserId(socket) {
  // short id for debugging
  return (socket.id || "").slice(0, 6);
}

// Optional: cleanup old rooms (prevents memory growth)
const ROOM_TTL_MS = 1000 * 60 * 60; // 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [code, info] of rooms.entries()) {
    if (now - info.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}, 1000 * 60 * 5); // every 5 minutes

io.on("connection", (socket) => {
  const userId = makeUserId(socket);

  // HOST: create/claim a room code
  socket.on("host_create_room", ({ roomCode } = {}) => {
    const code = normalizeCode(roomCode);
    if (code.length !== 6) return;

    // If room exists with a different host, we replace host (kiosk restart)
    const existing = rooms.get(code);

    rooms.set(code, {
      hostId: socket.id,
      createdAt: existing?.createdAt || Date.now(),
      lastHostState: existing?.lastHostState || null,
    });

    // Join host to room
    socket.join(code);

    // Confirm to host
    socket.emit("room_created", { roomCode: code });

    // If we have last known host state (e.g., refresh), re-broadcast it
    const info = rooms.get(code);
    if (info?.lastHostState) {
      socket.emit("host_state", { roomCode: code, state: info.lastHostState });
    }
  });

  // HOST: broadcast state snapshot to room (phones listen)
  socket.on("host_state", ({ roomCode, state } = {}) => {
    const code = normalizeCode(roomCode);
    const info = rooms.get(code);
    if (!info) return;

    // Only the room host can publish
    if (info.hostId !== socket.id) return;

    info.lastHostState = state || null;
    rooms.set(code, info);

    // Send to everyone in room EXCEPT host (phones only)
    socket.to(code).emit("host_state", { roomCode: code, state: info.lastHostState });
  });

  // HOST: notify (optional) that host advanced
  socket.on("host_next_question", ({ roomCode, qIndex } = {}) => {
    const code = normalizeCode(roomCode);
    const info = rooms.get(code);
    if (!info) return;
    if (info.hostId !== socket.id) return;

    // This event is optional; you can ignore it on phone if you want
    socket.to(code).emit("host_next_question", { roomCode: code, qIndex });
  });

  // USER: join room
  socket.on("user_join_room", ({ roomCode } = {}) => {
    const code = normalizeCode(roomCode);
    if (code.length !== 6) return;

    const info = rooms.get(code);
    if (!info) {
      socket.emit("room_error", { roomCode: code, error: "Room not found" });
      return;
    }

    // Join user to room
    socket.join(code);

    // Confirm to user (and host)
    socket.emit("room_joined", { roomCode: code, userId });
    io.to(info.hostId).emit("room_joined", { roomCode: code, userId });

    // Send last host state to the user immediately (so they see current question)
    if (info.lastHostState) {
      socket.emit("host_state", { roomCode: code, state: info.lastHostState });
    }
  });

  // USER: answer
  socket.on("user_answer", ({ roomCode, choice } = {}) => {
    const code = normalizeCode(roomCode);
    const info = rooms.get(code);
    if (!info) return;

    const c = String(choice || "").toUpperCase();
    if (!["A", "B", "C", "D"].includes(c)) return;

    // Relay ONLY to host (big screen)
    io.to(info.hostId).emit("user_answer", { roomCode: code, choice: c, userId });
  });

  socket.on("disconnect", () => {
    // If host disconnects, optionally keep room for a bit (refresh)
    // We'll remove rooms where host was this socket after TTL, or if you want immediate cleanup:
    for (const [code, info] of rooms.entries()) {
      if (info.hostId === socket.id) {
        // Keep it (so host refresh can reclaim) — OR delete immediately:
        // rooms.delete(code);
        // We'll keep it; host can reclaim with same code
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`TriviaApp server running on http://localhost:${PORT}`);
});
