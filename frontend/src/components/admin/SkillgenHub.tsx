import { motion } from 'framer-motion';
import { Network, Bot, Cpu, Zap, AlertCircle, Activity } from 'lucide-react';
import { useMigrationInfo } from '../../hooks/useAdminDashboard';

export function SkillgenHub() {
    const { data, loading, error } = useMigrationInfo();

    // Filtramos solo los eventos específicos de skill_event para mostrarlos.
    const skillEvents = (data?.events || []).filter(e => e.type === 'skill_event' || e.service === 'skillgen' || (e.message && e.message.toLowerCase().includes('skill')));

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <Bot className="w-8 h-8 text-cgr-gold" />
                        Gobernanza de Agentes: Skillgen
                    </h2>
                    <p className="text-slate-500 mt-1">
                        Log de actividad y auditoría en tiempo real del orquestador autónomo de análisis jurídico.
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-sm font-semibold">
                    <Activity className="w-4 h-4 animate-pulse" />
                    En Operación
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Blueprint / Resumen Operacional */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col justify-start relative shadow-inner">
                    <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2 mb-6">
                        <Network className="text-blue-500 w-5 h-5" />
                        Blueprint (Agente)
                    </h3>

                    <div className="flex flex-col items-center gap-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-cgr-navy border-2 border-cgr-gold p-4 rounded-xl shadow-[0_0_30px_rgba(234,179,8,0.2)] flex flex-col items-center w-full"
                        >
                            <Cpu className="text-cgr-gold w-8 h-8 mb-2" />
                            <span className="text-xs font-bold text-white tracking-wider text-center">SKILLGEN BASE ORCHESTRATOR</span>
                        </motion.div>

                        <div className="w-0.5 h-6 bg-slate-300"></div>

                        <div className="w-full flex justify-between gap-2">
                            <div className="bg-white border border-blue-500/50 p-2 rounded-lg text-center shadow-sm w-full">
                                <span className="text-xs text-slate-700 font-medium shrink-0">Normalización</span>
                            </div>
                            <div className="bg-white border border-purple-500/50 p-2 rounded-lg text-center shadow-sm w-full">
                                <span className="text-xs text-slate-700 font-medium shrink-0">Fallback</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-200">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Estadísticas Rápidas</h4>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-slate-600">Eventos en ventana</span>
                            <span className="text-sm font-bold text-slate-900">{skillEvents.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">Errores detectados</span>
                            <span className="text-sm font-bold text-rose-600">
                                {skillEvents.filter(e => e.matched === 0).length}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Eventos en vivo */}
                <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col h-[500px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-500" />
                            Bitácora de Eventos Skillgen
                        </h3>
                        {loading && <div className="w-4 h-4 border-2 border-cgr-gold border-t-transparent rounded-full animate-spin" />}
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-50 p-2">
                        {error && (
                            <div className="p-6 flex flex-col items-center justify-center text-rose-500 h-full">
                                <AlertCircle className="w-8 h-8 mb-2" />
                                <p className="text-sm font-medium">{error}</p>
                            </div>
                        )}

                        {!error && skillEvents.length === 0 && !loading && (
                            <div className="p-12 text-center flex flex-col items-center justify-center h-full text-slate-400">
                                <Zap className="w-8 h-8 mb-2 opacity-50" />
                                <p>No hay eventos recientes del Skillgen registrados en la bitácora.</p>
                            </div>
                        )}

                        {skillEvents.map((event, idx) => {
                            const isError = event.matched === 0;
                            return (
                                <div key={idx} className="p-3 hover:bg-slate-50 transition-colors flex items-start gap-4 rounded-lg">
                                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isError ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                        <Zap className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <h5 className="font-bold text-slate-800 text-sm truncate">
                                                {event.code || 'Evento anónimo'}
                                                {event.workflow && <span className="ml-2 font-mono text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded">{event.workflow}</span>}
                                            </h5>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap ml-2">
                                                {new Date(event.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-snug">
                                            {event.message}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
