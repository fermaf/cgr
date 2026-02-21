import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Building2, Tag, BookOpen, Share2, AlertCircle, Sparkles, Download, FileCheck } from "lucide-react";
import type { DictamenResponse } from "../types";
import { cn } from "../lib/utils";

export function DictamenDetail() {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<DictamenResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        fetch(`/api/v1/dictamenes/${id}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("El documento no se encuentra disponible o el enlace está dañado");
                return res.json();
            })
            .then((data) => setData(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

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

    const { meta, raw, intelligence } = data;

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-10 pb-20">
            {/* Nav */}
            <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3 text-slate-500 hover:text-cgr-navy transition-colors font-sans text-sm font-semibold group bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                    <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" /> Volver al Buscador
                </Link>
                <div className="flex gap-3">
                    <button title="Descargar PDF" className="p-2.5 text-slate-500 hover:text-cgr-blue bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <Download className="w-5 h-5" />
                    </button>
                    <button title="Compartir Enlace" className="p-2.5 text-slate-500 hover:text-cgr-blue bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <Share2 className="w-5 h-5" />
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
                            Dictamen N° {meta.numero || "S/N"}
                        </h1>
                    </div>
                    <span className={cn(
                        "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border flex items-center gap-2 whitespace-nowrap shadow-sm",
                        meta.es_enriquecido ? "bg-blue-50 text-cgr-blue border-blue-200" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                        {meta.es_enriquecido ? <><Sparkles className="w-4 h-4" /> ANÁLISIS IA</> : <><FileCheck className="w-4 h-4" /> ESTÁNDAR</>}
                    </span>
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-slate-600 font-sans font-medium">
                    <div className="flex items-center gap-2.5">
                        <Calendar className="w-4 h-4 text-slate-400" /> {meta.fecha_documento}
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
                                {raw.texto_completo || raw.documento_completo || raw.texto || raw.Descripcion ? (
                                    raw.texto_completo || raw.documento_completo || raw.texto || raw.Descripcion
                                ) : (
                                    <pre className="text-sm text-slate-600 bg-slate-50 p-4 rounded-lg font-mono text-left">
                                        {JSON.stringify(raw, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    </div>

                    {meta.referencias && meta.referencias.length > 0 && (
                        <div className="pt-8 border-t border-slate-200 space-y-4">
                            <h3 className="font-bold text-cgr-navy font-sans uppercase tracking-wide text-sm">Normativa Referenciada</h3>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {meta.referencias.map((ref, idx) => (
                                    <li key={idx}>
                                        <Link to={ref.url} className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-cgr-blue hover:shadow-sm transition-all group">
                                            <div className="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-cgr-blue transition-colors" />
                                            <span className="text-sm font-sans font-medium text-slate-600 group-hover:text-cgr-navy transition-colors">
                                                {ref.dictamen_ref_nombre} ({ref.year})
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </article>

                <aside className="lg:col-span-1 space-y-6 order-1 lg:order-2">
                    {intelligence?.extrae_jurisprudencia?.resumen && (
                        <div className="bg-cgr-navy rounded-2xl p-7 border border-cgr-navy shadow-premium relative overflow-hidden group">
                            <h3 className="font-bold text-white flex items-center gap-3 mb-5 relative z-10 uppercase tracking-wide text-sm font-sans">
                                <span className="p-2 bg-white/10 text-white rounded-lg border border-white/20">
                                    <Sparkles className="w-4 h-4" />
                                </span>
                                Resumen Ejecutivo IA
                            </h3>
                            <p className="text-blue-50 text-base leading-relaxed relative z-10 font-sans font-light">
                                {intelligence.extrae_jurisprudencia.resumen}
                            </p>
                        </div>
                    )}

                    {intelligence?.extrae_jurisprudencia?.analisis && (
                        <div className="bg-white p-7 rounded-2xl border border-slate-200 border-l-4 border-l-cgr-blue shadow-sm">
                            <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-4">Análisis Jurídico</h3>
                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line font-sans font-medium">
                                {intelligence.extrae_jurisprudencia.analisis}
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
