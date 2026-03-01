import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useMemo } from 'react';

type VolumetriaData = {
    anio: number;
    estado: string;
    count: number;
};

export function TimelineChart({ data }: { data: VolumetriaData[] }) {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Group by year
        const yearMap = new Map<number, any>();
        data.forEach(item => {
            if (!yearMap.has(item.anio)) {
                yearMap.set(item.anio, { year: item.anio, total: 0, vectorized: 0, enriched: 0, ingested: 0, error: 0 });
            }
            const agg = yearMap.get(item.anio);
            agg.total += item.count;
            if (item.estado === 'vectorized') agg.vectorized += item.count;
            else if (item.estado === 'enriched') agg.enriched += item.count;
            else if (item.estado === 'ingested') agg.ingested += item.count;
            else if (item.estado === 'error') agg.error += item.count;
        });

        const arr = Array.from(yearMap.values()).sort((a, b) => a.year - b.year);
        // Maybe filter years before 1990 for better chart density if needed
        return arr;
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
                    </defs>
                    <XAxis dataKey="year" stroke="#cbd5e1" tick={{ fill: '#64748b', fontWeight: 500 }} />
                    <YAxis stroke="#cbd5e1" tick={{ fill: '#64748b', fontWeight: 500 }} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#1e293b' }}
                        itemStyle={{ color: '#1e293b', fontWeight: 500 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', color: '#64748b' }} />
                    <Area type="monotone" dataKey="total" stroke="#818cf8" fillOpacity={1} fill="url(#colorTotal)" name="Total Ingresados" />
                    <Area type="monotone" dataKey="vectorized" stroke="#eab308" fillOpacity={1} fill="url(#colorVectorized)" name="Vectorizados (Completos)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
