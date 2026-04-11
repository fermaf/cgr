import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { 
    ArrowLeft, 
    Calendar, 
    ChevronRight, 
    History, 
    Info, 
    Scale, 
    ShieldCheck, 
    Sparkles, 
    AlertTriangle,
    FileText
} from "lucide-react";
import { formatSimpleDate } from "../lib/date";
import type { RegimenSimulado } from "../types";

export function RegimenView() {
    const { id } = useParams<{ id: string }>();
    const [regimen, setRegimen] = useState<any | null>(null);
    const [dictamenes, setDictamenes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch detalle del régimen
                const rRes = await fetch(`/api/v1/public/regimenes/${id}`);
                if (!rRes.ok) throw new Error("Régimen no encontrado");
                const rData = await rRes.json();
                
                // Fetch dictámenes miembros
                const dRes = await fetch(`/api/v1/public/regimenes/${id}/dictamenes?limit=100`);
                const dData = await dRes.json();

                setRegimen(rData.regimen);
                setDictamenes(dData.dictamenes || []);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-cgr-blue rounded-full animate-spin mb-4" />
                <p className="text-slate-500 font-medium animate-pulse">Reconstruyendo línea jurisprudencial...</p>
            </div>
        );
    }

    if (error || !regimen) {
        return (
            <div className="max-w-4xl mx-auto py-20 px-4 text-center">
                <div className="bg-red-50 border border-red-100 p-8 rounded-3xl inline-block mb-6">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Error al cargar régimen</h2>
                    <p className="text-slate-600">{error || "No se pudo encontrar la información solicitada."}</p>
                </div>
                <div>
                    <Link to="/" className="inline-flex items-center gap-2 text-cgr-blue font-bold hover:underline">
                        <ArrowLeft className="w-4 h-4" /> Volver al buscador
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-24">
            {/* Header / Banner */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-cgr-navy to-slate-900 text-white p-8 md:p-12 shadow-2xl border border-white/10">
                <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                    <Scale className="w-64 h-64" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
                    <div className="max-w-3xl space-y-6">
                        <Link to="/" className="inline-flex items-center gap-2 text-blue-200/70 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest mb-4">
                            <ArrowLeft className="w-4 h-4" /> Volver a Jurisprudencia
                        </Link>
                        
                        <div className="space-y-2">
                             <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                    regimen.estado === 'activo' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}>
                                    Régimen Jurisprudencial {regimen.estado}
                                </span>
                                <span className="text-blue-200/50 font-mono text-xs">{regimen.id}</span>
                             </div>
                             <h1 className="text-4xl md:text-5xl font-serif font-bold leading-tight">
                                {regimen.nombre}
                             </h1>
                        </div>

                        {regimen.pjo?.pregunta && (
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl space-y-3">
                                <div className="flex items-center gap-2 text-cgr-gold text-[10px] font-bold uppercase tracking-[0.2em]">
                                    <Sparkles className="w-4 h-4" /> Problema Jurídico Operativo (PJO)
                                </div>
                                <p className="text-xl md:text-2xl font-serif italic text-blue-50 leading-relaxed">
                                    "{regimen.pjo.pregunta}"
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-[2rem] min-w-[240px] shadow-inner">
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-blue-200/50 uppercase tracking-widest mb-2">Estabilidad del Criterio</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-cgr-gold rounded-full transition-all duration-1000" style={{ width: `${regimen.confianza * 100}%` }} />
                                    </div>
                                    <span className="text-sm font-bold text-cgr-gold">{Math.round(regimen.confianza * 100)}%</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                                <div>
                                    <p className="text-[9px] font-bold text-blue-200/50 uppercase tracking-tighter">Pronunciamientos</p>
                                    <p className="text-lg font-bold">{dictamenes.length}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-blue-200/50 uppercase tracking-tighter">Último Hito</p>
                                    <p className="text-sm font-bold">{formatSimpleDate(regimen.fecha_ultimo_pronunciamiento, "Pendiente")}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 px-2 md:px-0">
                {/* Columna Izquierda: Línea de Tiempo / Timeline */}
                <div className="lg:col-span-8 space-y-12">
                     <section>
                         <h2 className="text-2xl font-serif font-bold text-slate-900 mb-8 flex items-center gap-3">
                            <History className="w-6 h-6 text-cgr-blue" />
                            Evolución Jurisprudencial
                         </h2>
                         
                         <div className="relative space-y-8 pl-8 border-l-2 border-slate-100 ml-4 py-4">
                            {dictamenes.map((d) => {
                                const isSemilla = d.rol === 'semilla';
                                return (
                                    <div key={d.dictamen_id} className="relative group">
                                        {/* Punto en la línea de tiempo */}
                                        <div className={`absolute -left-[41px] top-6 w-5 h-5 rounded-full border-4 border-white shadow-md transition-transform group-hover:scale-125 z-10 ${
                                            isSemilla ? 'bg-cgr-gold scale-125 ring-4 ring-cgr-gold/10' : 'bg-slate-300 group-hover:bg-cgr-blue'
                                        }`} />

                                        <div className={`p-6 rounded-3xl border transition-all duration-300 ${
                                            isSemilla 
                                            ? 'bg-amber-50/50 border-amber-200 shadow-md ring-1 ring-amber-100' 
                                            : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-lg'
                                        }`}>
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-sm font-bold text-slate-500">N° {d.dictamen_id}</span>
                                                        {isSemilla && (
                                                            <span className="px-2 py-0.5 bg-cgr-gold/20 text-amber-700 text-[9px] font-black uppercase rounded tracking-widest flex items-center gap-1">
                                                                <ShieldCheck className="w-3 h-3" /> Dictamen Fundante
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded tracking-widest ${
                                                            d.estado_vigencia === 'vigente' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {d.estado_vigencia}
                                                        </span>
                                                    </div>
                                                    <h3 className="text-xl font-serif font-bold text-slate-800 leading-snug group-hover:text-cgr-navy transition-colors">
                                                        {d.titulo || "Sin título disponible"}
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-400 font-medium shrink-0">
                                                    <Calendar className="w-4 h-4" />
                                                    <span className="text-xs">{formatSimpleDate(d.fecha_documento)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                                <Link 
                                                    to={`/dictamen/${d.dictamen_id}`}
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-cgr-blue hover:text-cgr-navy transition-colors group-hover:translate-x-1 duration-300"
                                                >
                                                    Ver análisis detallado <ChevronRight className="w-3 h-3" />
                                                </Link>
                                                <div className="flex items-center gap-2">
                                                    {d.accion_cgr && (
                                                        <span className="px-2 py-1 bg-slate-50 text-slate-500 text-[10px] font-bold border border-slate-100 rounded">
                                                            {d.accion_cgr.toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                         </div>
                     </section>
                </div>

                {/* Columna Derecha / Metadata / Sidebar */}
                <div className="lg:col-span-4 space-y-8">
                    {/* Respuesta IA Sintética */}
                    {regimen.pjo?.respuesta_sintetica && (
                        <div className="bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl shadow-blue-600/20 sticky top-8">
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200 mb-6 flex items-center gap-2">
                                <Scale className="w-4 h-4 animate-bounce" /> Doctrina Síntesis
                            </h3>
                            <div className="space-y-4 font-serif text-lg leading-relaxed">
                                {regimen.pjo.respuesta_sintetica}
                            </div>
                            <div className="mt-8 pt-6 border-t border-blue-500/50 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-blue-200">
                                    <Info className="w-5 h-5" />
                                </div>
                                <p className="text-[10px] text-blue-200/70 font-medium">
                                    Resumen generado por IA para asistir la comprensión operativa de la línea jurisprudencial.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Normativa Relacionada */}
                    {regimen.normas && regimen.normas.length > 0 && (
                        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2">
                                <Scale className="w-5 h-5 text-cgr-blue" /> Marco Normativo
                            </h3>
                            <div className="space-y-4">
                                {regimen.normas.map((norma: any, i: number) => (
                                    <div key={i} className="flex items-start gap-4 group cursor-default">
                                        <div className="mt-1 flex-shrink-0 bg-slate-50 p-2 rounded-lg group-hover:bg-blue-50 transition-colors">
                                            <FileText className="w-4 h-4 text-slate-400 group-hover:text-cgr-blue" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 group-hover:text-cgr-navy transition-colors">{norma.norma}</p>
                                            <p className="text-xs text-slate-500 mt-0.5 italic">{norma.contexto || "Referencia normativa central del régimen."}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
