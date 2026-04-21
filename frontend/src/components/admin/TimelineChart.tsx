import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useMemo } from 'react';

type VolumetriaData = {
    anio: number;
    count: number;
    pending_enrichment: number;
    enriching: number;
    pending_vectorization: number;
    vectorizing: number;
    vectorized: number;
    errors: number;
};

export function TimelineChart({ data }: { data: VolumetriaData[] }) {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        return data.map(item => ({
            year: item.anio,
            total: item.count,
            pendienteEnrichment: item.pending_enrichment ?? 0,
            enEnrichment: item.enriching ?? 0,
            pendienteVectorizacion: item.pending_vectorization ?? 0,
            vectorizando: item.vectorizing ?? 0,
            vectorized: item.vectorized,
            errores: item.errors ?? 0
        })).sort((a, b) => a.year - b.year);
    }, [data]);

    if (chartData.length === 0) {
        return <div className="text-slate-400 p-4">No hay datos de volumetría.</div>;
    }

    return (
        <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorVectorized" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#eab308" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPendingVectorization" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorEnrichment" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="year" stroke="#cbd5e1" tick={{ fill: '#64748b', fontWeight: 500 }} />
                    <YAxis stroke="#cbd5e1" tick={{ fill: '#64748b', fontWeight: 500 }} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#1e293b' }}
                        itemStyle={{ color: '#1e293b', fontWeight: 500 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', color: '#64748b' }} />
                    <Area type="monotone" dataKey="total" stroke="#818cf8" fillOpacity={1} fill="url(#colorTotal)" name="Total Dictámenes (CGR)" />
                    <Area type="monotone" dataKey="pendienteEnrichment" stroke="#38bdf8" fillOpacity={1} fill="url(#colorEnrichment)" name="Pendientes de enrichment" />
                    <Area type="monotone" dataKey="enEnrichment" stroke="#0ea5e9" fillOpacity={0.3} fill="url(#colorEnrichment)" name="En enrichment" />
                    <Area type="monotone" dataKey="pendienteVectorizacion" stroke="#22c55e" fillOpacity={1} fill="url(#colorPendingVectorization)" name="Enriquecidos pendientes de vectorización" />
                    <Area type="monotone" dataKey="vectorizando" stroke="#14b8a6" fillOpacity={0.25} fill="url(#colorPendingVectorization)" name="Vectorizando" />
                    <Area type="monotone" dataKey="vectorized" stroke="#eab308" fillOpacity={1} fill="url(#colorVectorized)" name="Vectorizados (Portal Legal)" />
                    <Area type="monotone" dataKey="errores" stroke="#ef4444" fillOpacity={1} fill="url(#colorErrors)" name="Incidentes" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
