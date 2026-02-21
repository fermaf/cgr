import { NavLink } from "react-router-dom";
import { Home, Search, FileText, BarChart2, Shield, CircleDot, Scale, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
    { label: "Inicio", icon: Home, href: "/" },
    { label: "Jurisprudencia", icon: FileText, href: "/dictamenes" },
    { label: "Búsqueda Avanzada", icon: Search, href: "/buscar" },
    { label: "Estadísticas", icon: BarChart2, href: "/stats" },
    { label: "Gestión Interna", icon: Shield, href: "/gestion", disabled: true },
];

export function Sidebar() {
    return (
        <aside className="w-72 bg-cgr-navy text-white min-h-screen fixed left-0 top-0 z-50 flex flex-col shadow-2xl overflow-hidden transition-all duration-300">
            {/* Subtle top subtle texture */}
            <div className="absolute inset-0 z-0 bg-white opacity-[0.02] pointer-events-none" />

            <div className="p-8 border-b border-white/10 relative z-10 flex flex-col items-start justify-center gap-2">
                <div className="flex items-center gap-4 group cursor-pointer">
                    {/* Neural / Legal abstract logo placeholder */}
                    <div className="relative w-12 h-12 bg-gradient-to-br from-cgr-blue to-blue-800 rounded-xl shadow-md flex items-center justify-center border border-blue-400/30 overflow-hidden transform transition-all group-hover:scale-105">
                        <Scale className="w-6 h-6 text-white absolute" />
                        <Sparkles className="w-3 h-3 text-cgr-gold absolute top-2 right-2 animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-serif font-bold tracking-tight text-white m-0 leading-none group-hover:text-blue-100 transition-colors">
                            CGR<span className="text-cgr-gold text-2xl">.ai</span>
                        </h1>
                        <p className="text-[10px] text-blue-200 mt-1 uppercase tracking-widest font-semibold opacity-90">Plataforma Legal</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-4 py-8 space-y-2 relative z-10">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.href}
                        to={item.href}
                        className={({ isActive }) => cn(
                            "flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group border",
                            isActive
                                ? "bg-white/10 text-white border-white/20 shadow-sm"
                                : "text-blue-200 border-transparent hover:text-white hover:bg-white/5",
                            item.disabled && "opacity-40 cursor-not-allowed pointer-events-none"
                        )}
                        onClick={(e) => item.disabled && e.preventDefault()}
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon className={cn(
                                    "w-5 h-5 transition-transform duration-300 group-hover:scale-105",
                                    isActive ? "text-white" : "text-blue-300 group-hover:text-white"
                                )} />
                                {item.label}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            <div className="p-6 border-t border-white/10 relative z-10">
                <div className="bg-black/20 p-4 rounded-xl cursor-default group border border-white/5">
                    <p className="text-[10px] text-blue-200 mb-2 font-medium uppercase tracking-wider opacity-80">Estado del Sistema</p>
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <CircleDot className="w-3 h-3 text-green-400" />
                        Online & Segura
                    </div>
                </div>
            </div>
        </aside>
    );
}
