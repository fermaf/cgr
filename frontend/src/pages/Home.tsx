import { useState, useEffect } from "react";
import { SearchBar } from "../components/ui/SearchBar";
import { DictamenCard } from "../components/dictamen/DictamenCard";
import type { DictamenMeta, StatsResponse } from "../types";

export function Home() {
    const [results, setResults] = useState<DictamenMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<StatsResponse | null>(null);

    // Cargar datos iniciales
    useEffect(() => {
        fetch('/api/v1/stats')
            .then(res => res.json())
            .then((data: StatsResponse) => setStats(data))
            .catch(console.error);

        setLoading(true);
        const params = new URLSearchParams();
        params.append('limit', '4');

        fetch(`/api/v1/dictamenes?${params.toString()}`)
            .then(res => res.json())
            .then(json => setResults(json.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-12 w-full animate-in fade-in duration-700">
            {/* Premium Institutional Hero Section */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-cgr-navy shadow-2xl min-h-[450px] flex items-center justify-center p-8 lg:p-16 border border-cgr-navy/20">
                {/* Background Pattern */}
                <div className="absolute inset-0 z-0 bg-official opacity-20 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

                {/* Content */}
                <div className="relative z-10 text-center space-y-10 w-full max-w-4xl mx-auto">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cgr-gold/30 bg-black/10 backdrop-blur-md mb-6 text-cgr-gold text-[10px] sm:text-xs font-bold tracking-[0.2em] font-sans uppercase">
                            <span className="w-2 h-2 rounded-full bg-cgr-gold" />
                            Motor de Inteligencia Jurídica
                        </div>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold text-white tracking-tight drop-shadow-md leading-[1.1]">
                            Jurisprudencia <br />
                            <span className="text-white">
                                Administrativa
                            </span>
                        </h1>
                        <p className="text-base md:text-xl text-blue-100 font-light max-w-2xl mx-auto leading-relaxed mt-4 drop-shadow-sm">
                            Acceso a más de <span className="font-bold text-white">{stats?.total?.toLocaleString() || '...'}</span> dictámenes oficiales potenciados por análisis neuronal avanzado.
                        </p>
                    </div>

                    <div className="w-full max-w-3xl mx-auto mt-8 relative">
                        {/* Wrapper for SearchBar with shadow */}
                        <div className="p-1 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
                            <SearchBar />
                        </div>
                    </div>
                </div>

                {/* Decorative border bottom line gold */}
                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-gradient-to-r from-cgr-navy via-cgr-gold to-cgr-navy" />
            </div>

            <div className="space-y-8">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <h2 className="text-2xl font-serif font-bold text-cgr-navy tracking-tight flex items-center gap-3">
                        <span className="w-8 h-[3px] bg-cgr-red rounded-full shadow-sm" />
                        Últimos Documentos
                    </h2>
                    <button className="text-sm font-semibold text-cgr-navy hover:text-cgr-blue transition-colors group flex items-center gap-2">
                        Ver Todos
                        <span className="transform transition-transform text-lg group-hover:translate-x-1">&rarr;</span>
                    </button>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 animate-pulse">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-48 bg-white border border-slate-200 rounded-2xl shadow-sm"></div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                        {results.map((dictamen) => (
                            <DictamenCard key={dictamen.id} dictamen={dictamen} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

