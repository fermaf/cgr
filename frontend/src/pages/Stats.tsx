import { useEffect, useState, useRef } from "react";
import { FileText, Activity, Flame, Gavel, Scale } from "lucide-react";
import type { StatsResponse, MultidimensionalResponse } from "../types";

export function Stats() {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [multiStats, setMultiStats] = useState<MultidimensionalResponse | null>(null);
    const [heatmap, setHeatmap] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredYear, setHoveredYear] = useState<any | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const yearsData = multiStats?.volumetria.sort((a, b) => a.anio - b.anio) || [];
    const maxCount = Math.max(...yearsData.map(d => d.count), 1);

    useEffect(() => {
        if (!hoveredYear && yearsData.length > 0) {
            setHoveredYear(yearsData[yearsData.length - 1]);
        }
        if (multiStats && scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
    }, [multiStats, yearsData, hoveredYear]);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [sRes, mRes, hRes] = await Promise.all([
                    fetch('/api/v1/stats').then(r => r.json()),
                    fetch('/api/v1/analytics/multidimensional').then(r => r.json()),
                    fetch('/api/v1/analytics/statutes/heatmap?limit=20').then(r => r.json())
                ]);
                setStats(sRes);
                setMultiStats(mRes);
                setHeatmap(hRes.data || []);
            } catch (e) {
                console.error("Error fetching stats:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <div className="animate-spin w-10 h-10 border-4 border-slate-200 border-t-cgr-blue rounded-full"></div>
                <p className="font-sans text-cgr-navy font-semibold tracking-widest uppercase text-sm animate-pulse">Cargando Analíticas...</p>
            </div>
        );
    }

    if (!stats || !multiStats) return null;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-7xl mx-auto pb-20">
            <header className="space-y-4 border-b border-slate-200 pb-6">
                <h1 className="text-4xl font-serif font-bold text-cgr-navy flex items-center gap-4">
                    <Activity className="w-8 h-8 text-cgr-blue" />
                    Analítica Multidimensional
                </h1>
                <p className="text-slate-500 font-sans text-lg font-medium">
                    Exploración visual de la producción jurídica y jurisprudencia administrativa de la Contraloría.
                </p>
            </header>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
                    <div className="p-4 bg-blue-50 text-cgr-blue rounded-xl">
                        <FileText className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Dictámenes</p>
                        <p className="text-3xl font-bold text-cgr-navy tracking-tight">{stats.total.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
                    <div className="p-4 bg-amber-50 text-amber-600 rounded-xl">
                        <Scale className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Dictámenes que han producido jurisprudencia</p>
                        <p className="text-3xl font-bold text-amber-600 tracking-tight">
                            {multiStats.semantica.impacto.jurisprudencia.toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
                    <div className="p-4 bg-slate-50 text-slate-600 rounded-xl">
                        <Flame className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Carga Histórica</p>
                        <p className="text-3xl font-bold text-slate-600 tracking-tight">{yearsData.length} Años</p>
                    </div>
                </div>
            </div>

            {/* Chart Section - REDISEÑADO ARMÓNICO */}
            <div className="relative border border-slate-200 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
                {/* Panel de Estado STICKY */}
                <div className="p-8 border-b border-slate-100 bg-slate-50/80 backdrop-blur-xl relative z-50">
                    <div className={`transition-all duration-500 ${hoveredYear ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-8">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-cgr-blue/10 rounded-2xl flex items-center justify-center border border-cgr-blue/20">
                                    <Activity className="w-8 h-8 text-cgr-blue" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-cgr-navy tracking-tighter flex items-center gap-3">
                                        Período {hoveredYear?.anio}
                                        <span className="text-[10px] bg-cgr-blue/10 text-cgr-blue px-2 py-0.5 rounded border border-cgr-blue/20 uppercase tracking-widest font-mono">Oficial</span>
                                    </h3>
                                    <h3 className="text-lg font-bold text-slate-900">Comparativa de Dictámenes totales y los que han producido jurisprudencia</h3>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="px-6 py-3 text-center border-r border-slate-100 min-w-[120px]">
                                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1.5">Total</p>
                                    <p className="text-2xl font-black text-cgr-navy font-mono">{hoveredYear?.count.toLocaleString()}</p>
                                </div>
                                <div className="px-6 py-3 text-center min-w-[120px]">
                                    <p className="text-[10px] text-amber-600 uppercase font-black tracking-widest mb-1.5">Han generado jurisprudencia</p>
                                    <p className="text-2xl font-black text-amber-600 font-mono tabular-nums">{hoveredYear?.jurisprudencia.toLocaleString()}</p>
                                </div>
                                <div className="px-5 py-3 bg-amber-500/10 rounded-xl border border-amber-500/20 min-w-[90px] text-center">
                                    <p className="text-[10px] text-amber-600 uppercase font-black mb-1">Ratio</p>
                                    <p className="text-xl font-black text-amber-600 underline decoration-amber-500/40 underline-offset-4">
                                        {((hoveredYear?.jurisprudencia / (hoveredYear?.count || 1)) * 100).toFixed(1)}%
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    ref={scrollContainerRef}
                    className="h-[450px] flex items-end gap-4 py-8 px-12 overflow-x-auto relative scroll-smooth group/chart bg-gradient-to-b from-white to-slate-50"
                >
                    {/* Guías de Escala en el Fondo */}
                    <div className="absolute left-0 right-0 h-full pointer-events-none px-12 top-0">
                        {[0, 25, 50, 75, 100].map(p => (
                            <div key={p} className="absolute w-full border-t border-slate-200/50" style={{ bottom: `${p}%` }}>
                                <span className="absolute -left-8 text-[9px] text-slate-400 font-mono translate-y-[-50%]">{p}%</span>
                            </div>
                        ))}
                    </div>

                    {yearsData.map((item) => {
                        const totalHeight = Math.max((item.count / maxCount) * 100, 2);
                        const jurisRatio = (item.jurisprudencia / (item.count || 1)) * 100;
                        const isActive = hoveredYear?.anio === item.anio;

                        return (
                            <div 
                                key={item.anio} 
                                className="flex-1 min-w-[85px] flex flex-col items-center group relative z-10 h-full justify-end cursor-pointer"
                                onMouseEnter={() => setHoveredYear(item)}
                            >
                                <div className="w-full max-w-[50px] flex flex-col justify-end h-full relative">
                                    <div
                                        className={`w-full bg-slate-200 rounded-t-3xl border border-slate-100 relative overflow-hidden transition-all duration-300 group-hover:bg-slate-300 shadow-sm ${isActive ? 'ring-4 ring-cgr-blue/30 scale-105 bg-slate-300 shadow-xl' : ''}`}
                                        style={{ height: `${totalHeight}%` }}
                                    >
                                        {/* Barra de Jurisprudencia */}
                                        {item.jurisprudencia > 0 && (
                                            <div
                                                className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 transition-all duration-1000 border-t border-white/40 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                                                style={{ height: `${jurisRatio}%`, minHeight: '6px' }}
                                            >
                                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:12px_12px] opacity-20"></div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <span className={`text-[12px] mt-6 font-bold font-mono transition-all duration-300 tracking-tighter ${isActive ? 'text-cgr-blue scale-110 underline decoration-2 underline-offset-4' : 'text-slate-400'}`}>
                                    {item.anio}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Heatmap Section */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8">
                <div className="mb-8">
                    <h2 className="text-xl font-black text-cgr-navy font-sans uppercase tracking-widest flex items-center gap-3">
                        <span className="w-8 h-1.5 bg-cgr-blue rounded-full"></span>
                        Densidad de Citaciones Normativas
                    </h2>
                    <p className="text-slate-500 mt-2 font-medium font-sans">Leyes y Decretos más invocados oficialmente por la Contraloría.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 font-sans">
                    {heatmap.slice(0, 16).map((item, idx) => {
                        const isTop3 = idx < 3;
                        const isMid = idx >= 3 && idx < 8;
                        const bgColor = isTop3 ? 'bg-blue-50/50' : (isMid ? 'bg-slate-50' : 'bg-white');
                        const borderColor = isTop3 ? 'border-cgr-blue/30' : 'border-slate-200';
                        const badgeBg = isTop3 ? 'bg-cgr-blue text-white' : 'bg-slate-100 text-slate-600';

                        return (
                            <div key={idx} className={`p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${bgColor} ${borderColor} relative overflow-hidden`}>
                                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                                    <FileText className="w-32 h-32" />
                                </div>
                                <div className="relative z-10 flex flex-col h-full justify-between">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${badgeBg} border border-black/5 shadow-sm`}>
                                            {item.tipo_norma} {item.numero}
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-2xl font-black ${isTop3 ? 'text-cgr-blue' : 'text-slate-800'} leading-none`}>
                                                {item.total_refs}
                                            </span>
                                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-widest mt-1">Citas</span>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-black/5 space-y-2">
                                        <p className="text-xs text-slate-600 font-medium font-sans">
                                            Presente en <strong className="text-slate-900">{item.total_dictamenes}</strong> dictámenes.
                                        </p>
                                        <div className="w-full bg-slate-200/50 rounded-full h-1.5 overflow-hidden">
                                            <div className={`h-full ${isTop3 ? 'bg-cgr-blue' : 'bg-slate-400'}`} style={{ width: `${(item.total_refs / (heatmap[0]?.total_refs || 1)) * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-medium font-sans">
                <Gavel className="w-4 h-4" />
                <span>Base legal y jurisprudencia oficial validada por CGR.ai</span>
            </div>
        </div>
    );
}
