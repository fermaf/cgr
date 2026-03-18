import { fetchRecords, upsertRecord } from './src/clients/pinecone';

const env = {
    PINECONE_INDEX_HOST: process.env.PINECONE_INDEX_HOST || '',
    PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE || '',
    PINECONE_API_KEY: process.env.PINECONE_API_KEY || ''
};

async function run() {
    const testId = 'E400185N23';
    const meta = {
        Resumen: "Prueba unitaria tipo",
        aclarado: false, alterado: false, aplicado: false, boletin: false,
        complementado: false, confirmado: false, nuevo: false, reactivado: false,
        reconsiderado: false, reconsideradoParcialmente: false, recursoProteccion: false,
        relevante: false,
        analisis: "Texto de analisis prueba",
        created_at: new Date().toISOString(),
        fecha: "2023-10-01T00:00:00Z",
        materia: "Prueba manual",
        model: "mistral-large-2512",
        titulo: "Test Pinecone Array",
        u_time: 1696118400,
        text: "Texto de analisis prueba",
        descriptores_originales: ["original"],
        descriptores_AI: ["ley karin", "prueba", "array"]
    };

    await upsertRecord(env as any, { id: testId, text: meta.text, metadata: meta });
    console.log('Upsert exitoso. Verifique en Pinecone web ID:', testId);
}

run().catch(console.error);
