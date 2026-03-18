import { upsertRecord } from './src/clients/pinecone';
import { readFileSync } from 'node:fs';

const env = {
    PINECONE_INDEX_HOST: "https://cgr-8aea039.svc.aped-4627-b74a.pinecone.io",
    PINECONE_NAMESPACE: "mistralLarge2512",
    PINECONE_API_KEY: "8e367468-d06e-41a4-9e32-a546736274a2",
    MISTRAL_MODEL: "mistral-large-2512"
};

async function test() {
    const id = "E195929N25";
    const rawJson = JSON.parse(readFileSync('/tmp/kv_E195929N25_flat.json', 'utf8'));

    // Mock enrichment
    const enrichment = {
        titulo: "Test",
        resumen: "Test",
        analisis: "Test",
        etiquetas_json: "[]"
    };

    const sourceContent = rawJson?._source ?? rawJson?.source ?? rawJson?.raw_data ?? rawJson;

    const metadata = {
        ...enrichment,
        descriptores_AI: [],
        materia: sourceContent?.materia || "",
        descriptores_originales: [],
        fecha: String(sourceContent?.fecha_documento || ''),
        model: "mistral-large-2512",
        analisis: "Test"
    };

    console.log("Metadata constructed:", JSON.stringify(metadata, null, 2));

    try {
        // En lugar de llamar a upsertRecord (que fallará por 403), solo probamos normalizePineconeMetadata
        // Pero normalizePineconeMetadata no está exportada. La replicamos:
        const input = metadata;
        let uTime = Number(input.u_time) || 0;
        if (uTime === 0 && input.fecha) {
            const parsedDate = Date.parse(String(input.fecha));
            if (!isNaN(parsedDate)) {
                uTime = Math.floor(parsedDate / 1000);
            }
        }

        console.log("Calculated uTime:", uTime);
        if (uTime === 0) {
            throw new Error(`Invalid u_time: metadata must have a valid date to calculate timestamp.`);
        }
        console.log("SUCCESS!");
    } catch (e) {
        console.error("FAILED:", e.message);
    }
}

test();
