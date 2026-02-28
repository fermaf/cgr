
const CGR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

async function testHistorical1972() {
    const baseUrl = requireEnv("CGR_BASE_URL");
    const origin = new URL(baseUrl).origin;
    const referer = new URL("/web/cgr/buscador", baseUrl).toString();

    console.log("Iniciando sesión en CGR...");
    const initRes = await fetch(`${baseUrl}/web/cgr/buscador`, {
        headers: { "User-Agent": CGR_USER_AGENT }
    });
    const cookie = initRes.headers.get("set-cookie");

    // Rango sugerido: 08 Nov 1972 al 11 Dic 1972
    const body = {
        "search": "",
        "options": [
            {
                "type": "date",
                "field": "fecha_documento",
                "value": {
                    "gt": "1972-11-08T04:00:00.000Z",
                    "lt": "1972-12-12T03:59:59.000Z"
                },
                "inner_id": "historical_test",
                "dir": "gt"
            }
        ],
        "order": "date",
        "date_name": "fecha_documento",
        "source": "dictamenes",
        "page": 0
    };

    console.log("Buscando dictámenes históricos: 08/11/1972 - 11/12/1972...");
    const searchRes = await fetch(`${baseUrl}/apibusca/search/dictamenes`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": CGR_USER_AGENT,
            "Origin": origin,
            "Referer": referer,
            ...(cookie ? { "Cookie": cookie } : {})
        },
        body: JSON.stringify(body)
    });

    if (!searchRes.ok) {
        console.error("Error en la consulta:", searchRes.status);
        return;
    }

    const data = await searchRes.json();
    const items = data.hits?.hits || [];
    const total = data.hits?.total?.value || items.length;

    console.log(`\n¡Éxito! Se encontraron ${total} dictámenes en ese periodo histórico.`);

    if (items.length > 0) {
        console.log("\nPrimeros 5 resultados encontrados:");
        items.slice(0, 5).forEach((item, i) => {
            const s = item._source;
            console.log(`${i + 1}: ID ${item._id} | Fecha: ${s.fecha_documento} | Materia: ${s.materia?.substring(0, 80)}...`);
        });
    }
}

testHistorical1972();
