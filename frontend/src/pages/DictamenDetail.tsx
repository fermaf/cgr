import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Building2,
  Calendar,
  Download,
  FileCheck,
  Landmark,
  Share2,
  ShieldAlert,
  Sparkles,
  Tag
} from "lucide-react";
import type { DictamenResponse, RelacionCausa, RelacionEfecto } from "../types";
import { cn } from "../lib/utils";
import { formatSimpleDate } from "../lib/date";
import { buildLegalSourceCards } from "../lib/legalSources";
import { DoctrineVigilanceBadge } from "../components/doctrine/DoctrineVigilanceBadge";
import { ReadingRoleIndicator } from "../components/doctrine/ReadingRoleIndicator";

function relationBucket(tipoAccion: string): "consolida" | "desarrolla" | "ajusta" {
    if (["confirmado", "aplicado"].includes(tipoAccion)) return "consolida";
    if (["complementado", "aclarado"].includes(tipoAccion)) return "desarrolla";
    return "ajusta";
}

function relationBucketLabel(bucket: "consolida" | "desarrolla" | "ajusta") {
    if (bucket === "consolida") return "consolidación";
    if (bucket === "desarrolla") return "desarrollo";
    return "ajuste";
}

function outgoingRelationPhrase(tipoAccion: string) {
    if (tipoAccion === "aplicado") return "Este dictamen aplica criterio de";
    if (tipoAccion === "confirmado") return "Este dictamen confirma criterio de";
    if (tipoAccion === "complementado") return "Este dictamen complementa criterio de";
    if (tipoAccion === "aclarado") return "Este dictamen aclara criterio de";
    if (tipoAccion === "alterado") return "Este dictamen altera criterio de";
    if (tipoAccion === "reconsiderado") return "Este dictamen reconsidera criterio de";
    if (tipoAccion === "reconsiderado_parcialmente") return "Este dictamen limita parcialmente criterio de";
    if (tipoAccion === "reactivado") return "Este dictamen reactiva criterio de";
    return "Este dictamen se relaciona con";
}

function incomingRelationPhrase(tipoAccion: string) {
    if (tipoAccion === "aplicado") return "Fue usado después para aplicar su criterio";
    if (tipoAccion === "confirmado") return "Fue usado después para confirmar su criterio";
    if (tipoAccion === "complementado") return "Fue usado después para complementar su criterio";
    if (tipoAccion === "aclarado") return "Fue usado después para aclarar su criterio";
    if (tipoAccion === "alterado") return "Fue usado después para ajustar o alterar su criterio";
    if (tipoAccion === "reconsiderado") return "Fue usado después para reconsiderar su criterio";
    if (tipoAccion === "reconsiderado_parcialmente") return "Fue usado después para limitar parcialmente su criterio";
    if (tipoAccion === "reactivado") return "Fue usado después para reactivar su criterio";
    return "Fue utilizado por un dictamen posterior";
}

function summarizeRelationRole(relacionesCausa: RelacionCausa[], relacionesEfecto: RelacionEfecto[]) {
    const outgoingBuckets = relacionesEfecto.map((relation) => relationBucket(relation.tipo_accion));
    const incomingBuckets = relacionesCausa.map((relation) => relationBucket(relation.tipo_accion));

    if (outgoingBuckets.includes("ajusta")) {
        return "Este dictamen interviene sobre criterio previo ajustándolo o reordenándolo.";
    }
    if (outgoingBuckets.includes("desarrolla")) {
        return "Este dictamen desarrolla criterio previo mediante aclaraciones o complementos.";
    }
    if (outgoingBuckets.includes("consolida")) {
        return "Este dictamen se apoya en criterio previo para consolidar una línea visible.";
    }
    if (incomingBuckets.length > 0) {
        return "Este dictamen ya funciona como apoyo jurisprudencial para decisiones posteriores.";
    }
    return "Este dictamen aún muestra pocas relaciones jurídicas materializadas en la red visible.";
}

function buildDoctrinalPositionSummary(relacionesCausa: RelacionCausa[], relacionesEfecto: RelacionEfecto[]) {
    const outgoingAdjust = relacionesEfecto.filter((relation) => relationBucket(relation.tipo_accion) === "ajusta");
    const outgoingDevelop = relacionesEfecto.filter((relation) => relationBucket(relation.tipo_accion) === "desarrolla");
    const outgoingConsolidate = relacionesEfecto.filter((relation) => relationBucket(relation.tipo_accion) === "consolida");
    const incomingAdjust = relacionesCausa.filter((relation) => relationBucket(relation.tipo_accion) === "ajusta");
    const incomingConsolidate = relacionesCausa.filter((relation) => relationBucket(relation.tipo_accion) === "consolida");

    if (outgoingAdjust.length > 0) {
        return "Criterio ajustado frente a decisiones previas visibles.";
    }
    if (outgoingDevelop.length > 0) {
        return "Criterio en desarrollo a partir de decisiones previas visibles.";
    }
    if (outgoingConsolidate.length > 0) {
        return "Criterio que se inserta en una línea ya consolidada.";
    }
    if (incomingAdjust.length > 0) {
        return "Criterio retomado después para reordenar o limitar su alcance.";
    }
    if (incomingConsolidate.length > 0) {
        return "Criterio sostenido por decisiones posteriores.";
    }
    if (relacionesCausa.length > 0 || relacionesEfecto.length > 0) {
        return "Criterio ya integrado en una secuencia visible de decisiones relacionadas.";
    }
    return "Red visible todavía acotada para este dictamen.";
}

function relationTone(bucket: "consolida" | "desarrolla" | "ajusta") {
    if (bucket === "consolida") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (bucket === "desarrolla") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-cgr-red/20 bg-cgr-red/5 text-cgr-red";
}

function extractText(source: unknown): string | null {
    if (!source || typeof source !== "object") return null;
    const raw = source as Record<string, unknown>;
    const direct =
        raw.texto_completo ||
        raw.documento_completo ||
        raw.texto ||
        raw.Descripcion;
    if (typeof direct === "string" && direct.trim().length > 0) return direct;

    const nested = raw._source || raw.source || raw.raw_data;
    if (nested && typeof nested === "object") {
        const nestedRaw = nested as Record<string, unknown>;
        const nestedText =
            nestedRaw.texto_completo ||
            nestedRaw.documento_completo ||
            nestedRaw.texto ||
            nestedRaw.Descripcion;
        if (typeof nestedText === "string" && nestedText.trim().length > 0) return nestedText;
    }

    return null;
}

function RelationList({
    title,
    items,
    direction
}: {
    title: string;
    items: RelacionCausa[] | RelacionEfecto[];
    direction: "incoming" | "outgoing";
}) {
    if (items.length === 0) return null;

    return (
        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
            <div className="mt-4 space-y-3">
                {items.map((rel, idx) => {
                    const targetId = direction === "incoming"
                        ? (rel as RelacionCausa).origen_id
                        : (rel as RelacionEfecto).destino_id;
                    const date = direction === "incoming"
                        ? (rel as RelacionCausa).fecha_documento
                        : (rel as RelacionEfecto).fecha_documento;
                    const titleValue = direction === "incoming"
                        ? (rel as RelacionCausa).titulo
                        : (rel as RelacionEfecto).titulo;
                    const bucket = relationBucket(rel.tipo_accion);

                    return (
                        <Link
                            key={`${targetId}-${rel.tipo_accion}-${idx}`}
                            to={`/dictamen/${targetId}`}
                            className="block rounded-[1.15rem] border border-slate-200 bg-slate-50/70 p-4 transition hover:border-cgr-navy/20 hover:bg-white"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs text-cgr-navy">{targetId}</span>
                                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", relationTone(bucket))}>
                                            {relationBucketLabel(bucket)} · {rel.tipo_accion}
                                        </span>
                                    </div>
                                    {titleValue && <p className="font-serif text-base font-semibold text-cgr-navy">{titleValue}</p>}
                                    <p className="text-sm leading-6 text-slate-600">
                                        {direction === "incoming" ? incomingRelationPhrase(rel.tipo_accion) : outgoingRelationPhrase(rel.tipo_accion)}
                                    </p>
                                </div>
                                {date && <p className="shrink-0 text-xs text-slate-500">{formatSimpleDate(date, "Sin fecha")}</p>}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

export function DictamenDetail() {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<DictamenResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError(null);

        const fetchData = async () => {
            try {
                const response = await fetch(`/api/v1/dictamenes/${id}`);
                if (!response.ok) throw new Error("Documento no disponible");
                const detail = await response.json();
                setData(detail);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, [id]);

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="py-32 flex flex-col items-center justify-center relative z-10 w-full">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-cgr-blue rounded-full animate-spin mb-6" />
                <p className="text-cgr-navy font-sans uppercase tracking-widest text-sm font-semibold animate-pulse">Cargando expediente jurisprudencial...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-32 text-center text-cgr-red flex flex-col items-center gap-4 relative z-10 w-full bg-white p-10 rounded-2xl shadow-sm border border-slate-200">
                <AlertCircle className="w-12 h-12 text-cgr-red" />
                <p className="font-sans text-lg font-medium">{error}</p>
                <Link to="/" className="mt-4 px-6 py-2 bg-slate-50 border border-slate-200 text-cgr-navy hover:bg-slate-100 rounded-lg transition-colors font-semibold shadow-sm">
                    Volver a consulta jurisprudencial
                </Link>
            </div>
        );
    }

    if (!data) return null;

    const { meta, raw, extrae_jurisprudencia } = data;
    const isEnriched = meta.estado === "enriched" || meta.estado === "vectorized" || !!extrae_jurisprudencia;
    const textoIntegro = extractText(raw);
    const relacionesCausa = meta.relaciones_causa || [];
    const relacionesEfecto = meta.relaciones_efecto || [];
    const doctrinalPositionSummary = buildDoctrinalPositionSummary(relacionesCausa, relacionesEfecto);
    const relationRoleSummary = summarizeRelationRole(relacionesCausa, relacionesEfecto);
    const doctrinalPositionCounts = {
        consolida: [...relacionesCausa, ...relacionesEfecto].filter((rel) => relationBucket(rel.tipo_accion) === "consolida").length,
        desarrolla: [...relacionesCausa, ...relacionesEfecto].filter((rel) => relationBucket(rel.tipo_accion) === "desarrolla").length,
        ajusta: [...relacionesCausa, ...relacionesEfecto].filter((rel) => relationBucket(rel.tipo_accion) === "ajusta").length
    };
    const legalSourceCards = buildLegalSourceCards(meta.fuentes_legales || []);
    const title = extrae_jurisprudencia?.titulo || meta.criterio || meta.materia || `Dictamen ${meta.id}`;

    return (
        <div className="mx-auto max-w-[1600px] space-y-8 pb-20">
            <div className="flex items-center justify-between print:hidden">
                <Link
                    to="/"
                    className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-cgr-navy/20 hover:text-cgr-navy"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a consulta jurisprudencial
                </Link>

                <div className="flex gap-3">
                    <button
                        onClick={handlePrint}
                        title="Descargar PDF (Imprimir)"
                        className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:text-cgr-blue"
                    >
                        <Download className="h-5 w-5" />
                    </button>
                    <button
                        onClick={handleShare}
                        title="Compartir enlace"
                        className={cn(
                            "flex items-center gap-2 rounded-full border bg-white px-3 py-2.5 shadow-sm transition",
                            copySuccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:text-cgr-blue"
                        )}
                    >
                        <Share2 className="h-5 w-5" />
                        {copySuccess && <span className="text-[10px] font-bold uppercase tracking-wider">Copiado</span>}
                    </button>
                </div>
            </div>

            <header className="overflow-hidden rounded-[2rem] border border-cgr-navy/10 bg-gradient-to-br from-cgr-navy via-[#113a63] to-[#0a223e] text-white shadow-xl">
                <div className="space-y-6 p-6 md:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cgr-gold">
                                <BookOpen className="h-3.5 w-3.5" />
                                Expediente jurisprudencial
                            </div>
                            <div className="space-y-2">
                                <p className="font-mono text-sm text-cgr-gold">Dictamen {meta.id}</p>
                                <h1 className="font-serif text-3xl font-semibold leading-tight text-white md:text-4xl">{title}</h1>
                                <p className="max-w-3xl text-sm leading-7 text-blue-100">
                                    {extrae_jurisprudencia?.resumen || meta.resumen || "Lectura jurídica enriquecida del dictamen, con sus relaciones visibles y normativa citada."}
                                </p>
                            </div>
                        </div>

                        <span className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider",
                            isEnriched ? "border-blue-200/30 bg-white/10 text-white" : "border-white/15 bg-white/5 text-blue-100"
                        )}>
                            {isEnriched ? <><Sparkles className="h-4 w-4 text-cgr-gold" /> Lectura enriquecida</> : <><FileCheck className="h-4 w-4" /> Registro estándar</>}
                        </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-[1.35rem] border border-white/10 bg-white/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Fecha</p>
                            <p className="mt-3 text-sm font-semibold text-white">{formatSimpleDate(meta.fecha_documento, "Sin fecha")}</p>
                        </div>
                        <div className="rounded-[1.35rem] border border-white/10 bg-white/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">División</p>
                            <p className="mt-3 text-sm font-semibold text-white">{meta.division_nombre || "División no especificada"}</p>
                        </div>
                        <div className="rounded-[1.35rem] border border-white/10 bg-white/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Posición jurisprudencial visible</p>
                            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.12em] text-cgr-gold">{doctrinalPositionSummary}</p>
                        </div>
</div>
</div>
</header>

{meta.doctrinal_metadata && (
<section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
  <div className="flex items-center justify-between gap-4 flex-wrap">
    <div className="flex items-center gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estado doctrinal</p>
      <DoctrineVigilanceBadge
        estado={meta.doctrinal_metadata.estado_vigencia}
        confidence={meta.doctrinal_metadata.confidence_global}
        size="sm"
      />
    </div>
    <ReadingRoleIndicator
      role={meta.doctrinal_metadata.reading_role}
      weight={meta.doctrinal_metadata.reading_weight}
    />
  </div>
  <div className="mt-4 flex flex-wrap gap-6 text-xs text-slate-500">
    <div>
      <span className="font-medium text-slate-700">Rol principal:</span>{" "}
      {meta.doctrinal_metadata.rol_principal}
    </div>
    <div>
      <span className="font-medium text-slate-700">Intervención CGR:</span>{" "}
      {meta.doctrinal_metadata.estado_intervencion_cgr}
    </div>
    <div>
      <span className="font-medium text-slate-700">Actualidad:</span>{" "}
      {(meta.doctrinal_metadata.currentness_score * 100).toFixed(0)}%
    </div>
    <div>
      <span className="font-medium text-slate-700">Prioridad lectura:</span>{" "}
      {(meta.doctrinal_metadata.reading_weight * 100).toFixed(0)}%
    </div>
  </div>
</section>
)}

<div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
                <aside className="space-y-5">
                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Expediente</p>
                        <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                            <p>Este detalle mantiene el texto íntegro como centro de lectura y lo acompaña solo con el contexto jurisprudencial necesario para ubicar el dictamen.</p>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-700">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    {formatSimpleDate(meta.fecha_documento, "Sin fecha")}
                                </div>
                                <div className="flex items-center gap-2 text-slate-700">
                                    <Building2 className="h-4 w-4 text-slate-400" />
                                    {meta.division_nombre || "División no especificada"}
                                </div>
                            </div>
                        </div>
                    </section>

                    {meta.abogados && meta.abogados.length > 0 && (
                        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Firmantes</p>
                            <p className="mt-4 text-sm leading-6 text-slate-700">{meta.abogados.join(" • ")}</p>
                        </section>
                    )}

                    {meta.descriptores && meta.descriptores.length > 0 && (
                        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Tag className="h-4 w-4 text-cgr-navy" />
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Descriptores</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {meta.descriptores.map((tag) => (
                                    <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </section>
                    )}
                </aside>

                <main className="space-y-6">
                    {(extrae_jurisprudencia?.resumen || extrae_jurisprudencia?.analisis) && (
                        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-cgr-navy" />
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resumen jurisprudencial</p>
                            </div>
                            <div className="mt-4 space-y-4">
                                {extrae_jurisprudencia?.resumen && (
                                    <p className="font-serif text-xl leading-9 text-cgr-navy">{extrae_jurisprudencia.resumen}</p>
                                )}
                                {extrae_jurisprudencia?.analisis && (
                                    <p className="text-sm leading-7 text-slate-600 whitespace-pre-line">{extrae_jurisprudencia.analisis}</p>
                                )}
                            </div>
                        </section>
                    )}

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-cgr-navy" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ubicación jurisprudencial</p>
                        </div>
                        <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
                            <p className="font-serif text-xl leading-9 text-cgr-navy">{doctrinalPositionSummary}</p>
                            <p>{relationRoleSummary}</p>
                            {(relacionesCausa.length > 0 || relacionesEfecto.length > 0) && (
                                <p>
                                    En la red visible, este dictamen aparece en
                                    {" "}
                                    <strong className="text-cgr-navy">{doctrinalPositionCounts.consolida}</strong>
                                    {" "}
                                    relaciones de consolidación,
                                    {" "}
                                    <strong className="text-cgr-navy">{doctrinalPositionCounts.desarrolla}</strong>
                                    {" "}
                                    de desarrollo y
                                    {" "}
                                    <strong className="text-cgr-navy">{doctrinalPositionCounts.ajusta}</strong>
                                    {" "}
                                    de ajuste o revisión.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-6 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Texto íntegro</p>
                        </div>
                        <div className="px-6 py-8 md:px-10 md:py-10">
                            {meta.materia && (
                                <div className="mb-8 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-5">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Materia</p>
                                    <p className="mt-3 font-serif text-2xl leading-8 text-cgr-navy">{meta.materia}</p>
                                </div>
                            )}

                            <div className="prose prose-slate max-w-none whitespace-pre-wrap font-serif text-[1.06rem] leading-9 text-slate-800">
                                {textoIntegro ? (
                                    textoIntegro
                                ) : (
                                    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center not-prose">
                                        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                                        <p className="font-semibold text-slate-600">Texto original no disponible</p>
                                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                                            El contenido íntegro de este documento no fue almacenado digitalmente en nuestras bases de datos estructuradas en texto plano.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <RelationList
                            title="Dictámenes posteriores que usan este criterio"
                            items={relacionesCausa}
                            direction="incoming"
                        />
                        <RelationList
                            title="Criterio previo que este dictamen toma o ajusta"
                            items={relacionesEfecto}
                            direction="outgoing"
                        />
                    </div>
                </main>

                <aside className="space-y-5">
                    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cómo usar este dictamen</p>
                        <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                            <p className="font-semibold text-cgr-navy">{doctrinalPositionSummary}</p>
                            <p>{relationRoleSummary}</p>
                            <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Lectura práctica</p>
                                <ul className="mt-3 space-y-2">
                                    <li>Consolidan el criterio: <strong className="text-cgr-navy">{doctrinalPositionCounts.consolida}</strong></li>
                                    <li>Lo desarrollan: <strong className="text-cgr-navy">{doctrinalPositionCounts.desarrolla}</strong></li>
                                    <li>Lo ajustan o revisan: <strong className="text-cgr-navy">{doctrinalPositionCounts.ajusta}</strong></li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {legalSourceCards.length > 0 && (
                        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Landmark className="h-4 w-4 text-cgr-navy" />
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fuentes legales citadas</p>
                            </div>
                            <div className="mt-4 space-y-3">
                                {legalSourceCards.map((source) => (
                                    <div key={source.key} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-serif text-base font-semibold text-cgr-navy">{source.primary}</p>
                                                {source.secondary && <p className="mt-1 text-sm text-slate-600">{source.secondary}</p>}
                                            </div>
                                            <span className={cn(
                                                "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
                                                source.contextCompleteness === "alta"
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                    : source.contextCompleteness === "media"
                                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                                        : "border-cgr-red/20 bg-cgr-red/10 text-cgr-red"
                                            )}>
                                                identificación {source.contextCompleteness}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {source.articleLabels.map((label) => (
                                                <span key={label} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                                                    {label}
                                                </span>
                                            ))}
                                            {source.mentions > 1 && (
                                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                                                    {source.mentions} menciones
                                                </span>
                                            )}
                                        </div>

                                        {source.caution && (
                                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-cgr-red/15 bg-cgr-red/5 px-3 py-2 text-xs leading-5 text-cgr-red">
                                                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                <span>{source.caution}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
