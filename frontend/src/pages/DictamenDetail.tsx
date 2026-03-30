import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Building2, Tag, BookOpen, Share2, AlertCircle, Sparkles, Download, FileCheck, Activity, Landmark, ShieldAlert } from "lucide-react";
import type { DictamenResponse } from "../types";
import { cn } from "../lib/utils";
import { formatSimpleDate } from "../lib/date";
import { describeLegalSource } from "../lib/legalSources";
import type { RelacionCausa, RelacionEfecto } from "../types";

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
    if (tipoAccion === "reactivado") return "Fue usado después para reactivar su criterio";
    return "Fue utilizado por un dictamen posterior";
}

function summarizeRelationRole(relacionesCausa: RelacionCausa[], relacionesEfecto: RelacionEfecto[]) {
    const outgoingBuckets = relacionesEfecto.map((relation) => relationBucket(relation.tipo_accion));
    const incomingBuckets = relacionesCausa.map((relation) => relationBucket(relation.tipo_accion));

    if (outgoingBuckets.includes("ajusta")) {
        return "Este dictamen parece intervenir sobre criterio previo ajustándolo o reordenándolo.";
    }
    if (outgoingBuckets.includes("desarrolla")) {
        return "Este dictamen parece desarrollar criterio previo mediante aclaraciones o complementos.";
    }
    if (outgoingBuckets.includes("consolida")) {
        return "Este dictamen parece apoyarse en criterio previo para consolidar una línea existente.";
    }
    if (incomingBuckets.length > 0) {
        return "Este dictamen ya funciona como apoyo doctrinal para decisiones posteriores.";
    }
    return "Este dictamen aún muestra pocas relaciones jurídicas materializadas en la red visible.";
}

function NervioCentral({ lineage, currentId }: { lineage: any, currentId: string }) {
    if (!lineage || (!lineage.references_from?.length && !lineage.references_to?.length)) return null;

    const fromNodes = lineage.references_from || [];
    const toNodes = lineage.references_to || [];

    // Simplificamos la visualización en un layout tipo radial/lineal para SVG
    const width = 800;
    const height = 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const nodeRadius = 35;

    return (
        <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden group">
            {/* Background effects */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500 rounded-full blur-[120px]" />
            </div>

            <h3 className="font-bold text-white flex items-center gap-3 mb-10 relative z-10 uppercase tracking-widest text-xs font-sans">
                <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                Nervio Central de Relaciones
            </h3>

            <div className="relative z-10 w-full overflow-x-auto custom-scrollbar pb-4">
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto block">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                        </marker>
                    </defs>

                    {/* From Nodes (Incoming References) */}
                    {fromNodes.map((node: any, i: number) => {
                        const x = 100;
                        const y = (height / (fromNodes.length + 1)) * (i + 1);
                        return (
                            <g key={`from-${i}`}>
                                <path
                                    d={`M ${x + nodeRadius} ${y} L ${centerX - nodeRadius - 10} ${centerY}`}
                                    stroke="#1e293b" strokeWidth="2" strokeDasharray="5,5" fill="none"
                                />
                                <Link to={`/dictamen/${node.id}`}>
                                    <circle cx={x} cy={y} r={nodeRadius} className="fill-slate-800 stroke-blue-500/30 hover:stroke-blue-400 transition-all cursor-pointer" strokeWidth="2" />
                                    <text x={x} y={y + 4} textAnchor="middle" fontSize="10" className="fill-blue-200 font-bold font-mono pointer-events-none">
                                        {node.id.substring(0, 6)}
                                    </text>
                                </Link>
                                <text x={x} y={y + nodeRadius + 15} textAnchor="middle" fontSize="8" className="fill-slate-500 uppercase tracking-tighter pointer-events-none">
                                    Cita a este
                                </text>
                            </g>
                        );
                    })}

                    {/* Center Node (Current) */}
                    <g>
                        <circle cx={centerX} cy={centerY} r={nodeRadius + 10} className="fill-blue-600 stroke-blue-400 transition-all" strokeWidth="4" />
                        <text x={centerX} y={centerY + 6} textAnchor="middle" fontSize="12" className="fill-white font-bold font-mono pointer-events-none">
                            {currentId.substring(0, 8)}
                        </text>
                        <text x={centerX} y={centerY - nodeRadius - 20} textAnchor="middle" fontSize="9" className="fill-blue-400 font-bold uppercase tracking-widest pointer-events-none">
                            Núcleo Actual
                        </text>
                    </g>

                    {/* To Nodes (Outgoing References) */}
                    {toNodes.map((node: any, i: number) => {
                        const x = width - 100;
                        const y = (height / (toNodes.length + 1)) * (i + 1);
                        return (
                            <g key={`to-${i}`}>
                                <path
                                    d={`M ${centerX + nodeRadius + 10} ${centerY} L ${x - nodeRadius} ${y}`}
                                    stroke="#3b82f6" strokeWidth="2" fill="none" opacity="0.4"
                                />
                                <Link to={`/dictamen/${node.id}`}>
                                    <circle cx={x} cy={y} r={nodeRadius} className="fill-slate-800 stroke-emerald-500/30 hover:stroke-emerald-400 transition-all cursor-pointer" strokeWidth="2" />
                                    <text x={x} y={y + 4} textAnchor="middle" fontSize="10" className="fill-emerald-200 font-bold font-mono pointer-events-none">
                                        {node.id.substring(0, 6)}
                                    </text>
                                </Link>
                                <text x={x} y={y + nodeRadius + 15} textAnchor="middle" fontSize="8" className="fill-slate-500 uppercase tracking-tighter pointer-events-none">
                                    Citado por
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="mt-6 flex justify-center gap-8 text-[10px] uppercase tracking-widest font-bold">
                <div className="flex items-center gap-2 text-slate-500">
                    <span className="w-2 h-2 rounded-full border border-blue-500/50 bg-slate-800"></span> Referencias Entrantes
                </div>
                <div className="flex items-center gap-2 text-blue-400">
                    <span className="w-3 h-3 rounded-full bg-blue-600"></span> Documento Actual
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                    <span className="w-2 h-2 rounded-full border border-emerald-500/50 bg-slate-800"></span> Referencias Salientes
                </div>
            </div>
        </div>
    );
}

export function DictamenDetail() {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<DictamenResponse | null>(null);
    const [lineage, setLineage] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError(null);

        const fetchData = async () => {
            try {
                const [dRes, lRes] = await Promise.all([
                    fetch(`/api/v1/dictamenes/${id}`).then(r => {
                        if (!r.ok) throw new Error("Documento no disponible");
                        return r.json();
                    }),
                    fetch(`/api/v1/dictamenes/${id}/lineage`).then(r => r.json()).catch(() => null)
                ]);
                setData(dRes);
                setLineage(lRes);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return (
        <div className="py-32 flex flex-col items-center justify-center relative z-10 w-full">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-cgr-blue rounded-full animate-spin mb-6"></div>
            <p className="text-cgr-navy font-sans uppercase tracking-widest text-sm font-semibold animate-pulse">Cargando Documento Oficial...</p>
        </div>
    );

    if (error) return (
        <div className="py-32 text-center text-cgr-red flex flex-col items-center gap-4 relative z-10 w-full bg-white p-10 rounded-2xl shadow-sm border border-slate-200">
            <AlertCircle className="w-12 h-12 text-cgr-red" />
            <p className="font-sans text-lg font-medium">{error}</p>
            <Link to="/" className="mt-4 px-6 py-2 bg-slate-50 border border-slate-200 text-cgr-navy hover:bg-slate-100 rounded-lg transition-colors font-semibold shadow-sm">Volver al Inicio</Link>
        </div>
    );

    if (!data) return null;

    const { meta, raw, extrae_jurisprudencia } = data;
    const isEnriched = meta.estado === "enriched" || meta.estado === "vectorized" || !!extrae_jurisprudencia;

    const extractText = (source: any): string | null => {
        if (!source || typeof source !== "object") return null;
        const direct =
            source.texto_completo ||
            source.documento_completo ||
            source.texto ||
            source.Descripcion;
        if (typeof direct === "string" && direct.trim().length > 0) return direct;

        const nested = source._source || source.source || source.raw_data;
        if (nested && typeof nested === "object") {
            const nestedText =
                nested.texto_completo ||
                nested.documento_completo ||
                nested.texto ||
                nested.Descripcion;
            if (typeof nestedText === "string" && nestedText.trim().length > 0) return nestedText;
        }

        return null;
    };

    const textoIntegro = extractText(raw);
    const relacionesCausa = meta.relaciones_causa || [];
    const relacionesEfecto = meta.relaciones_efecto || [];
    const relacionRoleSummary = summarizeRelationRole(relacionesCausa, relacionesEfecto);

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-10 pb-20">
            {/* Nav */}
            <div className="flex items-center justify-between print:hidden">
                <Link to="/" className="flex items-center gap-3 text-slate-500 hover:text-cgr-navy transition-colors font-sans text-sm font-semibold group bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                    <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" /> Volver al Buscador
                </Link>
                <div className="flex gap-3">
                    <button
                        onClick={handlePrint}
                        title="Descargar PDF (Imprimir)"
                        className="p-2.5 text-slate-500 hover:text-cgr-blue bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all active:scale-95"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleShare}
                        title="Compartir Enlace"
                        className={cn(
                            "p-2.5 rounded-lg border shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center gap-2",
                            copySuccess ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "text-slate-500 hover:text-cgr-blue bg-white border-slate-200"
                        )}
                    >
                        <Share2 className="w-5 h-5" />
                        {copySuccess && <span className="text-[10px] font-bold uppercase tracking-wider">Copiado</span>}
                    </button>
                </div>
            </div>

            {/* Header / Meta */}
            <header className="space-y-6 pb-8 relative border-b border-slate-200">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-3 text-cgr-blue font-sans text-sm font-bold uppercase tracking-widest">
                            <BookOpen className="w-4 h-4" /> Registro Oficial
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-5xl font-serif font-bold text-cgr-navy leading-tight">
                            N° {meta.id}
                        </h1>
                    </div>
                    <span className={cn(
                        "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border flex items-center gap-2 whitespace-nowrap shadow-sm print:hidden",
                        isEnriched ? "bg-blue-50 text-cgr-blue border-blue-200" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                        {isEnriched ? <><Sparkles className="w-4 h-4" /> ANÁLISIS IA</> : <><FileCheck className="w-4 h-4" /> ESTÁNDAR</>}
                    </span>
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-slate-600 font-sans font-medium">
                    <div className="flex items-center gap-2.5">
                        <Calendar className="w-4 h-4 text-slate-400" /> {formatSimpleDate(meta.fecha_documento, "Sin fecha")}
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Building2 className="w-4 h-4 text-slate-400" /> {meta.division_nombre || "División no especificada"}
                    </div>
                </div>

                {meta.abogados && meta.abogados.length > 0 && (
                    <div className="flex items-center gap-3 text-sm text-slate-600 font-sans bg-slate-50 w-fit px-4 py-2.5 rounded-lg border border-slate-200">
                        <span className="font-bold text-cgr-navy">Firmantes:</span>
                        {meta.abogados.join(" • ")}
                    </div>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-12">

                <article className="lg:col-span-2 order-2 lg:order-1 space-y-10">
                    <div className="bg-white p-8 md:p-10 rounded-[20px] shadow-sm border border-slate-200 relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-cgr-navy" />
                        <h2 className="font-sans font-bold text-slate-400 text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                            Materia
                        </h2>
                        <p className="text-cgr-navy text-xl lg:text-2xl leading-relaxed font-serif">
                            {meta.materia}
                        </p>
                    </div>

                    {/* Official Text */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <h3 className="font-sans font-bold text-cgr-navy text-lg uppercase tracking-wide m-0">Texto Íntegro</h3>
                            <div className="h-px flex-1 bg-slate-200"></div>
                        </div>

                        <div className="bg-white border border-slate-200 text-slate-800 font-serif text-lg leading-loose px-8 py-12 md:px-14 md:py-16 rounded-2xl shadow-sm relative">
                            {/* Watermark simulada para light mode */}
                            <div className="absolute inset-0 opacity-[0.02] pointer-events-none flex items-center justify-center mix-blend-multiply text-cgr-navy">
                                <BookOpen className="w-[300px] h-[300px]" />
                            </div>

                            <div className="relative z-10 selection:bg-blue-100 whitespace-pre-wrap text-justify overflow-auto">
                                {textoIntegro ? (
                                    textoIntegro
                                ) : (
                                    <div className="text-center py-12 text-slate-500 font-sans border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                        <AlertCircle className="w-10 h-10 mx-auto mb-4 opacity-70 text-slate-400" />
                                        <p className="font-bold text-lg text-slate-600">Texto Original No Disponible</p>
                                        <p className="mt-2 text-sm leading-relaxed max-w-md mx-auto font-medium">El contenido íntegro de este documento no ha sido almacenado digitalmente en nuestras bases de datos estructuradas en texto plano.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Nervio Central (Grafo) */}
                    <div className="pt-10 print:hidden">
                        <NervioCentral lineage={lineage} currentId={id || ""} />
                    </div>

                    {meta.fuentes_legales && meta.fuentes_legales.length > 0 && (
                        <div className="pt-8 border-t border-slate-200 space-y-4 print:hidden">
                            <div className="flex items-start gap-3">
                                <div className="rounded-xl bg-slate-50 p-2 text-cgr-navy border border-slate-200">
                                    <Landmark className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-cgr-navy font-sans uppercase tracking-wide text-sm">Normativa citada</h3>
                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                        Indubia ya no muestra solo una sigla o número. Destaca año y órgano emisor cuando la norma no se identifica con seguridad por sí sola.
                                    </p>
                                </div>
                            </div>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {meta.fuentes_legales.map((source, idx) => {
                                    const detail = describeLegalSource(source);
                                    return (
                                    <li key={idx}>
                                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 hover:bg-white hover:border-cgr-blue hover:shadow-sm transition-all">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-cgr-navy">{detail.primary}</p>
                                                    {detail.secondary && (
                                                        <p className="mt-1 text-sm text-slate-600">{detail.secondary}</p>
                                                    )}
                                                </div>
                                                <span className={cn(
                                                    "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
                                                    detail.contextCompleteness === "alta"
                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                        : detail.contextCompleteness === "media"
                                                            ? "border-amber-200 bg-amber-50 text-amber-700"
                                                            : "border-cgr-red/20 bg-cgr-red/10 text-cgr-red"
                                                )}>
                                                    identificación {detail.contextCompleteness}
                                                </span>
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {detail.articleLabel && (
                                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                                                        {detail.articleLabel}
                                                    </span>
                                                )}
                                                {source.mentions > 1 && (
                                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                                                        {source.mentions} menciones
                                                    </span>
                                                )}
                                            </div>

                                            {detail.caution && (
                                                <div className="mt-3 flex items-start gap-2 rounded-xl border border-cgr-red/15 bg-cgr-red/5 px-3 py-2 text-xs leading-5 text-cgr-red">
                                                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                    <span>{detail.caution}</span>
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                )})}
                            </ul>
                        </div>
                    )}
                </article>

                <aside className="lg:col-span-1 space-y-6 order-1 lg:order-2">
                    {(relacionesCausa.length > 0 || relacionesEfecto.length > 0) && (
                        <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                            <div>
                                <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Posición doctrinal</h3>
                                <p className="mt-2 text-sm text-slate-500 font-sans">{relacionRoleSummary}</p>
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Consolidan</p>
                                    <p className="mt-2 text-2xl font-semibold text-cgr-navy">
                                        {[...relacionesCausa, ...relacionesEfecto].filter((rel) => relationBucket(rel.tipo_accion) === "consolida").length}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Desarrollan</p>
                                    <p className="mt-2 text-2xl font-semibold text-cgr-navy">
                                        {[...relacionesCausa, ...relacionesEfecto].filter((rel) => relationBucket(rel.tipo_accion) === "desarrolla").length}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-cgr-red/20 bg-cgr-red/5 px-4 py-3">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cgr-red">Ajustan</p>
                                    <p className="mt-2 text-2xl font-semibold text-cgr-navy">
                                        {[...relacionesCausa, ...relacionesEfecto].filter((rel) => relationBucket(rel.tipo_accion) === "ajusta").length}
                                    </p>
                                </div>
                            </div>

                            {relacionesCausa.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-cgr-navy">Dictámenes posteriores que usan este criterio</h4>
                                    <div className="space-y-2">
                                        {relacionesCausa.map((rel, idx) => (
                                            <Link
                                                key={`${rel.origen_id}-${rel.tipo_accion}-${idx}`}
                                                to={`/dictamen/${rel.origen_id}`}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-cgr-blue hover:bg-white transition-all"
                                            >
                                                <div>
                                                    <div className="font-mono text-sm font-bold text-cgr-navy">{rel.origen_id}</div>
                                                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{relationBucketLabel(relationBucket(rel.tipo_accion))} · {rel.tipo_accion}</div>
                                                    <div className="mt-1 text-xs leading-5 text-slate-500">{incomingRelationPhrase(rel.tipo_accion)}</div>
                                                    {rel.titulo && <div className="mt-1 text-xs leading-5 text-slate-500">{rel.titulo}</div>}
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Posterior</span>
                                                    {rel.fecha_documento && <div className="mt-1 text-[11px] text-slate-500">{formatSimpleDate(rel.fecha_documento)}</div>}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {relacionesEfecto.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-cgr-navy">Criterio previo que este dictamen toma o ajusta</h4>
                                    <div className="space-y-2">
                                        {relacionesEfecto.map((rel, idx) => (
                                            <Link
                                                key={`${rel.destino_id}-${rel.tipo_accion}-${idx}`}
                                                to={`/dictamen/${rel.destino_id}`}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-cgr-blue hover:bg-white transition-all"
                                            >
                                                <div>
                                                    <div className="font-mono text-sm font-bold text-cgr-navy">{rel.destino_id}</div>
                                                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{relationBucketLabel(relationBucket(rel.tipo_accion))} · {rel.tipo_accion}</div>
                                                    <div className="mt-1 text-xs leading-5 text-slate-500">{outgoingRelationPhrase(rel.tipo_accion)}</div>
                                                    {rel.titulo && <div className="mt-1 text-xs leading-5 text-slate-500">{rel.titulo}</div>}
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Previo</span>
                                                    {rel.fecha_documento && <div className="mt-1 text-[11px] text-slate-500">{formatSimpleDate(rel.fecha_documento)}</div>}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {extrae_jurisprudencia?.resumen && (
                        <div className="bg-cgr-navy rounded-2xl p-7 border border-cgr-navy shadow-premium relative overflow-hidden group">
                            <h3 className="font-bold text-white flex items-center gap-3 mb-5 relative z-10 uppercase tracking-wide text-sm font-sans">
                                <span className="p-2 bg-white/10 text-white rounded-lg border border-white/20">
                                    <Sparkles className="w-4 h-4" />
                                </span>
                                Resumen Ejecutivo IA
                            </h3>
                            <p className="text-blue-50 text-base leading-relaxed relative z-10 font-sans font-light">
                                {extrae_jurisprudencia.resumen}
                            </p>
                        </div>
                    )}

                    {extrae_jurisprudencia?.analisis && (
                        <div className="bg-white p-7 rounded-2xl border border-slate-200 border-l-4 border-l-cgr-blue shadow-sm">
                            <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-4">Análisis Jurídico</h3>
                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line font-sans font-medium">
                                {extrae_jurisprudencia.analisis}
                            </p>
                        </div>
                    )}

                    {meta.descriptores && meta.descriptores.length > 0 && (
                        <div className="space-y-4 pt-6 mt-6 border-t border-slate-200">
                            <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <Tag className="w-3 h-3" /> Descriptores
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {meta.descriptores.map(tag => (
                                    <span key={tag} className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-600 font-sans font-semibold text-[10px] uppercase tracking-wider rounded-lg hover:border-cgr-blue hover:text-cgr-blue transition-colors cursor-default">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
