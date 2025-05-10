import express from 'express';

export const chatRouter = express.Router();

// Get chat history for a session
chatRouter.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const redisClient = req.app.get('redisClient');
    
    // Get chat history from Redis
    const chatHistory = await redisClient.lrange(`chat:${sessionId}`, 0, -1);
    
    // Parse and reverse to get chronological order
    const messages = chatHistory
      .map(msg => JSON.parse(msg))
      .reverse();
    
    res.status(200).json({ sessionId, messages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Clear chat history for a session
chatRouter.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const redisClient = req.app.get('redisClient');
    
    // Delete chat history from Redis
    await redisClient.del(`chat:${sessionId}`);
    
    res.status(200).json({ message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// Send a chat message (REST API alternative to socket.io)
chatRouter.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // This endpoint is mainly for REST API access
    // The actual message processing happens in the socket.io handler
    // For simplicity, we'll just acknowledge the message here
    
    res.status(202).json({ 
      message: 'Message received. Use WebSocket for real-time responses.',
      sessionId 
    });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});