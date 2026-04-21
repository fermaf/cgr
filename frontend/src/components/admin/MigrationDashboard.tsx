import { motion } from 'framer-motion';
import {
    TrendingUp,
    AlertCircle,
    CheckCircle2,
    Clock,
    History,
    Database,
    ArrowRight,
    Zap
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts';
import { useMigrationInfo } from '../../hooks/useAdminDashboard';
import { formatSimpleDate } from '../../lib/date';

export function MigrationDashboard() {
    const { data, loading, error } = useMigrationInfo();

    if (loading) {
        return (
            <div className="flex justify-center items-center py-24">
                <div className="w-10 h-10 border-4 border-cgr-gold border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 text-cgr-red bg-cgr-red/10 p-6 rounded-2xl border border-cgr-red/20 mb-6">
                <AlertCircle className="w-6 h-6" />
                <p className="font-semibold">{error}</p>
            </div>
        );
    }

    if (!data) return null;

    const { stats, evolution, events, modelTarget } = data;
    const models = data.models ?? [];
    const normalizedTarget = modelTarget === 'mistralLarge2411' ? 'mistral-large-2411' : modelTarget;
    const targetCount = models.find(item => item.modelo === normalizedTarget)?.count ?? stats.migrated;
    const legacyCount = models.find(item => item.modelo === 'mistral-large-2411')?.count ?? stats.legacy;

    // Calcular porcentaje de progreso
    const progressPercent = Math.round((stats.migrated / (stats.total || 1)) * 100);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Progreso de Migración"
                    value={`${progressPercent}%`}
                    subtitle={`${stats.migrated} de ${stats.total} dictámenes`}
                    icon={TrendingUp}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <StatCard
                    title="Modelo objetivo"
                    value={targetCount.toLocaleString()}
                    subtitle={`Modelo: ${modelTarget}`}
                    icon={CheckCircle2}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
                <StatCard
                    title="Mistral 2411"
                    value={legacyCount.toLocaleString()}
                    subtitle="Enrichment histórico"
                    icon={Clock}
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
                <StatCard
                    title="Incidentes"
                    value={stats.errors.toLocaleString()}
                    subtitle="Requieren revisión manual"
                    icon={AlertCircle}
                    color="text-rose-600"
                    bg="bg-rose-50"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Evolution Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        Velocidad de Enriquecimiento (Últimos 30 días)
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={evolution}>
                                <defs>
                                    <linearGradient id="colorMigration" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorMigration)"
                                    name="Dictámenes procesados"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Breakdown */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Database className="w-5 h-5 text-cgr-gold" />
                        Distribución de Modelos
                    </h3>
                    <div className="space-y-6">
                        {models.map((item, idx) => (
                            <ProgressBar
                                key={item.modelo}
                                label={labelForModel(item.modelo)}
                                current={item.count}
                                total={stats.total}
                                color={colorForModel(item.modelo, idx)}
                            />
                        ))}
                        {models.length === 0 && (
                            <p className="text-sm text-slate-500">No hay distribución de modelos disponible.</p>
                        )}
                    </div>

                    <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-100 italic text-sm text-slate-600">
                        <Zap className="w-4 h-4 inline mr-2 text-cgr-gold" />
                        La distribución usa `enriquecimiento.modelo_llm`; los dictámenes sin enrichment quedan separados como sin modelo.
                    </div>
                </div>
            </div>

            {/* Event Feed */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-500" />
                        Monitor de Eventos en Tiempo Real
                    </h3>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Últimos 30 eventos
                    </div>
                </div>
                <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto scrollbar-hide">
                    {events.map((event, idx) => (
                        <EventRow key={idx} event={event} />
                    ))}
                    {events.length === 0 && (
                        <div className="p-12 text-center text-slate-400">
                            No hay eventos registrados en los últimos 7 días.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, subtitle, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
            <div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
                <h4 className="text-3xl font-bold text-slate-900 mb-1">{value}</h4>
                <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
            </div>
            <div className={`${bg} p-3 rounded-xl`}>
                <Icon className={`w-6 h-6 ${color}`} />
            </div>
        </div>
    );
}

function ProgressBar({ label, current, total, color }: any) {
    const percent = Math.round((current / (total || 1)) * 100);
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-slate-700">{label}</span>
                <span className="text-xs font-mono font-bold text-slate-500">{current.toLocaleString()} ({percent}%)</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`h-full ${color}`}
                />
            </div>
        </div>
    );
}

function labelForModel(model: string) {
    if (model === 'sin_modelo') return 'Sin modelo LLM';
    if (model === 'mistral-large-2411') return 'Mistral Large 2411';
    if (model === 'mistral-large-2512') return 'Mistral Large 2512';
    return model;
}

function colorForModel(model: string, index: number) {
    if (model === 'mistral-large-2512') return 'bg-emerald-500';
    if (model === 'mistral-large-2411') return 'bg-amber-400';
    if (model === 'sin_modelo') return 'bg-slate-300';
    return ['bg-blue-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500'][index % 4];
}

function EventRow({ event }: { event: any }) {
    const isError = event.type === 'skill_event' && event.matched === 0;

    return (
        <div className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4">
            <div className={`mt-1 p-2 rounded-lg ${event.type === 'skill_event'
                ? (isError ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600')
                : 'bg-emerald-100 text-emerald-600'
                }`}>
                {event.type === 'skill_event' ? <Zap className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                    <h5 className="font-bold text-slate-800 text-sm truncate">
                        {event.type === 'skill_event' ? `Evento de Skill: ${event.code}` : `Migración Exitosa: ${event.code}`}
                    </h5>
                    <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap ml-2">
                        {formatSimpleDate(event.timestamp)}
                    </span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2">
                    {event.message}
                </p>
                {event.extra && (
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono truncate">
                            {event.extra}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
