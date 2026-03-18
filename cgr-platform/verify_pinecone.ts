import { fetchRecords } from './src/clients/pinecone';

const env = {
    PINECONE_INDEX_HOST: process.env.PINECONE_INDEX_HOST || '',
    PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE || '',
    PINECONE_API_KEY: process.env.PINECONE_API_KEY || ''
};

async function verify() {
    const ids = ['E218346N25'];
    console.log(`Verificando IDs: ${ids.join(', ')}`);

    try {
        const results = await fetchRecords(env as any, ids);
        console.log(JSON.stringify(results, null, 2));
    } catch (error) {
        console.error('Error verificando:', error);
    }
}

verify();
