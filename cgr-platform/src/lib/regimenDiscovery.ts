/**
 * regimenDiscovery.ts — Fase 0: Descubrimiento de Regímenes Jurisprudenciales
 *
 * Descubre agrupaciones estables de dictámenes (Regímenes) bottom-up
 * usando las señales más fuertes del corpus:
 *
 * 1. Grafo de relaciones jurídicas (82K aristas)
 * 2. Normas compartidas (152K referencias, 5K normas únicas)
 * 3. Metadata jurisprudencial existente (17K registros)
 *
 * Un Régimen NO se inventa desde LLM ni desde embeddings.
 * Se descubre desde la estructura real del corpus.
 *
 * Principio de supremacía temporal:
 * - El dictamen más reciente dentro de un Régimen gobierna la lectura.
 * - Si ese dictamen contradice el criterio previo, el Régimen cambia de estado.
 * - La línea anterior se degrada a antecedente histórico.
 */

import type { Env, DictamenMetadataDoctrinalRow } from '../types';

// ── Tipos del piloto ────────────────────────────────────────────────

/** Dictamen semilla con alta centralidad jurisprudencial */
export interface SeedDictamen {
  id: string;
  materia: string;
  fecha_documento: string | null;
  titulo: string | null;
  resumen: string | null;
  rol_principal: string | null;
  estado_vigencia: string | null;
  reading_role: string | null;
  estado_intervencion_cgr: string | null;
  currentness_score: number;
  doctrinal_centrality_score: number;
  confidence_global: number;
}

/** Relación jurídica entre dictámenes */
export interface RelacionJuridica {
  dictamen_id: string;
  tipo_accion: string;
  fecha_documento: string | null;
  titulo: string | null;
  materia: string | null;
  direccion: 'entrante' | 'saliente';
}

/** Norma compartida dentro de una comunidad */
export interface NormaCompartida {
  norma_key: string;  // "Ley-18834-10"
  tipo_norma: string;
  numero: string;
  articulo: string | null;
  dictamenes_count: number;
  dictamen_ids: string[];
}

/** Miembro de una comunidad con su contexto */
export interface CommunityMember {
  dictamen_id: string;
  materia: string | null;
  fecha_documento: string | null;
  titulo: string | null;
  tipo_accion_con_semilla: string | null;
  direccion: 'entrante' | 'saliente' | 'semilla';
  hop_distance: number;
  rol_principal: string | null;
  estado_vigencia: string | null;
  currentness_score: number | null;
  doctrinal_centrality_score: number | null;
}

/** Candidato a Régimen jurisprudencial descubierto empíricamente */
export interface RegimenCandidate {
  seed_id: string;
  seed_titulo: string | null;
  seed_materia: string;
  seed_fecha: string | null;
  seed_rol: string | null;
  seed_centrality: number;

  // Comunidad descubierta
  members: CommunityMember[];
  total_members: number;

  // Normas compartidas (filtradas: excluye genéricas)
  normas_compartidas: NormaCompartida[];
  normas_nucleares: NormaCompartida[];  // las que comparten ≥3 dictámenes

  // Señales de supremacía temporal
  dictamen_mas_reciente: CommunityMember | null;
  dictamen_mas_antiguo: CommunityMember | null;
  span_temporal: { from: string | null; to: string | null };

  // Distribución de acciones juridicas
  acciones_distribution: Record<string, number>;

  // Señales de estado del régimen
  tiene_reconsideraciones: boolean;
  tiene_abstenciones: boolean;
  tiene_desplazamientos: boolean;
}

// ── Identidad normativa según derecho chileno ──────────────────────
//
// Jerarquía normativa relevante para la CGR:
//
// RANGO CONSTITUCIONAL:
//   - CPR: transversal absoluta, descartada como señal de régimen
//
// RANGO LEGAL — IDENTIFICABLES POR NÚMERO:
//   - Ley: numeración única y permanente (e.g., "Ley 18.834")
//   - DL (Decreto Ley): numeración correlativa única (e.g., "DL 3.500")
//   - Leyes con nombre propio o sigla:
//     · LOCBGAE = Ley 18.575  · LBPA = Ley 19.880  · LOC CGR = Ley 10.336
//     Se resuelven al número canónico antes de construir la clave.
//   - Códigos (Civil, del Trabajo, de Aguas, etc.):
//     Cuerpos normativos autónomos sin número de ley.
//     Se identifican como "Código|[nombre]|[artículo]".
//
// RANGO SUBLEGAL — REQUIEREN AÑO + ÓRGANO para ser inequívocos:
//   - DFL, Decretos, Resoluciones
//
// PROBLEMA EN LA DATA:
//   Variantes de capitalización en sector/tipo_norma. Se normaliza.

/** Tipos de norma identificables solo por número */
const NORMAS_POR_NUMERO = new Set([
  'Ley',
  'DL',
  'Decreto Ley',
  'Decreto-Ley',
]);

/** Tipos sublegal que requieren año + órgano para ser inequívocos */
const NORMAS_REQUIEREN_ANIO_ORGANO = new Set([
  'DFL',
  'Decreto',
  'Decreto Supremo',
  'Resolución',
  'Resolución Exenta',
  'Resolución Exenta.',
  'Oficio Circular',
]);

/**
 * Leyes conocidas por nombre propio o sigla.
 * Se mapean al número canónico para deduplicación.
 * El tipo resultante siempre será 'Ley'.
 */
const LEY_ALIAS_A_NUMERO: Record<string, string> = {
  'LOCBGAE':  '18575',
  'LBPA':     '19880',
  'LOC CGR':  '10336',
  'Ley Karin':'21643',
  // nombres completos en tipo_norma
  'Ley Orgánica Constitucional de Bases Generales de la Administración del Estado': '18575',
  'Ley de Bases de los Procedimientos Administrativos': '19880',
  'Ley Orgánica Constitucional de la Contraloría General de la República': '10336',
};

/** Leyes transversales (demasiado genéricas sin artículo específico) */
const LEYES_TRANSVERSALES = new Set(['18575', '19880', '10336']);

/** DFL transversales */
const DFL_TRANSVERSALES = new Set(['29']);

/**
 * Normas de rango constitucional.
 * Siempre transversales en el contexto CGR.
 */
const NORMAS_CONSTITUCIONALES = new Set([
  'Constitución Política de la República',
  'Constitucion Politica de la Republica',
  'Constitución',
  'Constitucion',
  'CPR',
]);

/**
 * Códigos chilenos: cuerpos normativos autónomos identificados por nombre.
 * Se normalizan las variantes del LLM a un nombre canónico.
 */
const CODIGO_CANONICO: Record<string, string> = {
  'Código del Trabajo':              'Código del Trabajo',
  'Código Del Trabajo':              'Código del Trabajo',
  'CTB':                             'Código del Trabajo',
  'Código Civil':                    'Código Civil',
  'Código de Aguas':                 'Código de Aguas',
  'Código Sanitario':                'Código Sanitario',
  'Código de Minería':             'Código de Minería',
  'Código Orgánico de Tribunales':  'Código Orgánico de Tribunales',
  'COT':                             'Código Orgánico de Tribunales',
  'Código Penal':                    'Código Penal',
  'Código Procesal Penal':           'Código Procesal Penal',
  'Código de Policía Local':         'Código de Policía Local',
  'Código':                          'Código',  // fallback genérico
};

/** Normaliza el campo sector/órgano para comparación canónica */
function normalizarOrgano(sector: string | null): string {
  if (!sector || sector.trim().length === 0) return '';
  return sector.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
}

/**
 * Construye la clave canónica de una norma respetando la jerarquía del
 * derecho chileno y las particularidades del corpus CGR.
 *
 * Retorna null si la norma no puede identificarse de forma inequívoca,
 * o si es transversal sin artículo específico.
 */
export function buildNormaCanonicalKey(
  tipoNorma: string,
  numero: string | null,
  articulo: string | null,
  year: string | null,
  sector: string | null
): string | null {
  const tipo = tipoNorma.trim();
  const num  = numero?.trim()   ?? '';
  const art  = articulo?.trim() ?? '';
  const anio = year?.trim()     ?? '';
  const organo = normalizarOrgano(sector);

  // 1. CPR y variantes: transversal absoluta, nunca es señal de régimen
  if (NORMAS_CONSTITUCIONALES.has(tipo)) return null;

  // 2. Códigos: cuerpos normativos autónomos, identificados por nombre + artículo.
  //    Sin artículo son demasiado genéricos.
  const codigoNombre = CODIGO_CANONICO[tipo];
  if (
    codigoNombre !== undefined ||
    tipo.startsWith('Código') ||
    tipo.startsWith('Codigo') ||
    tipo === 'CTB' ||
    tipo === 'COT'
  ) {
    if (!art) return null;
    const nombreFinal = codigoNombre ?? tipo;
    return `Código|${nombreFinal}|${art}`;
  }

  // 3. Aliases de leyes con nombre propio (LOCBGAE, LBPA, Ley Karin...)
  //    El tipo_norma ísmo es el alias en lugar del número.
  const numeroAlias = LEY_ALIAS_A_NUMERO[tipo];
  if (numeroAlias) {
    if (LEYES_TRANSVERSALES.has(numeroAlias) && !art) return null;
    return `Ley|${numeroAlias}|${art}`;
  }

  // 4. Leyes y DL: identificables solo por número
  if (NORMAS_POR_NUMERO.has(tipo)) {
    if (!num) return null;
    if (tipo === 'Ley' && LEYES_TRANSVERSALES.has(num) && !art) return null;
    // Unificar Ley y DL bajo el mismo prefijo 'Ley' (ambos son rango legal)
    // DL mantiene su tipo para distinguir en presentación si se necesita
    return `${tipo === 'Ley' ? 'Ley' : 'DL'}|${num}|${art}`;
  }

  // 5. Normativa sublegal: requiere año obligatorio, órgano recomendado
  if (NORMAS_REQUIEREN_ANIO_ORGANO.has(tipo)) {
    if (!num) return null;
    if (!anio) return null;  // sin año la norma es ambigua
    if (tipo === 'DFL' && DFL_TRANSVERSALES.has(num) && !art) return null;
    // 5 chars del órgano para colapsar variantes de capitalización
    const organoKey = organo ? organo.slice(0, 5) : 'unk';
    return `${tipo}|${num}|${anio}|${organoKey}|${art}`;
  }

  // 6. Tipo no reconocido: requiere al menos número + artículo
  if (!num || !art) return null;
  return `${tipo}|${num}|${art}`;
}

// ── Funciones de descubrimiento ─────────────────────────────────────

/**
 * Obtiene los dictámenes semilla: los de mayor centralidad jurisprudencial
 * (nucleo_doctrinal o criterio_operativo_actual)
 */
export async function fetchSeedDictamenes(
  db: D1Database,
  limit: number = 30
): Promise<SeedDictamen[]> {
  const res = await db.prepare(`
    SELECT 
      d.id, d.materia, d.fecha_documento,
      e.titulo, e.resumen,
      m.rol_principal, m.estado_vigencia, m.reading_role, m.estado_intervencion_cgr,
      m.currentness_score, m.doctrinal_centrality_score, m.confidence_global
    FROM dictamenes d
    INNER JOIN enriquecimiento e ON e.dictamen_id = d.id
    INNER JOIN dictamen_metadata_doctrinal m ON m.dictamen_id = d.id
    WHERE d.estado = 'vectorized'
      AND m.rol_principal IN ('nucleo_doctrinal', 'criterio_operativo_actual')
      AND m.doctrinal_centrality_score >= 0.7
    ORDER BY m.doctrinal_centrality_score DESC, m.currentness_score DESC
    LIMIT ?
  `).bind(limit).all<SeedDictamen>();

  return res.results ?? [];
}

/**
 * Expande una semilla por 1 hop en el grafo de relaciones jurídicas.
 * Devuelve todas las relaciones directas (entrantes y salientes).
 */
export async function expandByGraph(
  db: D1Database,
  seedId: string
): Promise<RelacionJuridica[]> {
  // Relaciones salientes: otros dictámenes que la semilla referencia
  const outgoing = await db.prepare(`
    SELECT 
      r.dictamen_destino_id as dictamen_id,
      r.tipo_accion,
      d.fecha_documento,
      e.titulo,
      d.materia,
      'saliente' as direccion
    FROM dictamen_relaciones_juridicas r
    LEFT JOIN dictamenes d ON d.id = r.dictamen_destino_id
    LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_destino_id
    WHERE r.dictamen_origen_id = ?
    ORDER BY d.fecha_documento DESC
  `).bind(seedId).all<RelacionJuridica>();

  // Relaciones entrantes: dictámenes que referencian a la semilla
  const incoming = await db.prepare(`
    SELECT 
      r.dictamen_origen_id as dictamen_id,
      r.tipo_accion,
      d.fecha_documento,
      e.titulo,
      d.materia,
      'entrante' as direccion
    FROM dictamen_relaciones_juridicas r
    LEFT JOIN dictamenes d ON d.id = r.dictamen_origen_id
    LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_origen_id
    WHERE r.dictamen_destino_id = ?
    ORDER BY d.fecha_documento DESC
  `).bind(seedId).all<RelacionJuridica>();

  return [
    ...(outgoing.results ?? []).map(r => ({ ...r, direccion: 'saliente' as const })),
    ...(incoming.results ?? []).map(r => ({ ...r, direccion: 'entrante' as const }))
  ];
}

/**
 * Busca normas compartidas entre los miembros de una comunidad.
 *
 * Aplica la distinción jurídica chilena:
 * - Leyes y DL: identidad por número (sin necesidad de año/órgano)
 * - DFL, Decretos, Resoluciones: identidad por número+año+órgano
 * - Normas transversales (LBPA, LOCBGAE) solo cuentan con artículo específico
 * - Normas sin clave canónica válida se ignoran
 *
 * La query incluye `year` y `sector` para poder construir la clave canónica
 * correctamente según el tipo de norma.
 */
export async function findSharedNorms(
  db: D1Database,
  memberIds: string[]
): Promise<NormaCompartida[]> {
  if (memberIds.length === 0) return [];

  const placeholders = memberIds.map(() => '?').join(',');
  const res = await db.prepare(`
    SELECT 
      f.tipo_norma,
      f.numero,
      f.articulo,
      f.year,
      f.sector,
      COUNT(DISTINCT f.dictamen_id) as dictamenes_count,
      GROUP_CONCAT(DISTINCT f.dictamen_id) as dictamen_ids_csv
    FROM dictamen_fuentes f
    WHERE f.dictamen_id IN (${placeholders})
      AND f.numero IS NOT NULL
      AND LENGTH(TRIM(f.numero)) > 0
      AND f.tipo_norma != 'valor de relleno'
      AND f.tipo_norma != 'Desconocido'
    GROUP BY f.tipo_norma, f.numero, f.articulo, f.year, f.sector
    HAVING dictamenes_count >= 2
    ORDER BY dictamenes_count DESC
  `).bind(...memberIds).all<{
    tipo_norma: string;
    numero: string;
    articulo: string | null;
    year: string | null;
    sector: string | null;
    dictamenes_count: number;
    dictamen_ids_csv: string;
  }>();

  // Agrupar por clave canónica (colapsa variantes de capitalización/abreviatura)
  const normaMap = new Map<string, NormaCompartida>();
  for (const row of res.results ?? []) {
    const canonicalKey = buildNormaCanonicalKey(
      row.tipo_norma, row.numero, row.articulo, row.year, row.sector
    );
    if (!canonicalKey) continue;  // norma no identificable o transversal sin artículo

    const existing = normaMap.get(canonicalKey);
    if (!existing) {
      normaMap.set(canonicalKey, {
        norma_key: canonicalKey,
        tipo_norma: row.tipo_norma,
        numero: row.numero,
        articulo: row.articulo,
        dictamenes_count: row.dictamenes_count,
        dictamen_ids: row.dictamen_ids_csv.split(',')
      });
    } else {
      // Colapsar variantes del mismo instrumento
      const mergedIds = new Set([...existing.dictamen_ids, ...row.dictamen_ids_csv.split(',')]);
      normaMap.set(canonicalKey, {
        ...existing,
        dictamenes_count: mergedIds.size,
        dictamen_ids: [...mergedIds]
      });
    }
  }

  return [...normaMap.values()]
    .filter(n => n.dictamenes_count >= 2)
    .sort((a, b) => b.dictamenes_count - a.dictamenes_count);
}

/**
 * Obtiene metadata jurisprudencial para un conjunto de dictámenes.
 */
async function fetchMetadataForIds(
  db: D1Database,
  ids: string[]
): Promise<Map<string, Partial<DictamenMetadataDoctrinalRow>>> {
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const res = await db.prepare(`
    SELECT dictamen_id, rol_principal, estado_vigencia, reading_role,
           currentness_score, doctrinal_centrality_score, estado_intervencion_cgr
    FROM dictamen_metadata_doctrinal
    WHERE dictamen_id IN (${placeholders})
  `).bind(...ids).all<Partial<DictamenMetadataDoctrinalRow>>();

  const map = new Map<string, Partial<DictamenMetadataDoctrinalRow>>();
  for (const row of res.results ?? []) {
    if (row.dictamen_id) map.set(row.dictamen_id, row);
  }
  return map;
}

/**
 * Construye un candidato a Régimen jurisprudencial a partir de una semilla.
 *
 * Algoritmo:
 * 1. Expandir por grafo (1 hop)
 * 2. Buscar normas compartidas
 * 3. Enriquecer con metadata jurisprudencial
 * 4. Detectar señales de estado (reconsideraciones, abstenciones, desplazamientos)
 * 5. Aplicar principio de supremacía temporal
 */
export async function buildRegimenCandidate(
  db: D1Database,
  seed: SeedDictamen
): Promise<RegimenCandidate> {
  // 1. Expandir por grafo
  const relations = await expandByGraph(db, seed.id);

  // 2. Construir comunidad: semilla + vecinos únicos
  const memberMap = new Map<string, CommunityMember>();

  // La semilla siempre es miembro
  memberMap.set(seed.id, {
    dictamen_id: seed.id,
    materia: seed.materia,
    fecha_documento: seed.fecha_documento,
    titulo: seed.titulo,
    tipo_accion_con_semilla: null,
    direccion: 'semilla',
    hop_distance: 0,
    rol_principal: seed.rol_principal,
    estado_vigencia: seed.estado_vigencia,
    currentness_score: seed.currentness_score,
    doctrinal_centrality_score: seed.doctrinal_centrality_score
  });

  // Agregar vecinos (1-hop)
  for (const rel of relations) {
    if (!memberMap.has(rel.dictamen_id)) {
      memberMap.set(rel.dictamen_id, {
        dictamen_id: rel.dictamen_id,
        materia: rel.materia,
        fecha_documento: rel.fecha_documento,
        titulo: rel.titulo,
        tipo_accion_con_semilla: rel.tipo_accion,
        direccion: rel.direccion,
        hop_distance: 1,
        rol_principal: null,
        estado_vigencia: null,
        currentness_score: null,
        doctrinal_centrality_score: null
      });
    }
  }

  const memberIds = [...memberMap.keys()];

  // 3. Enriquecer con metadata jurisprudencial
  const metadataMap = await fetchMetadataForIds(db, memberIds);
  for (const [id, member] of memberMap) {
    const meta = metadataMap.get(id);
    if (meta) {
      member.rol_principal = meta.rol_principal ?? null;
      member.estado_vigencia = meta.estado_vigencia ?? null;
      member.currentness_score = meta.currentness_score ?? null;
      member.doctrinal_centrality_score = meta.doctrinal_centrality_score ?? null;
    }
  }

  // 4. Buscar normas compartidas
  const normasCompartidas = await findSharedNorms(db, memberIds);
  const normasNucleares = normasCompartidas.filter(n => n.dictamenes_count >= 3);

  // 5. Distribución de acciones jurídicas
  const acciones: Record<string, number> = {};
  for (const rel of relations) {
    acciones[rel.tipo_accion] = (acciones[rel.tipo_accion] ?? 0) + 1;
  }

  // 6. Señales de estado
  const members = [...memberMap.values()];
  const tieneReconsideraciones = relations.some(r =>
    r.tipo_accion === 'reconsiderado' || r.tipo_accion === 'reconsiderado_parcialmente'
  );
  const tieneAbstenciones = members.some(m =>
    m.rol_principal === 'abstencion' ||
    m.estado_vigencia === 'desplazado'
  );
  const tieneDesplazamientos = members.some(m =>
    m.estado_vigencia === 'desplazado' || m.estado_vigencia === 'desplazado_parcialmente'
  );

  // 7. Supremacía temporal: identificar el más reciente y el más antiguo
  const membersConFecha = members.filter(m => m.fecha_documento);
  membersConFecha.sort((a, b) =>
    (b.fecha_documento ?? '').localeCompare(a.fecha_documento ?? '')
  );

  const masReciente = membersConFecha[0] ?? null;
  const masAntiguo = membersConFecha[membersConFecha.length - 1] ?? null;

  return {
    seed_id: seed.id,
    seed_titulo: seed.titulo,
    seed_materia: seed.materia,
    seed_fecha: seed.fecha_documento,
    seed_rol: seed.rol_principal,
    seed_centrality: seed.doctrinal_centrality_score,

    members,
    total_members: members.length,

    normas_compartidas: normasCompartidas,
    normas_nucleares: normasNucleares,

    dictamen_mas_reciente: masReciente,
    dictamen_mas_antiguo: masAntiguo,
    span_temporal: {
      from: masAntiguo?.fecha_documento ?? null,
      to: masReciente?.fecha_documento ?? null
    },

    acciones_distribution: acciones,
    tiene_reconsideraciones: tieneReconsideraciones,
    tiene_abstenciones: tieneAbstenciones,
    tiene_desplazamientos: tieneDesplazamientos
  };
}

/**
 * Ejecuta el piloto completo: descubre candidatos a Régimen
 * para las N semillas de mayor centralidad jurisprudencial.
 *
 * Este es el corazón de la Fase 0 del cambio de paradigma.
 */
export async function runRegimenPilot(
  env: Env,
  options: { seedLimit?: number } = {}
): Promise<{
  seeds_processed: number;
  regimenes: RegimenCandidate[];
  summary: {
    total_members_across_all: number;
    avg_members_per_regimen: number;
    regimenes_con_normas_nucleares: number;
    regimenes_con_reconsideraciones: number;
    regimenes_con_desplazamientos: number;
    normas_mas_frecuentes: { norma_key: string; regimenes_count: number }[];
  };
}> {
  const seedLimit = options.seedLimit ?? 15;
  const db = env.DB;

  // 1. Obtener semillas
  const seeds = await fetchSeedDictamenes(db, seedLimit);

  // 2. Construir candidatos a Régimen para cada semilla
  const regimenes: RegimenCandidate[] = [];
  for (const seed of seeds) {
    const candidate = await buildRegimenCandidate(db, seed);
    regimenes.push(candidate);
  }

  // 3. Construir resumen estadístico
  const totalMembers = regimenes.reduce((acc, r) => acc + r.total_members, 0);
  const normaFrequency = new Map<string, number>();
  for (const r of regimenes) {
    for (const n of r.normas_nucleares) {
      normaFrequency.set(n.norma_key, (normaFrequency.get(n.norma_key) ?? 0) + 1);
    }
  }
  const normasMasFrecuentes = [...normaFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([norma_key, regimenes_count]) => ({ norma_key, regimenes_count }));

  return {
    seeds_processed: seeds.length,
    regimenes,
    summary: {
      total_members_across_all: totalMembers,
      avg_members_per_regimen: regimenes.length > 0
        ? Math.round(totalMembers / regimenes.length)
        : 0,
      regimenes_con_normas_nucleares: regimenes.filter(r => r.normas_nucleares.length > 0).length,
      regimenes_con_reconsideraciones: regimenes.filter(r => r.tiene_reconsideraciones).length,
      regimenes_con_desplazamientos: regimenes.filter(r => r.tiene_desplazamientos).length,
      normas_mas_frecuentes: normasMasFrecuentes
    }
  };
}
