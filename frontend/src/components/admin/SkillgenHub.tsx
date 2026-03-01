import { motion } from 'framer-motion';
import { Network, Bot, ShieldCheck, Cpu } from 'lucide-react';

export function SkillgenHub() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <Bot className="w-8 h-8 text-cgr-gold" />
                        Gobernanza de Agentes: Skillgen
                    </h2>
                    <p className="text-slate-500 mt-1">
                        Arquitectura y estado del orquestador autónomo de análisis jurídico.
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-sm font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    Etapa 1 Validada
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Etapa 1 Status */}
                <div className="lg:col-span-1 bg-white border border-slate-200 shadow-sm p-6 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-3xl rounded-full" />
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Etapa 1: Enrutamiento Determinista</h3>
                    <ul className="space-y-3">
                        <StatusItem label="Normalización de Incidentes" done />
                        <StatusItem label="Persistencia en D1" done />
                        <StatusItem label="Fallas controladas (Sandbox)" done />
                    </ul>
                    <div className="mt-6 pt-4 border-t border-slate-700/50">
                        <p className="text-xs text-slate-500">Última validación: 2026-02-26</p>
                    </div>
                </div>

                {/* Blueprint Visualizer */}
                <div className="lg:col-span-2 bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col items-center justify-center relative min-h-[300px] shadow-inner">
                    <h3 className="text-lg font-bold text-slate-700 absolute top-6 left-6 flex items-center gap-2">
                        <Network className="text-blue-500 w-5 h-5" />
                        Blueprint Conceptual (Etapa 2 - Iteración 1)
                    </h3>

                    {/* Visual representation of the agent network */}
                    <div className="relative w-full max-w-lg mt-12 flex flex-col items-center gap-8">
                        {/* Orchestrator */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-cgr-navy border-2 border-cgr-gold p-4 rounded-xl shadow-[0_0_30px_rgba(234,179,8,0.2)] z-10 flex flex-col items-center"
                        >
                            <Cpu className="text-cgr-gold w-8 h-8 mb-2" />
                            <span className="font-bold text-white tracking-wider">SKILLGEN BASE ORCHESTRATOR</span>
                        </motion.div>

                        <div className="absolute top-16 bottom-16 w-0.5 bg-slate-700 -z-0" />
                        <div className="w-full flex justify-between px-12 relative z-10">
                            {/* Skill 1 */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="bg-white border border-blue-500/50 p-3 rounded-lg text-center shadow-sm"
                            >
                                <div className="w-2 h-2 bg-blue-500 rounded-full mx-auto mb-2 animate-pulse" />
                                <span className="text-sm text-slate-700 font-medium">Catálogo de Skills API</span>
                            </motion.div>

                            {/* Skill 2 */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="bg-white border border-purple-500/50 p-3 rounded-lg text-center shadow-sm"
                            >
                                <div className="w-2 h-2 bg-purple-500 rounded-full mx-auto mb-2 animate-pulse" />
                                <span className="text-sm text-slate-700 font-medium">Fallback/Rollback</span>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusItem({ label, done }: { label: string, done: boolean }) {
    return (
        <li className="flex items-center gap-3 text-sm">
            <div className={`flex items-center justify-center w-5 h-5 rounded-full ${done ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                {done ? '✓' : '○'}
            </div>
            <span className={done ? 'text-slate-700 font-medium' : 'text-slate-500'}>{label}</span>
        </li>
    );
}
