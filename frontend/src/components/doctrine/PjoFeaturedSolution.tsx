import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { 
    ArrowRight, 
    Scale, 
    History,
    ExternalLink
} from "lucide-react";
import type { RegimenSimulado } from "../../types";

interface PjoFeaturedSolutionProps {
    regimen: RegimenSimulado;
}

export function PjoFeaturedSolution({ regimen }: PjoFeaturedSolutionProps) {
    if (!regimen.pjo_respuesta) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mb-8 overflow-hidden rounded-lg border-2 border-cgr-gold/30 bg-white shadow-xl"
        >
            <div className="relative p-8 md:p-10">
                <div className="absolute top-0 right-0 p-8 opacity-[0.05] pointer-events-none">
                    <Scale className="w-48 h-48 text-cgr-navy" />
                </div>

                <div className="relative z-10 flex flex-col gap-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-cgr-gold/10 border border-cgr-gold/20">
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-cgr-navy/70">
                                Respuesta jurisprudencial
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                Régimen:
                            </span>
                            <Link 
                                to={`/regimen/${regimen.id}`}
                                className="text-[11px] font-black text-cgr-navy uppercase tracking-tight hover:underline flex items-center gap-1"
                            >
                                {regimen.nombre}
                                <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>

                    <div className="space-y-4 max-w-4xl">
                        <h2 className="text-2xl md:text-3xl font-serif font-bold text-cgr-navy leading-tight">
                            {regimen.pjo_pregunta}
                        </h2>
                        
                        <div className="relative">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cgr-gold/40 rounded-full" />
                            <div className="pl-6">
                                <p className="text-lg md:text-xl text-slate-700 leading-relaxed font-medium">
                                    {regimen.pjo_respuesta}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200/60">
                        <Link
                            to={`/regimen/${regimen.id}`}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-cgr-navy text-white text-sm font-bold transition-all hover:bg-cgr-blue hover:shadow-lg hover:shadow-cgr-blue/20 group"
                        >
                            Ver evolución jurisprudencial
                            <History className="w-4 h-4 group-hover:rotate-[-45deg] transition-transform" />
                        </Link>
                        
                        <button className="text-sm font-bold text-slate-500 hover:text-cgr-navy transition-colors flex items-center gap-2 px-4">
                            ¿Por qué este criterio?
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
