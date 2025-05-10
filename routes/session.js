import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export const sessionRouter = express.Router();

// Create a new session
sessionRouter.post('/', (req, res) => {
  try {
    const sessionId = uuidv4();
    res.status(201).json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get all sessions
sessionRouter.get('/', async (req, res) => {
  try {
    const redisClient = req.app.get('redisClient');
    const sessionPattern = 'chat:*';
    
    // Get all session keys
    const sessionKeys = await redisClient.keys(sessionPattern);
    
    // Get the most recent message from each session
    const sessions = await Promise.all(
      sessionKeys.map(async (key) => {
        const sessionId = key.replace('chat:', '');
        const messages = await redisClient.lrange(key, 0, 0);
        
        if (messages.length === 0) {
          return null;
        }
        
        const lastMessage = JSON.parse(messages[0]);
        
        return {
          sessionId,
          lastMessage: lastMessage.content,
          timestamp: lastMessage.timestamp
        };
      })
    );
    
    // Filter out null sessions and sort by timestamp
    const validSessions = sessions
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.status(200).json({ sessions: validSessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Check if a session exists
sessionRouter.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const redisClient = req.app.get('redisClient');
    
    // Check if session exists in Redis
    const exists = await redisClient.exists(`chat:${sessionId}`);
    
    if (exists) {
      res.status(200).json({ sessionId, exists: true });
    } else {
      res.status(404).json({ sessionId, exists: false });
    }
  } catch (error) {
    console.error('Error checking session:', error);
    res.status(500).json({ error: 'Failed to check session' });
  }
});