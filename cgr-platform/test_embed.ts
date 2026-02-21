import OpenAI from 'openai';

async function generateEmbedding() {
  const client = new OpenAI({
    apiKey: process.env.MISTRAL_API_KEY,
    baseURL: process.env.MISTRAL_API_URL,
    defaultHeaders: { 'cf-aig-authorization': process.env.CF_AIG_AUTHORIZATION }
  });

  const response = await client.embeddings.create({
    model: "mistral-embed",
    input: ["prueba"]
  });

  console.log(response.data[0].embedding.length);
}
generateEmbedding();
