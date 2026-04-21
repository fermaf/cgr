import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    ArrowUpRight,
    BookOpen,
    ChevronRight,
    CircleAlert,
    CircleDot,
    FileText,
    Landmark,
    LibraryBig,
    LoaderCircle,
    Scale,
    Search
} from "lucide-react";
import type {
    DoctrineGuidedFamilyCandidate,
    DoctrineGuidedFamilyResponse,
    DoctrineGuidedMatterStatus,
    DoctrineGuidedResponse,
    DoctrineInsightsResponse,
    DoctrineLine
} from "../types";
import {
    DOCTRINE_SEARCH_EXAMPLES,
    fetchDoctrineGuided,
    fetchDoctrineGuidedFamily,
    fetchDoctrineInsights,
    readCachedDoctrineInsights
} from "../lib/doctrineInsights";
import { cn } from "../lib/utils";
import { DoctrineReadingWorkspace } from "../components/doctrine/DoctrineReadingWorkspace";
import { formatSimpleDate } from "../lib/date";
import { graphStatusNarrative, simplifyDoctrineLanguage } from "../lib/doctrineLanguage";
import { PjoBentoGrid } from "../components/doctrine/PjoBentoGrid";
import { PjoHeroSolution } from "../components/doctrine/PjoHeroSolution";

type LoadState = "idle" | "loading" | "ready" | "error";

function formatFuenteLabel(tipo: string, numero: string | null) {
    const normalizedNumber = numero && /^\d+$/.test(numero) && numero.length > 4
        ? `${numero.slice(0, numero.length - 3)}.${numero.slice(-3)}`
        : numero;

    if (tipo === "Ley" && numero === "18834") return "Estatuto Administrativo";
    if (tipo === "Ley" && numero === "18883") return "Estatuto Administrativo Municipal";
    if (tipo === "Ley" && numero === "19880") return "Ley de Procedimiento Administrativo";
    if (tipo === "Ley" && numero === "18575") return "Ley de Bases de la Administración";

    return normalizedNumber ? `${tipo} ${normalizedNumber}` : tipo;
}

function modeTone(mode: "live" | "demo") {
    return mode === "live"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
}

function guidedStatusLabel(value: string | null | undefined) {
    return String(value ?? "").replace(/_/g, " ").trim() || "sin estado";
}

function guidedStatusTone(value: string | null | undefined) {
    if (value === "criterio_en_revision" || value === "criterio_tensionado") return "border-cgr-red/20 bg-cgr-red/5 text-cgr-red";
    if (value === "criterio_estable") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    return "border-amber-200 bg-amber-50 text-amber-700";
}

function matterStatusTone(category: DoctrineGuidedMatterStatus["status_category"]) {
    if (category === "abstencion_competencial" || category === "materia_litigiosa") {
        return "border-cgr-red/20 bg-cgr-red/5 text-cgr-red";
    }
    if (category === "cambio_de_regimen") {
        return "border-amber-200 bg-amber-50 text-amber-700";
    }
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function doctrinalTone(line: DoctrineLine) {
    const status = line.graph_doctrinal_status?.status ?? line.doctrinal_state;
    if (status === "criterio_en_revision" || status === "criterio_tensionado" || status === "bajo_tension") {
        return "border-cgr-red/20 bg-cgr-red/5 text-cgr-red";
    }
    if (status === "criterio_estable" || status === "consolidado") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusHeadline(line: DoctrineLine) {
    const status = line.graph_doctrinal_status?.status;
    if (status === "criterio_en_revision") return "La materia muestra revisión visible";
    if (status === "criterio_tensionado") return "El criterio sigue vigente, pero con tensión";
    if (status === "criterio_fragmentado") return "La consulta abre criterios que conviene separar";
    if (status === "criterio_en_evolucion") return "El criterio se ha desarrollado en el tiempo";
    if (status === "criterio_estable") return "El criterio visible se mantiene estable";
    if (line.doctrinal_state === "bajo_tension") return "La línea presenta ajustes relevantes";
    if (line.doctrinal_state === "en_evolucion") return "La línea ha evolucionado";
    return "La línea mantiene un criterio visible";
}

function formatDateRange(line: DoctrineLine) {
    if (!line.time_span.from && !line.time_span.to) return "Sin período visible";
    if (line.time_span.from && line.time_span.to) return `${formatSimpleDate(line.time_span.from, "s/d")} → ${formatSimpleDate(line.time_span.to, "s/d")}`;
    return formatSimpleDate(line.time_span.from ?? line.time_span.to, "Sin período visible");
}

function lineRepresentativeTitle(line: DoctrineLine) {
    return line.key_dictamenes.find((item) => item.id === line.representative_dictamen_id)?.titulo ?? line.title;
}

function lineFirstReadId(line: DoctrineLine) {
    return line.semantic_anchor_dictamen?.id ?? line.representative_dictamen_id;
}

function lineFirstReadTitle(line: DoctrineLine) {
    return line.semantic_anchor_dictamen?.titulo ?? lineRepresentativeTitle(line);
}

function lineFirstReadReason(line: DoctrineLine) {
    return simplifyDoctrineLanguage(
        line.reading_priority_reason
        ?? line.semantic_anchor_dictamen?.reason
        ?? "Es el punto de entrada más útil para entender cómo se está leyendo esta materia."
    );
}

function sameDictamen(left?: string | null, right?: string | null) {
    return Boolean(left && right && left === right);
}

function uniqueDictamenTargets(line: DoctrineLine, primaryEntry: ReturnType<typeof buildPrimaryEntry>) {
    const targets = [
        primaryEntry?.dictamenId
            ? { kind: "entrada" as const, id: primaryEntry.dictamenId, title: primaryEntry.title, label: "Por dónde entrar" }
            : null,
        { kind: "guia" as const, id: line.representative_dictamen_id, title: lineRepresentativeTitle(line), label: "Dictamen guía" },
        line.semantic_anchor_dictamen
            ? { kind: "ancla" as const, id: line.semantic_anchor_dictamen.id, title: line.semantic_anchor_dictamen.titulo, label: "Más cercano a la consulta" }
            : null,
        line.pivot_dictamen
            ? { kind: "cambio" as const, id: line.pivot_dictamen.id, title: line.pivot_dictamen.titulo, label: "Cambio visible" }
            : null
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    return targets.filter((item, index, source) => source.findIndex((candidate) => candidate.id === item.id) === index);
}

function keyDictamenContext(line: DoctrineLine, dictamen: DoctrineLine["key_dictamenes"][number]) {
    if (dictamen.id === line.representative_dictamen_id) {
        return "Conviene empezar aquí porque este dictamen organiza la lectura principal del criterio.";
    }
    if (dictamen.id === line.semantic_anchor_dictamen?.id) {
        return simplifyDoctrineLanguage(line.semantic_anchor_dictamen.reason);
    }
    if (dictamen.id === line.pivot_dictamen?.id) {
        return simplifyDoctrineLanguage(line.pivot_dictamen.reason);
    }
    if (dictamen.rol_en_linea === "núcleo doctrinal") {
        return "Ayuda a fijar la base del criterio y a distinguirlo de asuntos cercanos.";
    }
    return "Aporta contexto para ver cómo la línea se consolida, se desarrolla o se ajusta.";
}

function familyDateLabel(family: DoctrineGuidedFamilyCandidate) {
    if (family.visible_time_span.from || family.visible_time_span.to) {
        return `${formatSimpleDate(family.visible_time_span.from, "s/d")} → ${formatSimpleDate(family.visible_time_span.to, "s/d")}`;
    }
    return family.representative_date ? formatSimpleDate(family.representative_date, "s/d") : "Sin fecha";
}

function familySummary(family: DoctrineGuidedFamilyCandidate) {
    return simplifyDoctrineLanguage(family.why_this_family || family.relation_summary || family.next_step);
}

function buildPrimaryEntry(guidedResult: DoctrineGuidedResponse | null, selectedLine: DoctrineLine | null) {
    const matterStatus = guidedResult?.overview.recommended_entry === "estado_actual_materia"
        ? guidedResult.estado_actual_materia ?? null
        : null;

    if (matterStatus) {
        return {
            label: "Estado actual visible",
            title: matterStatus.title,
            dictamenId: matterStatus.dictamen_id,
            summary: simplifyDoctrineLanguage(matterStatus.summary),
            rationale: simplifyDoctrineLanguage(matterStatus.why_this_status),
            tone: matterStatusTone(matterStatus.status_category),
            badge: matterStatus.status_label
        };
    }

    if (guidedResult?.focus_directo) {
        return {
            label: "Dictamen de entrada",
            title: guidedResult.focus_directo.title,
            dictamenId: guidedResult.focus_directo.dictamen_id,
            summary: simplifyDoctrineLanguage(guidedResult.focus_directo.summary),
            rationale: simplifyDoctrineLanguage(guidedResult.focus_directo.why_this_focus),
            tone: "border-blue-100 bg-blue-50/70 text-cgr-navy",
            badge: "Entrada recomendada"
        };
    }

    if (selectedLine) {
        return {
            label: "Lectura inicial",
            title: lineFirstReadTitle(selectedLine),
            dictamenId: lineFirstReadId(selectedLine),
            summary: simplifyDoctrineLanguage(selectedLine.summary),
            rationale: lineFirstReadReason(selectedLine),
            tone: "border-blue-100 bg-blue-50/70 text-cgr-navy",
            badge: "Punto de partida"
        };
    }

    return null;
}

function routeCards(
    hasActiveQuery: boolean,
    guidedResult: DoctrineGuidedResponse | null,
    result: DoctrineInsightsResponse | null
) {
    if (hasActiveQuery && guidedResult && guidedResult.familias_candidatas.length > 0) {
        return guidedResult.familias_candidatas.map((family) => ({
            id: family.family_id,
            title: family.label,
            subtitle: family.representative_title,
            badge: guidedStatusLabel(family.doctrinal_status),
            badgeTone: guidedStatusTone(family.doctrinal_status),
            period: familyDateLabel(family),
            reason: familySummary(family),
            representativeId: family.representative_dictamen_id
        }));
    }

    return (result?.lines ?? []).map((line) => ({
        id: line.representative_dictamen_id,
        title: line.title,
        subtitle: lineRepresentativeTitle(line),
        badge: guidedStatusLabel(line.graph_doctrinal_status?.status ?? line.doctrinal_state),
        badgeTone: doctrinalTone(line),
        period: formatDateRange(line),
        reason: simplifyDoctrineLanguage(line.query_match_reason ?? line.summary),
        representativeId: line.representative_dictamen_id
    }));
}

export function Home() {
    const [searchParams, setSearchParams] = useSearchParams();
    const paramsQuery = searchParams.get("q") ?? "";
    const paramsFamilyId = searchParams.get("family");
    const initialInsights = paramsQuery.trim() ? readCachedDoctrineInsights(paramsQuery.trim(), 4) : null;
    const [query, setQuery] = useState(paramsQuery);
    const [state, setState] = useState<LoadState>(initialInsights ? "ready" : "idle");
    const [result, setResult] = useState<DoctrineInsightsResponse | null>(initialInsights?.data ?? null);
    const [guidedResult, setGuidedResult] = useState<DoctrineGuidedResponse | null>(null);
    const [guidedFamily, setGuidedFamily] = useState<DoctrineGuidedFamilyResponse | null>(null);
    const [guidedState, setGuidedState] = useState<LoadState>("idle");
    const [selectedId, setSelectedId] = useState<string | null>(initialInsights?.data.lines[0]?.representative_dictamen_id ?? null);
    const [mode, setMode] = useState<"live" | "demo">(initialInsights?.mode ?? "live");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
    const submittedQuery = paramsQuery.trim();
    const hasActiveQuery = submittedQuery.length > 0;

    useEffect(() => {
        setQuery(paramsQuery);
    }, [paramsQuery]);

    function updateInvestigationParams(next: { query?: string; familyId?: string | null }, replace = false) {
        const normalizedQuery = (next.query ?? paramsQuery).trim();
        const familyId = next.familyId === undefined ? paramsFamilyId : next.familyId;
        const nextParams = new URLSearchParams(searchParams);

        if (normalizedQuery) {
            nextParams.set("q", normalizedQuery);
            if (familyId) nextParams.set("family", familyId);
            else nextParams.delete("family");
        } else {
            nextParams.delete("q");
            nextParams.delete("family");
        }

        nextParams.delete("step");
        setSearchParams(nextParams, { replace });
    }

    useEffect(() => {
        let active = true;

        async function load() {
            if (!submittedQuery) {
                setMode("live");
                setResult(null);
                setSelectedId(null);
                setState("idle");
                setIsRefreshing(false);
                setGuidedResult(null);
                setGuidedFamily(null);
                setGuidedState("idle");
                return;
            }

            const cached = readCachedDoctrineInsights(submittedQuery, 4);
            const hasVisibleResult = Boolean(cached?.data || result);

            if (cached?.data) {
                setMode(cached.mode);
                setResult(cached.data);
                setSelectedId(cached.data.lines[0]?.representative_dictamen_id ?? null);
            }

            setState(hasVisibleResult ? "ready" : "loading");
            setIsRefreshing(hasVisibleResult);
            setGuidedResult(null);
            setGuidedFamily(null);
            setGuidedState("idle");

            try {
                const insightsResponse = await fetchDoctrineInsights(submittedQuery, 4);
                if (!active) return;

                setMode(insightsResponse.mode);
                setResult(insightsResponse.data);
                setSelectedId((current) => {
                    const currentStillVisible = insightsResponse.data.lines.some((line) => line.representative_dictamen_id === current);
                    if (currentStillVisible) return current;
                    return insightsResponse.data.lines[0]?.representative_dictamen_id ?? null;
                });
                setState("ready");
                setIsRefreshing(false);
            } catch {
                if (!active) return;
                setIsRefreshing(false);
                setState(result ? "ready" : "error");
            }
        }

        void load();
        return () => {
            active = false;
        };
    }, [submittedQuery]);

    useEffect(() => {
        let active = true;

        async function loadGuided() {
            if (!submittedQuery) return;
            setGuidedState("loading");
            try {
                const response = await fetchDoctrineGuided(submittedQuery, 4);
                if (!active) return;

                setGuidedResult(response);
                setGuidedState("ready");
                if (paramsFamilyId) {
                    const familyIds = new Set(response.familias_candidatas.map((family) => family.family_id));
                    if (!familyIds.has(paramsFamilyId)) {
                        updateInvestigationParams({ query: submittedQuery, familyId: null }, true);
                    }
                }
            } catch {
                if (!active) return;
                setGuidedState("error");
                setGuidedResult(null);
                setGuidedFamily(null);
            }
        }

        void loadGuided();
        return () => {
            active = false;
        };
    }, [submittedQuery]);

    useEffect(() => {
        let active = true;

        async function loadFamily() {
            if (!submittedQuery || !paramsFamilyId) return;
            try {
                const response = await fetchDoctrineGuidedFamily(submittedQuery, paramsFamilyId, 4);
                if (!active) return;
                setGuidedFamily(response);
            } catch {
                if (!active) return;
                setGuidedFamily(null);
            }
        }

        if (submittedQuery && paramsFamilyId) {
            void loadFamily();
        } else {
            setGuidedFamily(null);
        }

        return () => {
            active = false;
        };
    }, [submittedQuery, paramsFamilyId]);

    const selectedLine = useMemo(() => {
        if (!result?.lines.length) return null;

        const familyRepresentativeId = guidedFamily?.family?.representative_dictamen_id;
        if (familyRepresentativeId) {
            const familyLine = result.lines.find((line) => line.representative_dictamen_id === familyRepresentativeId);
            if (familyLine) return familyLine;
        }

        if (selectedId) {
            const pickedLine = result.lines.find((line) => line.representative_dictamen_id === selectedId);
            if (pickedLine) return pickedLine;
        }

        return result.lines[0] ?? null;
    }, [guidedFamily, result, selectedId]);

    useEffect(() => {
        if (!selectedLine) return;
        if (selectedId === selectedLine.representative_dictamen_id) return;
        setSelectedId(selectedLine.representative_dictamen_id);
    }, [selectedId, selectedLine]);

    const primaryEntry = useMemo(() => buildPrimaryEntry(guidedResult, selectedLine), [guidedResult, selectedLine]);
    const routes = useMemo(() => routeCards(hasActiveQuery, guidedResult, result), [guidedResult, hasActiveQuery, result]);
    const visibleOverviewQuery = hasActiveQuery ? submittedQuery : result?.overview.query;
    const visibleInterpretedQuery = result?.overview.query_interpreted ?? guidedResult?.overview.query_interpreted ?? null;
    const modeLabel = isRefreshing || state === "loading"
        ? "Actualizando resultado"
        : mode === "live"
            ? "Usando datos reales del corpus"
            : "Usando ejemplo local de respaldo";
    const firstReadMatchesRepresentative = selectedLine ? sameDictamen(lineFirstReadId(selectedLine), selectedLine.representative_dictamen_id) : false;
    const pivotMatchesRepresentative = selectedLine ? sameDictamen(selectedLine.pivot_dictamen?.id, selectedLine.representative_dictamen_id) : false;
    const pivotMatchesFirstRead = selectedLine ? sameDictamen(selectedLine.pivot_dictamen?.id, lineFirstReadId(selectedLine)) : false;
    const focusTargets = selectedLine ? uniqueDictamenTargets(selectedLine, primaryEntry) : [];
    const primaryEntryDiffersFromLine = Boolean(
        primaryEntry?.dictamenId
        && selectedLine
        && !sameDictamen(primaryEntry.dictamenId, lineFirstReadId(selectedLine))
    );

    function handleSearchSubmit(nextQuery?: string) {
        const value = typeof nextQuery === "string" ? nextQuery : query;
        updateInvestigationParams({ query: value, familyId: null });
    }

    function handleRouteSelection(routeId: string) {
        const familyMatch = guidedResult?.familias_candidatas.find((family) => family.family_id === routeId);
        if (familyMatch) {
            updateInvestigationParams({ query: submittedQuery, familyId: familyMatch.family_id });
            return;
        }

        setSelectedId(routeId);
    }

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-[100] -mx-4 -mt-2 border-b border-slate-200/70 bg-cgr-light/95 px-4 py-4 backdrop-blur-md md:-mx-8 md:-mt-4 md:px-8">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Búsqueda jurisprudencial profesional</p>
                            <h1 className="font-serif text-2xl font-semibold text-cgr-navy">
                                Encontrar la materia, ver su estado y decidir qué leer primero
                            </h1>
                        </div>
                        <div className={cn(
                            "flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                            modeTone(mode)
                        )}>
                            <CircleDot className="h-3 w-3" />
                            {modeLabel}
                        </div>
                    </div>

                    <form
                        className="flex max-w-4xl gap-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            handleSearchSubmit();
                        }}
                    >
                        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-cgr-navy/30 focus-within:ring-2 focus-within:ring-cgr-navy/5">
                            <Search className="h-4 w-4 text-slate-400" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Ej.: contrata confianza legítima"
                                className="w-full border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                            />
                        </div>
                        <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cgr-navy px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d3a6e]"
                        >
                            Buscar jurisprudencia
                        </button>
                    </form>

                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ejemplos:</span>
                        <div className="flex flex-wrap gap-2">
                            {DOCTRINE_SEARCH_EXAMPLES.map((example) => (
                                <button
                                    key={example}
                                    type="button"
                                    onClick={() => handleSearchSubmit(example)}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-cgr-navy/20 hover:bg-slate-50 hover:text-cgr-navy"
                                >
                                    {example}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {state === "loading" && !result && (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
                    <LoaderCircle className="h-8 w-8 animate-spin text-cgr-navy" />
                    <div className="space-y-1">
                        <h2 className="font-serif text-xl font-semibold text-cgr-navy">Leyendo el corpus jurisprudencial</h2>
                        <p className="text-sm text-slate-500">Indubia está ubicando la materia, evaluando su estado visible y ordenando la primera lectura.</p>
                    </div>
                </div>
            )}

            {!hasActiveQuery && state !== "loading" && (
                <div className="space-y-12">
                    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                        <article className="overflow-hidden rounded-[2rem] border border-cgr-navy/10 bg-gradient-to-br from-cgr-navy via-[#113a63] to-[#0a223e] text-white shadow-xl">
                            <div className="space-y-5 p-6 md:p-8">
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cgr-gold">
                                    <LibraryBig className="h-3.5 w-3.5" />
                                    Búsqueda jurisprudencial
                                </div>
                                <div className="space-y-3">
                                    <h2 className="font-serif text-3xl font-semibold leading-tight text-white">
                                        Encuentre el dictamen relevante y la línea jurisprudencial que realmente importa
                                    </h2>
                                    <p className="max-w-3xl text-sm leading-7 text-blue-100">
                                        Busque por problema jurídico, materia o criterio. Indubia le mostrará el dictamen más cercano a su consulta, el estado jurisprudencial visible y, cuando corresponda, rutas alternativas para profundizar.
                                    </p>
                                </div>
                            </div>
                        </article>

                        <article className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cómo empezar</p>
                                    <p className="mt-2 font-serif text-2xl font-semibold text-cgr-navy">Escriba una consulta jurídica concreta</p>
                                </div>
                                <div className="grid gap-3">
                                    <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Qué encontrará</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-700">El dictamen más cercano a su consulta, la materia detectada y el estado jurisprudencial visible.</p>
                                    </div>
                                    <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Si la consulta es ambigua</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-700">Se abrirán rutas jurisprudenciales comparables para distinguir problemas cercanos antes de profundizar.</p>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </section>

                    {/* FASE 1: Bento Grid de PJOs */}
                    <div className="pt-4">
                        <PjoBentoGrid />
                    </div>
                </div>
            )}

            {isRefreshing && result && (
                <section className="rounded-[1.2rem] border border-blue-100 bg-blue-50/70 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                        <LoaderCircle className="h-4 w-4 animate-spin text-cgr-navy" />
                        <p className="text-sm text-slate-700">
                            El resultado ya está visible. Se está afinando con datos más recientes del corpus.
                        </p>
                    </div>
                </section>
            )}

            {state === "error" && (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
                    <CircleAlert className="mx-auto h-8 w-8 text-cgr-red" />
                    <h2 className="mt-4 font-serif text-xl font-semibold text-cgr-navy">Error en la consulta</h2>
                    <p className="mt-2 text-sm text-slate-600">No fue posible conectar con el motor jurisprudencial. Reintente en unos momentos.</p>
                </div>
            )}

            {state === "ready" && result && result.lines.length === 0 && (
                <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
                    <Search className="mx-auto h-8 w-8 text-slate-300" />
                    <h2 className="mt-4 font-serif text-xl font-semibold text-cgr-navy">Sin resultados claros</h2>
                    <p className="mt-2 text-sm text-slate-500">No encontramos una línea jurisprudencial suficientemente visible para responder esta consulta.</p>
                </div>
            )}

            {state === "ready" && result && result.lines.length > 0 && selectedLine && (
                <>
                    {/* PARADIGMA PJO: Si la línea tiene un régimen con respuesta, este es el Hero absoluto */}
                    {(selectedLine as any).regimen?.pjo_respuesta ? (
                        <div className="mb-10">
                            <PjoHeroSolution
                                regimen={(selectedLine as any).regimen}
                                submittedQuery={submittedQuery}
                            />
                        </div>
                    ) : (
                        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr] mb-10">
                            <article className="overflow-hidden rounded-[2rem] border border-cgr-navy/10 bg-gradient-to-br from-cgr-navy via-[#113a63] to-[#0a223e] text-white shadow-xl">
                                <div className="space-y-5 p-6 md:p-8">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cgr-gold">
                                        <LibraryBig className="h-3.5 w-3.5" />
                                        {hasActiveQuery ? "Resultado principal de la consulta" : "Panorama jurisprudencial reciente"}
                                    </div>
                                    <div className="space-y-3">
                                        {primaryEntry?.dictamenId && (
                                            <Link
                                                to={`/dictamen/${primaryEntry.dictamenId}`}
                                                className="inline-flex items-center gap-2 font-mono text-sm font-semibold text-cgr-gold underline decoration-white/20 underline-offset-4 hover:text-white"
                                            >
                                                {primaryEntry.dictamenId}
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                        )}
                                        <h2 className="font-serif text-3xl font-semibold leading-tight text-white">
                                            {primaryEntry?.title ?? selectedLine.title}
                                        </h2>
                                        <p className="max-w-3xl text-sm leading-7 text-blue-100">
                                            {primaryEntry?.rationale ?? simplifyDoctrineLanguage(selectedLine.summary)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        {primaryEntry?.dictamenId && (
                                            <Link
                                                to={`/dictamen/${primaryEntry.dictamenId}`}
                                                className="inline-flex items-center gap-2 rounded-full bg-cgr-gold px-4 py-2 text-sm font-semibold text-cgr-navy transition hover:bg-[#f3d86c]"
                                            >
                                                Leer dictamen inicial
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setIsSlideOverOpen(true)}
                                            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                                        >
                                            Abrir ruta de lectura
                                            <BookOpen className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="space-y-5">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Resumen de la consulta</p>
                                        <p className="mt-2 font-serif text-2xl font-semibold text-cgr-navy">
                                            {simplifyDoctrineLanguage(result.overview.materiaEvaluated || "Jurisprudencia administrativa")}
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estado jurisprudencial visible</p>
                                            <p className="mt-2 text-sm font-semibold text-cgr-navy">{statusHeadline(selectedLine)}</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                                {simplifyDoctrineLanguage(selectedLine.graph_doctrinal_status?.summary ?? selectedLine.doctrinal_state_reason)}
                                            </p>
                                        </div>
                                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Qué conviene leer primero</p>
                                            <Link
                                                to={`/dictamen/${lineFirstReadId(selectedLine)}`}
                                                className="mt-2 inline-flex items-center gap-2 font-mono text-sm font-semibold text-cgr-navy underline decoration-cgr-navy/20 underline-offset-4"
                                            >
                                                {lineFirstReadId(selectedLine)}
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">{lineFirstReadReason(selectedLine)}</p>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </section>
                    )}

                    {routes.length > 1 && (
                        <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="max-w-3xl space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Rutas de lectura</p>
                                <h2 className="font-serif text-2xl font-semibold text-cgr-navy">
                                    {hasActiveQuery ? "Compare la ruta principal con sus alternativas" : "Líneas jurisprudenciales disponibles"}
                                </h2>
                                <p className="text-sm leading-7 text-slate-600">
                                    {hasActiveQuery
                                        ? "Elija la ruta que mejor describa su problema jurídico. No elija por el nombre: compare estado, dictamen guía y período visible."
                                        : "Cada línea ofrece una entrada distinta para explorar el panorama jurisprudencial visible del corpus."}
                                </p>
                            </div>
                            <div className="mt-6 grid gap-4 xl:grid-cols-2">
                                {routes.map((route) => {
                                    const isSelected = route.representativeId === selectedLine.representative_dictamen_id;
                                    return (
                                        <button
                                            key={route.id}
                                            type="button"
                                            onClick={() => handleRouteSelection(route.id)}
                                            className={cn(
                                                "rounded-[1.5rem] border p-5 text-left transition",
                                                isSelected
                                                    ? "border-cgr-navy/20 bg-cgr-navy/[0.03] shadow-sm"
                                                    : "border-slate-200 bg-slate-50/70 hover:border-cgr-navy/15 hover:bg-white"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-2">
                                                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", route.badgeTone)}>
                                                        {route.badge}
                                                    </span>
                                                    <h3 className="font-serif text-xl font-semibold text-cgr-navy">{route.title}</h3>
                                                    <p className="text-sm font-medium text-slate-500">{route.subtitle}</p>
                                                </div>
                                                <ChevronRight className={cn("h-4 w-4 text-slate-300 transition", isSelected && "text-cgr-navy")} />
                                            </div>
                                            <p className="mt-4 text-sm leading-7 text-slate-700">{route.reason}</p>
                                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                <span className="font-mono text-cgr-navy">{route.representativeId}</span>
                                                <span>·</span>
                                                <span>{route.period}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {guidedState === "loading" && (
                                <div className="mt-4 rounded-[1rem] border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-700">
                                    Las rutas comparables se están afinando con el corpus real.
                                </div>
                            )}
                        </section>
                    )}

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <main className="space-y-6">
                            <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="max-w-3xl space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={cn("inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", doctrinalTone(selectedLine))}>
                                                {guidedStatusLabel(selectedLine.graph_doctrinal_status?.status ?? selectedLine.doctrinal_state)}
                                            </span>
                                            {guidedFamily?.family?.label && guidedFamily.family.label !== selectedLine.title && (
                                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                                    {guidedFamily.family.label}
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="font-serif text-3xl font-semibold text-cgr-navy">{selectedLine.title}</h2>
                                        <p className="text-sm leading-7 text-slate-700">
                                            {simplifyDoctrineLanguage(
                                                guidedFamily?.family?.why_this_family
                                                ?? selectedLine.query_match_reason
                                                ?? selectedLine.summary
                                            )}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsSlideOverOpen(true)}
                                            className="inline-flex items-center gap-2 rounded-full bg-cgr-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#123d67]"
                                        >
                                            <BookOpen className="h-4 w-4" />
                                            Abrir ruta de lectura
                                        </button>
                                        <Link
                                            to={`/dictamen/${selectedLine.representative_dictamen_id}`}
                                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/20 hover:bg-slate-50"
                                        >
                                            Ver dictamen guía
                                            <ArrowUpRight className="h-4 w-4" />
                                        </Link>
                                    </div>
                                </div>

                                <div className={cn("mt-6 grid gap-4", pivotMatchesRepresentative || pivotMatchesFirstRead ? "md:grid-cols-2" : "md:grid-cols-3")}>
                                    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estado jurisprudencial visible</p>
                                        <p className="mt-2 text-sm font-semibold text-cgr-navy">{statusHeadline(selectedLine)}</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                            {simplifyDoctrineLanguage(selectedLine.graph_doctrinal_status?.summary ?? graphStatusNarrative(selectedLine))}
                                        </p>
                                    </div>

                                    <div className={cn(
                                        "rounded-[1.2rem] border p-4",
                                        firstReadMatchesRepresentative ? "border-blue-100 bg-blue-50/70" : "border-slate-200 bg-slate-50"
                                    )}>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                            {firstReadMatchesRepresentative ? "Dictamen que conviene leer primero" : "Qué encontró el sistema"}
                                        </p>
                                        <p className="mt-2 font-mono text-sm text-cgr-navy">{lineFirstReadId(selectedLine)}</p>
                                        <p className="mt-2 text-sm font-semibold text-cgr-navy">{lineFirstReadTitle(selectedLine)}</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                            {lineFirstReadReason(selectedLine)}
                                        </p>
                                    </div>

                                    {!pivotMatchesRepresentative && !pivotMatchesFirstRead && selectedLine.pivot_dictamen && (
                                        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cambio visible</p>
                                            <p className="mt-2 font-mono text-sm text-cgr-navy">{selectedLine.pivot_dictamen.id}</p>
                                            <p className="mt-2 text-sm font-semibold text-cgr-navy">{selectedLine.pivot_dictamen.titulo}</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-700">{simplifyDoctrineLanguage(selectedLine.pivot_dictamen.reason)}</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <BookOpen className="h-4 w-4 text-cgr-navy" />
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        {primaryEntryDiffersFromLine ? "Si profundiza en esta línea, lea primero" : "Qué conviene leer primero"}
                                    </p>
                                </div>
                                {selectedLine.key_dictamenes.length === 1 ? (
                                    <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-xs text-cgr-navy">{selectedLine.key_dictamenes[0].id}</span>
                                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                                        {selectedLine.key_dictamenes[0].rol_en_linea}
                                                    </span>
                                                </div>
                                                <h3 className="font-serif text-2xl font-semibold text-cgr-navy">{selectedLine.key_dictamenes[0].titulo}</h3>
                                                <p className="text-sm leading-7 text-slate-600">{lineFirstReadReason(selectedLine)}</p>
                                            </div>
                                            <p className="text-sm text-slate-500">{formatSimpleDate(selectedLine.key_dictamenes[0].fecha, "Sin fecha")}</p>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-3">
                                            <Link
                                                to={`/dictamen/${selectedLine.key_dictamenes[0].id}`}
                                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/20 hover:bg-slate-50"
                                            >
                                                Leer dictamen
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                            <span className="inline-flex items-center gap-2 rounded-full bg-cgr-gold/15 px-3 py-1.5 text-sm font-medium text-cgr-navy">
                                                Resultado principal de esta consulta
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                <div className="mt-5 space-y-4">
                                    {selectedLine.key_dictamenes.map((dictamen, index) => {
                                        const isRepresentative = dictamen.id === selectedLine.representative_dictamen_id;
                                        const isPivot = dictamen.id === selectedLine.pivot_dictamen?.id;
                                        return (
                                            <div key={dictamen.id} className="grid grid-cols-[18px_1fr] gap-4">
                                                <div className="flex flex-col items-center">
                                                    <span className={cn(
                                                        "mt-1 h-3.5 w-3.5 rounded-full border-2",
                                                        isRepresentative
                                                            ? "border-cgr-gold bg-cgr-gold"
                                                            : isPivot
                                                                ? "border-amber-500 bg-amber-500"
                                                                : "border-cgr-navy/20 bg-white"
                                                    )} />
                                                    {index < selectedLine.key_dictamenes.length - 1 && <span className="mt-2 h-full w-px bg-slate-200" />}
                                                </div>
                                                <article className={cn(
                                                    "rounded-[1.25rem] border p-4",
                                                    isRepresentative ? "border-cgr-navy/20 bg-cgr-navy/[0.03]" : "border-slate-200 bg-slate-50/70"
                                                )}>
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="space-y-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-mono text-xs text-cgr-navy">{dictamen.id}</span>
                                                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                                                    {dictamen.rol_en_linea}
                                                                </span>
                                                            </div>
                                                            <h3 className="font-serif text-xl font-semibold text-cgr-navy">{dictamen.titulo}</h3>
                                                            <p className="text-sm leading-7 text-slate-600">{keyDictamenContext(selectedLine, dictamen)}</p>
                                                        </div>
                                                        <p className="text-sm text-slate-500">{formatSimpleDate(dictamen.fecha, "Sin fecha")}</p>
                                                    </div>
                                                    <div className="mt-4 flex flex-wrap gap-3">
                                                        <Link
                                                            to={`/dictamen/${dictamen.id}`}
                                                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/20 hover:bg-slate-50"
                                                        >
                                                            Leer dictamen
                                                            <ArrowUpRight className="h-4 w-4" />
                                                        </Link>
                                                        {isRepresentative && (
                                                            <span className="inline-flex items-center gap-2 rounded-full bg-cgr-gold/15 px-3 py-1.5 text-sm font-medium text-cgr-navy">
                                                                Conviene empezar aquí
                                                            </span>
                                                        )}
                                                        {isPivot && (
                                                            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
                                                                Revisa el cambio visible
                                                            </span>
                                                        )}
                                                    </div>
                                                </article>
                                            </div>
                                        );
                                    })}
                                </div>
                                )}
                            </section>

                            {selectedLine.top_fuentes_legales.length > 0 && (
                                <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <Scale className="h-4 w-4 text-cgr-navy" />
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Normas que estructuran esta línea</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedLine.top_fuentes_legales.slice(0, 6).map((fuente) => (
                                            <span
                                                key={`${fuente.tipo_norma}-${fuente.numero}`}
                                                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-cgr-navy"
                                            >
                                                {formatFuenteLabel(fuente.tipo_norma, fuente.numero)}
                                            </span>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </main>

                        <aside className="space-y-5">
                            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Consulta activa</p>
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Consulta original</p>
                                        <p className="mt-2 font-serif text-xl font-semibold text-cgr-navy">
                                            {visibleOverviewQuery || "Panorama jurisprudencial reciente"}
                                        </p>
                                    </div>
                                    {visibleInterpretedQuery && visibleInterpretedQuery.trim() !== (visibleOverviewQuery ?? "").trim() && (
                                        <div className="rounded-[1rem] border border-blue-100 bg-blue-50/70 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-navy">Lectura semántica de la consulta</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-700">{visibleInterpretedQuery}</p>
                                        </div>
                                    )}
                                    <div className="grid gap-3">
                                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Materia encontrada</p>
                                            <p className="mt-2 text-sm font-semibold text-cgr-navy">{simplifyDoctrineLanguage(result.overview.materiaEvaluated || "Jurisprudencia administrativa")}</p>
                                        </div>
                                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cobertura visible</p>
                                            <p className="mt-2 text-sm font-semibold text-cgr-navy">{formatDateRange(selectedLine)}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {primaryEntry && (
                                <section className={cn("rounded-[1.6rem] border p-5 shadow-sm", primaryEntry.tone)}>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                                        {primaryEntryDiffersFromLine ? "Antes de profundizar" : "Por dónde entrar"}
                                    </p>
                                    <Link
                                        to={`/dictamen/${primaryEntry.dictamenId}`}
                                        className="mt-4 inline-flex items-center gap-2 font-mono text-base font-semibold underline decoration-current/20 underline-offset-4"
                                    >
                                        {primaryEntry.dictamenId}
                                        <ArrowUpRight className="h-4 w-4" />
                                    </Link>
                                    <h3 className="mt-3 font-serif text-xl font-semibold text-cgr-navy">{primaryEntry.title}</h3>
                                    <p className="mt-3 text-sm leading-7 text-slate-700">{primaryEntry.summary}</p>
                                    {primaryEntryDiffersFromLine && (
                                        <p className="mt-3 text-sm leading-7 text-slate-700">
                                            Revise primero este dictamen porque marca el estado actual visible de la materia. Después, si quiere profundizar en la línea seleccionada, siga la lectura sugerida del panel principal.
                                        </p>
                                    )}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <span className="rounded-full border border-current/10 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
                                            {primaryEntry.badge}
                                        </span>
                                    </div>
                                </section>
                            )}

                            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <Landmark className="h-4 w-4 text-cgr-navy" />
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dónde profundizar</p>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {focusTargets.map((target) => (
                                        <Link
                                            key={`${target.kind}-${target.id}`}
                                            to={`/dictamen/${target.id}`}
                                            className={cn(
                                                "block rounded-[1rem] border p-4 transition",
                                                target.kind === "cambio"
                                                    ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                                                    : target.kind === "entrada"
                                                        ? "border-cgr-red/20 bg-cgr-red/5 hover:bg-cgr-red/10"
                                                        : target.kind === "ancla"
                                                            ? "border-blue-100 bg-blue-50/70 hover:bg-blue-50"
                                                            : "border-slate-200 bg-slate-50 hover:border-cgr-navy/20 hover:bg-white"
                                            )}
                                        >
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{target.label}</p>
                                            <p className="mt-2 font-mono text-xs text-cgr-navy">{target.id}</p>
                                            <p className="mt-2 text-sm font-semibold text-cgr-navy">{target.title}</p>
                                        </Link>
                                    ))}
                                </div>
                            </section>

                            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Siguiente acción</p>
                                <p className="mt-3 text-sm leading-6 text-slate-600">
                                    Abra la ruta de lectura si quiere recorrer la línea completa. Si ya identificó el punto relevante, pase directo al dictamen guía o al dictamen inicial.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsSlideOverOpen(true)}
                                        className="inline-flex items-center gap-2 rounded-full bg-cgr-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#123d67]"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Abrir lectura
                                    </button>
                                    <Link
                                        to="/buscar"
                                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/20 hover:bg-slate-50"
                                    >
                                        Búsqueda avanzada
                                        <ArrowUpRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </section>
                        </aside>
                    </div>
                </>
            )}

            <div
                className={cn("slide-over-overlay", isSlideOverOpen && "open")}
                onClick={() => setIsSlideOverOpen(false)}
            />
            <div className={cn("slide-over-panel", isSlideOverOpen && "open")}>
                {selectedLine && (
                    <div className="p-6 md:p-8">
                        <button
                            onClick={() => setIsSlideOverOpen(false)}
                            className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-cgr-navy"
                        >
                            <ChevronRight className="h-4 w-4 rotate-180" />
                            Cerrar panel
                        </button>
                        <DoctrineReadingWorkspace
                            line={selectedLine}
                            query={visibleOverviewQuery ?? undefined}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
