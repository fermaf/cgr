
const CGR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

async function huntExotic(name, body) {
    const baseUrl = requireEnv("CGR_BASE_URL");
    const origin = new URL(baseUrl).origin;
    const referer = new URL("/web/cgr/buscador", baseUrl).toString();
    console.log(`\n>>> INVESTIGANDO CASO: ${name}`);

    const initRes = await fetch(`${baseUrl}/web/cgr/buscador`, { headers: { "User-Agent": CGR_USER_AGENT } });
    const cookie = initRes.headers.get("set-cookie");

    const searchRes = await fetch(`${baseUrl}/apibusca/search/dictamenes`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": CGR_USER_AGENT,
            "Origin": origin,
            "Referer": referer,
            ...(cookie ? { "Cookie": cookie } : {})
        },
        body: JSON.stringify({
            search: "",
            options: [],
            order: "date",
            date_name: "fecha_documento",
            source: "dictamenes",
            page: 0,
            ...body
        })
    });

    const data = await searchRes.json();
    const total = data.hits?.total?.value || 0;
    console.log(`Respuesta: ${total} resultados encontrados.`);
    if (data.hits?.hits?.length > 0) {
        const top = data.hits.hits[0]._source;
        console.log(`Ejemplo Real -> ID: ${data.hits.hits[0]._id} | Fecha: ${top.fecha_documento} | Materia: ${top.materia?.substring(0, 100)}...`);
    }
}

async function runAll() {
    // 1. Abogado específico (Sintaxis Lucene en search)
    await huntExotic("Sintaxis Lucene - Abogado 'JCQ'", { search: "abogado:JCQ" });

    // 2. División Jurídica + Año específico
    await huntExotic("División Jurídica en el año 2020", {
        search: 'origen:"División Jurídica"',
        options: [{ type: "force_obj", field: "year_doc_id", value: "2020" }]
    });

    // 3. Materia Municipal ('mun') + Criterio 'Genera Jurisprudencia'
    await huntExotic("Municipales que Generan Jurisprudencia", {
        options: [
            { type: "category", field: "descriptores", value: "mun" },
            { type: "category", field: "criterio", value: "Genera Jurisprudencia" }
        ]
    });
}

runAll();
