import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, ChevronLeft, ChevronRight, SlidersHorizontal, Loader2 } from "lucide-react";
import { DictamenCard } from "../components/dictamen/DictamenCard";
import type { DictamenMeta, SearchResponse } from "../types";
import { cn } from "../lib/utils";

export function SearchResults() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);

    const [results, setResults] = useState<DictamenMeta[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);

    const [year, setYear] = useState(searchParams.get("year") || "");
    const [materia, setMateria] = useState(searchParams.get("materia") || "");

    useEffect(() => {
        const fetchResults = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (query) params.set("q", query);
                params.set("page", page.toString());
                if (year) params.set("year", year);
                if (materia) params.set("materia", materia);

                // Agregamos un Timeout (15 segundos) para evitar bloqueos infinitos de la pantalla de carga
                // Esto es fundamental en aplicaciones de negocio donde la API puede tardar
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const res = await fetch(`/api/v1/dictamenes?${params.toString()}`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Error: ${res.status} - ${errText}`);
                }

                const data: SearchResponse = await res.json();
                setResults(data.data || []);
                setTotal(data.meta?.total || 0);
            } catch (error) {
                console.error("Search error:", error);
                setResults([]);
                setTotal(0);
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, [query, page, year, materia]);

    // Manejador del submit del formulario: Actualiza la URL y dispara un nuevo useEffect
    const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newQuery = formData.get("q") as string;
        setSearchParams({ q: newQuery, page: "1", year, materia });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ q: query, page: newPage.toString(), year, materia });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const totalPages = Math.ceil(total / 10);

    return (
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 w-full">

            {/* Botón de Filtros para Móviles */}
            <button
                className="md:hidden flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors shadow-sm"
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            >
                <SlidersHorizontal className="w-5 h-5" /> Filtros
            </button>

            {/* Sidebar Filters */}
            <aside className={cn(
                "w-full md:w-72 flex-shrink-0 space-y-6 md:block transition-all duration-300",
                isFiltersOpen ? "block" : "hidden"
            )}>
                <div className="bg-white p-6 rounded-2xl sticky top-24 border border-slate-200 shadow-sm relative overflow-hidden group">
                    <h3 className="font-sans font-bold text-cgr-navy mb-6 flex items-center gap-2 text-lg tracking-wide border-b border-slate-100 pb-4">
                        <Filter className="w-5 h-5 text-cgr-blue" /> Filtros Inteligentes
                    </h3>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest block">Año Fiscal</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder="ej. 2024"
                                    className="w-full pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cgr-blue/20 focus:border-cgr-blue text-slate-800 placeholder:text-slate-400 transition-all font-mono"
                                    value={year}
                                    onChange={(e) => {
                                        setYear(e.target.value);
                                        setSearchParams({ q: query, page: "1", year: e.target.value, materia });
                                    }}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest block">Materia</label>
                            <input
                                type="text"
                                placeholder="ej. Urbanismo"
                                className="w-full pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cgr-blue/20 focus:border-cgr-blue text-slate-800 placeholder:text-slate-400 transition-all"
                                value={materia}
                                onChange={(e) => {
                                    setMateria(e.target.value);
                                    setSearchParams({ q: query, page: "1", year, materia: e.target.value });
                                }}
                            />
                        </div>
                    </div>
                </div>
            </aside>

            {/* Área Principal de Resultados */}
            <div className="flex-1 space-y-6">

                {/* Cabecera de Búsqueda Premium */}
                <div className="bg-white p-1 rounded-2xl relative overflow-hidden group shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl transition-all duration-300 focus-within:ring-2 focus-within:ring-cgr-blue/20 focus-within:border-cgr-blue/30 focus-within:bg-white">
                        <div className="pl-4">
                            <Search className="w-6 h-6 text-slate-400 group-focus-within:text-cgr-blue transition-colors" />
                        </div>
                        <form onSubmit={handleSearch} className="flex-1">
                            <input
                                name="q"
                                defaultValue={query}
                                placeholder="Buscar jurisprudencia, conceptos, descriptores..."
                                className="w-full bg-transparent border-none py-3 px-2 focus:ring-0 text-slate-800 placeholder:text-slate-400 font-medium text-lg focus:outline-none"
                                autoComplete="off"
                            />
                        </form>
                    </div>
                </div>

                {/* Información de la Consulta */}
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-2 uppercase tracking-wide">
                    <span>Resultados Encontrados: <strong className="text-cgr-navy font-bold">{total}</strong></span>
                    <span>Página {page} / {totalPages || 1}</span>
                </div>

                {/* Lista de Resultados Renderizados */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="py-24 text-center flex flex-col items-center justify-center text-slate-500">
                            <Loader2 className="w-10 h-10 mb-4 animate-spin text-cgr-blue" />
                            <p className="font-mono text-sm uppercase tracking-widest animate-pulse font-medium">Consultando Base de Datos...</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-5">
                            {results.map((item) => (
                                <DictamenCard key={item.id} dictamen={item} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-24 text-center bg-white rounded-2xl flex flex-col items-center justify-center relative overflow-hidden border border-slate-200 shadow-sm">
                            <Search className="w-12 h-12 text-slate-300 mb-4" />
                            <p className="text-cgr-navy text-lg font-bold">No se encontraron registros para "{query}"</p>
                            <p className="text-slate-500 text-sm mt-2 font-medium">Ajusta tus filtros o intenta con diferentes palabras clave.</p>
                        </div>
                    )}
                </div>

                {/* Controles de Paginación */}
                {totalPages > 1 && (
                    <div className="flex justify-center gap-3 pt-10 pb-10">
                        <button
                            disabled={page <= 1}
                            onClick={() => handlePageChange(page - 1)}
                            className="p-3 rounded-xl border border-slate-200 text-slate-500 hover:text-cgr-navy hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm bg-white"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center px-6 font-mono font-bold text-cgr-navy bg-white rounded-xl border border-slate-200 shadow-sm">
                            {page}
                        </div>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => handlePageChange(page + 1)}
                            className="p-3 rounded-xl border border-slate-200 text-slate-500 hover:text-cgr-navy hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm bg-white"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
