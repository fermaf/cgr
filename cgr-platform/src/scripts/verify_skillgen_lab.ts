// cgr-platform/src/scripts/verify_skillgen_lab.ts
import { normalizeIncident } from '../lib/incident';
import { routeIncident } from '../lib/incidentRouter';

/**
 * ¡BIENVENIDO AL LABORATORIO DE SKILLGEN!
 * 
 * ¿Qué es Skillgen? Es como una "Caja Negra" de avión para nuestro sistema.
 * Cuando algo falla, en lugar de solo decir "Falló", Skillgen toma el error,
 * lo analiza, lo limpia (para que no se filtren contraseñas) y decide
 * qué "Habilidad" (Skill) puede arreglarlo.
 */

async function runLab() {
    console.log("--- 🧪 INICIANDO LABORATORIO SKILLGEN (ETAPA 1) --- \n");

    // CASO 1: Error de Red (DNS)
    // Imagina que el sistema intenta conectar a la Contraloría y falla el internet.
    console.log("PASO 1: Simulando un error de red (DNSLookup failed)...");

    const rawError = new Error("getaddrinfo ENOTFOUND www.contraloria.cl");

    // Normalización: Convertimos un error "feo" en un objeto ordenado.
    const incident = normalizeIncident({
        error: rawError,
        env: 'local',
        service: 'ingest-worker',
        context: {
            url: 'https://www.contraloria.cl/api/data',
            // ¡CUIDADO! Un secreto que no debería verse
            api_key: 'sk-123456789abcdef'
        }
    });

    console.log("✅ Incidente Normalizado:");
    console.log(JSON.stringify(incident, null, 2));
    console.log("\n---");

    // Ruteo: El sistema decide qué Skill llamar basado en el 'code' del incidente.
    console.log("PASO 2: Ruteando el incidente...");
    const decision = routeIncident(incident);

    console.log("✅ Decisión de Ruteo:");
    console.log(JSON.stringify(decision, null, 2));
    console.log("\n---");

    // Verificación de Sanitización
    console.log("PASO 3: Verificando que la 'api_key' se haya ocultado...");
    const isSanitized = incident.context?.api_key === '[REDACTED]';
    if (isSanitized) {
        console.log("🛡️ ¡ÉXITO! El secreto fue anonimizado automáticamente.");
    } else {
        console.log("⚠️ ALERTA: La sanitización falló.");
    }

    console.log("\n--- 🏁 FIN DEL LABORATORIO ---");
}

runLab().catch(console.error);
