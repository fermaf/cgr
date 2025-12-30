// Worker principal: HTTP, dashboard, cron y cola.
import { fetchDictamenesPage, fetchDictamenesSearchPage } from './services/cgrClient';
import { analyzeDictamen, analyzeFuentesLegales, buildPrompt, expandQuery, rerankResults, generateEmbedding } from './services/mistralClient';
import { upsertRecord, queryRecords, fetchRecords } from './services/pineconeClient';
import {
  finishRun,
  getLatestRawRef,
  getLatestEnrichment,
  getDashboardStats,
  getStats,
  getDictamenById,
  getExistingDictamenIds,
  getDictamenCanonicals,
  insertEnrichment,
  listDictamenes,
  listDictamenByStatus,
  listDictamenIdsByStatus,
  listDictamenIdsWithEmptyEnrichment,
  listDictamenIdsWithEmptyFuentes,
  listDictamenIdsWithInvalidInput,
  listDictamenIdsMissingDocumentoCompleto,
  listDictamenIdsForCanonical,
  listRuns,
  startRun,
  updateDictamenStatus,
  updateEnrichmentFuentes,
  updateEnrichmentFuentesMissing,
  updateDictamenDocumentoMissing,
  updateDictamenCanonical
} from './storage/d1';
import { getRaw } from './storage/rawKv';
import { getCursor, getJson, putJson, setCursor } from './storage/kv';
import { canConsume, consume } from './quota/governor';
import {
  ingestDictamen,
  buildCanonicalSignature,
  buildCanonicalPayload,
  hashString,
  storeRawOnly,
  extractDictamenId
} from './ingest/ingest';
import type { QueueMessage } from './types/queue';
import type { DictamenRaw, DictamenSource } from './types/dictamen';

type DashboardCounts = {
  total: number;
  ingested: number;
  enriched: number;
  vectorized: number;
  error: number;
  invalidInput: number;
};
type DashboardRuns = { total: number; errors: number; vectorized: number; enriched: number; crawl: number; fuentes: number; backfill: number };
type DashboardQuality = { valid: number; invalid: number; missing: number };
type DashboardActivity = { recentRuns: number; lastRunAt: string | null };
type DashboardPending = { enrich: number; vectorize: number; fuentes: number };
type DashboardMissing = {
  documentoCompleto: number;
  documentoCompletoUnknown: number;
  fuentesLegales: number;
  fuentesPendientes: number;
};
type DashboardCanonical = { complete: number; missing: number };
type DashboardErrorsByType = { enrich: number; vectorize: number; crawl: number; fuentes: number; backfill: number };
type DashboardData = {
  counts: DashboardCounts;
  runs24h: DashboardRuns;
  quality: DashboardQuality;
  activity: DashboardActivity;
  pending: DashboardPending;
  missing: DashboardMissing;
  canonical: DashboardCanonical;
  errorsByType: DashboardErrorsByType;
  crawlState: { stopped: boolean; stoppedAt: string | null; stoppedReason: string | null; stablePages: number };
  flags: { cronPaused: boolean; pipelinePaused: boolean; crawlStopped: boolean };
  timeZone?: string;
};
type EnrichmentPayload = {
  titulo?: string | null;
  resumen?: string | null;
  analisis?: string | null;
  etiquetas?: string[] | null;
  booleanos?: Record<string, unknown> | null;
  genera_jurisprudencia_llm?: number | null;
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-import-token",
      ...init?.headers
    }
  });
}
function htmlResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...init?.headers
    }
  });
}
function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}
// Render del dashboard operativo (HTML + JS embebido).
function renderDashboard(data: DashboardData) {
  const timeZone = data.timeZone ?? "America/Santiago";
  const completionRate = data.counts.total > 0 ? data.counts.vectorized / data.counts.total : 0;
  const errorRate = data.runs24h.total > 0 ? data.runs24h.errors / data.runs24h.total : 0;
  const errorTotal = data.counts.error + data.counts.invalidInput;
  const backlog = data.counts.total - data.counts.vectorized;
  const pendingEnrich = data.pending.enrich;
  const pendingVectorize = data.pending.vectorize;
  const pendingFuentes = data.pending.fuentes;
  const total = data.counts.total || 1;
  const pctIngested = data.counts.ingested / total * 100;
  const pctEnriched = data.counts.enriched / total * 100;
  const pctVectorized = data.counts.vectorized / total * 100;
  const pctError = errorTotal / total * 100;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CGR \xB7 Control Operativo</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@400;500;600;700&display=swap');
    :root {
      color-scheme: light;
      --ink: #0f172a;
      --muted: #64748b;
      --paper: #f5f1ea;
      --accent: #f97316;
      --accent-2: #0f766e;
      --danger: #ef4444;
      --ok: #16a34a;
      --info: #2563eb;
      --neutral: #94a3b8;
      --card: rgba(255, 255, 255, 0.92);
      --shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    }
    body {
      margin: 0;
      font-family: "Sora", "IBM Plex Sans", sans-serif;
      background:
        radial-gradient(circle at 15% 10%, rgba(249, 115, 22, 0.22), transparent 48%),
        radial-gradient(circle at 85% 0%, rgba(15, 118, 110, 0.22), transparent 50%),
        radial-gradient(circle at 45% 78%, rgba(37, 99, 235, 0.12), transparent 50%),
        var(--paper);
      color: var(--ink);
    }
    header {
      padding: 48px 24px 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-family: "Fraunces", serif;
      font-size: 34px;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0;
      color: var(--muted);
    }
    main {
      display: grid;
      gap: 24px;
      padding: 0 24px 56px;
      max-width: 1220px;
    }
    .section {
      display: grid;
      gap: 16px;
    }
    .section.hero {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      align-items: stretch;
    }
    .section.split {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .section.ops {
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr);
    }
    @media (max-width: 980px) {
      .section.ops {
        grid-template-columns: 1fr;
      }
    }
    .panel,
    .card {
      background: var(--card);
      border-radius: 18px;
      padding: 16px;
      box-shadow: var(--shadow);
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .panel.big,
    .card.big {
      padding: 20px;
    }
    .panel.wide {
      grid-column: span 2;
    }
    @media (max-width: 980px) {
      .panel.wide {
        grid-column: auto;
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .label {
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.12em;
      color: var(--muted);
    }
    .value {
      font-size: 28px;
      font-weight: 600;
    }
    .value.small {
      font-size: 20px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(15, 23, 42, 0.06);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(15, 23, 42, 0.1);
      cursor: pointer;
    }
    .badge.ok {
      color: var(--ok);
      background: rgba(22, 163, 74, 0.12);
    }
    .badge.warn {
      color: var(--accent);
      background: rgba(245, 158, 11, 0.16);
    }
    .badge.danger {
      color: var(--danger);
      background: rgba(239, 68, 68, 0.12);
    }
    .badge.info {
      color: var(--info);
      background: rgba(99, 102, 241, 0.12);
    }
    .badge.neutral {
      color: var(--neutral);
      background: rgba(148, 163, 184, 0.18);
    }
    .badge.highlight {
      color: #0f172a;
      background: rgba(249, 115, 22, 0.16);
    }
    .bar {
      height: 8px;
      background: rgba(148, 163, 184, 0.25);
      border-radius: 999px;
      overflow: hidden;
      margin-top: 10px;
    }
    .bar span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%);
      width: 0%;
      transition: width 0.6s ease;
    }
    .bar.alt span {
      background: linear-gradient(90deg, var(--accent-2) 0%, var(--info) 100%);
    }
    .meta {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
    }
    .stack {
      height: 16px;
      background: rgba(148, 163, 184, 0.2);
      border-radius: 999px;
      overflow: hidden;
      display: flex;
    }
    .stack span {
      height: 100%;
      display: block;
    }
    .donut {
      --pct-vectorized: 0;
      --pct-enriched: 0;
      --pct-ingested: 0;
      --pct-error: 0;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: conic-gradient(
        var(--ok) 0% calc(var(--pct-vectorized) * 1%),
        var(--accent-2) calc(var(--pct-vectorized) * 1%) calc((var(--pct-vectorized) + var(--pct-enriched)) * 1%),
        var(--accent) calc((var(--pct-vectorized) + var(--pct-enriched)) * 1%) calc((var(--pct-vectorized) + var(--pct-enriched) + var(--pct-ingested)) * 1%),
        var(--danger) calc((var(--pct-vectorized) + var(--pct-enriched) + var(--pct-ingested)) * 1%) 100%
      );
      display: grid;
      place-items: center;
      position: relative;
      box-shadow: inset 0 0 0 10px rgba(255, 255, 255, 0.6);
    }
    .donut::after {
      content: "";
      width: 90px;
      height: 90px;
      border-radius: 50%;
      background: rgba(248, 250, 252, 0.9);
      position: absolute;
    }
    .donut-label {
      position: relative;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      z-index: 1;
      text-align: center;
    }
    .legend {
      display: grid;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .runs {
      list-style: none;
      padding: 0;
      margin: 10px 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .runs li {
      display: grid;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.04);
      min-width: 180px;
    }
    .runs strong {
      color: var(--ink);
    }
    .controls {
      display: grid;
      gap: 10px;
      margin-top: 10px;
    }
    .controls input,
    .controls select,
    .controls textarea {
      width: 100%;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
      background: white;
      font-family: "Sora", sans-serif;
    }
    .controls textarea {
      min-height: 80px;
      resize: vertical;
    }
    .controls button {
      border: none;
      border-radius: 10px;
      padding: 10px 12px;
      font-weight: 600;
      color: white;
      background: var(--accent);
      cursor: pointer;
    }
    .controls button.secondary {
      background: var(--accent-2);
      color: var(--ink);
    }
    .controls button.danger {
      background: var(--danger);
    }
    .controls .status {
      font-size: 12px;
      color: var(--muted);
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    .form-card {
      border: 1px dashed rgba(148, 163, 184, 0.4);
      border-radius: 14px;
      padding: 12px;
      background: rgba(248, 250, 252, 0.85);
      display: grid;
      gap: 10px;
    }
    .form-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
    }
    .field {
      display: grid;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    .field label {
      font-weight: 600;
      color: var(--ink);
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      display: inline-block;
    }
    .dot.ok { background: var(--ok); }
    .dot.enriched { background: var(--accent-2); }
    .dot.ingested { background: var(--accent); }
    .dot.error { background: var(--danger); }
    .dot.neutral { background: var(--neutral); }
    .timestamp {
      font-size: 14px;
      font-weight: 700;
    }
    .tz {
      font-size: 11px;
      color: var(--muted);
      margin-left: 4px;
    }
    a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .animate {
      animation: rise 0.6s ease both;
    }
    .delay-1 { animation-delay: 0.1s; }
  </style>
</head>
<body>
  <header>
    <h1>CGR \xB7 Centro de Control</h1>
    <p>Mapa vivo del repositorio, con acciones guiadas para mantenerlo sincronizado.</p>
  </header>
  <main>
    <section class="section hero animate">
      <div class="panel big wide">
        <div class="label">Resumen general</div>
        <div class="row">
          <div class="donut" aria-label="Distribucion por estado" style="--pct-vectorized:${pctVectorized.toFixed(2)}; --pct-enriched:${pctEnriched.toFixed(2)}; --pct-ingested:${pctIngested.toFixed(2)}; --pct-error:${pctError.toFixed(2)};">
            <div class="donut-label">
              <span id="completion-rate">${formatPercent(completionRate)}</span>
              <div class="meta">listo para uso</div>
            </div>
          </div>
          <div class="legend">
            <span><i class="dot ok"></i>Listos <span id="count-vectorized">${formatNumber(data.counts.vectorized)}</span></span>
            <span><i class="dot enriched"></i>En proceso <span id="count-enriched">${formatNumber(data.counts.enriched)}</span></span>
            <span><i class="dot ingested"></i>Iniciados <span id="count-ingested">${formatNumber(data.counts.ingested)}</span></span>
            <span><i class="dot error"></i>Con error <span id="count-error">${formatNumber(errorTotal)}</span></span>
            <span><i class="dot neutral"></i>Entrada invalida <span id="count-invalid-input">${formatNumber(data.counts.invalidInput)}</span></span>
          </div>
        </div>
        <div class="meta">Repositorio total <span id="count-total">${formatNumber(data.counts.total)}</span></div>
        <div class="stack" aria-hidden="true">
          <span id="stack-vectorized" style="width:${pctVectorized.toFixed(2)}%; background: var(--ok);"></span>
          <span id="stack-enriched" style="width:${pctEnriched.toFixed(2)}%; background: var(--accent-2);"></span>
          <span id="stack-ingested" style="width:${pctIngested.toFixed(2)}%; background: var(--accent);"></span>
          <span id="stack-error" style="width:${pctError.toFixed(2)}%; background: var(--danger);"></span>
        </div>
      </div>
      <div class="panel big">
        <div class="label">Cobertura de uso</div>
        <div class="value" id="coverage-vectorized">${formatNumber(data.counts.vectorized)}</div>
        <div class="meta">Listos de <span id="coverage-total">${formatNumber(data.counts.total)}</span> dictamenes</div>
        <div class="bar"><span id="coverage-bar" style="width:${(completionRate * 100).toFixed(1)}%"></span></div>
        <div class="row">
          <span class="badge ok">Avance <span id="coverage-rate">${formatPercent(completionRate)}</span></span>
          <span class="badge ${errorTotal > 0 ? "danger" : "ok"}"><span id="coverage-errors">${formatNumber(errorTotal)}</span> errores</span>
        </div>
      </div>
      <div class="panel big">
        <div class="label">Trabajo en curso</div>
        <div class="value" id="pending-total">${formatNumber(backlog)}</div>
        <div class="meta">Pendientes reales para completar el flujo</div>
        <div class="row">
          <span class="badge warn">Analisis <span id="pending-enrich">${formatNumber(pendingEnrich)}</span></span>
          <span class="badge info">Vector <span id="pending-vectorize">${formatNumber(pendingVectorize)}</span></span>
          <span class="badge neutral">Fuentes <span id="pending-fuentes">${formatNumber(pendingFuentes)}</span></span>
        </div>
      </div>
      <div class="panel big">
        <div class="label">Actividad 24h</div>
        <div class="value" id="runs-vectorized">${formatNumber(data.runs24h.vectorized)}</div>
        <div class="meta">Procesos completados en las ultimas 24h</div>
        <div class="row">
          <span class="badge"><span id="runs-enriched">${formatNumber(data.runs24h.enriched)}</span> analisis</span>
          <span class="badge"><span id="runs-fuentes">${formatNumber(data.runs24h.fuentes)}</span> fuentes</span>
          <span class="badge"><span id="runs-crawl">${formatNumber(data.runs24h.crawl)}</span> captura</span>
          <span class="badge"><span id="runs-backfill">${formatNumber(data.runs24h.backfill)}</span> ajuste</span>
        </div>
      </div>
    </section>
    <section class="section split animate delay-1">
      <div class="panel">
        <div class="label">Calidad del repositorio</div>
        <div class="value small" id="quality-valid">${formatNumber(data.quality.valid)}</div>
        <div class="meta">Dictamenes listos con analisis completo</div>
        <div class="row">
          <span class="badge ok">Completos <span id="quality-valid-badge">${formatNumber(data.quality.valid)}</span></span>
          <span class="badge warn">Incompletos <span id="quality-invalid">${formatNumber(data.quality.invalid)}</span></span>
          <span class="badge danger">Sin analisis <span id="quality-missing">${formatNumber(data.quality.missing)}</span></span>
        </div>
      </div>
      <div class="panel">
        <div class="label">Datos faltantes</div>
        <div class="row">
          <span class="badge warn">Documento <span id="missing-doc">${formatNumber(data.missing.documentoCompleto)}</span></span>
          <span class="badge neutral">Doc. sin marca <span id="missing-doc-unknown">${formatNumber(data.missing.documentoCompletoUnknown)}</span></span>
          <span class="badge warn">Fuentes <span id="missing-fuentes">${formatNumber(data.missing.fuentesLegales)}</span></span>
        </div>
      </div>
      <div class="panel">
        <div class="label">Control de cambios</div>
        <div class="value small" id="canonical-progress">0%</div>
        <div class="meta">Cobertura de verificacion automatica</div>
        <div class="bar alt"><span id="canonical-bar" style="width:0%"></span></div>
        <div class="row">
          <span class="badge ok">Completos <span id="canonical-complete">${formatNumber(data.canonical.complete)}</span></span>
          <span class="badge warn">Pendientes <span id="canonical-missing">${formatNumber(data.canonical.missing)}</span></span>
        </div>
      </div>
      <div class="panel">
        <div class="label">Potencial del repositorio</div>
        <div class="meta">Capacidad real de ofrecer productos basados en dictamenes.</div>
        <div class="row">
          <span class="badge highlight">Docs completos <span id="coverage-doc">0%</span></span>
          <span class="badge info">Fuentes legales <span id="coverage-fuentes">0%</span></span>
          <span class="badge ok">Control cambios <span id="coverage-canon">0%</span></span>
        </div>
      </div>
    </section>
    <section class="section split animate delay-1">
      <div class="panel">
        <div class="label">Errores 24h</div>
        <div class="value small" id="runs-errors">${formatNumber(data.runs24h.errors)}</div>
        <div class="meta">Tasa de error <span id="error-rate">${formatPercent(errorRate)}</span></div>
      </div>
      <div class="panel">
        <div class="label">Errores por etapa</div>
        <div class="row">
          <span class="badge danger">Analisis <span id="errors-enrich">${formatNumber(data.errorsByType.enrich)}</span></span>
          <span class="badge danger">Vector <span id="errors-vectorize">${formatNumber(data.errorsByType.vectorize)}</span></span>
          <span class="badge danger">Fuentes <span id="errors-fuentes">${formatNumber(data.errorsByType.fuentes)}</span></span>
          <span class="badge danger">Captura <span id="errors-crawl">${formatNumber(data.errorsByType.crawl)}</span></span>
          <span class="badge danger">Ajuste <span id="errors-backfill">${formatNumber(data.errorsByType.backfill)}</span></span>
        </div>
      </div>
      <div class="panel">
        <div class="label">Eventos 24h</div>
        <div class="value small" id="runs-total">${formatNumber(data.runs24h.total)}</div>
        <div class="meta">Total de eventos registrados</div>
      </div>
      <div class="panel">
        <div class="label">Estado operativo</div>
        <div class="row">
          <span class="badge ${data.flags.cronPaused ? "danger" : "ok"}">Cron ${data.flags.cronPaused ? "pausado" : "activo"}</span>
          <span class="badge ${data.flags.pipelinePaused ? "danger" : "ok"}">Queue ${data.flags.pipelinePaused ? "pausada" : "activa"}</span>
          <span class="badge ${data.flags.crawlStopped ? "warn" : "ok"}">Crawl ${data.flags.crawlStopped ? "detenido" : "normal"}</span>
        </div>
        <div class="row" style="margin-top:8px;">
          <span class="badge ${data.activity.recentRuns > 0 ? "ok" : "warn"}">Procesando ${data.activity.recentRuns > 0 ? "si" : "no"}</span>
          <span class="badge">Ultimo run <span id="last-run-at" class="timestamp" data-raw="${data.activity.lastRunAt ?? ""}">${data.activity.lastRunAt ?? "sin datos"}</span></span>
        </div>
      </div>
      <div class="panel">
        <div class="label">Estabilidad del crawl</div>
        <div class="meta">Se detiene si todo es identico varias paginas.</div>
        <div class="row">
          <span class="badge info">Paginas estables <span id="stable-pages">${formatNumber(data.crawlState.stablePages)}</span></span>
          <span class="badge ${data.flags.crawlStopped ? "warn" : "neutral"}">Motivo <span id="stable-reason">${data.crawlState.stoppedReason ?? "n/a"}</span></span>
          <span class="badge">Detenido <span id="stable-stopped-at">${data.crawlState.stoppedAt ?? "n/a"}</span></span>
        </div>
      </div>
    </section>
    <section class="section ops animate delay-1">
      <div class="panel big">
        <div class="label">Programador manual</div>
        <div class="meta">Lanza endpoints con parametros desde esta vista.</div>
        <div class="controls">
          <input id="ops-token" type="password" placeholder="IMPORT_TOKEN (se guarda localmente)" />
          <div class="form-grid">
            <div class="form-card">
              <div class="form-title">Crawl CGR con filtros</div>
              <div class="meta">Define el periodo o usa busqueda/filtros directos para capturar desde CGR.</div>
              <div class="field">
                <label>Rango de fechas</label>
                <div class="row">
                  <input id="crawl-from" type="date" />
                  <input id="crawl-to" type="date" />
                </div>
              </div>
              <div class="field">
                <label>Busqueda CGR (search)</label>
                <input id="crawl-search" type="text" placeholder="Ej: E144420N25" />
              </div>
              <div class="field">
                <label>Limites</label>
                <div class="row">
                  <input id="crawl-limit" type="number" min="1" max="500" value="200" />
                  <input id="crawl-max-pages" type="number" min="1" max="200" value="30" />
                </div>
              </div>
              <div class="field">
                <label>Filtros potentes (click-first)</label>
                <div class="row">
                  <select id="filter-preset">
                    <option value="none">Preset rapido...</option>
                    <option value="criterio_gj">Criterio: Genera Jurisprudencia</option>
                    <option value="descriptor_not_show">Excluir descriptor (not_show)</option>
                    <option value="criterio_not_show">Excluir criterio (not_show)</option>
                  </select>
                  <button class="secondary" id="filter-preset-add">Agregar preset</button>
                </div>
              </div>
              <div class="field">
                <label>Constructor de filtros</label>
                <div class="row">
                  <select id="filter-field">
                    <option value="n_dictamen">N\xB0 dictamen (exacto)</option>
                    <option value="doc_id">ID dictamen (exacto)</option>
                    <option value="criterio">Criterio</option>
                    <option value="descriptores">Descriptores</option>
                    <option value="materia">Materia</option>
                    <option value="origen">Origen</option>
                  </select>
                  <select id="filter-type">
                    <option value="force_obj">Exacto</option>
                    <option value="category">Categoria</option>
                  </select>
                </div>
                <div class="row" style="margin-top:8px;">
                  <input id="filter-value" type="text" placeholder="Valor del filtro" />
                  <button class="secondary" id="filter-add">Agregar filtro</button>
                </div>
              </div>
              <div class="field">
                <label>Filtros activos</label>
                <div class="row" id="filter-chips"></div>
                <button class="secondary" id="filter-clear">Limpiar filtros</button>
              <div class="meta">Click en un filtro para quitarlo. Para IDs tipo E123N25 usa "ID dictamen".</div>
              </div>
              <div class="field">
                <label>Opciones avanzadas (JSON)</label>
                <textarea id="crawl-options-json" placeholder='[{"type":"category","field":"criterio","value":"Genera Jurisprudencia"}]'></textarea>
                <div class="meta">Opcional. Se agrega a los filtros activos.</div>
              </div>
              <label class="toggle"><input id="crawl-enqueue" type="checkbox" checked /> Enviar a cola para analisis + vectorizacion</label>
              <label class="toggle"><input id="crawl-disable-range" type="checkbox" /> Ignorar fechas y buscar desde el inicio</label>
              <button id="crawl-submit">Ejecutar crawl</button>
              <div class="status" id="crawl-status">Listo para ejecutar.</div>
            </div>
            <div class="form-card">
              <div class="form-title">Reprocesos</div>
              <div class="field">
                <label>Limite por accion</label>
                <input id="ops-limit" type="number" min="1" max="500" value="100" />
              </div>
              <button class="secondary" data-action="vectorized">Reprocesar vectorizados</button>
              <button data-action="errors">Reprocesar errores</button>
              <button class="danger" data-action="empty">Reprocesar enrichment vacio</button>
              <button class="secondary" data-action="fuentes">Reprocesar fuentes legales</button>
            </div>
            <div class="form-card">
              <div class="form-title">Backfill puntual</div>
              <div class="field">
                <label>Limite backfill</label>
                <input id="backfill-limit" type="number" min="1" max="500" value="100" />
              </div>
              <label class="toggle"><input id="backfill-force" type="checkbox" /> Recalcular aunque exista</label>
              <div class="meta">Si completas fechas arriba, usa ese rango.</div>
              <button class="secondary" id="backfill-canonical">Backfill hash canonico</button>
              <button class="secondary" id="backfill-documento">Backfill doc. faltante</button>
            </div>
          </div>
          <div class="status" id="ops-status">Sin acciones recientes.</div>
        </div>
      </div>
      <div class="panel">
        <div class="label">Ultimas ejecuciones</div>
        <div class="meta" id="runs-updated">Actualiza cada 30s</div>
        <ul class="runs" id="runs-list"></ul>
      </div>
    </section>
  </main>
  <script>
    const formatNumber = (value) => new Intl.NumberFormat('es-CL').format(value);
    const formatPercent = (value) => (value * 100).toFixed(1) + '%';
    const timeZone = "${timeZone}";
    const formatDateChile = (value) => {
      if (!value) return 'sin datos';
      return new Intl.DateTimeFormat('es-CL', {
        timeZone,
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(value));
    };
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const updateDashboard = async () => {
      try {
        const stats = await fetch('/stats').then((res) => res.json());
        const counts = stats.counts ?? {};
        const runs = stats.runs24h ?? {};
        const quality = stats.quality ?? {};
        const activity = stats.activity ?? {};
        const pending = stats.pending ?? {};
        const missing = stats.missing ?? {};
        const canonical = stats.canonical ?? {};
        const crawlState = stats.crawlState ?? {};
        const errorsByType = stats.errorsByType ?? {};
        const total = counts.total || 1;
        const pctVectorized = (counts.vectorized || 0) / total * 100;
        const pctEnriched = (counts.enriched || 0) / total * 100;
        const pctIngested = (counts.ingested || 0) / total * 100;
        const errorTotal = (counts.error || 0) + (counts.invalidInput || 0);
        const pctError = errorTotal / total * 100;
        const completionRate = (counts.vectorized || 0) / total;
        const errorRate = (runs.total || 0) > 0 ? (runs.errors || 0) / runs.total : 0;
        setText('count-vectorized', formatNumber(counts.vectorized || 0));
        setText('count-enriched', formatNumber(counts.enriched || 0));
        setText('count-ingested', formatNumber(counts.ingested || 0));
        setText('count-error', formatNumber(errorTotal));
        setText('count-invalid-input', formatNumber(counts.invalidInput || 0));
        setText('count-total', formatNumber(counts.total || 0));
        setText('completion-rate', formatPercent(completionRate));
        setText('coverage-vectorized', formatNumber(counts.vectorized || 0));
        setText('coverage-total', formatNumber(counts.total || 0));
        setText('coverage-rate', formatPercent(completionRate));
        setText('coverage-errors', formatNumber(errorTotal));
        setText('pending-total', formatNumber((counts.total || 0) - (counts.vectorized || 0)));
        setText('pending-enrich', formatNumber(pending.enrich || 0));
        setText('pending-vectorize', formatNumber(pending.vectorize || 0));
        setText('pending-fuentes', formatNumber(pending.fuentes || 0));
        setText('runs-vectorized', formatNumber(runs.vectorized || 0));
        setText('runs-enriched', formatNumber(runs.enriched || 0));
        setText('runs-fuentes', formatNumber(runs.fuentes || 0));
        setText('runs-crawl', formatNumber(runs.crawl || 0));
        setText('runs-backfill', formatNumber(runs.backfill || 0));
        setText('runs-errors', formatNumber(runs.errors || 0));
        setText('runs-total', formatNumber(runs.total || 0));
        setText('error-rate', formatPercent(errorRate));
        setText('quality-valid', formatNumber(quality.valid || 0));
        setText('quality-valid-badge', formatNumber(quality.valid || 0));
        setText('quality-invalid', formatNumber(quality.invalid || 0));
        setText('quality-missing', formatNumber(quality.missing || 0));
        setText('last-run-at', formatDateChile(activity.lastRunAt));
        setText('missing-doc', formatNumber(missing.documentoCompleto || 0));
        setText('missing-doc-unknown', formatNumber(missing.documentoCompletoUnknown || 0));
        setText('missing-fuentes', formatNumber(missing.fuentesLegales || 0));
        setText('canonical-complete', formatNumber(canonical.complete || 0));
        setText('canonical-missing', formatNumber(canonical.missing || 0));
        const canonicalRate = (canonical.complete || 0) / total;
        setText('canonical-progress', formatPercent(canonicalRate));
        const canonicalBar = document.getElementById('canonical-bar');
        if (canonicalBar) canonicalBar.style.width = (canonicalRate * 100).toFixed(1) + '%';
        const docCoverage = (total - (missing.documentoCompleto || 0) - (missing.documentoCompletoUnknown || 0)) / total;
        const fuentesCoverage = (total - (missing.fuentesLegales || 0)) / total;
        setText('coverage-doc', formatPercent(docCoverage));
        setText('coverage-fuentes', formatPercent(fuentesCoverage));
        setText('coverage-canon', formatPercent(canonicalRate));
        setText('stable-pages', formatNumber(crawlState.stablePages || 0));
        setText('stable-reason', crawlState.stoppedReason || 'n/a');
        setText('stable-stopped-at', crawlState.stoppedAt || 'n/a');
        setText('errors-enrich', formatNumber(errorsByType.enrich || 0));
        setText('errors-vectorize', formatNumber(errorsByType.vectorize || 0));
        setText('errors-fuentes', formatNumber(errorsByType.fuentes || 0));
        setText('errors-crawl', formatNumber(errorsByType.crawl || 0));
        setText('errors-backfill', formatNumber(errorsByType.backfill || 0));
        const donut = document.querySelector('.donut');
        if (donut) {
          donut.style.setProperty('--pct-vectorized', pctVectorized.toFixed(2));
          donut.style.setProperty('--pct-enriched', pctEnriched.toFixed(2));
          donut.style.setProperty('--pct-ingested', pctIngested.toFixed(2));
          donut.style.setProperty('--pct-error', pctError.toFixed(2));
        }
        const stackIds = [
          ['stack-vectorized', pctVectorized],
          ['stack-enriched', pctEnriched],
          ['stack-ingested', pctIngested],
          ['stack-error', pctError],
        ];
        for (const [id, value] of stackIds) {
          const el = document.getElementById(id);
          if (el) el.style.width = value.toFixed(2) + '%';
        }
        const bar = document.getElementById('coverage-bar');
        if (bar) bar.style.width = (completionRate * 100).toFixed(1) + '%';
      } catch (error) {
        console.error('Dashboard update failed', error);
      }
    };
    const updateRuns = async () => {
      try {
        const data = await fetch('/runs?limit=6').then((res) => res.json());
        const list = document.getElementById('runs-list');
        if (!list) return;
        const runs = Array.isArray(data.runs) ? data.runs : [];
        list.innerHTML = runs
          .map((run) => {
            const status = run.status || '';
            const started = run.started_at ? formatDateChile(run.started_at) : 'sin hora';
            let detail = '';
            if (run.detail_json) {
              try {
                const parsed = JSON.parse(run.detail_json);
                detail = parsed.dictamenId ? ' \xB7 ' + parsed.dictamenId : '';
                if (parsed.reason) detail += ' \xB7 ' + parsed.reason;
              } catch (_) {}
            }
            return '<li><strong>' + run.run_type + '</strong><span>' + started + ' \xB7 ' + status + detail + '</span></li>';
          })
          .join('');
        const updated = document.getElementById('runs-updated');
        if (updated) {
          const stamp = new Intl.DateTimeFormat('es-CL', {
            timeZone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).formatnew Date();
          updated.textContent = 'Actualizado ' + stamp;
        }
      } catch (error) {
        console.error('Runs update failed', error);
      }
    };
    updateDashboard();
    updateRuns();
    setInterval(updateDashboard, 30000);
    setInterval(updateRuns, 30000);
    const tokenInput = document.getElementById('ops-token');
    const opsStatus = document.getElementById('ops-status');
    const crawlStatus = document.getElementById('crawl-status');
    const opsLimitInput = document.getElementById('ops-limit');
    const backfillLimitInput = document.getElementById('backfill-limit');
    const crawlFilter = document.getElementById('crawl-filter');
    const crawlFilterValueWrap = document.getElementById('crawl-filter-value-wrap');
    const crawlFilterValue = document.getElementById('crawl-filter-value');
    const crawlSubmit = document.getElementById('crawl-submit');
    const backfillCanonical = document.getElementById('backfill-canonical');
    const backfillDocumento = document.getElementById('backfill-documento');
    const backfillForce = document.getElementById('backfill-force');
    const savedToken = localStorage.getItem('cgrToken');
    if (tokenInput && savedToken) tokenInput.value = savedToken;
    tokenInput?.addEventListener('input', () => {
      localStorage.setItem('cgrToken', tokenInput.value || '');
    });
    const postJson = async (url, token, payload) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-import-token': token,
        },
        body: JSON.stringify(payload ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    };

    const filterPreset = document.getElementById('filter-preset');
    const filterPresetAdd = document.getElementById('filter-preset-add');
    const filterField = document.getElementById('filter-field');
    const filterType = document.getElementById('filter-type');
    const filterValueInput = document.getElementById('filter-value');
    const filterAdd = document.getElementById('filter-add');
    const filterChips = document.getElementById('filter-chips');
    const filterClear = document.getElementById('filter-clear');
    const activeFilters = [];

    const renderFilterChips = () => {
      if (!filterChips) return;
      filterChips.innerHTML = activeFilters
        .map((f, i) => {
          const label = f.field + ':' + f.value;
          return '<span class="chip" data-index="' + i + '">' + label + '</span>';
        })
        .join('');
      filterChips.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const index = Number(chip.getAttribute('data-index'));
          if (Number.isFinite(index)) activeFilters.splice(index, 1);
          renderFilterChips();
        });
      });
    };

    filterPresetAdd?.addEventListener('click', () => {
      const preset = filterPreset?.value;
      if (!preset || preset === 'none') return;
      if (preset === 'criterio_gj') {
        activeFilters.push({ type: 'category', field: 'criterio', value: 'Genera Jurisprudencia' });
      } else if (preset === 'descriptor_not_show') {
        activeFilters.push({ type: 'category', field: 'descriptores', value: 'not_show' });
      } else if (preset === 'criterio_not_show') {
        activeFilters.push({ type: 'category', field: 'criterio', value: 'not_show' });
      }
      renderFilterChips();
    });

    const syncFilterType = () => {
      const field = filterField?.value;
      if (!filterType || !field) return;
      if (field === 'n_dictamen' || field === 'doc_id') filterType.value = 'force_obj';
      else filterType.value = 'category';
    };
    filterField?.addEventListener('change', syncFilterType);
    syncFilterType();

    const normalizeFilterField = (field, value) => {
      if (!field) return field;
      if (field === 'n_dictamen' && /^E\\d+N\\d+$/i.test(value)) return 'doc_id';
      return field;
    };

    filterAdd?.addEventListener('click', () => {
      let field = filterField?.value;
      const type = filterType?.value;
      const value = filterValueInput?.value?.trim();
      if (!field || !type || !value) return;
      field = normalizeFilterField(field, value);
      activeFilters.push({ type, field, value });
      if (filterValueInput) filterValueInput.value = '';
      renderFilterChips();
    });

    filterClear?.addEventListener('click', () => {
      activeFilters.length = 0;
      renderFilterChips();
    });

    crawlSubmit?.addEventListener('click', async () => {
      const token = tokenInput?.value?.trim();
      if (!token) {
        if (crawlStatus) crawlStatus.textContent = 'Falta IMPORT_TOKEN.';
        return;
      }
      const from = document.getElementById('crawl-from')?.value;
      const to = document.getElementById('crawl-to')?.value;
      const limit = Number(document.getElementById('crawl-limit')?.value || 200);
      const maxPages = Number(document.getElementById('crawl-max-pages')?.value || 30);
      const enqueue = Boolean(document.getElementById('crawl-enqueue')?.checked);
      const disableRange = Boolean(document.getElementById('crawl-disable-range')?.checked);
      const options = [...activeFilters];
      const search = document.getElementById('crawl-search')?.value?.trim() || '';
      const optionsJson = document.getElementById('crawl-options-json')?.value?.trim();
      if (optionsJson) {
        try {
          const parsed = JSON.parse(optionsJson);
          if (Array.isArray(parsed)) options.push(...parsed);
          else if (parsed) options.push(parsed);
        } catch (error) {
          if (crawlStatus) crawlStatus.textContent = 'JSON de opciones invalido.';
          return;
        }
      }
      if (!disableRange && (!from || !to) && options.length === 0 && !search) {
        if (crawlStatus) crawlStatus.textContent = 'Faltan fechas desde/hasta, busqueda o filtros.';
        return;
      }
      const payload = {
        limit,
        maxPages,
        enqueue,
        ...(disableRange ? { disableRange: true } : (from && to ? { from, to } : {})),
        ...(search ? { search } : {}),
        ...(options.length ? { options } : {}),
      };
      if (crawlStatus) crawlStatus.textContent = 'Ejecutando crawl...';
      try {
        const { res, data } = await postJson('/internal/crawl-range', token, payload);
        if (crawlStatus) {
          crawlStatus.textContent = res.ok
            ? 'Listo: ' + (data.collected ?? 0) + ' dictamenes, ' + (data.enqueued ?? 0) + ' en cola.'
            : 'Error: ' + (data.error ?? res.status);
        }
        updateDashboard();
      } catch (_) {
        if (crawlStatus) crawlStatus.textContent = 'Error al ejecutar crawl.';
      }
    });

    backfillCanonical?.addEventListener('click', async () => {
      const token = tokenInput?.value?.trim();
      if (!token) {
        opsStatus.textContent = 'Falta IMPORT_TOKEN.';
        return;
      }
      const limit = Number(backfillLimitInput?.value || 100);
      const from = document.getElementById('crawl-from')?.value;
      const to = document.getElementById('crawl-to')?.value;
      const force = Boolean(backfillForce?.checked);
      opsStatus.textContent = 'Ejecutando backfill canonico...';
      try {
        const payload = {
          limit,
          force,
          ...(from && to ? { from, to } : {}),
        };
        const { res, data } = await postJson('/internal/backfill-canonical', token, payload);
        opsStatus.textContent = res.ok
          ? 'Backfill canonico: ' + (data.updated ?? 0) + ' actualizados.'
          : 'Error: ' + (data.error ?? res.status);
        updateDashboard();
      } catch (_) {
        opsStatus.textContent = 'Error al ejecutar backfill.';
      }
    });

    backfillDocumento?.addEventListener('click', async () => {
      const token = tokenInput?.value?.trim();
      if (!token) {
        opsStatus.textContent = 'Falta IMPORT_TOKEN.';
        return;
      }
      const limit = Number(backfillLimitInput?.value || 100);
      opsStatus.textContent = 'Ejecutando backfill documento...';
      try {
        const { res, data } = await postJson('/internal/backfill-documento-missing', token, { limit });
        opsStatus.textContent = res.ok
          ? 'Backfill documento: ' + (data.updated ?? 0) + ' actualizados.'
          : 'Error: ' + (data.error ?? res.status);
        updateDashboard();
      } catch (_) {
        opsStatus.textContent = 'Error al ejecutar backfill.';
      }
    });

    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const token = tokenInput?.value?.trim();
        if (!token) {
          opsStatus.textContent = 'Falta IMPORT_TOKEN.';
          return;
        }
        const action = button.getAttribute('data-action');
        const limit = Number(opsLimitInput?.value || 100);
        let payload = { statuses: ['error'], limit };
        if (action === 'vectorized') payload = { statuses: ['vectorized'], limit };
        if (action === 'empty') payload = { emptyEnrichment: true, limit };
        if (action === 'fuentes') {
          payload = null;
        }
        opsStatus.textContent = 'Encolando...';
        try {
          const { res, data } = await postJson(
            action === 'fuentes' ? '/internal/recover-fuentes' : '/internal/recover',
            token,
            payload ? payload : { limit }
          );
          opsStatus.textContent = res.ok
            ? 'Encolados: ' + (data.enqueued ?? 0)
            : 'Error: ' + (data.error ?? res.status);
          updateDashboard();
        } catch (error) {
          opsStatus.textContent = 'Error al encolar.';
        }
      });
    });
  <\/script>
</body>
</html>`;
}
function getRawSource2(raw: DictamenRaw): DictamenSource {
  return raw._source ?? raw.source ?? raw.raw_data ?? raw;
}
function extractVectorText(raw: DictamenRaw, enrichment: EnrichmentPayload | null) {
  const source = getRawSource2(raw);
  const candidates = [
    enrichment?.analisis ?? null,
    enrichment?.resumen ?? null,
    enrichment?.titulo ?? null,
    source.documento_completo,
    source.documento_completo_raw,
    source.materia
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const fallback = JSON.stringify(raw);
  return fallback.trim() ? fallback : "sin texto";
}
function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
function getDocumentoCompleto(raw: DictamenRaw): string | null {
  const source = getRawSource2(raw);
  const doc = source.documento_completo;
  return typeof doc === "string" && doc.trim().length > 0 ? doc : null;
}
function formatCreatedAt(timeZone: string, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}:00`;
}
const STABLE_PAGE_THRESHOLD = 3;
const STABLE_PAGE_RATIO = 1;
// Resuelve timezone para fechas visibles y formateo de metadata.
function getTimeZone(env: Env) {
  return env.APP_TIMEZONE ?? "America/Santiago";
}
// Parametros de auto-detencion del crawl (evita barridos infinitos).
function getStableSettings(env: Env) {
  const thresholdRaw = Number(env.STABLE_PAGE_THRESHOLD ?? STABLE_PAGE_THRESHOLD);
  const ratioRaw = Number(env.STABLE_PAGE_RATIO ?? STABLE_PAGE_RATIO);
  const threshold = Number.isFinite(thresholdRaw) ? Math.min(Math.max(thresholdRaw, 1), 10) : STABLE_PAGE_THRESHOLD;
  const ratio = Number.isFinite(ratioRaw) ? Math.min(Math.max(ratioRaw, 0.5), 1) : STABLE_PAGE_RATIO;
  return { threshold, ratio };
}
function normalizeBoolean2(value: unknown) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true" || trimmed === "1" || trimmed === "si") return true;
    if (trimmed === "false" || trimmed === "0" || trimmed === "no") return false;
  }
  return false;
}
function normalizeBooleanos2(input?: Record<string, unknown>) {
  return {
    nuevo: normalizeBoolean2(input?.nuevo),
    aclarado: normalizeBoolean2(input?.aclarado),
    relevante: normalizeBoolean2(input?.relevante),
    confirmado: normalizeBoolean2(input?.confirmado),
    boletin: normalizeBoolean2(input?.boletin),
    alterado: normalizeBoolean2(input?.alterado),
    complementado: normalizeBoolean2(input?.complementado),
    reconsideradoParcialmente: normalizeBoolean2(input?.reconsideradoParcialmente),
    reconsiderado: normalizeBoolean2(input?.reconsiderado),
    aplicado: normalizeBoolean2(input?.aplicado),
    reactivado: normalizeBoolean2(input?.reactivado),
    recursoProteccion: normalizeBoolean2(input?.recursoProteccion)
  };
}
function normalizeDescriptors(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const list = value.map((item) => String(item).trim()).filter(Boolean);
    return list.length ? list : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : null;
  }
  return null;
}
function toUnixSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1e3);
}
function buildPineconeMetadata(
  raw: DictamenRaw,
  enrichment: EnrichmentPayload | null,
  modelNamespace: string,
  timeZone: string
): Record<string, unknown> {
  const source = getRawSource2(raw);
  const booleanos = normalizeBooleanos2(enrichment?.booleanos ?? void 0);
  const descriptoresOriginales = normalizeDescriptors(source.descriptores);
  const etiquetas = enrichment?.etiquetas ?? null;
  const fecha = typeof source.fecha_documento === "string" ? source.fecha_documento : null;
  const createdAt = formatCreatedAt(timeZone);
  return {
    id: source.doc_id || source.n_dictamen || null,
    Resumen: enrichment?.resumen ?? null,
    materia: typeof source.materia === "string" ? source.materia : null,
    titulo: enrichment?.titulo ?? null,
    ...booleanos,
    created_at: createdAt,
    descriptores_AI: etiquetas,
    descriptores_originales: descriptoresOriginales,
    fecha,
    model: modelNamespace,
    u_time: toUnixSeconds(fecha)
  };
}
async function handleImport(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const url = new URL(request.url);
  const enqueue = url.searchParams.get("enqueue") === "1";
  const payload = await request.json();
  const items = payload.items ?? (payload.item ? [payload.item] : []);
  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse({ error: "no items" }, { status: 400 });
  }
  const results = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    results.push(await ingestDictamen(env, raw, { status: "ingested" }));
  }
  if (enqueue) {
    for (const result of results) {
      await env.PIPELINE_QUEUE.send({ type: "enrich", dictamenId: result.dictamenId });
    }
  }
  return jsonResponse({ inserted: results.length, enqueued: enqueue ? results.length : 0, results });
}
async function handleImportMongo(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const items = payload.items ?? (payload.item ? [payload.item] : []);
  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse({ error: "no items" }, { status: 400 });
  }
  const backfillExisting = payload.backfillExisting === true;
  const ids = items.map((raw) => raw && typeof raw === "object" ? extractDictamenId(raw) : null).filter((id) => Boolean(id));
  const existing = await getExistingDictamenIds(env.DB, ids);
  const results = [];
  let skipped = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw;
    const dictamenId = extractDictamenId(record);
    if (!dictamenId) continue;
    const rawSource = getRawSource2(record);
    const documentoCompleto = typeof rawSource.documento_completo === "string" ? rawSource.documento_completo.trim() : "";
    const documentoCompletoMissing = documentoCompleto.length === 0;
    const fuentesRaw = typeof rawSource.fuentes_legales === "string" ? rawSource.fuentes_legales.trim() : "";
    const fuentesMissing = fuentesRaw.length < 6;
    const extrae = record.extrae_jurisprudencia;
    const etiquetas = Array.isArray(extrae?.etiquetas) ? extrae?.etiquetas : [];
    const generado = extrae?.genera_jurisprudencia ?? record.genera_jurisprudencia;
    const generaJurisprudenciaLlm = generado === void 0 ? null : normalizeBoolean2(generado) ? 1 : 0;
    const booleanos = record.arreglo_booleanos;
    const fuentesDetalle = record.detalle_fuentes;
    const model = typeof record.modelo_llm === "string" ? record.modelo_llm : null;
    const createdAt = typeof record.creado_en === "string" ? record.creado_en : new Date().toISOString();
    const hasEnrichment = typeof extrae?.titulo === "string" && typeof extrae?.resumen === "string" && typeof extrae?.analisis === "string" && extrae.titulo.trim().length > 0 && extrae.resumen.trim().length > 0 && extrae.analisis.trim().length > 0;
    const processed = normalizeBoolean2(record.procesado);
    const status = processed && hasEnrichment ? "vectorized" : "ingested";
    let inserted = false;
    let enrichmentInserted = false;
    if (existing.has(dictamenId)) {
      if (!backfillExisting) {
        results.push({ dictamenId, inserted: false, enrichmentInserted: false, skipped: true });
        skipped += 1;
        continue;
      }
      const rawRef = await getLatestRawRef(env.DB, dictamenId);
      const existingEnrichment = await getLatestEnrichment(env.DB, dictamenId);
      const needsRaw = !rawRef;
      const needsEnrichment = !existingEnrichment || !existingEnrichment.titulo || !existingEnrichment.resumen || !existingEnrichment.analisis || existingEnrichment.etiquetas_json === "[]";
      if (!needsRaw && !needsEnrichment) {
        results.push({ dictamenId, inserted: false, enrichmentInserted: false, skipped: true });
        skipped += 1;
        continue;
      }
      if (needsRaw) {
        await storeRawOnly(env, dictamenId, record);
        inserted = true;
      }
      await updateDictamenDocumentoMissing(env.DB, dictamenId, documentoCompletoMissing);
    }
    if (!existing.has(dictamenId)) {
      await ingestDictamen(env, record, {
        status,
        migratedFromMongo: 1,
        crawledFromCgr: 0
      });
      inserted = true;
    }
    if (hasEnrichment) {
      const existingEnrichment = await getLatestEnrichment(env.DB, dictamenId);
      const needsEnrichment = !existingEnrichment || !existingEnrichment.titulo || !existingEnrichment.resumen || !existingEnrichment.analisis || existingEnrichment.etiquetas_json === "[]";
      if (needsEnrichment) {
        await insertEnrichment(env.DB, {
          dictamen_id: dictamenId,
          titulo: extrae?.titulo ? String(extrae.titulo) : null,
          resumen: extrae?.resumen ? String(extrae.resumen) : null,
          analisis: extrae?.analisis ? String(extrae.analisis) : null,
          etiquetas_json: etiquetas.length ? JSON.stringify(etiquetas) : "[]",
          genera_jurisprudencia_llm: generaJurisprudenciaLlm,
          fuentes_legales_missing: fuentesMissing ? 1 : 0,
          booleanos_json: booleanos ? JSON.stringify(booleanos) : null,
          fuentes_legales_json: fuentesDetalle ? JSON.stringify(fuentesDetalle) : null,
          model,
          migrated_from_mongo: 1,
          created_at: createdAt
        });
        enrichmentInserted = true;
      }
    }
    results.push({ dictamenId, inserted, enrichmentInserted, skipped: false });
  }
  return jsonResponse({
    processed: results.length,
    inserted: results.filter((row) => row.inserted).length,
    enrichment_inserted: results.filter((row) => row.enrichmentInserted).length,
    skipped,
    results
  });
}
async function handleBackfillCanonical(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const limitRaw = typeof payload.limit === "number" ? payload.limit : 100;
  const limit = Math.min(Math.max(limitRaw, 1), 500);
  const { results } = await runBackfillCanonical(env, {
    limit,
    force: payload.force === true,
    from: payload.from?.trim(),
    to: payload.to?.trim()
  });
  return jsonResponse({
    processed: results.length,
    updated: results.filter((row) => row.updated).length,
    results
  });
}
async function handleBackfillDocumentoMissing(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const limitRaw = typeof payload.limit === "number" ? payload.limit : 100;
  const limit = Math.min(Math.max(limitRaw, 1), 500);
  const { results } = await runBackfillDocumentoMissing(env, limit);
  return jsonResponse({
    processed: results.length,
    updated: results.filter((row) => row.updated).length,
    results
  });
}
async function runBackfillCanonical(
  env: Env,
  options: { limit: number; force?: boolean; from?: string; to?: string }
): Promise<{ results: Array<{ dictamenId: string; updated: boolean; reason?: string }> }> {
  const runId = await startRun(env.DB, "backfill_canonical", options);
  const ids = await listDictamenIdsForCanonical(env.DB, options);
  const results = [];
  for (const dictamenId of ids) {
    const rawRef = await getLatestRawRef(env.DB, dictamenId);
    if (!rawRef) {
      results.push({ dictamenId, updated: false, reason: "missing_raw_ref" });
      continue;
    }
    const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
    if (!rawText) {
      results.push({ dictamenId, updated: false, reason: "missing_raw" });
      continue;
    }
    const raw = JSON.parse(rawText);
    const canonical = await buildCanonicalSignature(raw);
    await updateDictamenCanonical(env.DB, dictamenId, canonical);
    results.push({ dictamenId, updated: true });
  }
  await finishRun(env.DB, runId, "completed", {
    ...options,
    processed: results.length,
    updated: results.filter((row) => row.updated).length
  });
  return { results };
}
async function runBackfillDocumentoMissing(
  env: Env,
  limit: number
): Promise<{ results: Array<{ dictamenId: string; updated: boolean; reason?: string }> }> {
  const runId = await startRun(env.DB, "backfill_documento_missing", { limit });
  const ids = await listDictamenIdsMissingDocumentoCompleto(env.DB, limit);
  const results = [];
  for (const dictamenId of ids) {
    const rawRef = await getLatestRawRef(env.DB, dictamenId);
    if (!rawRef) {
      results.push({ dictamenId, updated: false, reason: "missing_raw_ref" });
      continue;
    }
    const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
    if (!rawText) {
      results.push({ dictamenId, updated: false, reason: "missing_raw" });
      continue;
    }
    const raw = JSON.parse(rawText);
    const rawSource = getRawSource2(raw);
    const documentoCompleto = typeof rawSource.documento_completo === "string" ? rawSource.documento_completo.trim() : "";
    const missing = documentoCompleto.length === 0;
    await updateDictamenDocumentoMissing(env.DB, dictamenId, missing);
    results.push({ dictamenId, updated: true });
  }
  await finishRun(env.DB, runId, "completed", {
    limit,
    processed: results.length,
    updated: results.filter((row) => row.updated).length
  });
  return { results };
}
function parseRangeDate(value: string | undefined, endOfDay: boolean): number | null {
  if (!value || typeof value !== "string") return null;
  const iso = endOfDay ? `${value}T23:59:59Z` : `${value}T00:00:00Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}
async function handleCrawlRange(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const disableRange = payload.disableRange === true;
  const from = payload.from?.trim();
  const to = payload.to?.trim();
  const hasRange = Boolean(from && to);
  const useRange = hasRange && !disableRange;
  const extraOptions = Array.isArray(payload.options) ? payload.options.filter(
    (option) => typeof option === "object" && option !== null && "type" in option && "field" in option
  ) : [];
  const search = payload.search?.trim() ?? "";
  const useSearch = useRange || extraOptions.length > 0 || search.length > 0;
  if (!useRange && !disableRange && !hasRange && extraOptions.length === 0 && search.length === 0) {
    return jsonResponse({ error: "missing from/to, search, or options" }, { status: 400 });
  }
  let fromMs = null;
  let toMs = null;
  if (useRange) {
    fromMs = parseRangeDate(from, false);
    toMs = parseRangeDate(to, true);
    if (fromMs === null || toMs === null || fromMs > toMs) {
      return jsonResponse({ error: "invalid date range" }, { status: 400 });
    }
  }
  const limitRaw = typeof payload.limit === "number" ? payload.limit : 200;
  const limit = Math.min(Math.max(limitRaw, 1), 500);
  const maxPagesRaw = typeof payload.maxPages === "number" ? payload.maxPages : 30;
  const maxPages = Math.min(Math.max(maxPagesRaw, 1), 200);
  const enqueue = payload.enqueue !== false;
  const runId = await startRun(env.DB, "crawl", {
    source: useRange ? "manual_range" : useSearch ? "manual_search" : "manual_full",
    from: useRange ? from : null,
    to: useRange ? to : null,
    limit,
    search: search || null
  });
  let cursor = void 0;
  let page = 0;
  let collected = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let enqueued = 0;
  let stoppedByRange = false;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const pageResult = useSearch ? await fetchDictamenesSearchPage(
      env.CGR_BASE_URL,
      page,
      useRange ? [
        {
          type: "date",
          field: "fecha_documento",
          dir: "gt",
          value: {
            gt: new Date(fromMs).toISOString(),
            lt: new Date(toMs).toISOString()
          }
        },
        ...extraOptions
      ] : extraOptions,
      void 0,
      search
    ) : await fetchDictamenesPage(env.CGR_BASE_URL, cursor);
    const items = pageResult.items ?? [];
    if (items.length === 0) break;
    const candidates = [];
    let oldestMs = null;
    for (const item of items) {
      const id = extractDictamenId(item);
      if (!id) continue;
      const source = getRawSource2(item);
      const fecha = typeof source.fecha_documento === "string" ? source.fecha_documento : "";
      const dateMs = Date.parse(fecha);
      if (Number.isNaN(dateMs)) continue;
      if (oldestMs === null || dateMs < oldestMs) oldestMs = dateMs;
      if (useRange && (dateMs < fromMs || dateMs > toMs)) continue;
      candidates.push({ id, raw: item, dateMs });
    }
    if (candidates.length > 0) {
      const ids = candidates.map((candidate) => candidate.id);
      const existing = await getExistingDictamenIds(env.DB, ids);
      const canonicals = await getDictamenCanonicals(env.DB, ids);
      for (const candidate of candidates) {
        if (collected >= limit) break;
        collected += 1;
        if (existing.has(candidate.id)) {
          const rawRef = await getLatestRawRef(env.DB, candidate.id);
          if (!rawRef) {
            await ingestDictamen(env, candidate.raw, {
              status: "ingested",
              migratedFromMongo: 0,
              crawledFromCgr: 1
            });
            updated += 1;
            if (enqueue) {
              await env.PIPELINE_QUEUE.send({ type: "enrich", dictamenId: candidate.id });
              enqueued += 1;
            }
            continue;
          }
          const stored = canonicals.get(candidate.id);
          const candidateCanonical = await buildCanonicalSignature(
            candidate.raw
          );
          if (stored?.sha256 && stored.sha256 === candidateCanonical.sha256) {
            skipped += 1;
            continue;
          }
          await ingestDictamen(env, candidate.raw, {
            status: "ingested",
            migratedFromMongo: 0,
            crawledFromCgr: 1
          });
          updated += 1;
          if (enqueue) {
            await env.PIPELINE_QUEUE.send({ type: "enrich", dictamenId: candidate.id });
            enqueued += 1;
          }
          continue;
        }
        await ingestDictamen(env, candidate.raw, {
          status: "ingested",
          migratedFromMongo: 0,
          crawledFromCgr: 1
        });
        inserted += 1;
        if (enqueue) {
          await env.PIPELINE_QUEUE.send({ type: "enrich", dictamenId: candidate.id });
          enqueued += 1;
        }
      }
    }
    if (collected >= limit) break;
    if (useRange && oldestMs !== null && oldestMs < fromMs) {
      stoppedByRange = true;
      break;
    }
    cursor = pageResult.nextCursor;
    page += 1;
    if (!cursor) break;
  }
  await finishRun(env.DB, runId, "completed", {
    source: "manual_range",
    from,
    to,
    limit,
    collected,
    inserted,
    updated,
    skipped,
    enqueued,
    stoppedByRange
  });
  return jsonResponse({
    from,
    to,
    limit,
    collected,
    inserted,
    updated,
    skipped,
    enqueued,
    stoppedByRange
  });
}
function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
async function handleCompareCanonical(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  let nDictamen = payload.n_dictamen?.trim() ?? null;
  if (!nDictamen && payload.dictamenId) {
    const row = await getDictamenById(env.DB, payload.dictamenId);
    nDictamen = row.n_dictamen;
  }
  if (!nDictamen) {
    return jsonResponse({ error: "missing n_dictamen or dictamenId" }, { status: 400 });
  }
  const rawRef = await getLatestRawRef(env.DB, payload.dictamenId ?? nDictamen);
  let kvRaw = null;
  if (rawRef) {
    const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
    if (rawText) kvRaw = JSON.parse(rawText);
  }
  const cgrPage = await fetchDictamenesSearchPage(
    env.CGR_BASE_URL,
    0,
    [{ type: "force_obj", field: "n_dictamen", value: nDictamen }],
    void 0,
    ""
  );
  const cgrRaw = cgrPage.items?.[0] ? cgrPage.items[0] : null;
  const kvCanonical = kvRaw ? buildCanonicalPayload(kvRaw) : null;
  const cgrCanonical = cgrRaw ? buildCanonicalPayload(cgrRaw) : null;
  const kvDoc = typeof kvCanonical?.documento_completo === "string" ? kvCanonical.documento_completo : null;
  const cgrDoc = typeof cgrCanonical?.documento_completo === "string" ? cgrCanonical.documento_completo : null;
  const kvDocSha = kvDoc ? await hashString(kvDoc) : null;
  const cgrDocSha = cgrDoc ? await hashString(cgrDoc) : null;
  const kvHash = kvRaw ? await buildCanonicalSignature(kvRaw) : null;
  const cgrHash = cgrRaw ? await buildCanonicalSignature(cgrRaw) : null;
  if (!kvCanonical && !cgrCanonical) {
    return jsonResponse({ error: "not_found", n_dictamen: nDictamen }, { status: 404 });
  }
  const keys = kvCanonical && cgrCanonical ? Object.keys(kvCanonical) : [];
  const typeDiffs = keys.filter(
    (key) => valueType(kvCanonical[key]) !== valueType(cgrCanonical[key])
  );
  return jsonResponse({
    n_dictamen: nDictamen,
    kv: kvCanonical ? {
      sha256: kvHash?.sha256 ?? null,
      bytes: kvHash?.bytes ?? null,
      doc_len: kvDoc ? kvDoc.length : 0,
      doc_sha256: kvDocSha,
      types: Object.fromEntries(Object.entries(kvCanonical).map(([key, value]) => [key, valueType(value)]))
    } : null,
    cgr: cgrCanonical ? {
      sha256: cgrHash?.sha256 ?? null,
      bytes: cgrHash?.bytes ?? null,
      doc_len: cgrDoc ? cgrDoc.length : 0,
      doc_sha256: cgrDocSha,
      types: Object.fromEntries(Object.entries(cgrCanonical).map(([key, value]) => [key, valueType(value)]))
    } : null,
    same: kvHash?.sha256 && cgrHash?.sha256 ? kvHash.sha256 === cgrHash.sha256 : null,
    typeDiffs
  });
}
async function handleProcess(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const ids = payload.dictamenIds ?? (payload.dictamenId ? [payload.dictamenId] : []);
  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonResponse({ error: "no dictamenIds" }, { status: 400 });
  }
  const results = [];
  for (const id of ids) {
    const dictamenId = String(id);
    const enriched = await runEnrich(env, dictamenId, false);
    const vectorized = enriched ? await runVectorize(env, dictamenId) : false;
    results.push({ dictamenId, enriched, vectorized });
  }
  return jsonResponse({ processed: results.length, results });
}
async function handleVectorize(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const ids = payload.dictamenIds ?? (payload.dictamenId ? [payload.dictamenId] : []);
  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonResponse({ error: "no dictamenIds" }, { status: 400 });
  }
  const results = [];
  for (const id of ids) {
    const dictamenId = String(id);
    const vectorized = await runVectorize(env, dictamenId);
    results.push({ dictamenId, vectorized });
  }
  return jsonResponse({ processed: results.length, results });
}
async function handleRecover(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const statuses = Array.isArray(payload.statuses) && payload.statuses.length ? payload.statuses : ["error", "ingested", "enriched"];
  const limitRaw = typeof payload.limit === "number" ? payload.limit : 100;
  const limit = Math.min(Math.max(limitRaw, 1), 500);
  const includesVectorized = statuses.includes("vectorized");
  const includesIngested = statuses.includes("ingested");
  const ordered = includesVectorized || includesIngested ? "ASC" : "DESC";
  const rows = payload.emptyEnrichment ? (await listDictamenIdsWithEmptyEnrichment(env.DB, limit)).map((id) => ({
    id,
    estado: "ingested"
  })) : await listDictamenByStatus(env.DB, statuses, limit, ordered);
  const results = [];
  const batch = [];
  for (const row of rows) {
    const estado = row.estado ?? "ingested";
    const nextType = estado === "enriched" ? "vectorize" : "enrich";
    results.push({ dictamenId: row.id, enqueued: nextType });
    batch.push({ body: { type: nextType, dictamenId: row.id } });
  }
  if (rows.length > 0) {
    const placeholders = rows.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE dictamen SET updated_at = datetime('now') WHERE id IN (${placeholders})`).bind(...rows.map((row) => row.id)).run();
  }
  const batchSize = 100;
  for (let i = 0; i < batch.length; i += batchSize) {
    const slice = batch.slice(i, i + batchSize);
    if (typeof env.PIPELINE_QUEUE.sendBatch === "function") {
      await env.PIPELINE_QUEUE.sendBatch(slice);
    } else {
      for (const message of slice) {
        await env.PIPELINE_QUEUE.send(message.body);
      }
    }
  }
  return jsonResponse({ enqueued: results.length, results });
}
async function handleMistralDebug(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const dictamenId = payload.dictamenId ? String(payload.dictamenId) : null;
  if (!dictamenId) {
    return jsonResponse({ error: "no dictamenId" }, { status: 400 });
  }
  const rawRef = await getLatestRawRef(env.DB, dictamenId);
  if (!rawRef) return jsonResponse({ error: "missing_raw_ref" }, { status: 404 });
  const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
  if (!rawText) return jsonResponse({ error: "missing_raw" }, { status: 404 });
  const raw = JSON.parse(rawText);
  const prompt = buildPrompt(raw);
  const response = await fetch(env.MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: env.MISTRAL_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });
  const text = response.ok ? await response.text() : await response.text().catch(() => "");
  return jsonResponse({
    ok: response.ok,
    status: response.status,
    prompt,
    raw_response: text
  });
}
async function handleRecoverFuentes(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const payload = await request.json();
    const limitRaw = typeof payload.limit === "number" ? payload.limit : 100;
    const limit = Math.min(Math.max(limitRaw, 1), 500);
    const candidates = await listDictamenIdsWithEmptyFuentes(env.DB, limit);
    if (candidates.length === 0) {
      return jsonResponse({ enqueued: 0, dictamenIds: [] });
    }
    const batchSize = 100;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const slice = candidates.slice(i, i + batchSize);
      const batch = slice.map((dictamenId) => ({ body: { type: "fuentes", dictamenId } }));
      if (typeof env.PIPELINE_QUEUE.sendBatch === "function") {
        await env.PIPELINE_QUEUE.sendBatch(batch);
      } else {
        for (const item of batch) await env.PIPELINE_QUEUE.send(item.body);
      }
    }
    return jsonResponse({ enqueued: candidates.length, dictamenIds: candidates });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: messageText }, { status: 500 });
  }
}
async function handleEdgeCases(request: Request, env: Env): Promise<Response> {
  if (env.IMPORT_TOKEN) {
    const token = request.headers.get("x-import-token");
    if (!token || token !== env.IMPORT_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }
  }
  const payload = await request.json();
  const limitRaw = typeof payload.limit === "number" ? payload.limit : 100;
  const limit = Math.min(Math.max(limitRaw, 1), 500);
  const reason = payload.reason === "all" ? null : payload.reason ?? null;
  const ids = await listDictamenIdsWithInvalidInput(env.DB, reason, limit);
  const results = [];
  const enqueue = payload.enqueue === true;
  for (const dictamenId of ids) {
    if (enqueue) {
      await env.PIPELINE_QUEUE.send({ type: "enrich", dictamenId });
    }
    results.push({ dictamenId, enqueued: enqueue });
  }
  return jsonResponse({ found: results.length, results });
}
// Ejecuta el enrichment LLM y actualiza estado del dictamen.
async function runEnrich(env: Env, dictamenId: string, enqueueVectorize: boolean): Promise<boolean> {
  const runId = await startRun(env.DB, "enrich", { dictamenId });
  const allowed = await consume(env.STATE_KV, env.DAILY_QUOTA, 1, env.QUOTA_RESERVE_RATIO);
  if (!allowed) {
    await finishRun(env.DB, runId, "skipped_quota");
    return false;
  }
  const rawRef = await getLatestRawRef(env.DB, dictamenId);
  if (!rawRef) {
    await finishRun(env.DB, runId, "missing_raw");
    return false;
  }
  const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
  if (!rawText) {
    await finishRun(env.DB, runId, "missing_raw");
    return false;
  }
  const raw = JSON.parse(rawText);
  const documentoCompleto = getDocumentoCompleto(raw);
  if (!documentoCompleto) {
    await updateDictamenDocumentoMissing(env.DB, dictamenId, true);
    await updateDictamenStatus(env.DB, dictamenId, "invalid_input");
    await finishRun(env.DB, runId, "invalid_input", {
      dictamenId,
      reason: "missing_documento_completo"
    });
    return false;
  }
  await updateDictamenDocumentoMissing(env.DB, dictamenId, false);
  const maxWords = Math.floor(64e3 / 1.2);
  const wordCount = countWords(documentoCompleto);
  if (wordCount >= maxWords) {
    await updateDictamenStatus(env.DB, dictamenId, "invalid_input");
    await finishRun(env.DB, runId, "invalid_input", {
      dictamenId,
      reason: "documento_completo_too_long",
      words: wordCount,
      max_words: maxWords
    });
    return false;
  }
  try {
    const enrichment = await analyzeDictamen(env, raw);
    const extrae = enrichment?.extrae_jurisprudencia;
    const generaJurisprudenciaLlm = typeof enrichment?.genera_jurisprudencia === "boolean" ? enrichment.genera_jurisprudencia : null;
    const fuentesRaw = getRawSource2(raw).fuentes_legales;
    const fuentesText = typeof fuentesRaw === "string" ? fuentesRaw.trim() : "";
    const fuentesMissing = fuentesText.length < 6;
    const fuentesLegales = !fuentesMissing ? await analyzeFuentesLegales(env, raw) : [{}];
    const etiquetas = Array.isArray(extrae?.etiquetas) ? extrae?.etiquetas : [];
    const validEnrichment = typeof extrae?.titulo === "string" && extrae.titulo.trim().length > 0 && typeof extrae?.resumen === "string" && extrae.resumen.trim().length > 0 && typeof extrae?.analisis === "string" && extrae.analisis.trim().length > 0 && etiquetas.length > 0;
    if (!enrichment || !validEnrichment) {
      await updateDictamenStatus(env.DB, dictamenId, "error");
      await finishRun(env.DB, runId, "invalid_enrichment", {
        dictamenId,
        has_enrichment: Boolean(enrichment),
        titulo: extrae?.titulo ?? null,
        resumen: extrae?.resumen ?? null,
        analisis: extrae?.analisis ?? null,
        etiquetas: etiquetas.length
      });
      return false;
    }
    await insertEnrichment(env.DB, {
      dictamen_id: dictamenId,
      titulo: extrae.titulo,
      resumen: extrae.resumen,
      analisis: extrae.analisis,
      etiquetas_json: JSON.stringify(etiquetas),
      genera_jurisprudencia_llm: generaJurisprudenciaLlm === null ? null : generaJurisprudenciaLlm ? 1 : 0,
      fuentes_legales_missing: fuentesMissing ? 1 : 0,
      booleanos_json: enrichment.booleanos ? JSON.stringify(enrichment.booleanos) : null,
      fuentes_legales_json: fuentesLegales ? JSON.stringify(fuentesLegales) : null,
      model: env.MISTRAL_MODEL,
      migrated_from_mongo: 0,
      created_at: new Date().toISOString()
    });
    await updateDictamenStatus(env.DB, dictamenId, "enriched");
    if (enqueueVectorize) {
      await env.PIPELINE_QUEUE.send({ type: "vectorize", dictamenId });
    }
    await finishRun(env.DB, runId, "completed");
    return true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await updateDictamenStatus(env.DB, dictamenId, "error");
    await finishRun(env.DB, runId, "error", { message: messageText });
    return false;
  }
}
// Genera embedding y actualiza el estado a vectorized.
async function runVectorize(env: Env, dictamenId: string): Promise<boolean> {
  const runId = await startRun(env.DB, "vectorize", { dictamenId });
  const allowed = await consume(env.STATE_KV, env.DAILY_QUOTA, 1, env.QUOTA_RESERVE_RATIO);
  if (!allowed) {
    await finishRun(env.DB, runId, "skipped_quota");
    return false;
  }
  const rawRef = await getLatestRawRef(env.DB, dictamenId);
  if (!rawRef) {
    await finishRun(env.DB, runId, "missing_raw");
    return false;
  }
  const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
  if (!rawText) {
    await finishRun(env.DB, runId, "missing_raw");
    return false;
  }
  try {
    const raw = JSON.parse(rawText);
    const enrichmentRow = await getLatestEnrichment(env.DB, dictamenId);
    const enrichment = enrichmentRow ? {
      titulo: enrichmentRow.titulo,
      resumen: enrichmentRow.resumen,
      analisis: enrichmentRow.analisis,
      etiquetas: enrichmentRow.etiquetas_json ? JSON.parse(enrichmentRow.etiquetas_json) : null,
      booleanos: enrichmentRow.booleanos_json ? JSON.parse(enrichmentRow.booleanos_json) : null,
      genera_jurisprudencia_llm: enrichmentRow.genera_jurisprudencia_llm
    } : null;
    const metadata = buildPineconeMetadata(raw, enrichment, env.PINECONE_NAMESPACE, getTimeZone(env));
    const text = extractVectorText(raw, enrichment);
    const values = await generateEmbedding(env, text);
    await upsertRecord(env, { id: dictamenId, text, metadata, values });
    await updateDictamenStatus(env.DB, dictamenId, "vectorized");
    await finishRun(env.DB, runId, "completed");
    return true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await updateDictamenStatus(env.DB, dictamenId, "error");
    await finishRun(env.DB, runId, "error", { message: messageText });
    return false;
  }
}
// Extrae y normaliza fuentes legales desde el RAW.
async function runFuentesLegales(env: Env, dictamenId: string): Promise<boolean> {
  const runId = await startRun(env.DB, "fuentes", { dictamenId });
  const allowed = await consume(env.STATE_KV, env.DAILY_QUOTA, 1, env.QUOTA_RESERVE_RATIO);
  if (!allowed) {
    await finishRun(env.DB, runId, "skipped_quota");
    return false;
  }
  const rawRef = await getLatestRawRef(env.DB, dictamenId);
  if (!rawRef) {
    await finishRun(env.DB, runId, "missing_raw");
    return false;
  }
  const rawText = await getRaw(env.RAW_KV, rawRef.raw_key);
  if (!rawText) {
    await finishRun(env.DB, runId, "missing_raw");
    return false;
  }
  try {
    const raw = JSON.parse(rawText);
    const fuente = getRawSource2(raw).fuentes_legales;
    const text = typeof fuente === "string" ? fuente.trim() : "";
    if (text.length < 6) {
      await updateEnrichmentFuentesMissing(env.DB, dictamenId);
      await finishRun(env.DB, runId, "invalid_input", {
        dictamenId,
        reason: "missing_fuentes_legales"
      });
      return false;
    }
    const fuentes = await analyzeFuentesLegales(env, raw);
    if (!fuentes) {
      await finishRun(env.DB, runId, "invalid_enrichment", {
        dictamenId,
        reason: "fuentes_legales_empty"
      });
      return false;
    }
    await updateEnrichmentFuentes(env.DB, dictamenId, JSON.stringify(fuentes));
    await finishRun(env.DB, runId, "completed");
    return true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await finishRun(env.DB, runId, "error", { message: messageText });
    return false;
  }
}
// Enrutador de mensajes de la cola.
async function handleQueueMessage(message: QueueMessage, env: Env): Promise<void> {
  switch (message.type) {
    case "crawl": {
      const runId = await startRun(env.DB, "crawl", { cursor: message.cursor ?? null });
      const allowed = await consume(env.STATE_KV, env.DAILY_QUOTA, 1, env.QUOTA_RESERVE_RATIO);
      if (!allowed) {
        await finishRun(env.DB, runId, "skipped_quota");
        return;
      }
      const stableSettings = getStableSettings(env);
      const stableState = await getJson(env.STATE_KV, "crawl:stable") ?? {};
      let stableCount = stableState.count ?? 0;
      const cursor = message.cursor ?? await getCursor(env.STATE_KV, "cgr") ?? void 0;
      const page = await fetchDictamenesPage(env.CGR_BASE_URL, cursor);
      const ids = page.items.map((item) => extractDictamenId(item)).filter((id) => Boolean(id));
      const existing = await getExistingDictamenIds(env.DB, ids);
      const canonicals = await getDictamenCanonicals(env.DB, ids);
      const itemsToProcess = [];
      let updated = 0;
      let unchanged = 0;
      for (const item of page.items) {
        const id = extractDictamenId(item);
        if (!id) continue;
        if (!existing.has(id)) {
          itemsToProcess.push(item);
          continue;
        }
        const stored = canonicals.get(id);
        const candidateCanonical = await buildCanonicalSignature(item);
        if (stored?.sha256 && stored.sha256 === candidateCanonical.sha256) {
          unchanged += 1;
          continue;
        }
        itemsToProcess.push(item);
        updated += 1;
      }
      const fetched = page.items.length;
      const processed = itemsToProcess.length;
      const unchangedRatio = fetched > 0 ? unchanged / fetched : 0;
      const stablePage = fetched > 0 && unchangedRatio >= stableSettings.ratio;
      if (stablePage) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      await putJson(env.STATE_KV, "crawl:stable", { count: stableCount });
      if (stablePage && stableCount >= stableSettings.threshold) {
        await putJson(env.STATE_KV, "crawl:cgr", {
          stopped: true,
          stoppedAt: new Date().toISOString(),
          cursor: cursor ?? null,
          reason: "stable_pages",
          threshold: stableSettings.threshold
        });
        await finishRun(env.DB, runId, "completed", {
          fetched,
          new: 0,
          updated,
          unchanged,
          stopped: true,
          stablePages: stableCount
        });
        return;
      }
      for (const item of itemsToProcess) {
        const { dictamenId } = await ingestDictamen(env, item, {
          status: "ingested",
          migratedFromMongo: 0,
          crawledFromCgr: 1
        });
        await env.PIPELINE_QUEUE.send({ type: "enrich", dictamenId });
      }
      if (page.nextCursor) {
        await setCursor(env.STATE_KV, "cgr", page.nextCursor);
        await env.PIPELINE_QUEUE.send({ type: "crawl", cursor: page.nextCursor });
      }
      await finishRun(env.DB, runId, "completed", {
        fetched,
        new: itemsToProcess.length - updated,
        updated,
        unchanged,
        skipped: fetched - itemsToProcess.length,
        stablePages: stableCount
      });
      return;
    }
    case "enrich": {
      await runEnrich(env, message.dictamenId, true);
      return;
    }
    case "vectorize": {
      await runVectorize(env, message.dictamenId);
      return;
    }
    case "fuentes": {
      await runFuentesLegales(env, message.dictamenId);
      return;
    }
    default:
      return;
  }
}
// Handler principal del Worker (HTTP + cron + queue).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-import-token",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, time: new Date().toISOString() });
    }
    if (url.pathname === "/stats") {
      const base = await getStats(env.DB);
      const dashboard = await getDashboardStats(env.DB);
      const crawlState = await getJson(
        env.STATE_KV,
        "crawl:cgr"
      );
      const stableState = await getJson(env.STATE_KV, "crawl:stable");
      return jsonResponse({
        ...base,
        ...dashboard,
        crawlState: {
          stopped: crawlState?.stopped === true,
          stoppedAt: crawlState?.stoppedAt ?? null,
          stoppedReason: crawlState?.reason ?? null,
          stablePages: stableState?.count ?? 0
        }
      });
    }
    if (url.pathname === "/runs") {
      const limitRaw = Number(url.searchParams.get("limit") ?? 100);
      const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 100, 200);
      const runs = await listRuns(env.DB, limit);
      return jsonResponse({ runs });
    }
    if (url.pathname === "/search") {
      const query = url.searchParams.get("q")?.trim();
      if (!query) return jsonResponse({ error: "missing_query" }, { status: 400 });
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
      const shouldExpand = url.searchParams.get("expand") !== "false";
      const shouldRerank = url.searchParams.get("rerank") !== "false";

      try {
        let results: any;
        let finalQuery = query;
        let detectedIntent = "semantic_search";

        // 1. Detección de intención: ¿Es un ID de dictamen?
        // Formatos: E123456, 123456, E123456/24, 123456/2024, E123456N24
        const isDictamenId = /^(E)?[0-9]+([\/N][0-9]+)?$/i.test(query);
        let filter: Record<string, any> | undefined = undefined;

        if (isDictamenId) {
          detectedIntent = "exact_id";
          const normalizedId = query.toUpperCase();
          // En lugar de fetch, usamos un filtro de metadatos en la búsqueda semántica
          filter = { id: { "$eq": normalizedId } };

          // Generamos un embedding para la consulta (aunque el filtro dominará)
          const queryVector = await generateEmbedding(env, query);
          results = await queryRecords(env, queryVector, limit, filter);

          // Si no hay resultados con el filtro exacto, intentamos sin filtro (búsqueda semántica pura)
          if (!results.matches || results.matches.length === 0) {
            results = await queryRecords(env, queryVector, limit);
          }
        } else {
          // 2. Detección de intención: ¿Es una búsqueda por año?
          const yearMatch = query.match(/\b(19|20)\d{2}\b/);

          if (yearMatch) {
            detectedIntent = "year_search";
            const year = yearMatch[0];
            filter = {
              fecha: { "$gte": `${year}-01-01`, "$lte": `${year}-12-31` }
            };
          }

          // 3. Expansión de consulta (opcional)
          if (shouldExpand && query.length > 3) {
            try {
              finalQuery = await expandQuery(env, query);
            } catch (e) {
              console.error("Query expansion failed:", e);
            }
          }

          // 4. Búsqueda semántica
          // Generamos el embedding de la consulta
          const queryVector = await generateEmbedding(env, finalQuery);
          results = await queryRecords(env, queryVector, limit, filter);

          // 5. Reranking (opcional)
          if (shouldRerank && results.matches?.length > 1) {
            try {
              const reranked = await rerankResults(env, query, results.matches);
              results.matches = reranked;
            } catch (e) {
              console.error("Reranking failed:", e);
            }
          }
        }

        return jsonResponse({
          results,
          meta: {
            detected_intent: detectedIntent,
            original_query: query,
            expanded_query: finalQuery !== query ? finalQuery : undefined,
            reranked: shouldRerank && !isDictamenId
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        return jsonResponse({
          error: "search_failed",
          message,
          stack,
          debug: {
            pinecone_host: env.PINECONE_INDEX_HOST ? "SET" : "MISSING",
            pinecone_key: env.PINECONE_API_KEY ? "SET" : "MISSING",
            mistral_key: env.MISTRAL_API_KEY ? "SET" : "MISSING"
          }
        }, { status: 500 });
      }
    }
    if (url.pathname === "/dictamenes") {
      const status = url.searchParams.get("estado") ?? void 0;
      const genera = url.searchParams.get("genera_jurisprudencia");
      let generaValue = void 0;
      if (genera === "null") generaValue = null;
      else if (genera !== null) {
        const parsed = Number(genera);
        if (Number.isFinite(parsed)) generaValue = parsed;
      }
      const limitRaw = Number(url.searchParams.get("limit") ?? 50);
      const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200);
      const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;
      const dictamenes = await listDictamenes(env.DB, { status, generaJurisprudencia: generaValue }, limit, offset);
      return jsonResponse({ dictamenes });
    }
    if (url.pathname === "/internal/import" && request.method === "POST") {
      return handleImport(request, env);
    }
    if (url.pathname === "/internal/import-mongo" && request.method === "POST") {
      return handleImportMongo(request, env);
    }
    if (url.pathname === "/internal/crawl-range" && request.method === "POST") {
      return handleCrawlRange(request, env);
    }
    if (url.pathname === "/internal/backfill-canonical" && request.method === "POST") {
      return handleBackfillCanonical(request, env);
    }
    if (url.pathname === "/internal/backfill-documento-missing" && request.method === "POST") {
      return handleBackfillDocumentoMissing(request, env);
    }
    if (url.pathname === "/internal/compare-canonical" && request.method === "POST") {
      return handleCompareCanonical(request, env);
    }
    if (url.pathname === "/internal/process" && request.method === "POST") {
      return handleProcess(request, env);
    }
    if (url.pathname === "/internal/vectorize" && request.method === "POST") {
      return handleVectorize(request, env);
    }
    if (url.pathname === "/internal/recover" && request.method === "POST") {
      return handleRecover(request, env);
    }
    if (url.pathname === "/internal/mistral-debug" && request.method === "POST") {
      return handleMistralDebug(request, env);
    }
    if (url.pathname === "/internal/recover-fuentes" && request.method === "POST") {
      return handleRecoverFuentes(request, env);
    }
    if (url.pathname === "/internal/edgecases" && request.method === "POST") {
      return handleEdgeCases(request, env);
    }
    if (url.pathname === "/internal/debug-pinecone") {
      const url = new URL(`/describe_index_stats`, env.PINECONE_INDEX_HOST);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Api-Key": env.PINECONE_API_KEY,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      return jsonResponse({ data });
    }
    if (url.pathname === "/internal/force-vectorize") {
      const id = url.searchParams.get("id");
      if (!id) return jsonResponse({ error: "missing_id" }, { status: 400 });
      const success = await runVectorize(env, id);
      return jsonResponse({ success });
    }
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      const dashboard = await getDashboardStats(env.DB);
      const crawlState = await getJson(env.STATE_KV, "crawl:cgr");
      const stableState = await getJson(env.STATE_KV, "crawl:stable");
      return htmlResponse(
        renderDashboard({
          ...dashboard,
          timeZone: getTimeZone(env),
          flags: {
            cronPaused: env.CRON_PAUSED === "true",
            pipelinePaused: env.PIPELINE_PAUSED === "true",
            crawlStopped: crawlState?.stopped === true
          },
          crawlState: {
            stablePages: stableState?.count ?? 0,
            stoppedAt: crawlState?.stoppedAt ?? null,
            stoppedReason: crawlState?.reason ?? null
          }
        })
      );
    }
    return jsonResponse({ error: "not_found" }, { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (env.BACKFILL_DOCUMENTO_MISSING === "true") {
      const limitRaw = Number(env.BACKFILL_DOCUMENTO_MISSING_LIMIT ?? 100);
      const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 100, 500);
      await runBackfillDocumentoMissing(env, limit);
      return;
    }
    if (env.BACKFILL_CANONICAL === "true") {
      const limitRaw = Number(env.BACKFILL_CANONICAL_LIMIT ?? 100);
      const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 100, 500);
      await runBackfillCanonical(env, { limit });
      return;
    }
    if (env.CRON_PAUSED === "true") return;
    const crawlState = await getJson(env.STATE_KV, "crawl:cgr");
    if (crawlState?.stopped) return;
    const allowed = await canConsume(env.STATE_KV, env.DAILY_QUOTA, 1, env.QUOTA_RESERVE_RATIO);
    if (!allowed) return;
    await env.PIPELINE_QUEUE.send({ type: "crawl" });
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    if (env.PIPELINE_PAUSED === "true") return;
    for (const message of batch.messages) {
      await handleQueueMessage(message.body, env);
    }
  }
};
