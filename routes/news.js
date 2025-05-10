import express from 'express';
import newsDataService from '../services/newsDataService.js';

const router = express.Router();

router.get('/search', async (req, res) => {
  try {
    const { query, language } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Query parameter is required' 
      });
    }

    const articles = await newsDataService.searchNews(query, language);
    res.json({ articles });
  } catch (error) {
    console.error('Error searching news:', error);
    res.status(500).json({ 
      error: 'Failed to search news',
      details: error.message 
    });
  }
});

export const newsRouter = router; 