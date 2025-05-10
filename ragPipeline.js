import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';
import newsDataService from './services/newsDataService.js';

// Load environment variables
dotenv.config();

// Initialize the embedding pipeline
let embedder = null;
// Cache for embeddings
const embeddingCache = new Map();

// Placeholder for legacy ingestNews functionality if needed by other parts of the system
const ingestNews = async () => {
  console.warn('Legacy ingestNews function called - this functionality has been replaced by NewsData.io integration');
  return [];
};

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // Use quantized model for faster inference
    });
  }
  return embedder;
}

export async function setupRagPipeline() {
  try {
    console.log('Setting up RAG pipeline...');
    
    // Initialize Qdrant client with proper configuration for cloud instance
    const qdrantClient = new QdrantClient({ 
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      timeout: 5000, // Reduced timeout
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    // Test connection with a health check
    try {
      console.log('Testing Qdrant connection...');
      const collections = await qdrantClient.getCollections();
      console.log('Successfully connected to Qdrant');
      console.log('Available collections:', collections);
    } catch (healthError) {
      console.error('Qdrant connection error:', healthError);
      throw healthError;
    }
    
    // Initialize Google Generative AI
    console.log('Initializing Gemini model...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.3,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 150,
      },
    });

    // Function to generate embeddings with caching
    async function generateEmbedding(text) {
      // Check cache first
      const cacheKey = text.slice(0, 100); // Use first 100 chars as key
      if (embeddingCache.has(cacheKey)) {
        return embeddingCache.get(cacheKey);
      }

      try {
        const embedder = await getEmbedder();
        const output = await embedder(text, {
          pooling: 'mean',
          normalize: true
        });
        const embedding = Array.from(output.data);
        
        // Store in cache
        embeddingCache.set(cacheKey, embedding);
        
        // Limit cache size
        if (embeddingCache.size > 1000) {
          const firstKey = embeddingCache.keys().next().value;
          embeddingCache.delete(firstKey);
        }
        
        return embedding;
      } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
      }
    }

    // Function to retrieve relevant passages
    async function retrievePassages(query) {
      try {
        // Step 1: Try to get real-time news from NewsData.io
        const articles = await newsDataService.searchNews(query);
        if (articles && articles.length > 0) {
          return {
            source: 'newsdata',
            passages: articles.map(article => ({
              title: article.title,
              content: article.content,
              source: article.source,
              pubDate: article.pubDate
            }))
          };
        }

        // Step 2: Try vector search in our database
        const queryEmbedding = await generateEmbedding(query);
        const searchResults = await qdrantClient.search(process.env.QDRANT_COLLECTION, {
          vector: queryEmbedding,
          limit: 1,
          score_threshold: 0.7
        });
        
        if (searchResults.length > 0) {
          return {
            source: 'vector',
            passages: searchResults.map(result => result.payload)
          };
        }

        // Step 3: Fallback to web search
        const webResults = await model.generateContent({
          contents: [{ 
            role: 'user', 
            parts: [{ text: `Search the web for recent information about: ${query}. Return the information in a clear, factual way.` }] 
          }],
        });

        if (webResults.response) {
          return {
            source: 'web',
            passages: [{
              title: query,
              content: webResults.response.text(),
              source: 'Web Search',
              pubDate: new Date().toISOString()
            }]
          };
        }

        return { source: 'none', passages: [] };
      } catch (error) {
        console.error('Error retrieving passages:', error);
        throw error;
      }
    }

    // Function to generate response using Gemini
    async function generateResponse(query, searchResult) {
      try {
        const context = searchResult.passages.map(p => `${p.title}: ${p.content}`).join('\n');
        
        let prompt;
        if (searchResult.source === 'newsdata') {
          prompt = `Based on this recent news: "${context}" - ${query} Answer in 1-2 sentences.`;
        } else if (searchResult.source === 'vector') {
          prompt = `Based on this historical news: "${context}" - ${query} Answer in 1-2 sentences, noting this may not be the most recent information.`;
        } else if (searchResult.source === 'web') {
          prompt = `Based on this web search result: "${context}" - ${query} Answer in 1-2 sentences.`;
        }
        
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        return result.response?.text() || "I couldn't find relevant information to answer your question.";
      } catch (error) {
        console.error('Error generating response:', error);
        return "I'm sorry, I couldn't process your query at this time.";
      }
    }

    // Main function to process a query through the RAG pipeline
    async function processQuery(query) {
      try {
        const searchResult = await retrievePassages(query);
        if (!searchResult.passages.length) {
          return "I don't have enough information to answer that question.";
        }
        return await generateResponse(query, searchResult);
      } catch (error) {
        console.error('Error processing query:', error);
        return "I'm sorry, I couldn't process your query at this time.";
      }
    }

    return { processQuery };
  } catch (error) {
    console.error('Error setting up RAG pipeline:', error);
    throw error;
  }
}