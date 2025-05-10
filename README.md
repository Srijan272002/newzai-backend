# Backend (VertiFast)

This directory contains the backend server application for VertiFast, providing API endpoints and services for the frontend application.

## Tech Stack

- Node.js
- Express.js
- RAG Pipeline for AI processing
- Environment-based configuration
- RESTful API architecture

## Directory Structure

```
backend/
├── services/      # Business logic and service implementations
├── routes/        # API route definitions
├── utils/         # Utility functions and helpers
├── index.js       # Main server entry point
├── ragPipeline.js # RAG (Retrieval-Augmented Generation) implementation
└── vercel.json    # Vercel deployment configuration
```

## Getting Started

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required values in `.env`

4. Start the development server:
   ```bash
   npm run dev
   ```

## Development

- The server is built with Node.js and Express
- API routes are organized in the `routes/` directory
- Business logic is separated into services in the `services/` directory
- Utility functions are kept in the `utils/` directory

## API Documentation

The backend provides several API endpoints:

- API endpoints and their documentation will be listed here
- Each endpoint should include its purpose, methods, and expected request/response formats

## Environment Variables

The following environment variables need to be set in your `.env` file:

- Check `.env.example` for all required environment variables and their descriptions

## Deployment

The backend is configured for deployment on Vercel:

- Configuration is defined in `vercel.json`
- Deployment settings can be adjusted as needed
- Production environment variables should be set in the deployment platform

## Error Handling

- The application uses standardized error responses
- Error logging is implemented for debugging
- HTTP status codes are used appropriately

## Security

- Environment variables are used for sensitive data
- Authentication and authorization are implemented where necessary
- Input validation is performed on all endpoints

## Related Documentation

- [Main Project README](../README.md)
- [Architecture Documentation](../ARCHITECTURE.md)

## Contributing

1. Follow the existing code structure
2. Implement proper error handling
3. Add appropriate comments and documentation
4. Test your changes thoroughly
5. Update this README if you add new features or dependencies 
