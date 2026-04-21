import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface CampaignArgs {
  etiquetasStartCursor: number;
  fuentesStartCursor: number;
  etiquetasLimit: number;
  fuentesLimit: number;
  campaignWindows: number;
  dryRunCampaign: boolean;
  applyCampaign: boolean;
  confirm: boolean;
}

function parseArgs(): CampaignArgs {
  const args = process.argv;
  const getArgValue = (flag: string) => {
    const joined = args.find(a => a.startsWith(`${flag}=`))?.split('=')[1];
    if (joined) return joined;
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length) return args[index + 1];
    return undefined;
  };

  const etiquetasStartStr = getArgValue('--etiquetas-start-cursor');
  const fuentesStartStr = getArgValue('--fuentes-start-cursor');
  const etiquetasLimitStr = getArgValue('--etiquetas-limit');
  const fuentesLimitStr = getArgValue('--fuentes-limit');
  const campaignWindowsStr = getArgValue('--campaign-windows');

  const dryRunCampaign = args.includes('--dry-run-campaign');
  const applyCampaign = args.includes('--apply-campaign');
  const confirm = args.includes('--confirm-remote-write');

  if (!etiquetasStartStr || !fuentesStartStr || etiquetasLimitStr === undefined || fuentesLimitStr === undefined || !campaignWindowsStr) {
    console.error('Error: Faltan argumentos obligatorios (--etiquetas-start-cursor, --fuentes-start-cursor, --etiquetas-limit, --fuentes-limit, --campaign-windows)');
    process.exit(1);
  }

  const windows = parseInt(campaignWindowsStr);
  if (isNaN(windows) || windows <= 0) {
    console.error('Error: --campaign-windows debe ser un número positivo');
    process.exit(1);
  }
  if (windows > 10) {
    console.error('Error: --campaign-windows no puede ser superior a 10 (Restricción Fase 9.8)');
    process.exit(1);
  }

  if (dryRunCampaign && applyCampaign) {
    console.error('Error: --dry-run-campaign y --apply-campaign son mutuamente excluyentes');
    process.exit(1);
  }

  if (!dryRunCampaign && !applyCampaign) {
    console.error('Error: Debe especificar --dry-run-campaign o --apply-campaign');
    process.exit(1);
  }

  if (applyCampaign && !confirm) {
    console.error('Error: --apply-campaign requiere confirmación mediante --confirm-remote-write');
    process.exit(1);
  }

  return {
    etiquetasStartCursor: parseInt(etiquetasStartStr),
    fuentesStartCursor: parseInt(fuentesStartStr),
    etiquetasLimit: parseInt(etiquetasLimitStr),
    fuentesLimit: parseInt(fuentesLimitStr),
    campaignWindows: windows,
    dryRunCampaign,
    applyCampaign,
    confirm
  };
}

function runWindow(kind: 'etiquetas' | 'fuentes', cursor: number, limit: number, mode: 'dry-run' | 'apply', confirm: boolean) {
  const args = [
    'tsx',
    'scripts/run_backfill_window.ts',
    '--kind', kind,
    '--start-cursor-after-id', cursor.toString(),
    '--limit', limit.toString(),
    '--window-lots', kind === 'etiquetas' ? '10' : '20',
    mode === 'dry-run' ? '--dry-run-window' : '--apply-window',
    '--json-report'
  ];

  if (mode === 'apply' && confirm) {
    args.push('--confirm-remote-write');
  }

  const result = spawnSync('npx', args, { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error(`Fallo en ventana [${kind}] (${mode}): ${result.stderr || result.stdout}`);
  }

  const startMark = '---WINDOW_JSON_REPORT_START---';
  const endMark = '---WINDOW_JSON_REPORT_END---';
  const startIndex = result.stdout.indexOf(startMark);
  const endIndex = result.stdout.indexOf(endMark);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`No se encontró el reporte JSON en la salida del script (${mode})`);
  }

  const jsonStr = result.stdout.substring(startIndex + startMark.length, endIndex).trim();
  return JSON.parse(jsonStr);
}

function auditD1Status() {
  const d1Result = spawnSync('./node_modules/.bin/wrangler', [
    'd1', 'execute', 'cgr-dictamenes', '--remote', '--json',
    '--command', 'SELECT MAX(id) as max_id FROM backfill_canonical_derivatives_runs; SELECT (SELECT COUNT(*) FROM (SELECT dictamen_id, etiqueta_id FROM dictamen_etiquetas GROUP BY dictamen_id, etiqueta_id HAVING COUNT(*) > 1)) as dup_etq, (SELECT COUNT(*) FROM (SELECT dictamen_id, fuente_id, mention_key FROM dictamen_fuentes GROUP BY dictamen_id, fuente_id, mention_key HAVING COUNT(*) > 1)) as dup_fte;'
  ], { encoding: 'utf-8' });

  if (d1Result.status !== 0) {
    console.error(`Error en auditoría D1: ${d1Result.stderr}`);
    return null;
  }
  try {
    return JSON.parse(d1Result.stdout);
  } catch (e) {
    return null;
  }
}

async function main() {
  const config = parseArgs();
  const campaignId = `CAMP_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const reportPath = path.join('../docs/explicacion/backfill_campaign_reports', `${campaignId}.md`);

  let currentEtiquetasCursor = config.etiquetasStartCursor;
  let currentFuentesCursor = config.fuentesStartCursor;
  const windowReports: any[] = [];

  console.log(`\n=== INICIANDO CAMPAÑA ${config.dryRunCampaign ? 'DRY-RUN' : 'APPLY'} [${campaignId}] ===`);
  console.log(`Windows: ${config.campaignWindows} | Etq: ${config.etiquetasLimit} | Fte: ${config.fuentesLimit}\n`);

  for (let w = 1; w <= config.campaignWindows; w++) {
    console.log(`\n--- VENTANA ${w}/${config.campaignWindows} ---`);

    try {
      // 1. Ejecutar Etiquetas
      console.log(`[Ventana ${w}] Procesando Etiquetas (Cursor: ${currentEtiquetasCursor})...`);
      const etqReport = runWindow('etiquetas', currentEtiquetasCursor, config.etiquetasLimit, config.dryRunCampaign ? 'dry-run' : 'apply', config.confirm);
      currentEtiquetasCursor = etqReport.cursor_final;

      // 2. Ejecutar Fuentes
      console.log(`[Ventana ${w}] Procesando Fuentes (Cursor: ${currentFuentesCursor})...`);
      const fteReport = runWindow('fuentes', currentFuentesCursor, config.fuentesLimit, config.dryRunCampaign ? 'dry-run' : 'apply', config.confirm);
      currentFuentesCursor = fteReport.cursor_final;

      // 3. Auditoría Post-Ventana si es APPLY
      if (config.applyCampaign) {
        console.log(`[Ventana ${w}] Realizando auditoría post-apply en D1...`);
        const audit = auditD1Status();
        if (!audit) {
           throw new Error('[AUDIT_ERROR] No se pudo verificar el estado de D1 tras la ventana.');
        }

        // Verificación básica de duplicados
        const dups = audit.find((r: any) => r.results && r.results[0] && r.results[0].dup_etq !== undefined);
        if (dups && (dups.results[0].dup_etq > 0 || dups.results[0].dup_fte > 0)) {
          throw new Error(`[AUDIT_FAILURE] Duplicados detectados en D1 (Etq: ${dups.results[0].dup_etq}, Fte: ${dups.results[0].dup_fte})`);
        }

        console.log(`[Ventana ${w}] Auditoría superada (0 duplicados). Continuando campaña...`);
      }

      windowReports.push({
        window: w,
        etiquetas: etqReport,
        fuentes: fteReport
      });

      console.log(`[Ventana ${w}] Completada. Nuevos cursores -> Etq: ${currentEtiquetasCursor}, Fte: ${currentFuentesCursor}`);

    } catch (e: any) {
      console.error(`\nError crítico en campaña: ${e.message}`);
      generateMarkdownReport(campaignId, config, windowReports, e.message, reportPath);
      process.exit(1);
    }
  }

  generateMarkdownReport(campaignId, config, windowReports, null, reportPath);

  console.log(`\n=== CAMPAÑA FINALIZADA [${campaignId}] ===`);
  console.log(`Reporte generado en: ${reportPath}`);
  console.log(`Cursores Finales -> Etiquetas: ${currentEtiquetasCursor}, Fuentes: ${currentFuentesCursor}\n`);
}

function generateMarkdownReport(campaignId: string, config: CampaignArgs, reports: any[], error: string | null, outputPath: string) {
  let md = `# Reporte de Campaña Backfill: ${campaignId}\n\n`;
  md += `**Fecha**: ${new Date().toLocaleString()}\n`;
  md += `**Modo**: ${config.dryRunCampaign ? 'DRY-RUN' : 'APPLY'}\n`;
  if (error) md += `**ESTADO**: ❌ FALLIDA - ${error}\n\n`;
  else md += `**ESTADO**: ✅ EXITOSA\n\n`;

  md += `## Configuración Inicial\n`;
  md += `- Ventanas: ${config.campaignWindows}\n`;
  md += `- Etiquetas: Cursor Inicial ${config.etiquetasStartCursor}, Limit ${config.etiquetasLimit}\n`;
  md += `- Fuentes: Cursor Inicial ${config.fuentesStartCursor}, Limit ${config.fuentesLimit}\n\n`;

  md += `## Resumen de Ejecución\n\n`;

  reports.forEach(r => {
    md += `### Ventana ${r.window}\n`;
    md += `#### Etiquetas\n`;
    md += `- Cursor Seg.: ${r.etiquetas.cursor_start} -> ${r.etiquetas.cursor_final}\n`;
    md += `- Lotes: ${r.etiquetas.lots_executed}\n`;
    md += `#### Fuentes\n`;
    md += `- Cursor Seg.: ${r.fuentes.cursor_start} -> ${r.fuentes.cursor_final}\n`;
    md += `- Lotes: ${r.fuentes.lots_executed}\n\n`;
  });

  if (reports.length > 0) {
    const last = reports[reports.length - 1];
    md += `## Estado Final Recomendado\n`;
    md += `- **Nuevo Cursor Etiquetas**: ${last.etiquetas.cursor_final}\n`;
    md += `- **Nuevo Cursor Fuentes**: ${last.fuentes.cursor_final}\n`;
  }

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, md);
  } catch (e) {
    console.error(`No se pudo escribir el reporte: ${outputPath}`);
  }
}

main().catch(console.error);
