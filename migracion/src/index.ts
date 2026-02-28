/**
 * @file src/index.ts
 * @description Cloudflare Worker for CGR Migration. 
 * This worker implements a dual-storage strategy using Cloudflare KV for raw data and 
 * Cloudflare D1 for a fully normalized relational index (13 tables).
 * 
 * Key Features:
 * - Robust JSON parsing for large backups.
 * - Text normalization (Lower/Upper/Trim) for law-specific fields.
 * - Change History (Audit log) for metadata updates.
 * - Large Payload Overflow: Bypasses the 128KB Queue limit using temporary KV storage.
 */

/**
 * Interface for messages sent via Cloudflare Queues.
 */
interface DictamenMessage {
    id: string;
    raw_data: any; // Raw JSON data from MongoDB source
    large_ref?: boolean; // Flag if payload is split between Queue and KV
}

/**
 * Environment bindings defined in wrangler.jsonc.
 */
interface Env {
    DICTAMENES_PASO: KVNamespace;    // Enriched data from previous steps
    DICTAMENES_SOURCE: KVNamespace;  // Final destination for raw migration data
    DICTAMENES_DB: D1Database;       // Relational database (D1)
    MIGRATION_QUEUE: Queue<DictamenMessage>;
    IMPORT_TOKEN?: string;           // Optional bearer token for source feeders
}

// ================ NORMALIZACIÓN ================

/**
 * Normalizes text for database consistency.
 * @param text The raw string to process.
 * @param mode 'lower' for search terms, 'upper' for initials, 'trim' for general text.
 * @returns Cleaned string or null if empty.
 */
function normalize(text: string | null | undefined, mode: 'lower' | 'upper' | 'trim' = 'lower'): string | null {
    if (!text) return null;
    const trimmed = text.trim().replace(/\n+$/, '');
    if (!trimmed) return null;
    if (mode === 'lower') return trimmed.toLowerCase();
    if (mode === 'upper') return trimmed.toUpperCase();
    return trimmed;
}

export default {
    /**
     * HTTP Handler (Producer)
     * Receives batches of records via POST /enqueue and puts them into the migration queue.
     */
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method;
        const path = url.pathname.replace(/\/$/, "");

        console.log(`[Fetch] ${method} ${url.pathname}`);

        // Security check
        if (env.IMPORT_TOKEN) {
            const token = request.headers.get("x-import-token");
            if (token !== env.IMPORT_TOKEN) {
                return new Response("Unauthorized", { status: 401 });
            }
        }

        // Endpoint: POST /enqueue
        if (method === "POST" && path === "/enqueue") {
            try {
                const body = await request.json() as { items: DictamenMessage[] };
                const items = body.items;

                if (!Array.isArray(items) || items.length === 0) {
                    return new Response("No items provided", { status: 400 });
                }

                console.log(`[Enqueue] Received batch of ${items.length} records`);

                for (const item of items) {
                    try {
                        // Standard send to Queue
                        await env.MIGRATION_QUEUE.send(item);
                    } catch (qErr: any) {
                        // PAYLOAD OVERFLOW HANDLING:
                        // Cloudflare Queues have a 128KB limit per message.
                        // For larger records, we store raw_data in KV and send only the reference.
                        if (qErr.message?.includes("Payload Too Large")) {
                            console.warn(`[Heavy] ${item.id} exceeds 128KB. Using KV overflow.`);
                            await env.DICTAMENES_SOURCE.put(`temp_large_${item.id}`, JSON.stringify(item.raw_data));
                            await env.MIGRATION_QUEUE.send({ id: item.id, large_ref: true } as any);
                        } else {
                            throw qErr;
                        }
                    }
                }

                return new Response(JSON.stringify({ success: true, enqueued: items.length }), {
                    headers: { "Content-Type": "application/json" }
                });

            } catch (error) {
                console.error(`[Fatal Error] /enqueue:`, error);
                return new Response(`Error: ${(error as Error).message}`, { status: 500 });
            }
        }

        return new Response(`Not Found: ${method} ${url.pathname}`, { status: 404 });
    },

    /**
     * Queue Handler (Consumer)
     * Processes messages from the queue and executes the relational mapping in D1.
     */
    async queue(batch: MessageBatch<DictamenMessage>, env: Env): Promise<void> {
        console.log(`[Queue] Processing batch of ${batch.messages.length} items`);

        for (const message of batch.messages) {
            let { id, raw_data } = message.body;
            const isLarge = (message.body as any).large_ref;

            try {
                // 1. Resolve Large Payloads from KV if needed
                if (isLarge) {
                    const tempKey = `temp_large_${id}`;
                    const stored = await env.DICTAMENES_SOURCE.get(tempKey);
                    if (!stored) throw new Error(`Overflow data not found in KV for ${id}`);
                    raw_data = JSON.parse(stored);
                    await env.DICTAMENES_SOURCE.delete(tempKey); // Cleanup
                }

                // 2. Fetch Enriched Data (PASO)
                // We check if this record was enriched in a previous LLM step.
                const enriquecidoDataRaw = await env.DICTAMENES_PASO.get(id);
                const enrichedObj = enriquecidoDataRaw ? JSON.parse(enriquecidoDataRaw) : null;
                const rd = raw_data || {};
                const esEnriquecido = enrichedObj ? 1 : 0;

                // 3. Extract Metadata
                const anio = rd.year_doc_id ? parseInt(rd.year_doc_id) : (id.match(/\d{2}$/) ? 2000 + parseInt(id.slice(-2)) : null);
                const fechaDoc = rd.fecha_documento ? rd.fecha_documento.split('T')[0] : null;
                const fechaIdx = rd.fecha_indexacion || null;

                // 4. Resolve Division ID
                const origenCode = rd.origenes ? rd.origenes.split(',')[0].trim().replace(/_$/, '') : null;
                const divisionId = await getDivisionId(env.DICTAMENES_DB, origenCode);

                // 5. Normalization: Attorneys (Multi-value)
                const abogadosStr = (rd.abogados || '').replace(/,/g, ' ');
                const abogadosIniciales = abogadosStr.trim().split(/\s+/)
                    .map((a: string) => normalize(a, 'upper'))
                    .filter((a: string | null) => {
                        // Noise filter: only 2-5 letter initials. Skip junk like "RES" or titles.
                        const noiseTerms = ['RES', 'N°', 'FECHA', 'ANT', 'DEL', 'LOS', 'LAS'];
                        return a && /^[A-Z]{2,5}$/.test(a) && !noiseTerms.includes(a);
                    }) as string[];

                // 6. Normalization: Descriptors (Multi-value)
                const descriptoresStr = rd.descriptores || '';
                const descriptoresArray = descriptoresStr.split(',')
                    .map((d: string) => normalize(d, 'lower'))
                    .filter((d: string | null) => d) as string[];

                // 7. Boolean Status
                const esNuevo = rd.nuevo === 'SI' ? 1 : 0;
                const esRelevante = rd.relevante === '1' ? 1 : 0;
                const enBoletin = rd.boletin === '1' ? 1 : 0;
                const recursoProteccion = rd.recurso_proteccion === 'Si' ? 1 : 0;
                const aclarado = rd.aclarado === 'SI' ? 1 : 0;
                const alterado = rd.alterado === 'SI' ? 1 : 0;
                const aplicado = rd.aplicado === 'SI' ? 1 : 0;
                const complementado = rd.complementado === 'SI' ? 1 : 0;
                const confirmado = rd.confirmado === 'SI' ? 1 : 0;
                const reactivado = rd.reactivado === 'SI' ? 1 : 0;
                const reconsiderado = rd.reconsiderado === 'SI' ? 1 : 0;
                const reconsideradoParcial = rd.reconsiderado_parcialmente === 'SI' ? 1 : 0;

                const ahora = new Date().toISOString();

                // 8. Change Tracking: History Logs
                // We compare incoming data with existing D1 record to log modifications.
                const existente = await env.DICTAMENES_DB.prepare(
                    'SELECT materia, criterio, destinatarios, es_enriquecido, division_id FROM dictamenes WHERE id = ?'
                ).bind(id).first<{ materia: string | null; criterio: string | null; destinatarios: string | null; es_enriquecido: number; division_id: number | null }>();

                const materiaActual = normalize(rd.materia, 'trim');
                const criterioActual = normalize(rd.criterio, 'trim');
                const destinatariosActual = normalize(rd.destinatarios, 'trim');

                const historialStatements: D1PreparedStatement[] = [];

                if (existente) {
                    const cambios: Array<{ campo: string; anterior: string | null; nuevo: string | null }> = [];

                    if (existente.materia !== materiaActual) cambios.push({ campo: 'materia', anterior: existente.materia, nuevo: materiaActual });
                    if (existente.criterio !== criterioActual) cambios.push({ campo: 'criterio', anterior: existente.criterio, nuevo: criterioActual });
                    if (existente.destinatarios !== destinatariosActual) cambios.push({ campo: 'destinatarios', anterior: existente.destinatarios, nuevo: destinatariosActual });
                    if (existente.es_enriquecido !== esEnriquecido) cambios.push({ campo: 'es_enriquecido', anterior: String(existente.es_enriquecido), nuevo: String(esEnriquecido) });
                    if (existente.division_id !== divisionId) cambios.push({ campo: 'division_id', anterior: String(existente.division_id), nuevo: String(divisionId) });

                    for (const c of cambios) {
                        historialStatements.push(env.DICTAMENES_DB.prepare(
                            `INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen) VALUES (?, ?, ?, ?, 'migracion')`
                        ).bind(id, c.campo, c.anterior, c.nuevo));
                    }
                }

                // 9. D1 Transaction (Atomic Batch)
                const statements: D1PreparedStatement[] = [];

                // Idempotency: Clear child tables before inserting
                statements.push(env.DICTAMENES_DB.prepare("DELETE FROM dictamen_abogados WHERE dictamen_id = ?").bind(id));
                statements.push(env.DICTAMENES_DB.prepare("DELETE FROM dictamen_descriptores WHERE dictamen_id = ?").bind(id));
                statements.push(env.DICTAMENES_DB.prepare("DELETE FROM dictamen_fuentes_legales WHERE dictamen_id = ?").bind(id));
                statements.push(env.DICTAMENES_DB.prepare("DELETE FROM dictamen_referencias WHERE dictamen_id = ?").bind(id));
                statements.push(env.DICTAMENES_DB.prepare("DELETE FROM dictamen_etiquetas_llm WHERE dictamen_id = ?").bind(id));

                // Table: dictamenes (Main)
                statements.push(env.DICTAMENES_DB.prepare(`
                    INSERT INTO dictamenes (id, numero, anio, fecha_documento, fecha_indexacion, division_id, criterio, destinatarios, materia, old_url, es_enriquecido, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET 
                        anio=excluded.anio, 
                        fecha_documento=excluded.fecha_documento,
                        fecha_indexacion=excluded.fecha_indexacion,
                        criterio=excluded.criterio,
                        destinatarios=excluded.destinatarios,
                        materia=excluded.materia,
                        es_enriquecido=excluded.es_enriquecido,
                        division_id=excluded.division_id
                `).bind(id, rd.n_dictamen || null, anio, fechaDoc, fechaIdx, divisionId, criterioActual, destinatariosActual, materiaActual, rd.old_url || null, esEnriquecido, ahora));

                // Table: atributos_juridicos
                statements.push(env.DICTAMENES_DB.prepare(`
                    INSERT INTO atributos_juridicos (dictamen_id, es_nuevo, es_relevante, en_boletin, recurso_proteccion, aclarado, alterado, aplicado, complementado, confirmado, reactivado, reconsiderado, reconsiderado_parcialmente, caracter)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(dictamen_id) DO UPDATE SET 
                        es_nuevo=excluded.es_nuevo,
                        es_relevante=excluded.es_relevante,
                        en_boletin=excluded.en_boletin,
                        caracter=excluded.caracter
                `).bind(id, esNuevo, esRelevante, enBoletin, recursoProteccion, aclarado, alterado, aplicado, complementado, confirmado, reactivado, reconsiderado, reconsideradoParcial, normalize(rd.carácter, 'trim')));

                // Table: auditoria_migracion
                statements.push(env.DICTAMENES_DB.prepare(`
                    INSERT INTO auditoria_migracion (dictamen_id, existe_en_kv_source, existe_en_kv_paso, esta_enriquecido, fecha_migracion_d1, fecha_escritura_kv, estado)
                    VALUES (?, 1, ?, ?, ?, ?, 'COMPLETADO')
                    ON CONFLICT(dictamen_id) DO UPDATE SET
                        esta_enriquecido=excluded.esta_enriquecido,
                        fecha_migracion_d1=excluded.fecha_migracion_d1,
                        estado='COMPLETADO'
                `).bind(id, enrichedObj ? 1 : 0, esEnriquecido, ahora, ahora));

                // Table: enriquecimiento (Sub-fields from LLM analysis)
                if (enrichedObj) {
                    const ej = enrichedObj.extrae_jurisprudencia || {};
                    statements.push(env.DICTAMENES_DB.prepare(`
                        INSERT INTO enriquecimiento (dictamen_id, modelo_llm, procesado, fecha_enriquecimiento, titulo, resumen, analisis, genera_jurisprudencia)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(dictamen_id) DO UPDATE SET
                            modelo_llm=excluded.modelo_llm,
                            titulo=excluded.titulo,
                            resumen=excluded.resumen,
                            analisis=excluded.analisis,
                            genera_jurisprudencia=excluded.genera_jurisprudencia
                    `).bind(id, normalize(ej.modelo || enrichedObj.modelo_llm, 'trim'), enrichedObj.procesado ? 1 : 0, enrichedObj.creado_en || null, normalize(ej.titulo, 'trim'), normalize(ej.resumen, 'trim'), normalize(ej.analisis, 'trim'), ej.genera_jurisprudencia ? 1 : 0));

                    const fuentes = enrichedObj.detalle_fuentes || [];
                    for (const f of fuentes) {
                        statements.push(env.DICTAMENES_DB.prepare(`
                            INSERT INTO dictamen_fuentes_legales (dictamen_id, tipo_norma, numero, articulo, extra, year, sector)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).bind(id, normalize(f.nombre, 'lower'), normalize(f.numero, 'trim'), normalize(f.articulo, 'trim'), normalize(f.extra, 'trim'), normalize(f.year, 'trim'), normalize(f.sector, 'lower')));
                    }

                    const referencias = enrichedObj.referencias || [];
                    for (const ref of referencias) {
                        statements.push(env.DICTAMENES_DB.prepare(`
                            INSERT INTO dictamen_referencias (dictamen_id, dictamen_ref_nombre, year, url)
                            VALUES (?, ?, ?, ?)
                        `).bind(id, normalize(ref.nombre, 'trim'), normalize(ref.year, 'trim'), normalize(ref.url, 'trim')));
                    }

                    const etiquetas = enrichedObj.extrae_jurisprudencia?.etiquetas || [];
                    for (const tag of etiquetas) {
                        const tagNorm = normalize(tag, 'lower');
                        if (tagNorm) {
                            statements.push(env.DICTAMENES_DB.prepare(`
                                INSERT INTO dictamen_etiquetas_llm (dictamen_id, etiqueta)
                                VALUES (?, ?)
                            `).bind(id, tagNorm));
                        }
                    }
                }

                // Relationships: Attorneys
                for (const iniciales of abogadosIniciales) {
                    const abogadoId = await getOrCreateAbogado(env.DICTAMENES_DB, iniciales);
                    statements.push(env.DICTAMENES_DB.prepare(`
                        INSERT OR IGNORE INTO dictamen_abogados (dictamen_id, abogado_id) VALUES (?, ?)
                    `).bind(id, abogadoId));
                }

                // Relationships: Descriptors
                for (const termino of descriptoresArray) {
                    const descriptorId = await getOrCreateDescriptor(env.DICTAMENES_DB, termino);
                    statements.push(env.DICTAMENES_DB.prepare(`
                        INSERT OR IGNORE INTO dictamen_descriptores (dictamen_id, descriptor_id) VALUES (?, ?)
                    `).bind(id, descriptorId));
                }

                // Audit: Change History
                statements.push(...historialStatements);

                // Batch Execution
                await env.DICTAMENES_DB.batch(statements);

                // 10. KV Mirror (Storage for Raw JSON)
                await env.DICTAMENES_SOURCE.put(id, JSON.stringify(raw_data));

                console.log(`[OK] Processed ${id}`);
                message.ack();

            } catch (error) {
                console.error(`[CRITICAL ERR] dictamen ${id}:`, error);

                // Log failure to migration audit table
                try {
                    await env.DICTAMENES_DB.prepare(`
                        INSERT INTO auditoria_migracion (dictamen_id, estado, error_detalle)
                        VALUES (?, 'ERROR', ?)
                        ON CONFLICT(dictamen_id) DO UPDATE SET estado='ERROR', error_detalle=excluded.error_detalle
                    `).bind(id, (error as Error).message.substring(0, 500)).run();
                } catch { }

                message.retry();
            }
        }
    }
};

// ================ HELPERS ================

/**
 * Resolves a Division numeric ID from its code in the database.
 */
async function getDivisionId(db: D1Database, codigo: string | null): Promise<number | null> {
    if (!codigo) return null;
    const result = await db.prepare('SELECT id FROM cat_divisiones WHERE codigo = ?').bind(codigo).first<{ id: number }>();
    return result?.id || null;
}

/**
 * Gets or creates an attorney record in the catalog.
 */
async function getOrCreateAbogado(db: D1Database, iniciales: string): Promise<number> {
    const existing = await db.prepare('SELECT id FROM cat_abogados WHERE iniciales = ?').bind(iniciales).first<{ id: number }>();
    if (existing) return existing.id;

    const result = await db.prepare('INSERT INTO cat_abogados (iniciales) VALUES (?) RETURNING id').bind(iniciales).first<{ id: number }>();
    return result!.id;
}

/**
 * Gets or creates a descriptor record in the catalog.
 */
async function getOrCreateDescriptor(db: D1Database, termino: string): Promise<number> {
    const existing = await db.prepare('SELECT id FROM cat_descriptores WHERE termino = ?').bind(termino).first<{ id: number }>();
    if (existing) return existing.id;

    const result = await db.prepare('INSERT INTO cat_descriptores (termino) VALUES (?) RETURNING id').bind(termino).first<{ id: number }>();
    return result!.id;
}
