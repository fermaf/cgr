import { normalizeIncident } from './src/lib/incident';

const mockEnv = 'prod';
const mockService = 'cgr-platform';
const mockWorkflow = 'backfillWorkflow';

const error = new Error("Mistral fail: OF9810N26");
const incident = normalizeIncident({
    error,
    env: mockEnv as any,
    service: mockService,
    workflow: mockWorkflow,
    context: { id: "OF9810N26" }
});

console.log("--- Incidente Normalizado ---");
console.log(JSON.stringify(incident, null, 2));

if (incident.code === 'AI_ENRICHMENT_FAILED') {
    console.log("\n✅ PRUEBA EXITOSA: Código AI_ENRICHMENT_FAILED detectado.");
} else {
    console.log("\n❌ PRUEBA FALLIDA: Código esperado AI_ENRICHMENT_FAILED, recibido " + incident.code);
    process.exit(1);
}

if (incident.context?.mistral_doc_id === 'OF9810N26') {
    console.log("✅ PRUEBA EXITOSA: mistral_doc_id extraído correctamente.");
} else {
    console.log("❌ PRUEBA FALLIDA: mistral_doc_id no encontrado o incorrecto.");
    process.exit(1);
}
