import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenText, ChevronRight, CircleAlert, CircleDot, LoaderCircle, Search, Sparkles } from "lucide-react";
import type { DoctrineInsightsResponse, DoctrineLine } from "../types";
import { DOCTRINE_SEARCH_EXAMPLES, fetchDoctrineInsights } from "../lib/doctrineInsights";
import { cn } from "../lib/utils";
import { DoctrineReadingWorkspace } from "../components/doctrine/DoctrineReadingWorkspace";
import { formatSimpleDate } from "../lib/date";
import { doctrinalStateNarrative, groupingHint, lineClarityLabel, relationPatternNarrative, simplifyDoctrineLanguage } from "../lib/doctrineLanguage";

type LoadState = "idle" | "loading" | "ready" | "error";

function levelBadgeTone(level: "low" | "medium" | "high", kind: "importance" | "risk") {
    if (kind === "importance") {
        if (level === "high") return "bg-cgr-navy text-white border-cgr-navy";
        if (level === "medium") return "bg-cgr-gold/15 text-cgr-navy border-cgr-gold/40";
        return "bg-white text-slate-600 border-slate-300";
    }

    if (level === "high") return "bg-cgr-red/10 text-cgr-red border-cgr-red/25";
    if (level === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function formatDateRange(line: DoctrineLine) {
    if (!line.time_span.from && !line.time_span.to) return "Sin período consolidado";
    if (line.time_span.from && line.time_span.to) return `${formatSimpleDate(line.time_span.from, "s/d")} → ${formatSimpleDate(line.time_span.to, "s/d")}`;
    return formatSimpleDate(line.time_span.from ?? line.time_span.to, "Sin período consolidado");
}

function formatFuenteLabel(tipo: string, numero: string | null) {
    return numero ? `${tipo} ${numero}` : tipo;
}

function doctrineExplorerTitle(query: string) {
    if (query.trim()) return "Líneas doctrinales relevantes para su consulta";
    return "Principales líneas doctrinales del corpus";
}

export function Home() {
    const [query, setQuery] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState("");
    const [state, setState] = useState<LoadState>("idle");
    const [result, setResult] = useState<DoctrineInsightsResponse | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<"live" | "demo">("live");

    useEffect(() => {
        let active = true;

        async function load() {
            setState("loading");
            setResult(null);
            setSelectedId(null);
            try {
                const response = await fetchDoctrineInsights(submittedQuery, 4);
                if (!active) return;

                setMode(response.mode);
                setResult(response.data);
                setSelectedId(response.data.lines[0]?.representative_dictamen_id ?? null);
                if (import.meta.env.DEV) {
                    console.debug("doctrine-search query", {
                        query_original: submittedQuery,
                        query_rewritten: response.data.overview.query_interpreted ?? null
                    });
                }
                setState("ready");
            } catch {
                if (!active) return;
                setState("error");
            }
        }

        void load();
        return () => {
            active = false;
        };
    }, [submittedQuery]);

    const selectedLine = useMemo(() => (
        result?.lines.find((line) => line.representative_dictamen_id === selectedId) ?? result?.lines[0] ?? null
    ), [result, selectedId]);

    const hasActiveQuery = submittedQuery.trim().length > 0;
    const visibleOverviewQuery = hasActiveQuery ? submittedQuery : result?.overview.query;
    const visibleInterpretedQuery = hasActiveQuery ? result?.overview.query_interpreted : null;
    const visibleOverviewMatter = state === "ready" ? result?.overview.materiaEvaluated : null;
    const modeLabel = state === "loading"
        ? "Actualizando resultado"
        : mode === "live"
            ? "Usando datos reales del corpus"
            : "Usando ejemplo local de respaldo";
    const modeTone = state === "loading"
        ? "text-blue-200"
        : mode === "live"
            ? "text-emerald-400"
            : "text-amber-300";

    function handleSearchSubmit(nextQuery?: string) {
        const value = typeof nextQuery === "string" ? nextQuery : query;
        setQuery(value);
        setSubmittedQuery(value.trim());
    }

    return (
        <div className="space-y-8">
            <section className="relative overflow-hidden rounded-[2rem] border border-cgr-navy/10 bg-gradient-to-br from-cgr-navy via-[#12355c] to-[#0b223e] px-6 py-8 md:px-10 md:py-12 shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_30%),linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_100%)] pointer-events-none" />
                <div className="relative z-10 grid gap-10 lg:grid-cols-[1.3fr_0.7fr]">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cgr-gold/30 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cgr-gold">
                            <Sparkles className="h-3.5 w-3.5" />
                            Indubia Doctrine Explorer
                        </div>

                        <div className="space-y-4">
                            <h1 className="max-w-4xl font-serif text-4xl font-semibold leading-tight text-white md:text-6xl">
                                Explore líneas doctrinales sin partir desde cero.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-blue-100 md:text-lg">
                                Indubia organiza dictámenes en líneas doctrinales legibles, muestra qué criterio parece más influyente y señala cuándo una materia podría estar cambiando en el tiempo.
                            </p>
                        </div>

                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                handleSearchSubmit();
                            }}
                        >
                            <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/15 bg-white/10 p-3 backdrop-blur md:flex-row">
                                <div className="flex flex-1 items-center gap-3 rounded-[1.15rem] bg-white px-4 py-3 text-slate-700 shadow-inner">
                                    <Search className="h-5 w-5 text-cgr-navy" />
                                    <input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Ej.: contrata confianza legítima"
                                        className="w-full border-0 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="inline-flex items-center justify-center gap-2 rounded-[1.15rem] bg-cgr-gold px-5 py-3 font-semibold text-cgr-navy transition hover:bg-[#f0cf57]"
                                >
                                    Buscar doctrina
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>

                            {visibleInterpretedQuery && visibleInterpretedQuery.trim() !== (visibleOverviewQuery ?? "").trim() && (
                                <div className="rounded-[1.15rem] border border-white/15 bg-white/10 px-4 py-3 text-sm text-blue-100">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cgr-gold">Consulta interpretada</p>
                                    <p className="mt-2">“{visibleInterpretedQuery}”</p>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {DOCTRINE_SEARCH_EXAMPLES.map((example) => (
                                    <button
                                        key={example}
                                        type="button"
                                        onClick={() => handleSearchSubmit(example)}
                                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-blue-100 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                                    >
                                        {example}
                                    </button>
                                ))}
                            </div>
                        </form>
                    </div>

                    <div className="grid gap-4 self-end">
                        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cgr-gold">Qué verá aquí</p>
                            <ul className="mt-4 space-y-3 text-sm leading-6 text-blue-100">
                                <li>La línea doctrinal que conviene leer primero.</li>
                                <li>Si parece estable o si muestra señales de evolución.</li>
                                <li>Qué dictámenes concentran mejor el criterio.</li>
                            </ul>
                        </div>
                        <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cgr-gold">Modo actual</p>
                            <div className="mt-4 flex items-center gap-3 text-white">
                                <CircleDot className={cn("h-4 w-4", modeTone)} />
                                <span className="text-sm font-medium">
                                    {modeLabel}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-5">
                    <div className="flex flex-col gap-2 rounded-[1.5rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <BookOpenText className="h-5 w-5 text-cgr-navy" />
                            <h2 className="font-serif text-2xl font-semibold text-cgr-navy">{doctrineExplorerTitle(submittedQuery)}</h2>
                        </div>
                        <p className="text-sm leading-6 text-slate-600">
                            {visibleOverviewQuery
                                ? `Consulta jurídica: “${visibleOverviewQuery}”.`
                                : "Sin consulta específica: se muestran las líneas doctrinales más visibles del corpus."}{" "}
                            {visibleOverviewMatter && `Materia predominante: ${visibleOverviewMatter}.`}
                        </p>
                        {result?.overview.query_intent && (
                            <p className="text-sm leading-6 text-slate-500">
                                Tema detectado: {result.overview.query_intent.intent_label}.
                            </p>
                        )}
                    </div>

                    {state === "loading" && (
                        <div className="space-y-4">
                            <div className="rounded-[1.5rem] border border-cgr-navy/10 bg-white px-6 py-5 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <LoaderCircle className="mt-0.5 h-5 w-5 animate-spin text-cgr-navy" />
                                    <div className="space-y-1">
                                        <h3 className="font-serif text-xl font-semibold text-cgr-navy">Buscando líneas doctrinales relevantes</h3>
                                        <p className="text-sm leading-6 text-slate-600">
                                            Indubia está agrupando dictámenes cercanos y priorizando qué criterio conviene leer primero.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {[...Array(3)].map((_, index) => (
                                <div key={index} className="animate-pulse rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                                    <div className="h-6 w-2/3 rounded bg-slate-200" />
                                    <div className="mt-4 h-4 w-1/3 rounded bg-slate-100" />
                                    <div className="mt-4 space-y-2">
                                        <div className="h-4 rounded bg-slate-100" />
                                        <div className="h-4 rounded bg-slate-100" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {state === "error" && (
                        <div className="rounded-[1.5rem] border border-cgr-red/15 bg-white p-6 shadow-sm">
                            <div className="flex items-start gap-3">
                                <CircleAlert className="mt-0.5 h-5 w-5 text-cgr-red" />
                                <div className="space-y-2">
                                    <h3 className="font-serif text-xl font-semibold text-cgr-navy">No fue posible completar la búsqueda doctrinal</h3>
                                    <p className="text-sm leading-6 text-slate-600">
                                        Indubia no pudo consultar esta búsqueda en el backend principal. Intente nuevamente en unos segundos o use una consulta distinta.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {state === "ready" && result?.lines.length === 0 && (
                        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                            <h3 className="font-serif text-xl font-semibold text-cgr-navy">No encontramos una línea doctrinal clara para esta consulta</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Pruebe con una materia más amplia o con una combinación más reconocible de términos jurídicos.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {DOCTRINE_SEARCH_EXAMPLES.slice(0, 3).map((example) => (
                                    <button
                                        key={example}
                                        type="button"
                                        onClick={() => handleSearchSubmit(example)}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 transition hover:border-cgr-navy/20 hover:text-cgr-navy"
                                    >
                                        Probar: {example}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {state === "ready" && result?.lines.map((line) => {
                        const isSelected = line.representative_dictamen_id === selectedLine?.representative_dictamen_id;
                        const visibleFuentes = line.top_fuentes_legales.slice(0, 3);
                        const visibleKeyDictamenes = line.key_dictamenes.slice(0, 3);
                        const structureHint = groupingHint(line);
                        return (
                            <button
                                key={line.representative_dictamen_id}
                                type="button"
                                onClick={() => setSelectedId(line.representative_dictamen_id)}
                                className={cn(
                                    "w-full rounded-[1.6rem] border bg-white p-6 text-left shadow-sm transition",
                                    isSelected
                                        ? "border-cgr-navy/25 shadow-lg ring-1 ring-cgr-navy/10"
                                        : "border-slate-200 hover:border-cgr-navy/20 hover:shadow-md"
                                )}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-3">
                                        <h3 className="font-serif text-2xl font-semibold text-cgr-navy">{line.title}</h3>
                                        <div className="flex flex-wrap gap-2">
                                            <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", levelBadgeTone(line.importance_level, "importance"))}>
                                                importancia {line.importance_level}
                                            </span>
                                            <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", levelBadgeTone(line.change_risk_level, "risk"))}>
                                                {doctrinalStateNarrative(line.doctrinal_state)}
                                            </span>
                                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                                                {relationPatternNarrative(line)}
                                            </span>
                                            <span className={cn(
                                                "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                                                line.coherence_signals.coherence_status === "fragmentada"
                                                    ? "border-cgr-red/20 bg-cgr-red/10 text-cgr-red"
                                                    : line.coherence_signals.coherence_status === "mixta"
                                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                            )}>
                                                {lineClarityLabel(line)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                        {formatDateRange(line)}
                                    </div>
                                </div>

                                <p className="mt-4 text-sm leading-7 text-slate-700">{simplifyDoctrineLanguage(line.summary)}</p>
                                <p className="mt-3 text-sm leading-6 text-slate-500">{simplifyDoctrineLanguage(line.doctrinal_state_reason)}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-500">{simplifyDoctrineLanguage(line.relation_dynamics.summary)}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-500">{simplifyDoctrineLanguage(line.coherence_signals.summary)}</p>
                                {line.semantic_anchor_dictamen && (
                                    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-navy/75">Más cercano a su búsqueda</p>
                                        <p className="mt-1 font-mono text-xs text-cgr-navy">{line.semantic_anchor_dictamen.id}</p>
                                        <p className="mt-2 text-sm leading-6 text-cgr-navy">{line.semantic_anchor_dictamen.titulo}</p>
                                        <p className="mt-2 text-xs text-slate-500">{formatSimpleDate(line.semantic_anchor_dictamen.fecha, "Sin fecha")}</p>
                                    </div>
                                )}
                                {line.structure_adjustments && (
                                    <p className="mt-2 text-sm leading-6 text-emerald-800">{simplifyDoctrineLanguage(line.structure_adjustments.note)}</p>
                                )}
                                {structureHint && (
                                    <div
                                        className={cn(
                                            "mt-3 inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]",
                                            line.structure_adjustments
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border-cgr-red/15 bg-cgr-red/5 text-cgr-red"
                                        )}
                                    >
                                        {structureHint}
                                    </div>
                                )}

                                {line.query_match_reason && (
                                    <div className="mt-4 rounded-2xl border border-cgr-gold/25 bg-cgr-gold/10 px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-navy/75">Por qué conviene leer esta línea</p>
                                        <p className="mt-1 text-sm leading-6 text-cgr-navy">{simplifyDoctrineLanguage(line.query_match_reason)}</p>
                                    </div>
                                )}

                                <div className="mt-5 grid gap-5 md:grid-cols-[1fr_0.85fr]">
                                    {visibleFuentes.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Normas dominantes</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {visibleFuentes.map((fuente) => (
                                                    <span key={`${fuente.tipo_norma}-${fuente.numero ?? "sin-numero"}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                                                        {formatFuenteLabel(fuente.tipo_norma, fuente.numero)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {visibleKeyDictamenes.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dictámenes a leer primero</p>
                                            <div className="mt-2 space-y-2">
                                                {visibleKeyDictamenes.map((dictamen) => (
                                                    <div key={dictamen.id} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="space-y-1">
                                                                <p className="font-serif text-base font-semibold text-cgr-navy">{dictamen.titulo}</p>
                                                                <p className="font-mono text-xs text-slate-500">{dictamen.id}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{dictamen.rol_en_linea}</p>
                                                                {dictamen.fecha && <p className="mt-1 text-xs text-slate-500">{formatSimpleDate(dictamen.fecha, "Sin fecha")}</p>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <aside className="xl:sticky xl:top-8 xl:self-start">
                    {selectedLine ? (
                        <DoctrineReadingWorkspace
                            line={selectedLine}
                            query={visibleOverviewQuery ?? undefined}
                        />
                    ) : (
                        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                            {state === "loading" ? (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                                <LoaderCircle className="h-8 w-8 animate-spin text-cgr-navy" />
                                <div className="space-y-2">
                                    <h3 className="font-serif text-2xl font-semibold text-cgr-navy">Actualizando líneas doctrinales</h3>
                                    <p className="max-w-md text-sm leading-6 text-slate-600">
                                        Se está limpiando la vista anterior y cargando el nuevo resultado para su consulta.
                                    </p>
                                </div>
                            </div>
                        ) : state === "ready" && result?.lines.length === 0 ? (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                                <CircleAlert className="h-8 w-8 text-slate-400" />
                                <div className="space-y-2">
                                    <h3 className="font-serif text-2xl font-semibold text-cgr-navy">Sin línea seleccionada</h3>
                                    <p className="max-w-md text-sm leading-6 text-slate-600">
                                        Esta consulta no devolvió una línea doctrinal clara. Pruebe con una materia más amplia o con otro término jurídico.
                                    </p>
                                </div>
                            </div>
                        ) : state === "error" ? (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                                <CircleAlert className="h-8 w-8 text-cgr-red" />
                                <div className="space-y-2">
                                    <h3 className="font-serif text-2xl font-semibold text-cgr-navy">Detalle temporalmente no disponible</h3>
                                    <p className="max-w-md text-sm leading-6 text-slate-600">
                                        La consulta no pudo completar la carga. Vuelva a intentar la búsqueda para reconstruir la línea doctrinal.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                                <LoaderCircle className="h-8 w-8 animate-spin text-cgr-navy" />
                                <div className="space-y-2">
                                    <h3 className="font-serif text-2xl font-semibold text-cgr-navy">Seleccione una línea doctrinal</h3>
                                    <p className="max-w-md text-sm leading-6 text-slate-600">
                                        Aquí verá el dictamen más útil para empezar, el recorrido sugerido y los documentos que conviene leer primero.
                                    </p>
                                </div>
                            </div>
                            )}
                        </div>
                    )}

                    <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Siguiente paso sugerido</p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                            La home ya permite bajar al dictamen guía de cada línea. Use búsqueda avanzada cuando quiera contrastar el criterio doctrinal con más resultados del corpus.
                        </p>
                        <Link
                            to="/buscar"
                            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cgr-navy hover:text-cgr-blue"
                        >
                            Ir a búsqueda avanzada
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                </aside>
            </section>
        </div>
    );
}
