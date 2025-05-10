import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

import { setupRagPipeline } from './ragPipeline.js';
import { chatRouter } from './routes/chat.js';
import { sessionRouter } from './routes/session.js';
import { newsRouter } from './routes/news.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'PORT',
  'REDIS_URL',
  'QDRANT_URL',
  'QDRANT_API_KEY',
  'QDRANT_COLLECTION',
  'GEMINI_API_KEY',
  'NEWSDATA_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.warn(`WARNING: Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('Some features may not work correctly without these variables');
}

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',    // Local development

  'https://newzai-backend.vercel.app', // New production backend
  'https://newz-chi.vercel.app', // Current production frontend
  'http://localhost:3000',    // Alternative local
  'http://localhost:5000'     // Alternative local
];

// Initialize Express app
const app = express();
const server = http.createServer(app);

// CORS middleware with proper error handling
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      console.warn(`Rejected CORS request from origin: ${origin}`);
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Additional headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Set proper MIME types for JavaScript modules
  if (req.url.endsWith('.js')) {
    res.type('application/javascript');
  }
  if (req.url.endsWith('.mjs')) {
    res.type('application/javascript');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// Initialize Redis client
const redisClient = new Redis(process.env.REDIS_URL);
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Make Redis client available to routes
app.set('redisClient', redisClient);

// Root route handler
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'NewsChat AI API is running' });
});

// Socket.io connection
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`Rejected Socket.IO connection from origin: ${origin}`);
        callback(new Error('Origin not allowed'));
      }
    },
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e8,
  allowEIO3: true,
  path: '/socket.io/',
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});

io.on('connection', (socket) => {
  console.log('New client connected with ID:', socket.id);
  
  // Generate or use provided session ID
  const sessionId = socket.handshake.query.sessionId || uuidv4();
  console.log('Session ID:', sessionId);
  socket.join(sessionId);
  
  // Send session ID to client
  socket.emit('session', { sessionId });
  console.log('Sent session ID to client');
  
  socket.on('message', async (data) => {
    console.log('Received message:', data);
    try {
      const { message, sessionId } = data;
      
      // Emit "typing" indicator immediately
      socket.emit('status', { type: 'typing', message: 'Searching for information...' });
      console.log('Emitted typing status');
      
      // Store user message in Redis (don't await)
      const storeUserMessage = redisClient.lpush(`chat:${sessionId}`, JSON.stringify({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }));
      
      // Set TTL for the chat history (don't await)
      const setTTL = redisClient.expire(`chat:${sessionId}`, parseInt(process.env.REDIS_TTL, 10));
      
      // Broadcast user message immediately
      io.to(sessionId).emit('message', {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });
      
      // Process the message through RAG pipeline with status updates
      let processingStarted = false;
      const timeoutId = setTimeout(() => {
        if (!processingStarted) {
          socket.emit('status', { 
            type: 'processing', 
            message: 'This might take a moment...' 
          });
        }
      }, 3000);
      
      const botResponse = await processQuery(message);
      clearTimeout(timeoutId);
      processingStarted = true;
      
      // Store bot response in Redis (don't await)
      const storeBotResponse = redisClient.lpush(`chat:${sessionId}`, JSON.stringify({
        role: 'assistant',
        content: botResponse,
        timestamp: new Date().toISOString()
      }));
      
      // Send complete message immediately
      io.to(sessionId).emit('message', {
        role: 'assistant',
        content: botResponse,
        timestamp: new Date().toISOString(),
        isComplete: true
      });
      
      // Clear typing indicator
      socket.emit('status', { type: 'idle' });
      
      // Handle Redis operations in the background
      await Promise.all([storeUserMessage, setTTL, storeBotResponse]);
      
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Error processing your message' });
      socket.emit('status', { type: 'idle' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Initialize RAG pipeline
let processQuery = async (query) => {
  return "I'm sorry, the knowledge base is currently unavailable. Please try again later.";
};

(async () => {
  try {
    const ragPipeline = await setupRagPipeline();
    processQuery = ragPipeline.processQuery;
    console.log('RAG pipeline initialized successfully');
  } catch (error) {
    console.error('Failed to initialize RAG pipeline:', error);
    // Continue running the server without the RAG pipeline
    console.log('Server will continue running with limited functionality');
  }
})();

// API Routes
app.use('/api/chat', chatRouter);
app.use('/api/session', sessionRouter);
app.use('/api/news', newsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await redisClient.quit();
  server.close(() => {
    console.log('Server shut down successfully');
    process.exit(0);
  });
});

export default app;