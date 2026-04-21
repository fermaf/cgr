import { ArrowUpRight, BookOpenText, ChevronRight, GitBranch, Landmark, LibraryBig, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import type { DoctrineLine, DoctrineKeyDictamen } from "../../types";
import { cn } from "../../lib/utils";
import { formatSimpleDate } from "../../lib/date";
import { graphStatusNarrative, simplifyDoctrineLanguage } from "../../lib/doctrineLanguage";

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

function statusTone(line: DoctrineLine) {
    const status = line.graph_doctrinal_status?.status ?? line.doctrinal_state;
    if (status === "criterio_en_revision" || status === "criterio_tensionado" || status === "bajo_tension") {
        return "border-cgr-red/20 bg-cgr-red/5 text-cgr-red";
    }
    if (status === "criterio_estable" || status === "consolidado") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    return "border-amber-200 bg-amber-50 text-amber-700";
}

function roleTone(role: DoctrineKeyDictamen["rol_en_linea"], isRepresentative: boolean) {
    if (isRepresentative) {
        return "border-cgr-navy/20 bg-cgr-navy text-white";
    }

    if (role === "núcleo doctrinal") {
        return "border-cgr-gold/30 bg-cgr-gold/10 text-cgr-navy";
    }

    if (role === "pivote de cambio") {
        return "border-amber-200 bg-amber-100 text-amber-800";
    }

    return "border-slate-200 bg-white text-slate-700";
}

function firstReadId(line: DoctrineLine) {
    return line.semantic_anchor_dictamen?.id ?? line.representative_dictamen_id;
}

function firstReadTitle(line: DoctrineLine) {
    return line.semantic_anchor_dictamen?.titulo
        ?? line.key_dictamenes.find((item) => item.id === line.representative_dictamen_id)?.titulo
        ?? line.title;
}

function firstReadReason(line: DoctrineLine) {
    return simplifyDoctrineLanguage(
        line.reading_priority_reason
        ?? line.semantic_anchor_dictamen?.reason
        ?? "Es el mejor punto de entrada para entender la línea."
    );
}

function dictamenContext(line: DoctrineLine, dictamen: DoctrineKeyDictamen) {
    if (dictamen.id === line.representative_dictamen_id) {
        return "Concentra la lectura principal del criterio y conviene abrirlo primero.";
    }
    if (dictamen.id === line.semantic_anchor_dictamen?.id) {
        return simplifyDoctrineLanguage(line.semantic_anchor_dictamen.reason);
    }
    if (dictamen.id === line.pivot_dictamen?.id) {
        return simplifyDoctrineLanguage(line.pivot_dictamen.reason);
    }
    if (dictamen.rol_en_linea === "núcleo doctrinal") {
        return "Fija la base del criterio y ayuda a distinguirlo de problemas cercanos.";
    }
    return "Sirve para ver cómo la línea se proyecta o se ajusta en el tiempo.";
}

function formatFuenteLabel(tipo: string, numero: string | null) {
    if (tipo === "Ley" && numero === "18834") return "Estatuto Administrativo";
    if (tipo === "Ley" && numero === "18883") return "Estatuto Administrativo Municipal";
    if (tipo === "Ley" && numero === "19880") return "Ley de Procedimiento Administrativo";
    if (tipo === "Ley" && numero === "18575") return "Ley de Bases de la Administración";
    return numero ? `${tipo} ${numero}` : tipo;
}

function sameDictamen(left?: string | null, right?: string | null) {
    return Boolean(left && right && left === right);
}

interface DoctrineReadingWorkspaceProps {
    line: DoctrineLine;
    query?: string;
}

export function DoctrineReadingWorkspace({ line, query }: DoctrineReadingWorkspaceProps) {
    const timeline = sortTimeline(line.key_dictamenes);
    const firstReadMatchesRepresentative = sameDictamen(firstReadId(line), line.representative_dictamen_id);
    const pivotMatchesRepresentative = sameDictamen(line.pivot_dictamen?.id, line.representative_dictamen_id);
    const pivotMatchesFirstRead = sameDictamen(line.pivot_dictamen?.id, firstReadId(line));

    return (
        <div className="space-y-5">
            <section className="overflow-hidden rounded-[1.75rem] border border-cgr-navy/10 bg-gradient-to-br from-cgr-navy via-[#113a63] to-[#0a223e] text-white shadow-xl">
                <div className="space-y-5 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cgr-gold">
                                <LibraryBig className="h-3.5 w-3.5" />
                                Ruta de lectura
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-serif text-3xl font-semibold leading-tight text-white">{line.title}</h3>
                                <p className="max-w-2xl text-sm leading-7 text-blue-100">
                                    {simplifyDoctrineLanguage(line.summary)}
                                    {query ? ` Esta lectura parte de la consulta “${query}”.` : ""}
                                </p>
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

                    <div className={cn("grid gap-4", pivotMatchesRepresentative || pivotMatchesFirstRead ? "md:grid-cols-2" : "md:grid-cols-3")}>
                        <div className="rounded-[1.2rem] border border-white/10 bg-white/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Estado jurisprudencial visible</p>
                            <div className={cn("mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", statusTone(line))}>
                                {String(line.graph_doctrinal_status?.status ?? line.doctrinal_state).replace(/_/g, " ")}
                            </div>
                            <p className="mt-3 text-sm leading-6 text-blue-100">
                                {simplifyDoctrineLanguage(line.graph_doctrinal_status?.summary ?? graphStatusNarrative(line))}
                            </p>
                        </div>

                        <div className="rounded-[1.2rem] border border-white/10 bg-white/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">
                                {firstReadMatchesRepresentative ? "Dictamen que conviene leer primero" : "Qué leer primero"}
                            </p>
                            <p className="mt-2 font-mono text-sm text-cgr-gold">{firstReadId(line)}</p>
                            <p className="mt-2 text-sm font-semibold text-white">{firstReadTitle(line)}</p>
                            <p className="mt-2 text-sm leading-6 text-blue-100">{firstReadReason(line)}</p>
                        </div>

                        {!pivotMatchesRepresentative && !pivotMatchesFirstRead && (
                            <div className="rounded-[1.2rem] border border-white/10 bg-white/10 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Cambio visible</p>
                                <p className="mt-2 font-mono text-sm text-cgr-gold">{line.pivot_dictamen?.id ?? "Sin hito distinto"}</p>
                                <p className="mt-2 text-sm font-semibold text-white">{line.pivot_dictamen?.titulo ?? "Sin hito distinto"}</p>
                                <p className="mt-2 text-sm leading-6 text-blue-100">
                                    {simplifyDoctrineLanguage(line.pivot_dictamen?.reason ?? "No aparece un segundo dictamen distinto que cambie la lectura principal.")}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <BookOpenText className="h-4 w-4 text-cgr-navy" />
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Secuencia de lectura</p>
                    </div>

                    {timeline.length === 1 ? (
                        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs text-cgr-navy">{timeline[0].id}</span>
                                        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", roleTone(timeline[0].rol_en_linea, true))}>
                                            {timeline[0].rol_en_linea}
                                        </span>
                                    </div>
                                    <h4 className="font-serif text-xl font-semibold text-cgr-navy">{timeline[0].titulo}</h4>
                                    <p className="text-sm leading-7 text-slate-600">{firstReadReason(line)}</p>
                                </div>
                                <p className="text-sm text-slate-500">{formatSimpleDate(timeline[0].fecha, "Sin fecha")}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <Link
                                    to={`/dictamen/${timeline[0].id}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-cgr-navy/10 bg-white px-3 py-2 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/25 hover:bg-slate-50"
                                >
                                    Leer dictamen
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                                <span className="inline-flex items-center gap-2 rounded-full bg-cgr-gold/15 px-3 py-2 text-sm font-medium text-cgr-navy">
                                    No hay otra secuencia visible que revisar
                                </span>
                            </div>
                        </div>
                    ) : (
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
                                                    ? "border-amber-500 bg-amber-500"
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
                                                <p className="text-sm leading-7 text-slate-600">{dictamenContext(line, dictamen)}</p>
                                            </div>

                                            <p className="text-sm text-slate-500">{formatSimpleDate(dictamen.fecha, "Sin fecha")}</p>
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <Link
                                                to={`/dictamen/${dictamen.id}`}
                                                className="inline-flex items-center gap-2 rounded-full border border-cgr-navy/10 bg-white px-3 py-2 text-sm font-semibold text-cgr-navy transition hover:border-cgr-navy/25 hover:bg-slate-50"
                                            >
                                                Leer dictamen
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                            {isRepresentative && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-cgr-gold/15 px-3 py-2 text-sm font-medium text-cgr-navy">
                                                    Conviene empezar aquí
                                                </span>
                                            )}
                                            {isPivot && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
                                                    <GitBranch className="h-4 w-4" />
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

                <div className="space-y-5">
                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cómo leer esta línea</p>
                        </div>
                        <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                            <p>{firstReadReason(line)}</p>
                            <p>{simplifyDoctrineLanguage(line.graph_doctrinal_status?.summary ?? line.doctrinal_state_reason)}</p>
                            {line.pivot_dictamen && !pivotMatchesRepresentative && !pivotMatchesFirstRead && (
                                <div className="rounded-[1rem] border border-amber-200 bg-amber-50 p-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Cambio visible</p>
                                    <p className="mt-2 font-mono text-xs text-amber-900">{line.pivot_dictamen.id}</p>
                                    <p className="mt-2 font-serif text-lg font-semibold text-cgr-navy">{line.pivot_dictamen.titulo}</p>
                                    <p className="mt-2">{simplifyDoctrineLanguage(line.pivot_dictamen.reason)}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {line.top_fuentes_legales.length > 0 && (
                        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Scale className="h-4 w-4 text-cgr-navy" />
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Normas predominantes</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {line.top_fuentes_legales.slice(0, 6).map((fuente) => (
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

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Landmark className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Profundizar</p>
                        </div>
                        <div className="mt-4 space-y-3">
                            <Link
                                to={`/dictamen/${line.representative_dictamen_id}`}
                                className="block rounded-[1rem] border border-slate-200 bg-slate-50 p-4 transition hover:border-cgr-navy/20 hover:bg-white"
                            >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Dictamen guía</p>
                                <p className="mt-2 font-mono text-xs text-cgr-navy">{line.representative_dictamen_id}</p>
                            </Link>
                            {line.semantic_anchor_dictamen && line.semantic_anchor_dictamen.id !== line.representative_dictamen_id && (
                                <Link
                                    to={`/dictamen/${line.semantic_anchor_dictamen.id}`}
                                    className="block rounded-[1rem] border border-blue-100 bg-blue-50/70 p-4 transition hover:bg-blue-50"
                                >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cgr-navy">Más cercano a la consulta</p>
                                    <p className="mt-2 font-mono text-xs text-cgr-navy">{line.semantic_anchor_dictamen.id}</p>
                                </Link>
                            )}
                            {line.pivot_dictamen && (
                                <Link
                                    to={`/dictamen/${line.pivot_dictamen.id}`}
                                    className="block rounded-[1rem] border border-amber-200 bg-amber-50 p-4 transition hover:bg-amber-100"
                                >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Cambio visible</p>
                                    <p className="mt-2 font-mono text-xs text-amber-900">{line.pivot_dictamen.id}</p>
                                </Link>
                            )}
                        </div>
                    </section>

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Siguiente acción</p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                            Abra el dictamen guía y luego compare con el cambio visible o con el dictamen más cercano a su consulta si necesita afinar el encuadre.
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
