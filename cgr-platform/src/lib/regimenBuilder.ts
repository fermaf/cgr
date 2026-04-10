/**
 * regimenBuilder.ts — Fase 1: Pipeline de persistencia de Regímenes Jurisprudenciales
 *
 * Toma los candidatos descubiertos por regimenDiscovery.ts y los persiste
 * en las tablas D1 creadas en la migración 0009.
 *
 * Flujo:
 *   1. fetchSeedDictamenes() → semillas de alta centralidad
 *   2. buildRegimenCandidate() → comunidad descubierta (grafo + normas)
 *   3. assignNombreRegimen() → nombre legible (heurística sobre normas nucleares)
 *   4. upsertRegimen() → persiste en regimenes_jurisprudenciales
 *   5. upsertNormasRegimen() → persiste en norma_regimen
 *   6. buildRegimeTimeline() → persiste en regimen_timeline
 *
 * Principio de supremacía temporal:
 *   Si el dictamen más reciente del régimen tiene estado 'desplazado' en la
 *   semilla, el régimen se marca como 'desplazado'. Si tiene reconsideraciones,
 *   se marca 'en_transicion' o 'zona_litigiosa' dependiendo de la proporción.
 *
 * Nomenclatura:
 *   Se usa "jurisprudencial" (no "doctrinal") porque la CGR emite
 *   jurisprudencia administrativa, no doctrina académica.
 */

import type { Env } from '../types';
import {
  fetchSeedDictamenes,
  buildRegimenCandidate,
  buildNormaCanonicalKey,
  type RegimenCandidate,
  type SeedDictamen,
} from './regimenDiscovery';

// ── Tipos del builder ────────────────────────────────────────────────

export interface RegimenPersistResult {
  regimen_id: string;
  regimen_nombre: string;
  estado: string;
  total_members: number;
  normas_nucleares_count: number;
  timeline_events: number;
  was_upsert: boolean;
}

export interface BuilderRunResult {
  seeds_processed: number;
  regimenes_persistidos: RegimenPersistResult[];
  regimenes_saltados: { seed_id: string; razon: string }[];
  errors: { seed_id: string; error: string }[];
}

// ── Umbral mínimo para considerar un candidato válido ───────────────

const MIN_MEMBERS = 3;          // al menos 3 miembros para ser régimen
const MIN_NORMAS_NUCLEARES = 0; // puede ser 0 si el régimen es de grafo puro
const NORMAS_NUCLEARES_THRESHOLD = 3; // ≥3 dictámenes comparten la norma → "nuclear"

// ── Generación de nombre (sin LLM, Fase 1) ──────────────────────────

/**
 * Genera un nombre legible para el régimen basado en la semilla y sus
 * normas nucleares. Sin LLM — solo heurísticas sobre los datos disponibles.
 *
 * En Fase 2 esto se reemplazará por un LLM ligero (gemini-flash o similar).
 */
function assignNombreRegimen(candidate: RegimenCandidate): string {
  // Si la semilla tiene título, úsalo como base (truncado y limpio)
  if (candidate.seed_titulo) {
    return candidate.seed_titulo
      .replace(/^(Dictamen|Oficio|Resolución)[\s\d:]*[-–]?\s*/i, '')
      .replace(/N°\s*[\d.]+\s*de\s*\d{4}/gi, '')
      .trim()
      .slice(0, 120);
  }

  // Si no hay título, construir desde la materia
  return candidate.seed_materia
    .slice(0, 100)
    .replace(/\.$/, '')
    .trim();
}

/**
 * Genera un ID slug canónico para el régimen.
 * Basado en el ID de la semilla para ser determinista y trazable.
 */
function generateRegimenId(seedId: string): string {
  return `regimen-${seedId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

// ── Cálculo de estado del régimen ───────────────────────────────────

/**
 * Calcula el estado del régimen basándose en:
 * - Estado de vigencia de la semilla
 * - Señales de reconsideraciones y desplazamientos
 * - Proporción de acciones reconsideradas vs. aplicadas
 */
function calcularEstadoRegimen(candidate: RegimenCandidate): {
  estado: string;
  estado_razon: string | null;
} {
  const { tiene_desplazamientos, tiene_reconsideraciones, acciones_distribution } = candidate;
  const semilla = candidate.members.find(m => m.direccion === 'semilla');
  const vigenciaSemilla = semilla?.estado_vigencia ?? null;

  // Desplazado: la semilla ya no rige
  if (vigenciaSemilla === 'desplazado' || vigenciaSemilla === 'desplazado_parcialmente') {
    return { estado: 'desplazado', estado_razon: `Semilla ${candidate.seed_id} tiene estado_vigencia=${vigenciaSemilla}` };
  }

  // Alto nivel de reconsideraciones → litigio jurisprudencial
  const totalAcciones = Object.values(acciones_distribution).reduce((a, b) => a + b, 0);
  const recons = (acciones_distribution['reconsiderado'] ?? 0) + (acciones_distribution['reconsiderado_parcialmente'] ?? 0);
  const proporcionRecons = totalAcciones > 0 ? recons / totalAcciones : 0;

  if (proporcionRecons > 0.3) {
    return {
      estado: 'zona_litigiosa',
      estado_razon: `${Math.round(proporcionRecons * 100)}% de las acciones son reconsideraciones`
    };
  }

  if (tiene_reconsideraciones) {
    return { estado: 'en_transicion', estado_razon: 'Existen reconsideraciones sobre el criterio base' };
  }

  if (vigenciaSemilla === 'valor_historico') {
    return { estado: 'activo', estado_razon: 'Semilla de valor histórico: criterio evolucionado' };
  }

  if (vigenciaSemilla === 'vigente_tensionado') {
    return { estado: 'en_transicion', estado_razon: 'Criterio vigente pero bajo tensión jurisprudencial' };
  }

  return { estado: 'activo', estado_razon: null };
}

// ── Cálculo de scores ──────────────────────────────────────────────

function calcularScores(candidate: RegimenCandidate): {
  estabilidad: number;
  cobertura_corpus: number;
  confianza: number;
} {
  const totalAcciones = Object.values(candidate.acciones_distribution).reduce((a, b) => a + b, 0);
  const recons = (candidate.acciones_distribution['reconsiderado'] ?? 0) +
                 (candidate.acciones_distribution['reconsiderado_parcialmente'] ?? 0);
  const proporcionRecons = totalAcciones > 0 ? recons / totalAcciones : 0;

  // Estabilidad: inverso de reconsideraciones
  const estabilidad = Math.max(0, 1 - proporcionRecons * 2);

  // Cobertura: normalizada respecto al corpus (~27K dictámenes)
  const cobertura_corpus = Math.min(1, candidate.total_members / 27000);

  // Confianza: basada en centralidad de la semilla + normas nucleares
  const normasBonus = Math.min(0.3, candidate.normas_nucleares.length * 0.05);
  const confianza = Math.min(1, candidate.seed_centrality * 0.7 + normasBonus + 0.1);

  return {
    estabilidad: Math.round(estabilidad * 100) / 100,
    cobertura_corpus: Math.round(cobertura_corpus * 10000) / 10000,
    confianza: Math.round(confianza * 100) / 100
  };
}

// ── Persistencia en D1 ──────────────────────────────────────────────

/**
 * Persiste o actualiza un Régimen Jurisprudencial en D1.
 */
async function upsertRegimen(
  db: D1Database,
  regimenId: string,
  nombre: string,
  candidate: RegimenCandidate
): Promise<void> {
  const { estado, estado_razon } = calcularEstadoRegimen(candidate);
  const scores = calcularScores(candidate);

  // Dictamen más reciente = rector actual
  const dictamenRector = candidate.dictamen_mas_reciente?.dictamen_id ?? candidate.seed_id;

  await db.prepare(`
    INSERT INTO regimenes_jurisprudenciales (
      id, pipeline_version, nombre, nombre_normalizado, estado, estado_razon,
      dictamen_rector_id, dictamen_fundante_id,
      estabilidad, cobertura_corpus, confianza,
      fecha_criterio_fundante, fecha_ultimo_pronunciamiento,
      computed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      pipeline_version = excluded.pipeline_version,
      nombre = excluded.nombre,
      nombre_normalizado = excluded.nombre_normalizado,
      estado = excluded.estado,
      estado_razon = excluded.estado_razon,
      dictamen_rector_id = excluded.dictamen_rector_id,
      estabilidad = excluded.estabilidad,
      cobertura_corpus = excluded.cobertura_corpus,
      confianza = excluded.confianza,
      fecha_ultimo_pronunciamiento = excluded.fecha_ultimo_pronunciamiento,
      computed_at = datetime('now'),
      updated_at = datetime('now')
  `).bind(
    regimenId,
    '1.0.0-pilot',
    nombre,
    nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    estado,
    estado_razon,
    dictamenRector,
    candidate.seed_id,
    scores.estabilidad,
    scores.cobertura_corpus,
    scores.confianza,
    candidate.dictamen_mas_antiguo?.fecha_documento ?? candidate.seed_fecha,
    candidate.dictamen_mas_reciente?.fecha_documento ?? candidate.seed_fecha
  ).run();
}

/**
 * Persiste las normas nucleares del régimen en norma_regimen.
 */
async function upsertNormasRegimen(
  db: D1Database,
  regimenId: string,
  candidate: RegimenCandidate
): Promise<void> {
  if (candidate.normas_nucleares.length === 0) return;

  const totalMembers = candidate.total_members;

  for (const norma of candidate.normas_nucleares) {
    const centralidad = totalMembers > 0
      ? Math.round((norma.dictamenes_count / totalMembers) * 100) / 100
      : 0;

    // Parsear la norma_key para rellenar los campos de presentación
    const parts = norma.norma_key.split('|');
    const tipo = parts[0] ?? norma.tipo_norma;
    const num  = parts[1] ?? norma.numero;
    const rest = parts.slice(2);

    await db.prepare(`
      INSERT INTO norma_regimen (norma_key, regimen_id, tipo_norma, numero, articulo, year, sector, centralidad, dictamenes_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(norma_key, regimen_id) DO UPDATE SET
        centralidad = excluded.centralidad,
        dictamenes_count = excluded.dictamenes_count
    `).bind(
      norma.norma_key,
      regimenId,
      tipo,
      num ?? null,
      norma.articulo ?? (rest[rest.length - 1] || null),
      null,  // year: se puede parsear desde la key si es DFL/Decreto
      null,  // sector: ídem
      centralidad,
      norma.dictamenes_count
    ).run();
  }
}

/**
 * Persiste la tabla puente regimen_dictamenes.
 * Permite listar los dictámenes de un régimen sin recalcular el grafo.
 * Se llama siempre después de upsertRegimen.
 */
async function upsertRegimenDictamenes(
  db: D1Database,
  regimenId: string,
  candidate: RegimenCandidate
): Promise<number> {
  let count = 0;
  for (const member of candidate.members) {
    const rol: string =
      member.direccion === 'semilla'
        ? 'semilla'
        : member.direccion === 'entrante'
        ? 'referencia_entrante'
        : 'miembro';

    await db.prepare(`
      INSERT INTO regimen_dictamenes (regimen_id, dictamen_id, rol, distancia, estado_vigencia)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(regimen_id, dictamen_id) DO UPDATE SET
        rol = CASE WHEN excluded.rol = 'semilla' THEN 'semilla' ELSE regimen_dictamenes.rol END,
        estado_vigencia = COALESCE(excluded.estado_vigencia, regimen_dictamenes.estado_vigencia)
    `).bind(
      regimenId,
      member.dictamen_id,
      rol,
      member.hop_distance ?? 1,
      member.estado_vigencia ?? null
    ).run();
    count++;
  }
  return count;
}

/**
 * Construye y persiste el timeline del régimen.
 * Identifica eventos clave: fundación, actividad, y estado actual.
 */
async function buildRegimenTimeline(
  db: D1Database,
  regimenId: string,
  candidate: RegimenCandidate
): Promise<number> {
  const eventos: Array<{
    dictamen_id: string;
    fecha: string;
    tipo_evento: string;
    descripcion: string;
    impacto: string;
  }> = [];

  // Evento: fundación (dictamen más antiguo)
  if (candidate.dictamen_mas_antiguo?.fecha_documento) {
    eventos.push({
      dictamen_id: candidate.dictamen_mas_antiguo.dictamen_id,
      fecha: candidate.dictamen_mas_antiguo.fecha_documento,
      tipo_evento: 'fundacion',
      descripcion: `Primer pronunciamiento conocido en el régimen`,
      impacto: 'alto'
    });
  }

  // Evento: estado actual (dictamen más reciente si es distinto al fundante)
  const masReciente = candidate.dictamen_mas_reciente;
  const masAntiguo  = candidate.dictamen_mas_antiguo;
  if (masReciente && masReciente.dictamen_id !== masAntiguo?.dictamen_id && masReciente.fecha_documento) {
    const semilla = candidate.members.find(m => m.direccion === 'semilla');
    const vigencia = masReciente.estado_vigencia ?? 'desconocido';
    const esDesplazado = vigencia === 'desplazado' || vigencia === 'desplazado_parcialmente';

    eventos.push({
      dictamen_id: masReciente.dictamen_id,
      fecha: masReciente.fecha_documento,
      tipo_evento: esDesplazado ? 'desplazamiento' : 'consolidacion',
      descripcion: esDesplazado
        ? `Dictamen más reciente con estado_vigencia=${vigencia}: el criterio anterior fue desplazado`
        : `Último pronunciamiento conocido; criterio vigente`,
      impacto: esDesplazado ? 'alto' : 'medio'
    });
  }

  // Evento: reconsideraciones (si las hay)
  if (candidate.tiene_reconsideraciones) {
    eventos.push({
      dictamen_id: candidate.seed_id,
      fecha: candidate.seed_fecha ?? new Date().toISOString().slice(0, 10),
      tipo_evento: 'tension',
      descripcion: `El criterio base fue objeto de reconsideración`,
      impacto: 'medio'
    });
  }

  // Persistir eventos
  for (const ev of eventos) {
    await db.prepare(`
      INSERT INTO regimen_timeline (regimen_id, dictamen_id, fecha, tipo_evento, descripcion, impacto)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(regimenId, ev.dictamen_id, ev.fecha, ev.tipo_evento, ev.descripcion, ev.impacto).run();

  }

  return eventos.length;
}

// ── Runner principal ─────────────────────────────────────────────────

/**
 * Ejecuta el pipeline de persistencia de Regímenes Jurisprudenciales.
 *
 * Procesa una semilla a la vez (para respetar el wall-clock del Worker).
 * Se invoca desde el endpoint o desde el workflow de backfill.
 */
export async function buildAndPersistRegimen(
  env: Env,
  seedIndex: number
): Promise<RegimenPersistResult | null> {
  const db = env.DB;

  const seeds = await fetchSeedDictamenes(db, seedIndex + 1);
  if (seeds.length <= seedIndex) return null;

  const seed = seeds[seedIndex];
  const candidate = await buildRegimenCandidate(db, seed);

  // Filtro de calidad mínima
  if (candidate.total_members < MIN_MEMBERS) return null;

  const regimenId = generateRegimenId(seed.id);
  const nombre    = assignNombreRegimen(candidate);

  await upsertRegimen(db, regimenId, nombre, candidate);
  await upsertNormasRegimen(db, regimenId, candidate);
  const timelineEvents = await buildRegimenTimeline(db, regimenId, candidate);
  const memberCount = await upsertRegimenDictamenes(db, regimenId, candidate);

  const { estado } = calcularEstadoRegimen(candidate);

  return {
    regimen_id: regimenId,
    regimen_nombre: nombre,
    estado,
    total_members: candidate.total_members,
    normas_nucleares_count: candidate.normas_nucleares.length,
    timeline_events: timelineEvents,
    was_upsert: true
  };
}

/**
 * Procesa múltiples semillas en un batch (para backfill).
 * Manejo de errores por semilla para no interrumpir el batch.
 */
export async function buildAndPersistRegimenBatch(
  env: Env,
  seedIndexes: number[]
): Promise<BuilderRunResult> {
  const persistidos: RegimenPersistResult[] = [];
  const saltados: { seed_id: string; razon: string }[] = [];
  const errors: { seed_id: string; error: string }[] = [];

  const db = env.DB;

  // Obtener todas las semillas necesarias de una vez
  const maxIndex = Math.max(...seedIndexes);
  const allSeeds = await fetchSeedDictamenes(db, maxIndex + 1);

  for (const idx of seedIndexes) {
    const seed = allSeeds[idx];
    if (!seed) {
      saltados.push({ seed_id: `index-${idx}`, razon: 'Semilla no encontrada' });
      continue;
    }

    try {
      const candidate = await buildRegimenCandidate(db, seed);

      if (candidate.total_members < MIN_MEMBERS) {
        saltados.push({ seed_id: seed.id, razon: `Comunidad demasiado pequeña (${candidate.total_members} miembros)` });
        continue;
      }

      const regimenId = generateRegimenId(seed.id);
      const nombre    = assignNombreRegimen(candidate);

      await upsertRegimen(db, regimenId, nombre, candidate);
      await upsertNormasRegimen(db, regimenId, candidate);
      const timelineEvents = await buildRegimenTimeline(db, regimenId, candidate);
      await upsertRegimenDictamenes(db, regimenId, candidate);
      const { estado } = calcularEstadoRegimen(candidate);

      persistidos.push({
        regimen_id: regimenId,
        regimen_nombre: nombre,
        estado,
        total_members: candidate.total_members,
        normas_nucleares_count: candidate.normas_nucleares.length,
        timeline_events: timelineEvents,
        was_upsert: true
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ seed_id: seed.id, error: msg });
    }
  }

  return {
    seeds_processed: seedIndexes.length,
    regimenes_persistidos: persistidos,
    regimenes_saltados: saltados,
    errors
  };
}
