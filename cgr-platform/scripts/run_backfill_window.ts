import { spawnSync } from 'node:child_process';

interface WindowArgs {
  kind: 'etiquetas' | 'fuentes';
  startCursorAfterId: number;
  limit: number;
  windowLots: number;
  dryRunWindow: boolean;
  applyWindow: boolean;
  jsonReport: boolean;
  confirm: boolean;
}

function parseArgs(): WindowArgs {
  const args = process.argv;
  const getArgValue = (flag: string) => {
    const joined = args.find(a => a.startsWith(`${flag}=`))?.split('=')[1];
    if (joined) return joined;
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length) return args[index + 1];
    return undefined;
  };

  const kind = getArgValue('--kind') as any;
  const startCursorStr = getArgValue('--start-cursor-after-id');
  const limitStr = getArgValue('--limit');
  const windowLotsStr = getArgValue('--window-lots');
  const dryRunWindow = args.includes('--dry-run-window');
  const applyWindow = args.includes('--apply-window');
  const jsonReport = args.includes('--json-report');
  const confirm = args.includes('--confirm-remote-write');

  if (!kind || !['etiquetas', 'fuentes'].includes(kind)) {
    console.error('Error: --kind [etiquetas|fuentes] es requerido');
    process.exit(1);
  }
  if (!startCursorStr || !limitStr || !windowLotsStr) {
    console.error('Error: --start-cursor-after-id, --limit y --window-lots son requeridos');
    process.exit(1);
  }

  if (dryRunWindow && applyWindow) {
    console.error('Error: --dry-run-window y --apply-window son mutuamente excluyentes');
    process.exit(1);
  }

  if (!dryRunWindow && !applyWindow) {
    console.error('Error: Debe especificar --dry-run-window o --apply-window');
    process.exit(1);
  }

  const windowLots = parseInt(windowLotsStr);
  if (windowLots > 20) {
    console.error('Error: --window-lots no puede ser mayor a 20 (Restricción Fase 9.1)');
    process.exit(1);
  }

  const limit = parseInt(limitStr);
  const maxLimit = kind === 'etiquetas' ? 200 : 100;
  if (limit > maxLimit) {
    console.error(`Error: --limit no puede ser mayor a ${maxLimit} para [${kind}] (Guardrail Fase 9.1)`);
    process.exit(1);
  }

  if (limit < 0) {
    console.error('Error: --limit debe ser mayor o igual a 0');
    process.exit(1);
  }

  if (applyWindow && !confirm) {
    console.error('Error: --apply-window requiere confirmación mediante --confirm-remote-write');
    process.exit(1);
  }

  return {
    kind,
    startCursorAfterId: parseInt(startCursorStr),
    limit,
    windowLots,
    dryRunWindow,
    applyWindow,
    jsonReport,
    confirm
  };
}

function runLot(kind: string, cursor: number, limit: number, mode: 'dry-run' | 'apply', confirm: boolean) {
  const args = [
    'tsx',
    'scripts/backfill_canonical_derived_catalogs.ts',
    '--kind', kind,
    '--cursor-after-id', cursor.toString(),
    '--limit', limit.toString(),
    mode === 'dry-run' ? '--dry-run' : '--apply',
    '--json-report'
  ];

  if (mode === 'apply' && confirm) {
    args.push('--confirm-remote-write');
  }

  const result = spawnSync('npx', args, { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error(`Fallo en lote (${mode}): ${result.stderr || result.stdout}`);
  }

  const startMark = '---JSON_REPORT_START---';
  const endMark = '---JSON_REPORT_END---';
  const startIndex = result.stdout.indexOf(startMark);
  const endIndex = result.stdout.indexOf(endMark);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`No se encontró el reporte JSON en la salida del script (${mode})`);
  }

  const jsonStr = result.stdout.substring(startIndex + startMark.length, endIndex).trim();
  return JSON.parse(jsonStr);
}

async function main() {
  const config = parseArgs();
  let currentCursor = config.startCursorAfterId;
  const logs = [];

  console.log(`\n=== INICIANDO VENTANA ${config.applyWindow ? 'APPLY' : 'DRY-RUN'} (${config.kind}) ===`);
  console.log(`Lots: ${config.windowLots} | Start Cursor: ${currentCursor} | Limit: ${config.limit}\n`);

  for (let i = 1; i <= config.windowLots; i++) {
    const lotLabel = `Lote ${i}/${config.windowLots}`;
    console.log(`[${lotLabel}] Iniciando ciclo preventivo (Cursor: ${currentCursor})...`);

    try {
      // 1. Dry-run preventivo obligatorio
      const dryReport = runLot(config.kind, currentCursor, config.limit, 'dry-run', false);

      // 2. Validación de Guardrails desde JSON
      const isAdministrativeSkip = dryReport.apply_status === 'skipped_by_config' || dryReport.apply_status === 'end_of_data';

      if (!isAdministrativeSkip && (dryReport.errors > 0 || dryReport.skipped_error > 0)) {
        throw new Error(`[GUARDRAIL] Errores técnicos detectados en dry-run preventivo.`);
      }
      if (!isAdministrativeSkip && dryReport.skipped_missing_ref > 0) {
        throw new Error(`[GUARDRAIL] Falla de integridad referencial (missing_ref) detectada.`);
      }
      if (!isAdministrativeSkip && dryReport.skipped_norm_null > 2) {
        throw new Error(`[GUARDRAIL] Exceso de normalización nula (>2).`);
      }
      if (config.kind === 'fuentes' && (dryReport.skipped_relleno / dryReport.legacy_rows_read) > 0.25) {
        console.error(`[BLOCKED_DEGRADED_LOT] Salto por relleno alto (>25%) en lote ${i}.`);
        process.exit(1);
      }

      // 3. Ejecución de Apply si está autorizado
      let finalReport = dryReport;
      if (config.applyWindow) {
        console.log(`[${lotLabel}] Validaciones superadas. Ejecutando APPLY...`);
        finalReport = runLot(config.kind, currentCursor, config.limit, 'apply', config.confirm);

        if (!['success', 'skipped_by_config', 'end_of_data'].includes(finalReport.apply_status) || finalReport.errors > 0) {
          throw new Error(`[APPLY_FAILURE] El lote no pudo aplicarse con éxito o generó errores post-write (Status: ${finalReport.apply_status}).`);
        }
      }

      logs.push({
        lot: i,
        cursor_start: finalReport.cursor_start_id,
        cursor_end: finalReport.cursor_end_id,
        read: finalReport.legacy_rows_read,
        unique: finalReport.relation_unique,
        skipped: finalReport.skipped,
        relleno: finalReport.skipped_relleno,
        status: finalReport.apply_status
      });

      // 4. Verificación de Fin de Datos
      if (finalReport.legacy_rows_read < config.limit) {
        console.warn(`\n[END_OF_DATA] Detectado fin de tabla en lote ${i}.`);
        currentCursor = finalReport.next_cursor_after_id;
        break;
      }

      currentCursor = finalReport.next_cursor_after_id;
    } catch (e: any) {
      console.error(`\nError crítico en ventana: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`\n=== RESUMEN DE VENTANA (${config.kind}) ===`);
  console.table(logs);
  console.log(`\nCursor Seguro Final: ${currentCursor}`);
  console.log(`Estado: ${config.applyWindow ? 'APPLIED' : 'SAFE (DRY-RUN)'}`);

  if (config.jsonReport) {
    const report = {
      kind: config.kind,
      apply: config.applyWindow,
      windows_lots: config.windowLots,
      cursor_start: config.startCursorAfterId,
      cursor_final: currentCursor,
      lots_executed: logs.length,
      runs: logs,
      status: 'success'
    };
    console.log('\n---WINDOW_JSON_REPORT_START---');
    console.log(JSON.stringify(report, null, 2));
    console.log('---WINDOW_JSON_REPORT_END---');
  }
}

main().catch(console.error);
