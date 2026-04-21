import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
    Sparkles, 
    ChevronRight, 
    Scale, 
    Layers,
    Clock,
    Search
} from "lucide-react";
import type { RegimenSimulado } from "../../types";

export function PjoBentoGrid() {
    const [regimenes, setRegimenes] = useState<RegimenSimulado[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRegimenes = async () => {
            try {
                const response = await fetch("https://cgr-platform.abogado.workers.dev/api/v1/public/regimenes?limit=6");
                const data = await response.json();
                // Solo mostrar los que tengan PJO pregunta
                setRegimenes(data.regimenes.filter((r: RegimenSimulado) => r.pjo_pregunta));
            } catch (error) {
                console.error("Error fetching regimenes for home:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRegimenes();
    }, []);

    if (loading) {
        return (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-64 rounded-[2rem] bg-slate-100 animate-pulse" />
                ))}
            </div>
        );
    }

    if (regimenes.length === 0) return null;

    return (
        <section className="space-y-8 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-cgr-gold text-[10px] font-bold uppercase tracking-[0.2em]">
                        <Sparkles className="w-4 h-4" /> Jurisprudencia estructurada
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-cgr-navy">
                        Explorador de Problemas Jurídicos
                    </h2>
                    <p className="text-slate-500 max-w-2xl">
                        Acceso directo a regímenes consolidados donde la jurisprudencia ya ha definido criterios operativos claros.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regimenes.map((regimen, index) => (
                    <motion.div
                        key={regimen.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Link 
                            to={`/regimen/${regimen.id}`}
                            className="group block relative h-full bg-white border border-slate-200 rounded-lg p-8 shadow-sm hover:shadow-xl hover:border-cgr-navy/20 transition-all duration-500 overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
                                <Scale className="w-32 h-32" />
                            </div>

                            <div className="relative z-10 flex flex-col h-full space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                        regimen.estado === 'activo' 
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                            : 'bg-amber-50 text-amber-600 border border-amber-100'
                                    }`}>
                                        {regimen.estado}
                                    </span>
                                    <div className="text-slate-300 group-hover:text-cgr-navy transition-colors">
                                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>

                                <div className="flex-1 space-y-3">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-tight group-hover:text-cgr-blue transition-colors">
                                        {regimen.nombre}
                                    </h3>
                                    <p className="text-lg font-serif font-bold text-slate-800 leading-snug">
                                        "{regimen.pjo_pregunta}"
                                    </p>
                                </div>

                                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1">
                                            <Layers className="w-3 h-3" /> {regimen.normas_count} normas
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Actualizado
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}

                {/* Card de exploración libre */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: regimenes.length * 0.1 }}
                >
                    <div className="h-full bg-gradient-to-br from-cgr-navy to-slate-900 rounded-[2rem] p-8 text-white flex flex-col justify-between shadow-lg group">
                        <div className="space-y-4">
                            <div className="p-3 bg-white/10 rounded-2xl w-fit">
                                <Search className="w-6 h-6 text-cgr-gold" />
                            </div>
                            <h3 className="text-2xl font-serif font-bold leading-tight">
                                ¿No encuentras el problema específico?
                            </h3>
                            <p className="text-blue-100/70 text-sm leading-relaxed">
                                Usa el buscador superior para explorar el corpus completo mediante lenguaje natural.
                            </p>
                        </div>
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-cgr-gold">
                                +82,000 Dictámenes Indexados
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
