import { FileText, Calendar, Building2, Download, Share2, Sparkles, FileStack, Info } from "lucide-react";
import { Link } from "react-router-dom";
import type { DictamenMeta, RelacionCausa } from "../../types";
import { formatRobustDate } from "../../lib/date";

interface DictamenCardProps {
    dictamen: DictamenMeta;
}

export function DictamenCard({ dictamen }: DictamenCardProps) {
    const isEnriched = dictamen.estado === "enriched" || dictamen.estado === "vectorized";

    return (
        <div className="relative group block bg-white rounded-2xl border border-slate-200 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-premium hover:-translate-y-1">
            <Link
                to={`/dictamen/${dictamen.id}`}
                className="block h-full p-6 relative z-10"
            >
                {/* Micro-animación premium: Barra lateral azul que se expande al pasar el mouse por encima (hover) */}
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-cgr-navy to-cgr-blue transform origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 ease-out" />

                <div className="flex justify-between items-start mb-4 relative z-10 pl-2">
                    <div className="flex items-center gap-4">
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors shadow-sm">
                            <FileText className="w-5 h-5 text-slate-500 group-hover:text-cgr-blue transition-colors" />
                        </div>
                        <div>
                            <h3 className="font-sans font-bold text-lg md:text-xl text-slate-800 group-hover:text-cgr-navy transition-colors leading-tight">
                                N° {dictamen.id}
                            </h3>
                            <div className="mt-1 flex items-center gap-2">
                                {dictamen.genera_jurisprudencia ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-tight">
                                        <Sparkles className="w-3 h-3" /> Genera Jurisprudencia
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                        <FileStack className="w-3 h-3" /> Dictamen Estándar
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-end">
                        {isEnriched ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-cgr-blue border border-blue-200 shadow-sm tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-cgr-blue" />
                                ANÁLISIS IA
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 border border-slate-200">
                                ESTÁNDAR
                            </span>
                        )}
                    </div>
                </div>

                <p className="text-slate-700 line-clamp-2 md:line-clamp-3 mb-6 text-lg leading-relaxed pl-2 font-serif font-medium">
                    {dictamen.resumen || dictamen.materia}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500 pl-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                        <div className="flex items-center gap-2 group-hover:text-cgr-navy transition-colors font-medium">
                            <Calendar className="w-4 h-4 text-slate-400 group-hover:text-cgr-navy" />
                            <span>{formatRobustDate(dictamen.fecha_documento)}</span>
                        </div>
                        {dictamen.division_nombre && (
                            <div className="flex items-center gap-2 group-hover:text-cgr-navy transition-colors font-medium">
                                <Building2 className="w-4 h-4 text-slate-400 group-hover:text-cgr-navy" />
                                <span className="line-clamp-1 max-w-[150px]">{dictamen.division_nombre}</span>
                            </div>
                        )}
                        
                        {/* Indicadores de Relaciones Jurídicas (Retro-Update) */}
                        {dictamen.relaciones_causa && dictamen.relaciones_causa.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1 sm:mt-0">
                                {dictamen.relaciones_causa.map((rel, idx) => (
                                    <div key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] font-bold text-amber-700 uppercase tracking-tight shadow-sm hover:bg-amber-100 transition-colors">
                                        <Info className="w-3 h-3" />
                                        <span>{rel.tipo_accion}</span>
                                        <span className="text-amber-500 opacity-60">|</span>
                                        <span className="font-mono text-[9px]">{rel.origen_id}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Botones de acción rápida: Solo visibles al pasar el mouse encima de la tarjeta */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-cgr-blue transition-colors">
                            <Download className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-cgr-blue transition-colors">
                            <Share2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </Link>
        </div>
    );
}
