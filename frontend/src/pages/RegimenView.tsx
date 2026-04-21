import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    Calendar,
    History,
    Info,
    Scale,
    ShieldCheck,
    Sparkles,
    AlertTriangle,
    FileText,
    ExternalLink
} from "lucide-react";
import { formatSimpleDate } from "../lib/date";

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
            <div className="flex flex-col items-center justify-center py-40">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="w-16 h-16 border-4 border-slate-100 border-t-cgr-gold rounded-full mb-8 shadow-xl"
                />
                <p className="text-slate-400 font-bold tracking-widest uppercase text-xs animate-pulse">
                    Reconstruyendo línea jurisprudencial...
                </p>
            </div>
        );
    }

    if (error || !regimen) {
        return (
            <div className="max-w-4xl mx-auto py-20 px-4 text-center">
                <div className="bg-red-50 border border-red-100 p-12 rounded-[3rem] inline-block mb-8 shadow-sm">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-serif font-bold text-slate-900 mb-4">No pudimos reconstruir este Régimen</h2>
                    <p className="text-slate-600 max-w-sm mx-auto">{error || "La jurisprudencia solicitada no está disponible actualmente."}</p>
                </div>
                <div>
                    <Link to="/" className="inline-flex items-center gap-2 px-8 py-4 bg-cgr-navy text-white rounded-2xl font-bold hover:bg-cgr-blue transition-all shadow-lg shadow-cgr-navy/20">
                        <ArrowLeft className="w-4 h-4" /> Volver al buscador
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-7xl mx-auto space-y-12 pb-32"
        >
            {/* Header / Banner Premium */}
            <div className="relative overflow-hidden rounded-[3rem] bg-[#0c1421] text-white p-8 md:p-16 shadow-2xl">
                {/* Background Textures */}
                <div className="absolute inset-0 opacity-20 overflow-hidden pointer-events-none">
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-cgr-gold rounded-full blur-[120px] mix-blend-screen animate-pulse" />
                    <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cgr-navy rounded-full blur-[120px] mix-blend-screen" />
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start gap-12">
                    <div className="max-w-4xl space-y-8">
                        <Link to="/" className="group inline-flex items-center gap-2 text-white/50 hover:text-white transition-all text-[10px] font-black uppercase tracking-[0.2em]">
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            Explorador de Regímenes
                        </Link>

                        <div className="space-y-4">
                             <div className="flex flex-wrap items-center gap-4">
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg ${
                                    regimen.estado === 'activo' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                    Régimen Juridicial {regimen.estado}
                                </span>
                                <div className="h-1 w-1 rounded-full bg-white/20" />
                                <span className="text-white/40 font-mono text-[10px] tracking-widest">REF: {regimen.id}</span>
                             </div>
                             <h1 className="text-4xl md:text-6xl font-serif font-black leading-[1.1] tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/60">
                                {regimen.nombre}
                             </h1>
                        </div>

                        {regimen.pjo?.pregunta && (
                            <motion.div
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="relative p-8 md:p-10 rounded-[2.5rem] bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-inner overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-cgr-gold rotate-12">
                                    <Scale className="w-32 h-32" />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-cgr-gold text-[10px] font-black uppercase tracking-[0.25em]">
                                        <Sparkles className="w-4 h-4" />
                                        Problema Jurídico Central
                                    </div>
                                    <p className="text-2xl md:text-3xl font-serif font-medium italic text-blue-50 leading-relaxed max-w-3xl">
                                        "{regimen.pjo.pregunta}"
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="w-full xl:w-80 bg-white/[0.05] backdrop-blur-3xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl space-y-8"
                    >
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-end mb-3">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Estabilidad Doctrinal</p>
                                    <span className="text-sm font-black text-cgr-gold">{Math.round(regimen.confianza * 100)}%</span>
                                </div>
                                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${regimen.confianza * 100}%` }}
                                        className="h-full bg-gradient-to-r from-cgr-gold/50 to-cgr-gold rounded-full"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/10">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.1em]">Precedentes</p>
                                    <p className="text-2xl font-serif font-bold">{dictamenes.length}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.1em]">Última Ratificación</p>
                                    <p className="text-xs font-bold text-white/80">{formatSimpleDate(regimen.fecha_ultimo_pronunciamiento, "En proceso")}</p>
                                </div>
                            </div>
                        </div>

                        <button className="w-full py-4 bg-cgr-gold text-cgr-navy rounded-2xl font-black text-xs uppercase tracking-[0.15em] hover:bg-white transition-all shadow-xl shadow-cgr-gold/10">
                            Descargar Reporte Doctrinal
                        </button>
                    </motion.div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 px-4 md:px-0">
                {/* Columna Izquierda: Línea de Tiempo / Timeline */}
                <div className="lg:col-span-8 space-y-12">
                     <section>
                         <div className="flex items-center justify-between mb-12">
                            <h2 className="text-3xl font-serif font-black text-slate-900 flex items-center gap-4">
                                <History className="w-8 h-8 text-cgr-gold" />
                                Genealogía Jurisprudencial
                            </h2>
                            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Orden: Cronológico</span>
                            </div>
                         </div>

                         <div className="relative space-y-12 pl-12 border-l-2 border-slate-100 ml-4 py-4">
                             <AnimatePresence>
                                {dictamenes.map((d, index) => {
                                    const isSemilla = d.rol === 'semilla';
                                    return (
                                        <motion.div
                                            key={d.dictamen_id}
                                            initial={{ x: 20, opacity: 0 }}
                                            whileInView={{ x: 0, opacity: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: index * 0.1 }}
                                            className="relative group"
                                        >
                                            {/* Landmark on the timeline */}
                                            <div className={`absolute -left-[61px] top-8 w-10 h-10 rounded-2xl bg-white border-2 flex items-center justify-center transition-all group-hover:rotate-[15deg] z-10 ${
                                                isSemilla ? 'border-cgr-gold shadow-gold text-cgr-gold ring-8 ring-cgr-gold/5 scale-110' : 'border-slate-200 text-slate-400 group-hover:border-cgr-blue group-hover:text-cgr-blue shadow-premium'
                                            }`}>
                                                {isSemilla ? <Sparkles className="w-5 h-5" /> : <div className="w-2 h-2 rounded-full bg-current" />}
                                            </div>

                                            <div className={`overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all duration-500 shadow-sm ${
                                                isSemilla
                                                ? 'bg-gradient-to-br from-white to-cgr-gold/[0.04] border-cgr-gold/30 shadow-gold'
                                                : 'bg-white border-slate-100 hover:border-cgr-blue/30 hover:shadow-2xl'
                                            }`}>
                                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <span className="font-mono text-xs font-black text-slate-400 tracking-widest bg-slate-50 px-3 py-1 rounded-lg"># {d.dictamen_id}</span>
                                                            {isSemilla && (
                                                                <span className="px-3 py-1 bg-cgr-gold text-cgr-navy text-[10px] font-black uppercase rounded-full tracking-widest flex items-center gap-1.5 shadow-sm">
                                                                    <ShieldCheck className="w-3.5 h-3.5" /> Origen Doctrinal
                                                                </span>
                                                            )}
                                                            <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-full tracking-[0.1em] ${
                                                                d.estado_vigencia === 'vigente' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
                                                            }`}>
                                                                {d.estado_vigencia}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-2xl font-serif font-black text-slate-900 leading-[1.2] group-hover:text-cgr-navy transition-colors">
                                                            {d.titulo || "Dictamen sin título descriptivo"}
                                                        </h3>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-slate-400 font-bold shrink-0 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
                                                        <Calendar className="w-4 h-4 text-cgr-gold" />
                                                        <span className="text-xs">{formatSimpleDate(d.fecha_documento, "S/F")}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-50">
                                                    <Link
                                                        to={`/dictamen/${d.dictamen_id}`}
                                                        className="inline-flex items-center gap-2 text-xs font-black text-cgr-navy uppercase tracking-widest hover:text-cgr-blue transition-all group/link"
                                                    >
                                                        Explorar análisis <ExternalLink className="w-4 h-4 group-hover/link:translate-y-[-2px] group-hover/link:translate-x-[2px] transition-transform" />
                                                    </Link>
                                                    <div className="flex items-center gap-3">
                                                        <button className="p-2.5 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-cgr-blue transition-all border border-transparent hover:border-slate-200">
                                                            <FileText className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                             </AnimatePresence>
                         </div>
                     </section>
                </div>

                {/* Columna Derecha / Sidebar Premium */}
                <div className="lg:col-span-4 space-y-10">
                    {/* Respuesta IA Sintética */}
                    {regimen.pjo?.respuesta_sintetica && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.6 }}
                            className="bg-cgr-navy rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group/sintesis sticky top-12"
                        >
                            {/* Decorative element */}
                            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover/sintesis:scale-110 transition-transform duration-700">
                                <Sparkles className="w-48 h-48" />
                            </div>

                            <div className="relative z-10 space-y-8">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-cgr-gold flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-cgr-gold animate-pulse" />
                                        Síntesis Resolutiva
                                    </h3>
                                    <Info className="w-4 h-4 text-white/20" />
                                </div>

                                <div className="space-y-6 font-serif text-xl leading-relaxed text-blue-50/90 font-medium italic">
                                    {regimen.pjo.respuesta_sintetica}
                                </div>

                                <div className="pt-8 border-t border-white/10">
                                    <p className="text-[10px] text-white/30 font-bold leading-relaxed uppercase tracking-tighter">
                                        Esta síntesis representa el criterio jurisprudencial visible tras el análisis de {dictamenes.length} pronunciamientos.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Marco Normativo */}
                    {regimen.normas && regimen.normas.length > 0 && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="bg-white border-2 border-slate-100 rounded-[3rem] p-10 shadow-premium group/normas"
                        >
                            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-10 flex items-center gap-3">
                                <Scale className="w-5 h-5 text-cgr-gold" />
                                Sustento Normativo
                            </h3>
                            <div className="space-y-6">
                                {regimen.normas.map((norma: any, i: number) => (
                                    <div key={i} className="flex items-start gap-6 group/norma">
                                        <div className="mt-1 flex-shrink-0 bg-slate-50 border border-slate-100 p-3 rounded-2xl group-hover/norma:bg-cgr-gold group-hover/norma:text-cgr-navy transition-all duration-300">
                                            <FileText className="w-5 h-5 text-slate-400 group-hover/norma:text-cgr-navy" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-serif font-black text-slate-900 text-lg leading-tight group-hover/norma:text-cgr-navy transition-colors">{norma.norma}</p>
                                            <p className="text-xs text-slate-400 font-medium uppercase tracking-tighter">Artículo {norma.articulo || "Gral."}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
