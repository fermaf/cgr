import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, 
    Calendar, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    ExternalLink, 
    Layers, 
    Music, 
    Image as ImageIcon,
    Plus,
    X,
    Filter,
    ArrowRight
} from "lucide-react";
import { useBoletines } from "../../hooks/useBoletines";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function BoletinesManager() {
    const { boletines, stats, loading, fetchBoletinDetail, createBoletin } = useBoletines();
    const [showNewForm, setShowNewForm] = useState(false);
    const [selectedBoletinId, setSelectedBoletinId] = useState<string | null>(null);
    const [detailedBoletin, setDetailedBoletin] = useState<any>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    
    // State for Asset Modal (Agent-first visualization)
    const [selectedAsset, setSelectedAsset] = useState<{ type: 'image' | 'audio_agent', key?: string, info?: any } | null>(null);


    const [formData, setFormData] = useState({
        fecha_inicio: format(new Date(Date.now() - 7 * 24 * 3600 * 1000), 'yyyy-MM-dd'),
        fecha_fin: format(new Date(), 'yyyy-MM-dd'),
        filtro_boletin: true,
        filtro_relevante: true,
        filtro_recurso_prot: false
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await createBoletin(formData);
        setShowNewForm(false);
    };

    const handleSelectBoletin = async (id: string) => {
        setSelectedBoletinId(id);
        setLoadingDetail(true);
        const detail = await fetchBoletinDetail(id);
        setDetailedBoletin(detail);
        setLoadingDetail(false);
    };

    const selectedBoletin = detailedBoletin || boletines.find(b => b.id === selectedBoletinId);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="text-cgr-gold" />
                    Generación de Boletines Multimedia
                </h2>
                <button 
                    onClick={() => setShowNewForm(true)}
                    className="flex items-center gap-2 bg-cgr-navy text-white px-4 py-2 rounded-xl hover:bg-cgr-navy/90 transition-all shadow-lg shadow-cgr-navy/20"
                >
                    <Plus size={18} />
                    Nuevo Boletín
                </button>
            </div>

            {/* Stats de Candidatos */}
            {stats && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    <div className="bg-gradient-to-r from-cgr-navy to-blue-900 p-6 rounded-2xl text-white shadow-xl flex items-center justify-between">
                        <div>
                            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Candidatos Disponibles</p>
                            <h4 className="text-3xl font-black">{stats.candidates.toLocaleString()}</h4>
                            <p className="text-[10px] text-blue-300 mt-1 uppercase">Dictámenes con marca jurisprudencial listos</p>
                        </div>
                        <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
                            <Layers className="text-cgr-gold" size={32} />
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Última Generación</p>
                            <h4 className="text-xl font-bold text-slate-800">
                                {stats.last_generated ? format(new Date(stats.last_generated), 'dd MMM, HH:mm', { locale: es }) : 'Nunca'}
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-1 uppercase">Sincronización de orquestador activa</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <Clock className="text-slate-400" size={32} />
                        </div>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de Boletines */}
                <div className="lg:col-span-1 space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {boletines.length === 0 && !loading && (
                        <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                            <Clock className="mx-auto text-slate-300 mb-2" size={32} />
                            <p className="text-slate-500 text-sm">No hay boletines generados</p>
                        </div>
                    )}
                    
                    {boletines.map((b) => (
                        <motion.div
                            key={b.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => handleSelectBoletin(b.id)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                selectedBoletinId === b.id 
                                ? "bg-white border-cgr-gold shadow-xl shadow-cgr-gold/10 ring-1 ring-cgr-gold" 
                                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${getStatusBg(b.status)}`}>
                                        {getStatusIcon(b.status)}
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">BOLETÍN ID</span>
                                        <p className="text-xs font-mono text-slate-600 truncate max-w-[120px]">{b.id}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${getStatusText(b.status)}`}>
                                        {b.status}
                                    </span>
                                    {b.updated_at && (
                                        <span className="text-[10px] text-slate-500 font-bold font-mono">
                                            {new Date(b.updated_at + 'Z').toLocaleString('es-CL', { 
                                                day: '2-digit', 
                                                month: '2-digit', 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                            })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 mt-4 text-slate-500">
                                <Calendar size={14} />
                                <span className="text-xs">
                                    {format(new Date(b.fecha_inicio), 'dd MMM', { locale: es })} - {format(new Date(b.fecha_fin), 'dd MMM yyyy', { locale: es })}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Detalle y Entregables */}
                <div className="lg:col-span-2">
                    <AnimatePresence mode="wait">
                        {selectedBoletin ? (
                            <motion.div 
                                key={selectedBoletin.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden min-h-[500px]"
                            >
                                <div className="bg-slate-50 border-b border-slate-200 p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-slate-800">Resultado de Generación</h3>
                                        <button 
                                            onClick={() => window.open(`/api/v1/boletines/${selectedBoletin.id}`, '_blank')}
                                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                            JSON Crudo <ExternalLink size={12} />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 flex-1 min-w-[150px]">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Rango Jurisprudencial</p>
                                            <p className="text-sm font-semibold">{format(new Date(selectedBoletin.fecha_inicio), 'dd/MM')} al {format(new Date(selectedBoletin.fecha_fin), 'dd/MM/yyyy')}</p>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 flex-1 min-w-[150px]">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Filtros Aplicados</p>
                                            <div className="flex gap-1 mt-1">
                                                {selectedBoletin.filtro_boletin === 1 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Boletín</span>}
                                                {selectedBoletin.filtro_relevante === 1 && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Relevante</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 border-b border-slate-100">
                                    <div className="flex gap-2 mb-6">
                                        <div className="flex-1">
                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                                <Layers size={12} className="text-cgr-gold" /> Insumos Originales (ADN)
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedBoletin.original_ids ? JSON.parse(selectedBoletin.original_ids).map((id: string) => (
                                                    <a 
                                                        key={id} 
                                                        href={`/dictamen/${id}`} 
                                                        target="_blank"
                                                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg border border-slate-200 transition-colors"
                                                    >
                                                        {id}
                                                    </a>
                                                )) : <span className="text-xs text-slate-400">Sin datos de auditoría legacy</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {selectedBoletin.synthesis && (
                                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
                                            <h4 className="text-[10px] font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                                                <Send size={12} /> Síntesis Jurisprudencial Maestra (Mistral Map-Reduce)
                                            </h4>
                                            <p className="text-sm text-slate-700 leading-relaxed italic">
                                                "{selectedBoletin.synthesis}"
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6">
                                    {loadingDetail ? (
                                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                                            <div className="w-8 h-8 border-4 border-cgr-gold border-t-transparent rounded-full animate-spin" />
                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cargando Insumos y RRSS...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {!selectedBoletin?.entregables || selectedBoletin.entregables.length === 0 ? (
                                                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                                    <Send className="mx-auto text-slate-300 mb-4" size={48} />
                                                    <p className="text-slate-500 font-medium">Borrador vacío o entregables en cola...</p>
                                                </div>
                                            ) : (
                                                selectedBoletin.entregables.map((ent: any) => (
                                                    <div key={ent.id} className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100/50 relative overflow-hidden group hover:border-cgr-gold/30 transition-all">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                                                    <Send size={16} className="text-cgr-navy" />
                                                                </div>
                                                                <div>
                                                                    <h5 className="text-sm font-bold text-slate-800">{ent.canal}</h5>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${ent.status === 'READY' ? 'bg-green-500' : 'bg-cgr-gold animate-pulse'}`} />
                                                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{ent.status}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {ent.metadata && JSON.parse(ent.metadata).image_key && (
                                                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md flex items-center justify-center">
                                                                    <ImageIcon size={14} />
                                                                </div>
                                                            )}
                                                            {ent.metadata && JSON.parse(ent.metadata).agent_type && (
                                                                <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md flex items-center justify-center">
                                                                    <Music size={14} />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto custom-scrollbar bg-white p-4 rounded-xl border border-slate-100 mb-4 shadow-sm">
                                                            {ent.content_text}
                                                        </div>

                                                        {ent.prompts && (
                                                            <div className="mt-4 pt-4 border-t border-slate-100">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <ImageIcon size={12} className="text-purple-500" />
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Input Agente Visual (Gemini)</span>
                                                                </div>
                                                                <div className="text-[11px] bg-purple-50/50 text-purple-700 p-4 rounded-xl border border-purple-100/50 font-sans italic leading-relaxed">
                                                                    "{ent.prompts}"
                                                                </div>
                                                            </div>
                                                        )}

                                                        {ent.metadata && (
                                                            <div className="mt-4 flex items-center justify-between">
                                                                <span className="text-[9px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">META: {ent.metadata}</span>
                                                                <button 
                                                                    onClick={() => {
                                                                        const meta = JSON.parse(ent.metadata || '{}');
                                                                        if (meta.image_key) {
                                                                            setSelectedAsset({ type: 'image', key: meta.image_key });
                                                                        } else if (meta.agent_type) {
                                                                            setSelectedAsset({ type: 'audio_agent', info: meta });
                                                                        }
                                                                    }}
                                                                    className="text-cgr-navy hover:text-cgr-gold flex items-center gap-1 text-[10px] font-bold uppercase transition-colors"
                                                                >
                                                                    Ver Assets <ExternalLink size={10} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[500px] border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
                                <ArrowRight className="mb-4" />
                                <p>Selecciona un boletín para ver sus entregables</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal de Nuevo Boletín */}
            <AnimatePresence>
                {showNewForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200"
                        >
                            <div className="p-8">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-2xl font-bold text-slate-800">Parámetros del Orquestador</h3>
                                    <button onClick={() => setShowNewForm(false)} className="text-slate-400 hover:text-slate-600">
                                        <X />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha Inicio</label>
                                            <input 
                                                type="date" 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:ring-2 focus:ring-cgr-gold/20 focus:border-cgr-gold transition-all"
                                                value={formData.fecha_inicio}
                                                onChange={e => setFormData({...formData, fecha_inicio: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha Fin</label>
                                            <input 
                                                type="date" 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:ring-2 focus:ring-cgr-gold/20 focus:border-cgr-gold transition-all"
                                                value={formData.fecha_fin}
                                                onChange={e => setFormData({...formData, fecha_fin: e.target.value})}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <Filter size={14} /> Filtros de Admisión
                                        </label>
                                        <div className="space-y-2">
                                            <Checkbox label="Incluir dictámenes marcados como 'En Boletín'" checked={formData.filtro_boletin} onChange={v => setFormData({...formData, filtro_boletin: v})} />
                                            <Checkbox label="Incluir dictámenes marcados como 'Relevantes'" checked={formData.filtro_relevante} onChange={v => setFormData({...formData, filtro_relevante: v})} />
                                            <Checkbox label="Solo casos de 'Recurso de Protección'" checked={formData.filtro_recurso_prot} onChange={v => setFormData({...formData, filtro_recurso_prot: v})} />
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <button 
                                            type="submit"
                                            className="w-full bg-gradient-to-r from-cgr-navy to-blue-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-blue-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            <Send size={20} />
                                            Disparar Orquestación AI
                                        </button>
                                        <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-[0.2em]">
                                            Paradigma Agent-First Activado
                                        </p>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Assets (Visor de Imágenes y Webhook Agent Info) */}
            <AnimatePresence>
                {selectedAsset && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-40 transition-opacity flex items-center justify-center p-4"
                        onClick={() => setSelectedAsset(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <ImageIcon className="text-cgr-gold" size={20} />
                                    Auditoría de Activos Multimedia
                                </h3>
                                <button 
                                    onClick={() => setSelectedAsset(null)}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="p-8 bg-slate-100/50 min-h-[400px] flex items-center justify-center relative">
                                {selectedAsset.type === 'image' && selectedAsset.key && (
                                    <img 
                                        src={`/api/v1/assets/image/${selectedAsset.key}`} 
                                        alt="Asset Generado" 
                                        className="max-w-full max-h-[60vh] rounded-xl shadow-lg border border-slate-200"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as any).parentElement.innerHTML = '<div class="text-slate-400 text-sm text-center">Imagen no encontrada en KV Storage.<br/>Puede haber expirado o fallado en generación.</div>';
                                        }}
                                    />
                                )}

                                {selectedAsset.type === 'audio_agent' && selectedAsset.info && (
                                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-lg w-full">
                                        <div className="text-center mb-6">
                                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Music size={28} />
                                            </div>
                                            <h4 className="font-bold text-slate-800 text-lg">Integración con Agente de Voz ElevenLabs</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Este canal no genera un archivo MP3 estático. 
                                                Es un <strong>Agent Webhook</strong> que tu Agente de ElevenLabs debe consumir como herramienta ("Tool").
                                            </p>
                                        </div>

                                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-6">
                                            <h5 className="text-xs font-bold text-slate-800 uppercase mb-4 flex items-center gap-2">
                                                <Layers size={14} className="text-blue-500" /> ¿Cómo probarlo?
                                            </h5>
                                            <ol className="text-xs text-slate-600 space-y-3 list-decimal pl-4 leading-relaxed">
                                                <li>Crea un "Conversational Agent" en tu dashboard de <strong>ElevenLabs</strong>.</li>
                                                <li>Agrega una nueva <strong>Tool</strong> tipo Webhook (GET).</li>
                                                <li>Copia la URL del endpoint que aparece abajo.</li>
                                                <li>Cuando hables con el agente, dile: <em>"¿Hay algún boletín jurídico nuevo?"</em>.</li>
                                                <li>El agente leerá dinámicamente este script estructurado desde nuestro backend.</li>
                                            </ol>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Punto de Integración Webhook</p>
                                                <code className="block w-full bg-slate-900 text-green-400 p-3 rounded-xl text-xs overflow-x-auto">
                                                    GET https://cgr-platform.abogado.workers.dev{selectedAsset.info.agent_api_tool}
                                                </code>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Estado del Canal</p>
                                                <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                    {selectedAsset.info.status.replace(/_/g, ' ')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Checkbox({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all border border-transparent hover:border-slate-200">
            <input 
                type="checkbox" 
                className="w-5 h-5 rounded-md border-slate-300 text-cgr-gold focus:ring-cgr-gold"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
            />
            <span className="text-sm text-slate-700">{label}</span>
        </label>
    );
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'COMPLETED': return <CheckCircle2 size={18} className="text-emerald-500" />;
        case 'ERROR': return <AlertCircle size={18} className="text-rose-500" />;
        default: return <Clock size={18} className="text-blue-500 animate-pulse" />;
    }
}

function getStatusBg(status: string) {
    switch (status) {
        case 'COMPLETED': return 'bg-emerald-100';
        case 'ERROR': return 'bg-rose-100';
        default: return 'bg-blue-100';
    }
}

function getStatusText(status: string) {
    switch (status) {
        case 'COMPLETED': return 'text-emerald-700 bg-emerald-100';
        case 'ERROR': return 'text-rose-700 bg-rose-100';
        case 'MISTRAL_REDUCING': return 'text-purple-700 bg-purple-100';
        case 'MEDIA_GENERATING': return 'text-blue-700 bg-blue-100';
        default: return 'text-slate-500 bg-slate-100';
    }
}

