import { useState } from 'react';
import { useDictamenHistory } from '../../hooks/useAdminDashboard';
import { Search, History, ArrowRight, PackageCheck, AlertCircle } from 'lucide-react';
import { formatSimpleDate } from '../../lib/date';

export function DictamenHistory() {
    const [searchTerm, setSearchTerm] = useState('');
    const [query, setQuery] = useState('');
    const { history, loading, error } = useDictamenHistory(query);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setQuery(searchTerm);
    };

    return (
        <div className="space-y-6">
            <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por ID (ej. E93310N25)..."
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-cgr-gold/50 focus:border-cgr-gold outline-none transition-all placeholder:text-slate-400 shadow-sm"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !searchTerm}
                    className="px-6 py-3 bg-cgr-gold hover:bg-yellow-500 text-slate-900 font-bold rounded-xl transition-all disabled:opacity-50"
                >
                    {loading ? 'Buscando...' : 'Analizar'}
                </button>
            </form>

            <div className="min-h-[300px] border border-slate-200 rounded-2xl bg-white shadow-sm p-6">
                {!query ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
                        <History className="w-12 h-12 mb-4 opacity-50" />
                        <p>Ingresa un ID de dictamen para visualizar su ciclo de vida</p>
                    </div>
                ) : loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-cgr-gold border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 text-cgr-red bg-cgr-red/10 p-4 rounded-xl border border-cgr-red/20">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error}</p>
                    </div>
                ) : history ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-cgr-navy flex items-center gap-2">
                                    Anatomía del Dictamen
                                    <span className="text-cgr-gold bg-cgr-gold/10 px-2 py-0.5 rounded text-sm">{history.dictamen.id}</span>
                                </h3>
                                <p className="text-slate-500 text-sm mt-1 font-medium">Estado actual: <span className="text-cgr-navy capitalize font-bold">{history.dictamen.estado}</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Última Actualización</p>
                                <p className="text-slate-700 font-medium">{formatSimpleDate(history.dictamen.updated_at)}</p>
                            </div>
                        </div>

                        {/* Metamorfosis Timeline 3D-ish */}
                        <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:left-[19px] before:w-0.5 before:bg-gradient-to-b before:from-cgr-gold before:to-slate-200">
                            {/* Genesis Event */}
                            <div className="relative z-10">
                                <span className="absolute -left-[30px] w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                </span>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative hover:border-cgr-blue/30 transition-colors shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-cgr-navy">Ingreso a la Plataforma</h4>
                                        <span className="text-xs text-slate-500 font-medium">{formatSimpleDate(history.dictamen.created_at)}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 font-medium">El documento fue indexado inicialmente en el sistema.</p>
                                </div>
                            </div>

                            {/* History Events */}
                            {history.history.map((h) => (
                                <div key={h.id} className="relative z-10 group">
                                    <span className={`absolute -left-[30px] w-6 h-6 rounded-full bg-white border-2 flex items-center justify-center shadow-sm transition-colors ${h.campo_modificado === 'estado' && h.valor_nuevo === 'enriched' ? 'border-blue-500' :
                                        h.campo_modificado === 'estado' && h.valor_nuevo === 'vectorized' ? 'border-cgr-gold' :
                                            'border-slate-200'
                                        }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${h.campo_modificado === 'estado' && h.valor_nuevo === 'enriched' ? 'bg-blue-500' :
                                            h.campo_modificado === 'estado' && h.valor_nuevo === 'vectorized' ? 'bg-cgr-gold animate-pulse' :
                                                'bg-slate-400'
                                            }`} />
                                    </span>

                                    <div className={`p-4 rounded-xl border relative transition-colors shadow-sm ${h.campo_modificado === 'estado' ? 'bg-white border-blue-100' : 'bg-slate-50/50 border-slate-200'
                                        }`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-cgr-navy capitalize">Cambio en {h.campo_modificado.replace('_', ' ')}</h4>
                                            <span className="text-xs text-slate-500 font-medium">{formatSimpleDate(h.fecha_cambio)}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <span className="text-slate-400 line-through">{h.valor_anterior || 'Vacío'}</span>
                                            <ArrowRight className="w-4 h-4 text-slate-300" />
                                            <span className="text-slate-800 font-bold">{h.valor_nuevo}</span>
                                        </div>
                                        {h.origen && <p className="text-xs text-slate-500 mt-2 flex items-center gap-1 font-medium"><PackageCheck className="w-3 h-3 text-cgr-blue" /> Origen: {h.origen}</p>}
                                    </div>
                                </div>
                            ))}

                            {/* Final Vectorized State if achieved */}
                            {history.dictamen.estado === 'vectorized' && (
                                <div className="relative z-10 pt-4">
                                    <span className="absolute -left-[32px] w-7 h-7 rounded-full bg-white border-2 border-cgr-gold flex items-center justify-center shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                                        <div className="w-2 h-2 rounded-full bg-cgr-gold animate-pulse" />
                                    </span>
                                    <div className="bg-gradient-to-r from-cgr-gold/5 to-transparent p-4 rounded-xl border border-cgr-gold/10">
                                        <h4 className="font-bold text-cgr-gold text-lg">Disponibilidad Vectorial Alcanzada</h4>
                                        <p className="text-sm text-slate-600 mt-1 font-medium">El dictamen ya es ubicable por agentes LLM y búsqueda semántica.</p>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
