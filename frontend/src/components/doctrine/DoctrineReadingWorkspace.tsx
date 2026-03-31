import { ArrowUpRight, BookOpenText, ChevronRight, GitBranch, Landmark, LibraryBig, Scale, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { DoctrineLine, DoctrineKeyDictamen } from "../../types";
import { cn } from "../../lib/utils";
import { formatSimpleDate } from "../../lib/date";
import { doctrinalStateNarrative, lineClarityLabel, relationPatternNarrative, simplifyDoctrineLanguage } from "../../lib/doctrineLanguage";

function normalizeDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortTimeline(items: DoctrineKeyDictamen[]) {
    return [...items].sort((left, right) => {
        const leftDate = normalizeDate(left.fecha)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = normalizeDate(right.fecha)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
    });
}

function roleTone(role: DoctrineKeyDictamen["rol_en_linea"], isRepresentative: boolean) {
    if (isRepresentative) {
        return "border-cgr-navy/20 bg-cgr-navy text-white";
    }

    if (role === "núcleo doctrinal") {
        return "border-cgr-gold/30 bg-cgr-gold/10 text-cgr-navy";
    }

    if (role === "pivote de cambio") {
        return "border-cgr-red/25 bg-cgr-red/10 text-cgr-red";
    }

    return "border-slate-200 bg-white text-slate-700";
}

function roleHint(index: number, total: number, isRepresentative: boolean) {
    if (isRepresentative) return "dictamen guía";
    if (index === 0) return "primer hito visible";
    if (index === total - 1) return "último hito visible";
    return "punto de apoyo";
}

function coherenceActionHints(line: DoctrineLine) {
    const hints: string[] = [];
    if (line.structure_adjustments?.action === "merge_clusters") {
        hints.push("criterio ya consolidado");
    }
    if (line.coherence_signals.coherence_status === "fragmentada") {
        hints.push("la agrupación podría refinarse");
    }
    if (line.coherence_signals.outlier_probability >= 0.22) {
        hints.push("hay decisiones con relación poco clara");
    }
    if (line.coherence_signals.descriptor_noise_score >= 0.4) {
        hints.push("conviene ordenar mejor los nombres del criterio");
    }
    return hints.slice(0, 3);
}

function pivotLabel(signal: NonNullable<DoctrineLine["pivot_dictamen"]>["signal"]) {
    if (signal === "pivote_de_cambio") return "decisión que marca un cambio en el criterio";
    return "decisión que marca un hito visible del criterio";
}

interface DoctrineReadingWorkspaceProps {
    line: DoctrineLine;
    query?: string;
}

export function DoctrineReadingWorkspace({ line, query }: DoctrineReadingWorkspaceProps) {
    const representative = line.key_dictamenes.find((item) => item.id === line.representative_dictamen_id)
        ?? line.key_dictamenes[0]
        ?? {
            id: line.representative_dictamen_id,
            titulo: "Abrir dictamen representativo",
            fecha: line.time_span.to,
            rol_en_linea: "representativo" as const
        };
    const timeline = sortTimeline(line.key_dictamenes);
    const coherenceHints = coherenceActionHints(line);

    return (
        <div className="space-y-5">
            <section className="overflow-hidden rounded-[1.75rem] border border-cgr-navy/10 bg-gradient-to-br from-cgr-navy via-[#113a63] to-[#0a223e] text-white shadow-xl">
                <div className="space-y-5 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cgr-gold">
                                <LibraryBig className="h-3.5 w-3.5" />
                                Lectura sugerida
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-serif text-3xl font-semibold leading-tight text-white">{line.title}</h3>
                                <p className="max-w-2xl text-sm leading-7 text-blue-100">{simplifyDoctrineLanguage(line.summary)}</p>
                            </div>
                        </div>

                        <Link
                            to={`/dictamen/${line.representative_dictamen_id}`}
                            className="inline-flex items-center gap-2 rounded-full bg-cgr-gold px-4 py-2 text-sm font-semibold text-cgr-navy transition hover:bg-[#f3d86c]"
                        >
                            Abrir dictamen guía
                            <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>

                    <div className="rounded-[1.35rem] border border-white/10 bg-white/10 p-5">
                        <div className="space-y-5">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Dictamen más cercano a su búsqueda</p>
                                <p className="mt-2 font-mono text-sm text-cgr-gold">{line.semantic_anchor_dictamen?.id ?? representative.id}</p>
                                <p className="mt-2 font-serif text-2xl font-semibold text-white">
                                    {line.semantic_anchor_dictamen?.titulo ?? representative.titulo}
                                </p>
                                <p className="mt-3 text-sm leading-6 text-blue-100">
                                    {simplifyDoctrineLanguage(line.reading_priority_reason ?? line.semantic_anchor_dictamen?.reason ?? "Es el dictamen que conviene leer primero para entender este criterio.")}
                                </p>
                            </div>

                            <div className="border-t border-white/10 pt-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Período en que este criterio aparece</p>
                                <p className="mt-2 text-sm text-white">
                                    {formatSimpleDate(line.time_span.from, "s/d")} → {formatSimpleDate(line.time_span.to, "s/d")}
                                </p>
                            </div>

                            <div className="border-t border-white/10 pt-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Cómo se comporta el criterio</p>
                                <div className="mt-2 flex items-start gap-2 text-sm text-white">
                                    <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-cgr-gold" />
                                    <span>{doctrinalStateNarrative(line.doctrinal_state)}</span>
                                </div>
                                <p className="mt-2 text-xs leading-5 text-blue-100">{simplifyDoctrineLanguage(line.doctrinal_state_reason)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ruta de lectura sugerida</p>
                        </div>

                    <div className="mt-5 space-y-5">
                        {timeline.map((dictamen, index) => {
                            const isRepresentative = dictamen.id === line.representative_dictamen_id;
                            const isPivot = dictamen.id === line.pivot_dictamen?.id;
                            return (
                                <div key={dictamen.id} className="grid grid-cols-[20px_1fr] gap-4">
                                    <div className="flex flex-col items-center">
                                        <span className={cn(
                                            "mt-1 h-3.5 w-3.5 rounded-full border-2",
                                            isRepresentative
                                                ? "border-cgr-gold bg-cgr-gold"
                                                : isPivot
                                                    ? "border-cgr-red bg-cgr-red"
                                                    : "border-cgr-navy/20 bg-white"
                                        )} />
                                        {index < timeline.length - 1 && <span className="mt-2 h-full w-px bg-slate-200" />}
                                    </div>

                                    <article className={cn(
                                        "rounded-[1.25rem] border p-4 transition hover:border-cgr-navy/20 hover:shadow-sm",
                                        isRepresentative ? "border-cgr-navy/20 bg-cgr-navy/[0.03]" : "border-slate-200 bg-slate-50/70"
                                    )}>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-xs text-cgr-navy">{dictamen.id}</span>
                                                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", roleTone(dictamen.rol_en_linea, isRepresentative))}>
                                                        {dictamen.rol_en_linea}
                                                    </span>
                                                </div>
                                                <h4 className="font-serif text-xl font-semibold text-cgr-navy">{dictamen.titulo}</h4>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                    {isPivot ? "decisión que marca un cambio" : roleHint(index, timeline.length, isRepresentative)}
                                                </p>
                                                <p className="mt-2 text-sm text-slate-600">{formatSimpleDate(dictamen.fecha)}</p>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <Link
                                                to={`/dictamen/${dictamen.id}`}
                                                className="inline-flex items-center gap-2 rounded-full border border-cgr-navy/10 bg-white px-3 py-2 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/25 hover:bg-slate-50"
                                            >
                                                Ver dictamen
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                            {isRepresentative && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-cgr-gold/15 px-3 py-2 text-sm font-medium text-cgr-navy">
                                                    <BookOpenText className="h-4 w-4" />
                                                    Conviene empezar aquí
                                                </span>
                                            )}
                                            {isPivot && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-cgr-red/10 px-3 py-2 text-sm font-medium text-cgr-red">
                                                    <GitBranch className="h-4 w-4" />
                                                    {line.pivot_dictamen ? pivotLabel(line.pivot_dictamen.signal) : "decisión relevante"}
                                                </span>
                                            )}
                                        </div>
                                    </article>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-5">
                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cómo se aplica este criterio</p>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-600">{simplifyDoctrineLanguage(line.doctrinal_state_reason)}</p>
                        {line.reading_priority_reason && (
                            <p className="mt-3 text-sm leading-6 text-slate-600">{simplifyDoctrineLanguage(line.reading_priority_reason)}</p>
                        )}
                        {line.pivot_dictamen && (
                            <div className="mt-4 rounded-[1.2rem] border border-cgr-red/15 bg-cgr-red/5 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-red">Dictamen pivote</p>
                                <div className="mt-2 flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-mono text-xs text-cgr-red">{line.pivot_dictamen.id}</p>
                                        <p className="mt-2 font-serif text-lg font-semibold text-cgr-navy">{line.pivot_dictamen.titulo}</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">{simplifyDoctrineLanguage(line.pivot_dictamen.reason)}</p>
                                    </div>
                                    <p className="text-sm text-slate-500">{formatSimpleDate(line.pivot_dictamen.fecha)}</p>
                                </div>
                                <Link
                                    to={`/dictamen/${line.pivot_dictamen.id}`}
                                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-cgr-red/15 bg-white px-3 py-2 text-sm font-semibold text-cgr-red transition hover:bg-cgr-red/5"
                                >
                                    Abrir pivote
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </div>
                        )}
                        {line.semantic_anchor_dictamen && (
                            <div className="mt-4 rounded-[1.2rem] border border-blue-200 bg-blue-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-navy">Más cercano a su búsqueda</p>
                                <div className="mt-2 flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-mono text-xs text-cgr-navy">{line.semantic_anchor_dictamen.id}</p>
                                        <p className="mt-2 font-serif text-lg font-semibold text-cgr-navy">{line.semantic_anchor_dictamen.titulo}</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">{simplifyDoctrineLanguage(line.semantic_anchor_dictamen.reason)}</p>
                                    </div>
                                    <p className="text-sm text-slate-500">{formatSimpleDate(line.semantic_anchor_dictamen.fecha, "Sin fecha")}</p>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <ChevronRight className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Patrón de decisiones</p>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-600">{simplifyDoctrineLanguage(line.relation_dynamics.summary)}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Consolidan</p>
                                <p className="mt-2 text-2xl font-semibold text-cgr-navy">{line.relation_dynamics.consolida}</p>
                            </div>
                            <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Desarrollan</p>
                                <p className="mt-2 text-2xl font-semibold text-cgr-navy">{line.relation_dynamics.desarrolla}</p>
                            </div>
                            <div className="rounded-[1rem] border border-cgr-red/20 bg-cgr-red/5 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-red">Ajustan</p>
                                <p className="mt-2 text-2xl font-semibold text-cgr-navy">{line.relation_dynamics.ajusta}</p>
                            </div>
                        </div>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Patrón dominante: {relationPatternNarrative(line)}
                        </p>
                    </section>

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Claridad de la línea</p>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className={cn(
                                "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
                                line.coherence_signals.coherence_status === "fragmentada"
                                    ? "border-cgr-red/20 bg-cgr-red/10 text-cgr-red"
                                    : line.coherence_signals.coherence_status === "mixta"
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            )}>
                                {lineClarityLabel(line)}
                            </span>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-600">{simplifyDoctrineLanguage(line.coherence_signals.summary)}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cercanía entre dictámenes</p>
                                <p className="mt-2 text-2xl font-semibold text-cgr-navy">{line.coherence_signals.cluster_cohesion_score}</p>
                            </div>
                            <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Riesgo de mezcla</p>
                                <p className="mt-2 text-2xl font-semibold text-cgr-navy">{line.coherence_signals.fragmentation_risk}</p>
                            </div>
                        </div>
                        {line.structure_adjustments && (
                            <p className="mt-4 text-sm leading-6 text-emerald-800">{simplifyDoctrineLanguage(line.structure_adjustments.note)}</p>
                        )}
                        {coherenceHints.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Qué conviene revisar</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {coherenceHints.map((hint) => (
                                        <span
                                            key={hint}
                                            className={cn(
                                                "rounded-full border px-3 py-1.5 text-xs font-medium",
                                                hint === "fusión estructural aplicada"
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                    : "border-cgr-red/15 bg-cgr-red/5 text-cgr-red"
                                            )}
                                        >
                                            {hint}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Scale className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dictámenes clave</p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {line.core_dictamen_ids.map((id) => (
                                <Link
                                    key={id}
                                    to={`/dictamen/${id}`}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-700 transition hover:border-cgr-navy/20 hover:text-cgr-navy"
                                >
                                    {id}
                                </Link>
                            ))}
                        </div>
                    </section>

                    {line.top_descriptores_AI.length > 0 && (
                        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Landmark className="h-4 w-4 text-cgr-navy" />
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Descriptores dominantes</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {line.top_descriptores_AI.map((descriptor) => (
                                    <span key={descriptor} className="rounded-full border border-cgr-navy/10 bg-slate-50 px-3 py-1.5 text-sm text-cgr-navy">
                                        {descriptor}
                                    </span>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Siguiente acción</p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                            Abra el dictamen representativo y luego recorra la línea en orden temporal para ver cómo se consolida o cambia el criterio.
                            {query ? ` Esta línea viene de la consulta “${query}”.` : ""}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <Link
                                to={`/dictamen/${line.representative_dictamen_id}`}
                                className="inline-flex items-center gap-2 rounded-full bg-cgr-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#123d67]"
                            >
                                Abrir dictamen guía
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                            <Link
                                to="/buscar"
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/20 hover:bg-slate-50"
                            >
                                Búsqueda avanzada
                                <ArrowUpRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </section>
                </div>
            </section>
        </div>
    );
}
