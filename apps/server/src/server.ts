import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import { registerSocketHandlers, flushPendingUpdates } from './ws/socketHandler';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 5001;
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

// Middlewares
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json());
app.use(cookieParser());

// REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
  pingTimeout: 60000,
});

registerSocketHandlers(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Allowed CORS origin: ${CLIENT_URL}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  
  // Close HTTP & Socket server first to reject new actions
  httpServer.close(async () => {
    console.log('[Server] HTTP server closed.');
    
    // Flush all pending DB writes
    try {
      await flushPendingUpdates();
    } catch (err) {
      console.error('[Server] Error flushing updates during shutdown:', err);
    }
    
    process.exit(0);
  });

  // Force shutdown after 10s if graceful fails
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
