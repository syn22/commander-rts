import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './network/SocketHandler.js';
import { fileURLToPath } from 'url';
import path from 'path';

// ============================================================
// Server entry point
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Serve built client files in production
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: Date.now(), sessions: 'active' });
});

// SPA fallback — serve index.html for any non-API, non-static route
// Express 5 uses {*path} syntax instead of *
app.use((_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Setup socket handlers
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let keyStatus = 'NOT SET';
  if (apiKey) {
    const trimmed = apiKey.trim();
    keyStatus = `SET (len: ${apiKey.length}, trimmed: ${trimmed.length}, start: "${trimmed.substring(0, 15)}...")`;
  }

  console.log(`\n====================================`);
  console.log(`  Commander RTS Server`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Serving client from: ${clientDistPath}`);
  console.log(`  ANTHROPIC_API_KEY: ${keyStatus}`);
  console.log(`====================================\n`);
});
