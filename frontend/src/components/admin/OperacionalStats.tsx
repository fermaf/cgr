import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { DatabaseZap, ShieldAlert, CheckCircle2, Activity, Wifi, Server, Database } from 'lucide-react';

type OperacionalData = {
    en_paso: number;
    en_source: number;
    count: number;
};
type TransaccionalData = {
    estado: string;
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

    return (
        <div className="space-y-8">
            {/* Heartbeats de Periféricos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <HeartbeatCard
                    name="Mistral AI Platform"
                    icon={Server}
                    latency="42ms"
                    status="healthy"
                    glowColor="rgba(59, 130, 246, 0.5)"
                />
                <HeartbeatCard
                    name="Pinecone Vector DB"
                    icon={Database}
                    latency="18ms"
                    status="healthy"
                    glowColor="rgba(234, 179, 8, 0.5)"
                />
                <HeartbeatCard
                    name="CGR Core Origin"
                    icon={Wifi}
                    latency="115ms"
                    status="warning"
                    glowColor="rgba(249, 115, 22, 0.5)"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Cuello de Botella Transaccional (Distribución de Estados) */}
                <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="text-cgr-gold w-5 h-5" />
                        Distribución de Estados (Embudos)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={transData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                                <XAxis type="number" stroke="#475569" tick={{ fill: '#94a3b8' }} />
                                <YAxis dataKey="estado" type="category" width={100} stroke="#475569" tick={{ fill: '#94a3b8' }} />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff' }}
                                />
                                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                                    {transData.map((e, index) => (
                                        <Cell key={`cell-${index}`} fill={e.estado === 'vectorized' ? '#eab308' : e.estado === 'error' ? '#ef4444' : '#3b82f6'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* KV Sync Status */}
                <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <DatabaseZap className="text-blue-400 w-5 h-5" />
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
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-3 bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                                <div>
                                    <p className="text-2xl font-bold text-white">{syncedPaso.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">Sincronizados D1 → KV</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                                <ShieldAlert className="w-8 h-8 text-red-500" />
                                <div>
                                    <p className="text-2xl font-bold text-white">{unsyncedPaso.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">Pendientes de Sync</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

function HeartbeatCard({ name, icon: Icon, latency, status, glowColor }: { name: string, icon: any, latency: string, status: 'healthy' | 'warning' | 'error', glowColor: string }) {
    const isHealthy = status === 'healthy';

    return (
        <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between relative overflow-hidden group">
            <div className="flex items-center gap-3">
                <div className="relative">
                    <Icon className={`w-5 h-5 ${isHealthy ? 'text-green-400' : 'text-orange-400'}`} />
                    <div className={`absolute inset-0 blur-md ${isHealthy ? 'bg-green-400' : 'bg-orange-400'} opacity-30`} />
                </div>
                <div>
                    <p className="text-white font-medium text-sm">{name}</p>
                    <p className="text-slate-400 text-xs flex items-center gap-1">
                        Latencia: <span className="text-slate-300 font-mono">{latency}</span>
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-bold text-slate-500">{isHealthy ? 'Online' : 'Degraded'}</span>
                <div className="relative flex h-3 w-3">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isHealthy ? 'bg-green-400' : 'bg-orange-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${isHealthy ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                </div>
            </div>
            {/* Ambient glow on hover */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(circle at right, ${glowColor} 0%, transparent 70%)` }}
            />
        </div>
    );
}
