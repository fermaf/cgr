import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  normalizeEtiquetaNorm,
  normalizeEtiquetaDisplay,
  etiquetaSlugFromNorm,
  buildFuenteNormaKey,
  buildFuenteDisplayLabel
} from '../src/lib/derivedCatalogs';
import { normalizeLegalSourceForStorage } from '../src/lib/legalSourcesCanonical';

interface Args {
  kind: 'etiquetas' | 'fuentes';
  limit: number;
  offset: number;
  cursorAfterId: number | null;
  paginationMode: 'offset' | 'cursor';
  dryRun: boolean;
  apply: boolean;
  confirm: boolean;
  allowRepeat: boolean;
  jsonReport: boolean;
}

function parseIntegerArg(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} debe ser un entero estrictamente numérico`);
  }
  return Number(value);
}

function sqlString(value: string | null | undefined): string {
  if (value === undefined || value === null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseArgs(): Args {
  const args = process.argv;

  const getArgValue = (flag: string) => {
    const joined = args.find(a => a.startsWith(`${flag}=`))?.split('=')[1];
    if (joined) return joined;
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length) return args[index + 1];
    return undefined;
  };

  const kind = getArgValue('--kind') as any;
  const limitStr = getArgValue('--limit') || '100';
  const offsetStr = getArgValue('--offset');
  const cursorAfterIdStr = getArgValue('--cursor-after-id');

  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const confirm = args.includes('--confirm-remote-write');
  const allowRepeat = args.includes('--allow-repeat');
  const jsonReport = args.includes('--json-report');

  if (offsetStr && cursorAfterIdStr) {
    console.error('Error: --offset y --cursor-after-id son mutuamente excluyentes. Use solo uno.');
    process.exit(1);
  }

  const paginationMode = cursorAfterIdStr ? 'cursor' : 'offset';

  if (!kind || !['etiquetas', 'fuentes'].includes(kind)) {
    console.error('Error: Debe especificar --kind=etiquetas o --kind=fuentes');
    process.exit(1);
  }

  if (dryRun && apply) {
    console.error('Error: use solo uno de --dry-run o --apply');
    process.exit(1);
  }

  if (!dryRun && !apply) {
    console.error('Error: Debe especificar explícitamente --dry-run o --apply');
    process.exit(1);
  }

  let limit: number;
  let offset = 0;
  let cursorAfterId: number | null = null;
  try {
    limit = parseIntegerArg(limitStr, '--limit');
    if (offsetStr) {
      offset = parseIntegerArg(offsetStr, '--offset');
      console.warn('[WARNING] El modo --offset está deprecado para producción. Use --cursor-after-id para mayor estabilidad.');
    }
    if (cursorAfterIdStr) {
      cursorAfterId = parseIntegerArg(cursorAfterIdStr, '--cursor-after-id');
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  if (apply) {
    const maxLimit = kind === 'etiquetas' ? 200 : 100;
    if (limit > maxLimit) {
      console.error(`Error: --limit no puede ser mayor a ${maxLimit} para [${kind}] en modo --apply (Guardrail Fase 9.1)`);
      process.exit(1);
    }
  }

  if (limit < 0) {
    console.error('Error: --limit debe ser mayor o igual a 0');
    process.exit(1);
  }

  if (apply && !confirm) {
    console.error('Error: el modo --apply requiere confirmación explícita mediante --confirm-remote-write');
    process.exit(1);
  }

  return { kind, limit, offset, cursorAfterId, paginationMode, dryRun, apply, confirm, allowRepeat, jsonReport };
}

function executeWrangler(args: string[]) {
  const wranglerPath = './node_modules/.bin/wrangler';
  const result = spawnSync(wranglerPath, args, { encoding: 'utf-8' });

  if (result.error) {
    throw new Error(`Error al ejecutar wrangler: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Wrangler falló (exit ${result.status}): ${result.stderr}`);
  }

  return result.stdout;
}

function queryD1(sql: string) {
  try {
    const stdout = executeWrangler(['d1', 'execute', 'cgr-dictamenes', '--remote', '--json', '--command', sql]);
    const parsed = JSON.parse(stdout);
    if (!parsed[0]?.success) {
      throw new Error(`D1 Query failed: ${JSON.stringify(parsed[0]?.messages)}`);
    }
    return parsed[0].results || [];
  } catch (error: any) {
    console.error(`Error consultando D1: ${error.message}`);
    process.exit(1);
  }
}

function executeD1Command(sql: string) {
  try {
    executeWrangler(['d1', 'execute', 'cgr-dictamenes', '--remote', '--command', sql]);
  } catch (error: any) {
    console.error(`Error ejecutando comando D1: ${error.message}`);
    throw error;
  }
}

async function checkIfAlreadyMigrated(args: Args): Promise<boolean> {
  let sql = '';
  if (args.paginationMode === 'cursor') {
    sql = `SELECT id FROM backfill_canonical_derivatives_runs WHERE kind = ${sqlString(args.kind)} AND cursor_after_id = ${args.cursorAfterId} AND legacy_limit = ${args.limit} AND pagination_mode = 'cursor' AND mode = 'apply' AND status = 'success' LIMIT 1`;
  } else {
    sql = `SELECT id FROM backfill_canonical_derivatives_runs WHERE kind = ${sqlString(args.kind)} AND legacy_offset = ${args.offset} AND legacy_limit = ${args.limit} AND pagination_mode = 'offset' AND mode = 'apply' AND status = 'success' LIMIT 1`;
  }
  const results = queryD1(sql);
  return results.length > 0;
}

async function checkOverlapCursor(args: Args, startId: number, endId: number): Promise<number | null> {
  const sql = `
    SELECT id
    FROM backfill_canonical_derivatives_runs
    WHERE kind = ${sqlString(args.kind)}
      AND mode = 'apply'
      AND status = 'success'
      AND pagination_mode = 'cursor'
      AND cursor_start_id <= ${endId}
      AND cursor_end_id >= ${startId}
    LIMIT 1
  `;
  const results = queryD1(sql);
  return results.length > 0 ? results[0].id : null;
}

async function checkOverlap(args: Args): Promise<number | null> {
  if (args.paginationMode === 'cursor') return null; // Los cursores se validan post-fetch

  const newStart = args.offset;
  const newEnd = args.offset + args.limit - 1;
  const sql = `
    SELECT id
    FROM backfill_canonical_derivatives_runs
    WHERE kind = ${sqlString(args.kind)}
      AND mode = 'apply'
      AND status = 'success'
      AND pagination_mode = 'offset'
      AND legacy_offset <= ${newEnd}
      AND (legacy_offset + legacy_limit - 1) >= ${newStart}
    LIMIT 1
  `;
  const results = queryD1(sql);
  return results.length > 0 ? results[0].id : null;
}

function registerBackfillStart(args: Args): number {
  const isCursor = args.paginationMode === 'cursor';
  const legacyOffsetValue = isCursor ? (args.cursorAfterId ?? 0) : args.offset;

  const sql = `
    INSERT INTO backfill_canonical_derivatives_runs (
      kind, legacy_offset, legacy_limit, mode, status, apply_status, started_at,
      pagination_mode, cursor_after_id
    )
    VALUES (
      ${sqlString(args.kind)}, ${legacyOffsetValue}, ${args.limit}, 'apply', 'started', 'pending', datetime('now'),
      ${sqlString(args.paginationMode)}, ${isCursor ? args.cursorAfterId : 'NULL'}
    )
    ON CONFLICT(kind, legacy_offset, legacy_limit, mode)
    DO UPDATE SET
      status = 'started',
      apply_status = 'pending',
      apply_error = NULL,
      legacy_rows_read = 0,
      catalog_candidates = 0,
      catalog_unique = 0,
      relation_candidates = 0,
      relation_unique = 0,
      duplicates_detected = 0,
      skipped = 0,
      errors = 0,
      sql_file = NULL,
      cursor_after_id = ${isCursor ? args.cursorAfterId : 'NULL'},
      cursor_start_id = NULL,
      cursor_end_id = NULL,
      pagination_mode = ${sqlString(args.paginationMode)},
      started_at = datetime('now'),
      finished_at = NULL
    RETURNING id
  `;
  const results = queryD1(sql);
  return results[0].id;
}

function updateBackfillRun(runId: number, data: any) {
  try {
    const sets = Object.entries(data)
      .map(([key, val]) => {
        if (val === null) return `${key} = NULL`;
        if (typeof val === 'string') return `${key} = ${sqlString(val)}`;
        return `${key} = ${val}`;
      })
      .join(', ');

    const sql = `UPDATE backfill_canonical_derivatives_runs SET ${sets}, finished_at = datetime('now') WHERE id = ${runId}`;
    executeD1Command(sql);
  } catch (e: any) {
    console.warn(`[WARNING] No se pudo actualizar la tabla de control (ID=${runId}): ${e.message}`);
  }
}

async function runBackfill(args: Args) {
  if (args.limit === 0) {
    if (args.jsonReport) {
      const report = {
        kind: args.kind,
        mode: args.apply ? 'apply' : 'dry-run',
        pagination_mode: args.paginationMode,
        cursor_after_id: args.cursorAfterId,
        cursor_start_id: args.cursorAfterId,
        cursor_end_id: args.cursorAfterId,
        next_cursor_after_id: args.cursorAfterId,
        legacy_rows_read: 0,
        catalog_unique: 0,
        relation_unique: 0,
        skipped: 0,
        skipped_relleno: 0,
        skipped_norm_null: 0,
        skipped_missing_ref: 0,
        skipped_error: 0,
        errors: 0,
        apply_status: 'skipped_by_config'
      };
      console.log('---JSON_REPORT_START---');
      console.log(JSON.stringify(report, null, 2));
      console.log('---JSON_REPORT_END---');
    }
    return;
  }

  const isEtiquetas = args.kind === 'etiquetas';
  const isCursor = args.paginationMode === 'cursor';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sqlFile = `/tmp/backfill_${args.kind}_${timestamp}.sql`;

  let selectSql = '';
  if (isCursor) {
    if (isEtiquetas) {
      selectSql = `SELECT id, dictamen_id, etiqueta FROM dictamen_etiquetas_llm WHERE id > ${args.cursorAfterId} ORDER BY id ASC LIMIT ${args.limit}`;
    } else {
      selectSql = `SELECT id, dictamen_id, tipo_norma, numero, articulo, extra, year, sector FROM dictamen_fuentes_legales WHERE id > ${args.cursorAfterId} ORDER BY id ASC LIMIT ${args.limit}`;
    }
  } else {
    if (isEtiquetas) {
      selectSql = `SELECT id, dictamen_id, etiqueta FROM dictamen_etiquetas_llm ORDER BY dictamen_id, id LIMIT ${args.limit} OFFSET ${args.offset}`;
    } else {
      selectSql = `SELECT id, dictamen_id, tipo_norma, numero, articulo, extra, year, sector FROM dictamen_fuentes_legales ORDER BY dictamen_id, id LIMIT ${args.limit} OFFSET ${args.offset}`;
    }
  }

  if (args.apply && !args.allowRepeat) {
    const alreadyDone = await checkIfAlreadyMigrated(args);
    if (alreadyDone) {
      const modeDesc = isCursor ? `cursor_after_id=${args.cursorAfterId}` : `offset=${args.offset}`;
      console.error(`Error: El lote [${args.kind}] ${modeDesc} limit=${args.limit} ya ha sido migrado con éxito anteriormente. Use --allow-repeat para forzar.`);
      process.exit(1);
    }

    const collisionId = await checkOverlap(args);
    if (collisionId !== null) {
      console.error(`Error: El rango solicitado (OFFSET mode) solapa con un lote exitoso existente (ID=${collisionId}). Use --allow-repeat si es intencional.`);
      process.exit(1);
    }
  }

  const modeLog = isCursor ? `cursor_after_id=${args.cursorAfterId}` : `offset=${args.offset}`;
  console.log(`Leyendo ${args.kind} desde legacy (limit=${args.limit}, ${modeLog})...`);
  const rows = queryD1(selectSql);

  if (rows.length === 0) {
    console.log(`apply_status=end_of_data`);
    if (args.jsonReport) {
      const report = {
        kind: args.kind,
        mode: args.apply ? 'apply' : 'dry-run',
        pagination_mode: args.paginationMode,
        cursor_after_id: args.cursorAfterId,
        cursor_start_id: args.cursorAfterId,
        cursor_end_id: args.cursorAfterId,
        next_cursor_after_id: args.cursorAfterId,
        legacy_rows_read: 0,
        catalog_unique: 0,
        relation_unique: 0,
        skipped: 0,
        skipped_relleno: 0,
        skipped_norm_null: 0,
        skipped_missing_ref: 0,
        skipped_error: 0,
        errors: 0,
        apply_status: 'end_of_data'
      };
      console.log('---JSON_REPORT_START---');
      console.log(JSON.stringify(report, null, 2));
      console.log('---JSON_REPORT_END---');
    }
    if (args.apply) {
      const runId = registerBackfillStart(args);
      updateBackfillRun(runId, {
        status: 'success',
        apply_status: 'end_of_data',
        legacy_rows_read: 0
      });
    }
    return;
  }

  const firstId = rows[0].id;
  const lastId = rows[rows.length - 1].id;

  if (isCursor && args.apply && !args.allowRepeat) {
    const collisionId = await checkOverlapCursor(args, firstId, lastId);
    if (collisionId !== null) {
      process.exit(1);
    }
  }

  let read = 0;
  let catalogCandidates = 0;
  let relationCandidates = 0;
  let skipped = 0;
  let skipped_relleno = 0;
  let skipped_norm_null = 0;
  let skipped_missing_ref = 0;
  let skipped_error = 0;
  let errors = 0;

  const catalogUnique = new Set<string>();
  const relationUnique = new Set<string>();
  const dictamenIds = new Set<string>();
  const sqlCommands: string[] = [];

  const batchDictamenIds = Array.from(new Set(rows.map((r: any) => r.dictamen_id as string)));
  const existingDictamenIds = new Set<string>();
  if (batchDictamenIds.length > 0) {
    const idList = batchDictamenIds.map(id => sqlString(id as string)).join(',');
    const checkSql = `SELECT id FROM dictamenes WHERE id IN (${idList})`;
    const existing = queryD1(checkSql);
    existing.forEach((r: any) => existingDictamenIds.add(r.id));
  }

  sqlCommands.push(`-- backfill_canonical_derived_catalogs`);
  sqlCommands.push(`-- kind=${args.kind}`);
  sqlCommands.push(`-- limit=${args.limit}`);
  if (isCursor) {
    sqlCommands.push(`-- cursor_after_id=${args.cursorAfterId}`);
    sqlCommands.push(`-- cursor_range=[${firstId}-${lastId}]`);
  }
  sqlCommands.push(`-- generated_at=${new Date().toISOString()}`);
  sqlCommands.push(``);

  const isRellenoLocal = (val: string | null | undefined): boolean => {
    if (!val) return false;
    const v = String(val).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return v.includes('valor de relleno') || v === 'n/a' || v === 'desconocido';
  };

  for (const row of rows) {
    read++;
    try {
      if (!existingDictamenIds.has(row.dictamen_id)) {
        skipped++;
        skipped_missing_ref++;
        continue;
      }

      if (isEtiquetas) {
        const norm = normalizeEtiquetaNorm(row.etiqueta);
        if (!norm) {
          skipped++;
          skipped_norm_null++;
          continue;
        }
        const display = normalizeEtiquetaDisplay(row.etiqueta);
        const slug = etiquetaSlugFromNorm(norm);

        catalogCandidates++;
        relationCandidates++;
        catalogUnique.add(norm);
        relationUnique.add(`${row.dictamen_id}|${norm}`);
        dictamenIds.add(row.dictamen_id);

        sqlCommands.push(`INSERT OR IGNORE INTO etiquetas_catalogo (etiqueta_display, etiqueta_norm, etiqueta_slug, origen) VALUES (${sqlString(display)}, ${sqlString(norm)}, ${sqlString(slug)}, 'llm');`);
        sqlCommands.push(`INSERT OR IGNORE INTO dictamen_etiquetas (dictamen_id, etiqueta_id, raw_etiqueta, modelo_llm) SELECT ${sqlString(row.dictamen_id)}, id, ${sqlString(row.etiqueta)}, NULL FROM etiquetas_catalogo WHERE etiqueta_norm = ${sqlString(norm)};`);
      } else {
        if (isRellenoLocal(row.tipo_norma) || isRellenoLocal(row.numero)) {
          skipped++;
          skipped_relleno++;
          continue;
        }

        const normalized = normalizeLegalSourceForStorage({
          tipo_norma: row.tipo_norma,
          numero: row.numero,
          articulo: row.articulo,
          extra: row.extra,
          year: row.year,
          sector: row.sector
        });

        const normaKey = buildFuenteNormaKey(normalized);
        if (!normaKey) {
          skipped++;
          skipped_norm_null++;
          continue;
        }

        const displayLabel = buildFuenteDisplayLabel({
          tipo_norma: normalized.tipo_norma ?? 'Desconocido',
          numero: normalized.numero,
          articulo: normalized.articulo,
          year: normalized.year,
          sector: normalized.sector
        });

        const mentionKey = [normaKey, normalized.extra || '-'].join('|');

        catalogCandidates++;
        relationCandidates++;
        catalogUnique.add(normaKey);
        relationUnique.add(`${row.dictamen_id}|${normaKey}|${mentionKey}`);
        dictamenIds.add(row.dictamen_id);

        sqlCommands.push(`INSERT OR IGNORE INTO fuentes_legales_catalogo (norma_key, tipo_norma, numero, articulo, year, sector, display_label) VALUES (${sqlString(normaKey)}, ${sqlString(normalized.tipo_norma)}, ${sqlString(normalized.numero)}, ${sqlString(normalized.articulo)}, ${sqlString(normalized.year)}, ${sqlString(normalized.sector)}, ${sqlString(displayLabel)});`);
        sqlCommands.push(`INSERT OR IGNORE INTO dictamen_fuentes (dictamen_id, fuente_id, raw_tipo_norma, raw_numero, raw_articulo, raw_extra, modelo_llm, mention_key) SELECT ${sqlString(row.dictamen_id)}, id, ${sqlString(row.tipo_norma)}, ${sqlString(row.numero)}, ${sqlString(row.articulo)}, ${sqlString(row.extra)}, NULL, ${sqlString(mentionKey)} FROM fuentes_legales_catalogo WHERE norma_key = ${sqlString(normaKey)};`);
      }
    } catch (e: any) {
      skipped++;
      skipped_error++;
      errors++;
    }
  }

  writeFileSync(sqlFile, `${sqlCommands.join('\n')}\n`);

  if (relationCandidates === 0) {
    if (args.jsonReport) {
      const report = {
        kind: args.kind,
        mode: args.apply ? 'apply' : 'dry-run',
        pagination_mode: args.paginationMode,
        cursor_after_id: args.cursorAfterId,
        cursor_start_id: firstId,
        cursor_end_id: lastId,
        next_cursor_after_id: lastId,
        legacy_rows_read: read,
        catalog_unique: catalogUnique.size,
        relation_unique: relationUnique.size,
        skipped,
        skipped_relleno,
        skipped_norm_null,
        skipped_missing_ref,
        skipped_error,
        errors,
        apply_status: 'skipped_no_valid_candidates'
      };
      console.log('---JSON_REPORT_START---');
      console.log(JSON.stringify(report, null, 2));
      console.log('---JSON_REPORT_END---');
    }
    if (args.apply) {
      const runId = registerBackfillStart(args);
      updateBackfillRun(runId, {
        status: 'skipped',
        apply_status: 'skipped_no_valid_candidates',
        legacy_rows_read: read,
        skipped,
        errors,
        sql_file: sqlFile,
        cursor_start_id: firstId,
        cursor_end_id: lastId
      });
    }
    return;
  }

  let applyStatus = 'pending';
  let applyError: string | null = null;
  let runId: number | null = null;

  if (args.apply) {
    runId = registerBackfillStart(args);
    try {
      executeWrangler(['d1', 'execute', 'cgr-dictamenes', '--remote', '--file', sqlFile]);
      applyStatus = 'success';
    } catch (e: any) {
      applyStatus = 'error';
      applyError = e.message || String(e);
    }
  } else {
    applyStatus = 'dry-run-generated';
  }

  if (args.apply && runId) {
    updateBackfillRun(runId, {
      status: applyStatus === 'success' ? 'success' : 'error',
      apply_status: applyStatus,
      apply_error: applyError,
      legacy_rows_read: read,
      catalog_candidates: catalogCandidates,
      catalog_unique: catalogUnique.size,
      relation_candidates: relationCandidates,
      relation_unique: relationUnique.size,
      duplicates_detected: relationCandidates - relationUnique.size,
      skipped,
      errors,
      sql_file: sqlFile,
      cursor_start_id: firstId,
      cursor_end_id: lastId
    });
  }

  if (args.jsonReport) {
    const report = {
      kind: args.kind,
      mode: args.apply ? 'apply' : 'dry-run',
      pagination_mode: args.paginationMode,
      cursor_after_id: args.cursorAfterId,
      cursor_start_id: firstId,
      cursor_end_id: lastId,
      next_cursor_after_id: lastId,
      legacy_rows_read: read,
      catalog_unique: catalogUnique.size,
      relation_unique: relationUnique.size,
      skipped,
      skipped_relleno,
      skipped_norm_null,
      skipped_missing_ref,
      skipped_error,
      errors,
      sql_file: sqlFile,
      apply_status: applyStatus
    };
    console.log('---JSON_REPORT_START---');
    console.log(JSON.stringify(report, null, 2));
    console.log('---JSON_REPORT_END---');
  }
}

async function main() {
  const args = parseArgs();
  await runBackfill(args);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
