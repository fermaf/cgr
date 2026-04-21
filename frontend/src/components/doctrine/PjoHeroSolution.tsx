import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { 
    History,
    ArrowUpRight,
    LibraryBig,
    Scale
} from "lucide-react";
import type { RegimenSimulado } from "../../types";

interface PjoHeroSolutionProps {
    regimen: RegimenSimulado;
    submittedQuery: string;
}

export function PjoHeroSolution({ regimen, submittedQuery }: PjoHeroSolutionProps) {
    if (!regimen.pjo_respuesta) return null;

    return (
        <motion.article
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-lg border border-cgr-navy/10 bg-cgr-navy text-white shadow-xl relative"
        >
            <div className="absolute top-0 right-0 p-12 opacity-[0.07] pointer-events-none">
                <Scale className="w-64 h-64 text-white" />
            </div>

            <div className="relative z-10 space-y-8 p-8 md:p-12">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="inline-flex items-center gap-2 rounded-md border border-cgr-gold/30 bg-cgr-gold/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-cgr-gold">
                        Respuesta jurisprudencial
                    </div>
                    
                    <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-blue-200">
                        <LibraryBig className="h-3.5 w-3.5" />
                        Régimen: {regimen.nombre}
                    </div>
                </div>

                <div className="space-y-6 max-w-5xl">
                    <div className="space-y-2">
                        <span className="text-blue-300/60 text-xs font-bold uppercase tracking-widest pl-1">
                            Problema jurídico operativo
                        </span>
                        <h2 className="font-serif text-3xl md:text-4xl font-semibold leading-tight text-white">
                            {regimen.pjo_pregunta}
                        </h2>
                    </div>

                    <div className="relative group">
                        <div className="absolute -left-6 top-0 bottom-0 w-1.5 bg-cgr-gold rounded-md opacity-70" />
                        <div className="bg-white/5 backdrop-blur-sm rounded-lg p-8 border border-white/5 shadow-inner transition-all hover:bg-white/10">
                            <p className="text-xl md:text-2xl leading-relaxed text-blue-50 font-medium">
                                {regimen.pjo_respuesta}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-4">
                    <Link
                        to={`/regimen/${regimen.id}`}
                        className="inline-flex items-center gap-3 rounded-md bg-cgr-gold px-8 py-4 text-sm font-black text-cgr-navy transition-all hover:bg-[#f3d86c] shadow-lg shadow-cgr-gold/20"
                    >
                        Abrir ruta de lectura
                        <History className="h-5 w-5" />
                    </Link>

                    <Link
                        to={`/busqueda?q=${encodeURIComponent(submittedQuery)}`}
                        className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-6 py-4 text-sm font-bold text-white transition-all hover:bg-white/20"
                    >
                        Ver todos los dictámenes
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="text-[10px] text-blue-300/40 uppercase tracking-[0.3em] font-medium pt-4">
                    Jurisprudencia administrativa CGR
                </div>
            </div>
        </motion.article>
    );
}
