import { useNavigate } from "react-router-dom";
import { Search, Command } from "lucide-react";

export function SearchBar() {
    const navigate = useNavigate();

    const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const query = formData.get("q") as string;
        if (query.trim()) {
            navigate(`/buscar?q=${encodeURIComponent(query)}`);
        }
    };

    return (
        <div className="relative w-full mx-auto group z-50 transition-all duration-300 transform hover:scale-[1.01]">
            <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <Search className="h-6 w-6 text-slate-400 group-focus-within:text-cgr-navy transition-colors duration-300" />
            </div>

            <form onSubmit={handleSearch}>
                <input
                    type="text"
                    name="q"
                    className="block w-full pl-16 pr-20 py-4 lg:py-5 bg-white border border-slate-200/80 rounded-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-cgr-blue/10 focus:border-cgr-blue shadow-sm hover:shadow-md transition-all duration-300 text-lg md:text-xl font-sans"
                    placeholder="Búsqueda libre por materia, conceptos, descriptores..."
                    autoComplete="off"
                />
            </form>

            <div className="absolute inset-y-0 right-0 pr-6 flex items-center pointer-events-none transition-opacity duration-300 group-focus-within:opacity-0">
                <div className="h-8 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs font-semibold text-slate-400 shadow-sm">
                    <Command className="w-3.5 h-3.5" />
                    <span>K</span>
                </div>
            </div>

            {/* Animated Bottom Focus Line */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-gradient-to-r from-transparent via-cgr-navy to-transparent opacity-0 group-focus-within:w-2/3 group-focus-within:opacity-100 transition-all duration-500 ease-out" />
        </div>
    );
}
