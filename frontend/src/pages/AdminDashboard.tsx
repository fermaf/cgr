import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Database, Clock, BrainCircuit, AlertCircle, Bot } from "lucide-react";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { TimelineChart } from "../components/admin/TimelineChart";
import { DictamenHistory } from "../components/admin/DictamenHistory";
import { OperacionalStats } from "../components/admin/OperacionalStats";
import { SemanticHeatmap } from "../components/admin/SemanticHeatmap";
import { SkillgenHub } from "../components/admin/SkillgenHub";

export function AdminDashboard() {
    const [activeTab, setActiveTab] = useState("volumetria");
    const [yearFilter, setYearFilter] = useState<number | undefined>(undefined);

    const { data, loading, error } = useAdminDashboard({
        yearFrom: yearFilter,
        yearTo: yearFilter
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-700 w-full max-w-7xl mx-auto text-white">
            {/* Header WOW */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-cgr-navy shadow-2xl p-8 border border-cgr-navy/20">
                <div className="absolute inset-0 z-0 bg-official opacity-20 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cgr-gold/30 bg-black/20 backdrop-blur-md mb-4 text-cgr-gold text-[10px] font-bold tracking-[0.2em] font-sans uppercase">
                            <span className="w-2 h-2 rounded-full bg-cgr-gold animate-pulse" />
                            Control Total Multidimensional
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-serif font-bold tracking-tight drop-shadow-md">
                            Centro de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cgr-gold">Comando</span>
                        </h1>
                        <p className="text-blue-200 mt-2 font-light max-w-xl">
                            Visualización analítica y topológica de la salud operacional, transaccionalidad y semántica de la plataforma.
                        </p>
                    </div>
                    {/* Global Filter Navbar */}
                    <div className="bg-black/20 backdrop-blur-md border border-white/10 rounded-xl p-4 flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Filtro Global</span>
                        <select
                            className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg pr-8 focus:ring-cgr-gold focus:border-cgr-gold p-2.5 outline-none"
                            value={yearFilter || ""}
                            onChange={(e) => setYearFilter(e.target.value ? parseInt(e.target.value) : undefined)}
                        >
                            <option value="">Histórico (Todos los años)</option>
                            <option value="2025">Año 2025</option>
                            <option value="2024">Año 2024</option>
                            <option value="2023">Año 2023</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Navegación Semántica (Clusters) */}
            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide border-b border-slate-700/50">
                <TabButton
                    icon={Database}
                    label="Volumetría (Cluster C)"
                    active={activeTab === "volumetria"}
                    onClick={() => setActiveTab("volumetria")}
                />
                <TabButton
                    icon={Clock}
                    label="Transaccionalidad (Cluster B)"
                    active={activeTab === "transacciones"}
                    onClick={() => setActiveTab("transacciones")}
                />
                <TabButton
                    icon={Activity}
                    label="Salud Operacional (Cluster A)"
                    active={activeTab === "operacional"}
                    onClick={() => setActiveTab("operacional")}
                />
                <TabButton
                    icon={BrainCircuit}
                    label="Semántica (Cluster D)"
                    active={activeTab === "semantica"}
                    onClick={() => setActiveTab("semantica")}
                />
                <TabButton
                    icon={Bot}
                    label="Agente Skillgen (Cluster E)"
                    active={activeTab === "skillgen"}
                    onClick={() => setActiveTab("skillgen")}
                />
            </div>

            {/* Contenido Dinámico */}
            <div className="min-h-[500px]">
                {loading && (
                    <div className="flex justify-center items-center py-24">
                        <div className="w-10 h-10 border-4 border-cgr-gold border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 text-cgr-red bg-cgr-red/10 p-6 rounded-2xl border border-cgr-red/20 mb-6">
                        <AlertCircle className="w-6 h-6" />
                        <p className="font-semibold">{error}</p>
                    </div>
                )}

                {!loading && !error && data && activeTab === "volumetria" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="p-6 border border-slate-700/50 rounded-2xl bg-slate-900/40 backdrop-blur-md"
                    >
                        <h2 className="text-xl font-bold mb-6 text-slate-100 flex items-center gap-2">
                            <Database className="w-5 h-5 text-cgr-gold" />
                            Tasa de Crecimiento y Brechas Históricas
                        </h2>
                        <TimelineChart data={data.volumetria} />
                    </motion.div>
                )}

                {activeTab === "transacciones" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-6"
                    >
                        <DictamenHistory />
                    </motion.div>
                )}

                {!loading && !error && data && activeTab === "operacional" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-6"
                    >
                        <OperacionalStats opData={data.operacional} transData={data.transaccional} />
                    </motion.div>
                )}

                {!loading && !error && data && activeTab === "semantica" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-6"
                    >
                        <SemanticHeatmap data={data.semantica} />
                    </motion.div>
                )}

                {activeTab === "skillgen" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-6"
                    >
                        <SkillgenHub />
                    </motion.div>
                )}
            </div>
        </div>
    );
}

function TabButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-medium transition-all duration-300 border-b-2 whitespace-nowrap ${active
                ? "bg-cgr-navy/20 border-cgr-gold text-white drop-shadow-md"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
        >
            <Icon className={`w-4 h-4 ${active ? "text-cgr-gold" : ""}`} />
            {label}
        </button>
    );
}
