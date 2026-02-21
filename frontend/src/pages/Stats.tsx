import { useEffect, useState } from "react";
import { BarChart2, Calendar, FileText, Activity } from "lucide-react";
import type { StatsResponse } from "../types";

export function Stats() {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/stats')
            .then(res => res.json())
            .then((data: StatsResponse) => setStats(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <div className="animate-spin w-10 h-10 border-4 border-slate-200 border-t-cgr-blue rounded-full"></div>
                <p className="font-sans text-cgr-navy font-semibold tracking-widest uppercase text-sm animate-pulse">Cargando Estadísticas...</p>
            </div>
        );
    }

    if (!stats) return null;

    // Encontrar el conteo máximo para el escalado de la gráfica
    const maxCount = Math.max(...stats.by_year.map(d => d.count), 1);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-7xl mx-auto">
            <header className="space-y-4 border-b border-slate-200 pb-6">
                <h1 className="text-4xl font-serif font-bold text-cgr-navy flex items-center gap-4">
                    <Activity className="w-8 h-8 text-cgr-blue" />
                    Estadísticas del Repositorio
                </h1>
                <p className="text-slate-500 font-sans text-lg font-medium">
                    Visión general cuantitativa de la jurisprudencia administrativa disponible en el sistema.
                </p>
            </header>

            {/* KPI Cards Premium */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Docs */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 transition-all hover:shadow-md hover:border-cgr-blue duration-300">
                    <div className="p-4 bg-slate-50 text-cgr-blue rounded-xl border border-slate-100 shadow-sm">
                        <FileText className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Dictámenes</p>
                        <p className="text-3xl font-bold text-cgr-navy tracking-tight">{stats.total.toLocaleString()}</p>
                    </div>
                </div>

                {/* Last Update */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 transition-all hover:shadow-md hover:border-cgr-blue duration-300">
                    <div className="p-4 bg-slate-50 text-cgr-red rounded-xl border border-slate-100 shadow-sm">
                        <Calendar className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Última Actualización</p>
                        <p className="text-xl font-bold text-cgr-navy tracking-tight">
                            {new Date(stats.last_updated).toLocaleDateString('es-CL', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                {/* Years Covered */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 transition-all hover:shadow-md hover:border-cgr-blue duration-300">
                    <div className="p-4 bg-slate-50 text-cgr-gold rounded-xl border border-slate-100 shadow-sm">
                        <BarChart2 className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Años Cubiertos</p>
                        <p className="text-3xl font-bold text-cgr-navy tracking-tight">{stats.by_year.length} Años</p>
                    </div>
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-bold text-cgr-navy mb-8 font-sans uppercase tracking-wider flex items-center gap-3">
                    <span className="w-6 h-1 bg-cgr-blue rounded-full"></span>
                    Distribución por Año Contable
                </h2>

                <div className="h-72 flex items-end gap-2 overflow-x-auto pb-6 relative">
                    {/* Y-axis background lines (optional, for aesthetics) */}
                    <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-full h-px bg-slate-100"></div>
                        ))}
                    </div>

                    {stats.by_year.map((item) => {
                        const heightPercent = (item.count / maxCount) * 100;
                        return (
                            <div key={item.anio} className="flex-1 min-w-[40px] flex flex-col items-center group relative z-10 h-full justify-end">
                                {/* Información contextual (Tooltip) */}
                                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-cgr-navy text-white font-sans text-xs py-1.5 px-3 rounded-lg shadow-md whitespace-nowrap pointer-events-none border border-cgr-navy">
                                    <span className="font-bold">{item.anio}</span>: {item.toLocaleString()} Registros
                                    {/* Tooltip triangle */}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-cgr-navy"></div>
                                </div>

                                {/* Barra de la gráfica */}
                                <div
                                    className="w-full max-w-[40px] bg-slate-100 rounded-t-md group-hover:bg-blue-50 transition-all border border-b-0 border-slate-200 overflow-hidden relative"
                                    style={{ height: `${heightPercent}%` }}
                                >
                                    {/* Fill overlay on hover */}
                                    <div className="absolute bottom-0 left-0 w-full bg-cgr-blue h-0 group-hover:h-full transition-all duration-300 opacity-20" />
                                </div>

                                {/* Etiqueta del año */}
                                <span className="text-[10px] text-slate-500 mt-3 font-semibold font-mono text-center">
                                    {item.anio}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
