import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Database, Clock, BrainCircuit, AlertCircle, Bot, Layers } from "lucide-react";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { TimelineChart } from "../components/admin/TimelineChart";
import { DictamenHistory } from "../components/admin/DictamenHistory";
import { OperacionalStats } from "../components/admin/OperacionalStats";
import { SemanticHeatmap } from "../components/admin/SemanticHeatmap";
import { SkillgenHub } from "../components/admin/SkillgenHub";
import { MigrationDashboard } from "../components/admin/MigrationDashboard";
import { BoletinesManager } from "../components/admin/BoletinesManager";

export function AdminDashboard() {
    const [activeTab, setActiveTab] = useState("volumetria");
    const [yearFilter, setYearFilter] = useState<number | undefined>(undefined);

    const { data, loading, error } = useAdminDashboard({
        yearFrom: yearFilter,
        yearTo: yearFilter
    });

    const totalDictamenes = data?.volumetria.reduce((acc, item) => acc + item.count, 0) ?? 0;
    const totalVectorized = data?.volumetria.reduce((acc, item) => acc + item.vectorized, 0) ?? 0;
    const totalPendingVectorization = data?.volumetria.reduce((acc, item) => acc + item.pending_vectorization, 0) ?? 0;
    const totalPendingEnrichment = data?.volumetria.reduce((acc, item) => acc + item.pending_enrichment + item.enriching, 0) ?? 0;
    const topModel = data?.modelos.find((item) => item.modelo !== "sin_modelo") ?? data?.modelos[0];

    return (
        <div className="space-y-8 animate-in fade-in duration-700 w-full max-w-7xl mx-auto text-slate-900">
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
                        <h1 className="text-4xl lg:text-5xl font-serif font-bold tracking-tight drop-shadow-md text-white">
                            Centro de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cgr-gold">Comando</span>
                        </h1>
                        <p className="text-blue-100 mt-2 font-light max-w-xl">
                            Visualización analítica y topológica de la salud operacional, transaccionalidad y semántica de la plataforma.
                        </p>
                    </div>
                    {/* Global Filter Navbar */}
                    <div className="bg-black/20 backdrop-blur-md border border-white/10 rounded-xl p-4 flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Filtro Global</span>
                        <select
                            className="bg-white border border-slate-200 text-slate-800 text-sm rounded-lg pr-8 focus:ring-cgr-gold focus:border-cgr-gold p-2.5 outline-none shadow-sm"
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
            <div className="flex flex-wrap justify-start gap-2 pb-2 border-b border-slate-700/50">
                <TabButton
                    icon={Database}
                    label="Volumetría"
                    active={activeTab === "volumetria"}
                    onClick={() => setActiveTab("volumetria")}
                />
                <TabButton
                    icon={Clock}
                    label="Transaccionalidad"
                    active={activeTab === "transacciones"}
                    onClick={() => setActiveTab("transacciones")}
                />
                <TabButton
                    icon={Activity}
                    label="Salud Operacional"
                    active={activeTab === "operacional"}
                    onClick={() => setActiveTab("operacional")}
                />
                <TabButton
                    icon={BrainCircuit}
                    label="Semántica"
                    active={activeTab === "semantica"}
                    onClick={() => setActiveTab("semantica")}
                />
                <TabButton
                    icon={Bot}
                    label="Agente Skillgen"
                    active={activeTab === "skillgen"}
                    onClick={() => setActiveTab("skillgen")}
                />
                <TabButton
                    icon={BrainCircuit}
                    label="Migración LLM"
                    active={activeTab === "migracion"}
                    onClick={() => setActiveTab("migracion")}
                />
                <TabButton
                    icon={Layers}
                    label="Boletín Multimedia"
                    active={activeTab === "boletines"}
                    onClick={() => setActiveTab("boletines")}
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
                        className="p-6 border border-slate-200 shadow-sm rounded-2xl bg-white"
                    >
                        <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                            <Database className="w-5 h-5 text-cgr-gold" />
                            Volumetría por estado operativo
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <MetricCard label="Total filtrado" value={totalDictamenes} />
                            <MetricCard label="Vectorizados" value={totalVectorized} tone="gold" />
                            <MetricCard label="Pendientes de vectorización" value={totalPendingVectorization} tone="green" />
                            <MetricCard label="Pendientes de enrichment" value={totalPendingEnrichment} tone="blue" />
                        </div>
                        {topModel && (
                            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                Modelo LLM dominante: <span className="font-mono font-semibold text-slate-800">{topModel.modelo}</span>
                                <span className="ml-2 font-semibold text-slate-800">{topModel.count.toLocaleString()} dictámenes</span>
                            </div>
                        )}
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

                {activeTab === "migracion" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-6"
                    >
                        <MigrationDashboard />
                    </motion.div>
                )}

                {activeTab === "boletines" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-6"
                    >
                        <BoletinesManager />
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
                ? "bg-slate-200/50 border-cgr-navy text-cgr-navy drop-shadow-sm font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
        >
            <Icon className={`w-4 h-4 ${active ? "text-cgr-gold" : ""}`} />
            {label}
        </button>
    );
}

function MetricCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "gold" | "green" | "blue" }) {
    const toneClass = {
        slate: "border-slate-200 bg-slate-50 text-slate-900",
        gold: "border-yellow-200 bg-yellow-50 text-yellow-800",
        green: "border-emerald-200 bg-emerald-50 text-emerald-800",
        blue: "border-sky-200 bg-sky-50 text-sky-800",
    }[tone];

    return (
        <div className={`rounded-xl border p-4 ${toneClass}`}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-1 text-2xl font-black">{value.toLocaleString()}</p>
        </div>
    );
}
