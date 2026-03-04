// cgr-platform/src/scripts/test_mistral_incident.ts
import { normalizeIncident } from '../lib/incident';
import { routeIncident } from '../lib/incidentRouter';

async function testMistralIncident() {
    console.log("--- 🧪 PRUEBA DE INCIDENTE MISTRAL --- \n");

    const rawError = new Error("Mistral fail: OF9810N26");

    const incident = normalizeIncident({
        error: rawError,
        env: 'local',
        service: 'backfill-workflow',
        context: {
            batchSize: 50
        }
    });

    console.log("✅ Incidente Normalizado:");
    console.log(JSON.stringify(incident, null, 2));
    console.log("\n---");

    const decision = routeIncident(incident);

    console.log("✅ Decisión de Ruteo:");
    console.log(JSON.stringify(decision, null, 2));

    if (incident.code === 'AI_MISTRAL_FAILED' && decision.skill === 'mistral_timeout_triage') {
        console.log("\n🚀 ¡ÉXITO! El error fue clasificado y ruteado correctamente.");
    } else {
        console.error("\n❌ FALLA EN LA CLASIFICACIÓN.");
    }
}

testMistralIncident().catch(console.error);
