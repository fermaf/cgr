import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, ChevronLeft, ChevronRight, SlidersHorizontal, Loader2 } from "lucide-react";
import { DictamenCard } from "../components/dictamen/DictamenCard";
import { PjoFeaturedSolution } from "../components/doctrine/PjoFeaturedSolution";
import type { DictamenMeta, SearchResponse } from "../types";
import { cn } from "../lib/utils";
import { normalizeQueryForRequest } from "../lib/queryNormalization";

export function SearchResults() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);

    const [results, setResults] = useState<DictamenMeta[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);

    const [year, setYear] = useState(searchParams.get("year") || "");
    const [materia, setMateria] = useState(searchParams.get("materia") || "");
    const [division, setDivision] = useState(searchParams.get("division") || "");
    const [tags, setTags] = useState(searchParams.get("tags") || "");
    const [juris, setJuris] = useState(searchParams.get("juris") === "true");
    const [materiaSuggestions, setMateriaSuggestions] = useState<string[]>([]);
    const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
    const [availableDivisions, setAvailableDivisions] = useState<{codigo: string, nombre_completo: string}[]>([]);

    useEffect(() => {
        const fetchDivisions = async () => {
            try {
                const res = await fetch('/api/v1/divisions');
                const data = await res.json();
                setAvailableDivisions(data.data || []);
            } catch (e) {
                console.error("Error fetching divisions:", e);
            }
        };
        fetchDivisions();
    }, []);

    useEffect(() => {
        const fetchResults = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (query) params.set("q", normalizeQueryForRequest(query));
                params.set("page", page.toString());
                if (year) params.set("year", year);
                if (materia) params.set("materia", materia);
                if (division) params.set("division", division);
                if (tags) params.set("tags", tags);
                if (juris) params.set("juris", "true");

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
    }, [query, page, year, materia, division, tags, juris]);

    // Autocompletado Materia
    useEffect(() => {
        if (materia.length < 3) {
            setMateriaSuggestions([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/v1/analytics/suggest/materia?q=${encodeURIComponent(materia)}`);
                const data = await res.json();
                setMateriaSuggestions(data.suggestions || []);
            } catch (e) {
                console.error("Error fetching suggestions:", e);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [materia]);

    // Autocompletado Etiquetas
    useEffect(() => {
        if (tags.length < 3) {
            setTagSuggestions([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/v1/analytics/suggest/tags?q=${encodeURIComponent(tags)}`);
                const data = await res.json();
                setTagSuggestions(data.suggestions || []);
            } catch (e) {
                console.error("Error fetching tag suggestions:", e);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [tags]);

    const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newQuery = formData.get("q") as string;
        setSearchParams({ q: newQuery, page: "1", year, materia, division, tags, juris: juris ? "true" : "false" });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ q: query, page: newPage.toString(), year, materia, division, tags, juris: juris ? "true" : "false" });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const totalPages = Math.ceil(total / 10);

    return (
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 w-full">
            <button
                className="md:hidden flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors shadow-sm"
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            >
                <SlidersHorizontal className="w-5 h-5" /> Filtros
            </button>

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
                            <label
                                className="text-[10px] font-bold uppercase text-slate-500 tracking-widest block flex items-center gap-1.5 cursor-help"
                                title="Filtra por el año oficial en que fue emitido el dictamen por la Contraloría."
                            >
                                Año de emisión
                                <span className="bg-slate-200/50 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] text-slate-400">?</span>
                            </label>
                            <select
                                className="w-full pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cgr-blue/20 focus:border-cgr-blue text-slate-800 transition-all cursor-pointer font-medium"
                                value={year}
                                onChange={(e) => {
                                    setYear(e.target.value);
                                    setSearchParams({ q: query, page: "1", year: e.target.value, materia, division, tags, juris: juris ? "true" : "false" });
                                }}
                            >
                                <option value="">Todos los años</option>
                                {Array.from({ length: 30 }, (_, i) => 2025 - i).map(y => (
                                    <option key={y} value={y.toString()}>{y}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label
                                className="text-[10px] font-bold uppercase text-slate-500 tracking-widest block flex items-center gap-1.5 cursor-help"
                                title="Corresponde a la clasificación oficial de materias de la Contraloría General de la República."
                            >
                                Materia
                                <span className="bg-slate-200/50 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] text-slate-400">?</span>
                            </label>
                            <input
                                type="text"
                                list="materia-suggestions"
                                placeholder="ej. Urbanismo"
                                className="w-full pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cgr-blue/20 focus:border-cgr-blue text-slate-800 placeholder:text-slate-400 transition-all font-medium"
                                value={materia}
                                onChange={(e) => {
                                    setMateria(e.target.value);
                                    setSearchParams({ q: query, page: "1", year, materia: e.target.value, division, tags, juris: juris ? "true" : "false" });
                                }}
                            />
                            <datalist id="materia-suggestions">
                                {materiaSuggestions.map((s, idx) => <option key={idx} value={s} />)}
                            </datalist>
                        </div>

                        <div className="space-y-2">
                            <label
                                className="text-[10px] font-bold uppercase text-slate-500 tracking-widest block flex items-center gap-1.5 cursor-help"
                                title="Filtra por la división o área especializada de la Contraloría que emitió el dictamen."
                            >
                                Área especializada
                                <span className="bg-slate-200/50 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] text-slate-400">?</span>
                            </label>
                            <select
                                className="w-full pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cgr-blue/20 focus:border-cgr-blue text-slate-800 transition-all cursor-pointer font-medium"
                                value={division}
                                onChange={(e) => {
                                    setDivision(e.target.value);
                                    setSearchParams({ q: query, page: "1", year, materia, division: e.target.value, tags, juris: juris ? "true" : "false" });
                                }}
                            >
                                <option value="">Todas las áreas</option>
                                {availableDivisions.map(d => (
                                    <option key={d.codigo} value={d.codigo}>{d.nombre_completo}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2 relative">
                            <label 
                                className="text-[10px] font-bold uppercase text-slate-500 tracking-widest block flex items-center gap-1.5 cursor-help"
                                title="Corresponde a la clasificación temática semántica extraída automáticamente mediante análisis neuronal de los dictámenes."
                            >
                                Temática (Semántica)
                                <span className="bg-slate-200/50 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] text-slate-400">?</span>
                            </label>
                            <input
                                type="text"
                                list="tag-suggestions"
                                placeholder="ej. Educación, Salud"
                                className="w-full pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cgr-blue/20 focus:border-cgr-blue text-slate-800 placeholder:text-slate-400 transition-all font-medium"
                                value={tags}
                                onChange={(e) => {
                                    setTags(e.target.value);
                                    setSearchParams({ q: query, page: "1", year, materia, division, tags: e.target.value, juris: juris ? "true" : "false" });
                                }}
                            />
                            <datalist id="tag-suggestions">
                                {tagSuggestions.map((s, idx) => <option key={idx} value={s} />)}
                            </datalist>
                        </div>

                        <div className="pt-2 border-t border-slate-100 mt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only" 
                                        checked={juris}
                                        onChange={(e) => {
                                            const newVal = e.target.checked;
                                            setJuris(newVal);
                                            setSearchParams({ q: query, page: "1", year, materia, division, tags, juris: newVal ? "true" : "false" });
                                        }}
                                    />
                                    <div className={cn(
                                        "w-10 h-5 rounded-full transition-colors",
                                        juris ? "bg-cgr-blue" : "bg-slate-200"
                                    )}></div>
                                    <div className={cn(
                                        "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                                        juris ? "translate-x-5" : "translate-x-0"
                                    )}></div>
                                </div>
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight group-hover:text-cgr-blue transition-colors leading-tight">SOLO DICTAMENES QUE HAN GENERADO JURISPRUDENCIA</span>
                            </label>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="flex-1 space-y-6">
                <div className="bg-white p-1 rounded-2xl relative overflow-hidden group shadow-md border-2 border-slate-300">
                    <div className="flex items-center gap-4 bg-slate-50 p-2.5 rounded-xl transition-all duration-300 focus-within:ring-4 focus-within:ring-cgr-blue/10 focus-within:border-cgr-blue/30 focus-within:bg-white shadow-inner">
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

                <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-2 uppercase tracking-wide">
                    <span>Resultados Encontrados: <strong className="text-cgr-navy font-bold">{total}</strong></span>
                    <span>Página {page} / {totalPages || 1}</span>
                </div>

                <div className="space-y-4">
                    <main className="flex-1 min-w-0 relative">
                        {/* Overlay de Carga Reactivo */}
                        {loading && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-50 flex flex-col items-center justify-start pt-32 transition-all duration-300">
                                <div className="bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                                    <div className="relative">
                                        <Loader2 className="w-10 h-10 text-cgr-blue animate-spin" />
                                        <div className="absolute inset-0 blur-xl bg-cgr-blue/20 animate-pulse"></div>
                                    </div>
                                    <p className="text-sm font-black text-cgr-navy uppercase tracking-tighter">Sincronizando Filtros...</p>
                                </div>
                            </div>
                        )}

                        <div className={cn("space-y-6 transition-all duration-300", loading && "opacity-40 grayscale-[0.5] blur-[1px]")}>
                            {results.length > 0 && results[0].regimen && results[0].regimen.pjo_respuesta && (
                                <PjoFeaturedSolution regimen={results[0].regimen} />
                            )}

                            {results.length > 0 ? (
                                results.map((dictamen) => (
                                    <DictamenCard key={dictamen.id} dictamen={dictamen} />
                                ))
                            ) : (
                                !loading && (
                                    <div className="bg-white border-2 border-dashed border-slate-200 p-16 rounded-3xl text-center flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
                                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
                                            <Search className="w-10 h-10 text-slate-300" />
                                        </div>
                                        <div className="space-y-2 max-w-sm">
                                            <h3 className="text-xl font-black text-cgr-navy tracking-tight">No encontramos registros</h3>
                                            <div className="text-slate-500 text-sm leading-relaxed">
                                                No hay dictámenes que coincidan con los filtros actuales:
                                                <div className="flex flex-wrap justify-center gap-2 mt-4">
                                                    {year && <span className="px-2 py-1 bg-slate-100 text-[10px] font-bold rounded border border-slate-200 uppercase">Año: {year}</span>}
                                                    {materia && <span className="px-2 py-1 bg-slate-100 text-[10px] font-bold rounded border border-slate-200 uppercase">Materia: {materia}</span>}
                                                    {tags && <span className="px-2 py-1 bg-slate-100 text-[10px] font-bold rounded border border-slate-200 uppercase">Tags: {tags}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setYear("");
                                                setMateria("");
                                                setDivision("");
                                                setTags("");
                                                setSearchParams({ q: query, page: "1" });
                                            }}
                                            className="px-6 py-2.5 bg-cgr-navy text-white text-sm font-bold rounded-xl hover:bg-cgr-blue transition-all shadow-lg hover:shadow-cgr-blue/20 uppercase tracking-widest"
                                        >
                                            Limpiar todos los filtros
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    </main>

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
        </div>
    );
}
