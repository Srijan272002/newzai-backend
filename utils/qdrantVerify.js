import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

async function verifyQdrantPermissions() {
  const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
  });

  const tests = [
    {
      name: 'Collections Read',
      test: async () => await qdrantClient.getCollections(),
      permission: 'collections:read'
    },
    {
      name: 'Collections Write',
      test: async () => {
        const testCollectionName = 'test-permission-collection';
        await qdrantClient.createCollection(testCollectionName, {
          vectors: { size: 4, distance: 'Cosine' }
        });
        await qdrantClient.deleteCollection(testCollectionName);
      },
      permission: 'collections:write'
    },
    {
      name: 'Vectors Read',
      test: async () => {
        if (process.env.QDRANT_COLLECTION) {
          await qdrantClient.scroll(process.env.QDRANT_COLLECTION, { limit: 1 });
        }
      },
      permission: 'vectors:read'
    },
    {
      name: 'Vectors Write',
      test: async () => {
        if (process.env.QDRANT_COLLECTION) {
          await qdrantClient.upsert(process.env.QDRANT_COLLECTION, {
            wait: true,
            points: [{
              id: 'test-point',
              vector: [0.1, 0.2, 0.3, 0.4],
              payload: { test: true }
            }]
          });
        }
      },
      permission: 'vectors:write'
    }
  ];

  console.log('Starting Qdrant permissions verification...\n');

  for (const { name, test, permission } of tests) {
    try {
      console.log(`Testing ${name} permission (${permission})...`);
      await test();
      console.log(`✅ ${name} permission verified successfully\n`);
    } catch (error) {
      console.error(`❌ ${name} permission test failed:`);
      console.error(`Error: ${error.message}\n`);
    }
  }
}

// Run the verification if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  verifyQdrantPermissions()
    .then(() => console.log('Verification complete'))
    .catch(console.error);
}

export { verifyQdrantPermissions }; 