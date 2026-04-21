import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { DatabaseZap, ShieldAlert, CheckCircle2, Activity, AlertTriangle } from 'lucide-react';

type OperacionalData = {
    en_paso: number;
    en_source: number;
    count: number;
};
type TransaccionalData = {
    estado: string | null;
    nombre: string;
    descripcion: string;
    etapa: string;
    catalogado: 0 | 1;
    count: number;
};

export function OperacionalStats({ opData, transData }: { opData: OperacionalData[], transData: TransaccionalData[] }) {
    // Calcular KV Sync completados vs pendientes
    const totalSync = opData.reduce((acc, curr) => acc + curr.count, 0);
    const syncedPaso = opData.filter(d => d.en_paso === 1).reduce((acc, curr) => acc + curr.count, 0);
    const unsyncedPaso = totalSync - syncedPaso;

    const kvSyncPieData = [
        { name: 'Sincronizados (Paso)', value: syncedPaso },
        { name: 'Pendientes', value: unsyncedPaso },
    ];
    const COLORS = ['#10b981', '#ef4444'];
    const stageTotals = transData.reduce<Record<string, number>>((acc, item) => {
        acc[item.etapa] = (acc[item.etapa] ?? 0) + item.count;
        return acc;
    }, {});
    const uncatalogued = transData.filter(item => item.catalogado === 0);

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PipelineCard label="Pendiente de enrichment" value={stageTotals.pendiente_enrichment ?? 0} />
                <PipelineCard label="Pendiente de vectorización" value={stageTotals.pendiente_vectorizacion ?? 0} tone="green" />
                <PipelineCard label="Vectorizado" value={stageTotals.publicable ?? 0} tone="gold" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Cuello de Botella Transaccional (Distribución de Estados) */}
                <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Activity className="text-cgr-gold w-5 h-5" />
                        Distribución de Estados (Embudos)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={transData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                                <XAxis type="number" stroke="#e2e8f0" tick={{ fill: '#64748b' }} />
                                <YAxis dataKey="nombre" type="category" width={165} stroke="#e2e8f0" tick={{ fill: '#64748b', fontWeight: 500, fontSize: 11 }} />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#1e293b' }}
                                    formatter={(value, _name, props) => [`${Number(value).toLocaleString()} dictámenes`, props.payload.estado ?? 'sin_estado']}
                                />
                                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                                    {transData.map((e, index) => (
                                        <Cell key={`cell-${index}`} fill={colorForStage(e.etapa)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {uncatalogued.length > 0 && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            <AlertTriangle className="mr-2 inline h-4 w-4" />
                            Hay {uncatalogued.length} estado(s) sin catálogo visible: {uncatalogued.map(item => item.estado ?? "sin_estado").join(", ")}.
                        </div>
                    )}
                </div>

                {/* KV Sync Status */}
                <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <DatabaseZap className="text-blue-500 w-5 h-5" />
                        Salud de Replicación KV (Source vs Paso)
                    </h3>
                    <div className="flex flex-col md:flex-row items-center gap-8 h-64">
                        <div className="h-full w-full md:w-1/2">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={kvSyncPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {kvSyncPieData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#1e293b' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-3 bg-green-50 p-4 rounded-xl border border-green-200">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                                <div>
                                    <p className="text-2xl font-bold text-slate-800">{syncedPaso.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Sincronizados D1 → KV</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-red-50 p-4 rounded-xl border border-red-200">
                                <ShieldAlert className="w-8 h-8 text-red-500" />
                                <div>
                                    <p className="text-2xl font-bold text-slate-800">{unsyncedPaso.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Pendientes de Sync</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

function PipelineCard({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "green" | "gold" }) {
    const toneClass = {
        blue: "border-sky-200 bg-sky-50 text-sky-800",
        green: "border-emerald-200 bg-emerald-50 text-emerald-800",
        gold: "border-yellow-200 bg-yellow-50 text-yellow-800",
    }[tone];
    return (
        <div className={`rounded-xl border p-5 shadow-sm ${toneClass}`}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-2 text-3xl font-black">{value.toLocaleString()}</p>
        </div>
    );
}

function colorForStage(stage: string) {
    if (stage === 'publicable') return '#eab308';
    if (stage === 'pendiente_vectorizacion' || stage === 'vectorizacion') return '#22c55e';
    if (stage === 'enrichment' || stage === 'pendiente_enrichment') return '#0ea5e9';
    if (stage === 'incidente' || stage === 'sin_catalogo') return '#ef4444';
    return '#64748b';
}
