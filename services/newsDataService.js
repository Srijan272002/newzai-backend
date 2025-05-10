import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class NewsDataService {
  constructor() {
    this.apiKey = process.env.NEWSDATA_API_KEY;
    this.baseUrl = 'https://newsdata.io/api/1/news';
  }

  async searchNews(query, language = 'en') {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          apikey: this.apiKey,
          q: query,
          language: language
        }
      });

      if (response.data.status === 'success') {
        return response.data.results.map(article => ({
          id: article.article_id,
          title: article.title,
          content: article.content || article.description,
          source: article.link,
          pubDate: article.pubDate,
          sourceId: article.source_id,
          imageUrl: article.image_url
        }));
      }
      
      throw new Error('Failed to fetch news');
    } catch (error) {
      console.error('Error fetching news:', error);
      throw error;
    }
  }
}

export default new NewsDataService(); 