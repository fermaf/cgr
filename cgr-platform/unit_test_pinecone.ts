
import { upsertRecord } from './src/clients/pinecone';

async function runTest() {
    const env = {
        PINECONE_INDEX_HOST: "https://cgr-8aea039.svc.aped-4627-b74a.pinecone.io",
        PINECONE_NAMESPACE: "mistralLarge2512",
        PINECONE_API_KEY: "8e367468-d06e-41a4-9e32-a546736274a2", // Tomado de logs previos si estuviera, pero usaré el de wrangler si puedo. 
        MISTRAL_MODEL: "mistral-large-2512"
    };

    const recordId = "UNIT_TEST_METADATA_02";
    console.log(`Enviando registro de prueba ${recordId} a Pinecone...`);

    try {
        await upsertRecord(env as any, {
            id: recordId,
            text: "Este es un texto de prueba para verificar la indexación de descriptores_AI.",
            metadata: {
                titulo: "Prueba de Metadatos",
                resumen: "Verificación de descriptores_AI",
                descriptores_AI: ["test1", "test2", "derecho administrativo"],
                descriptores_originales: ["original1"],
                u_time: Math.floor(Date.now() / 1000),
                fecha: "2026-03-04"
            }
        });
        console.log("Upsert completado con éxito.");
    } catch (e) {
        console.error("Error en upsert:", e);
    }
}

runTest();
