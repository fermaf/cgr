import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
    return (
        <div className="min-h-screen bg-cgr-light text-slate-800 flex font-sans selection:bg-cgr-navy selection:text-white overflow-hidden relative">
            {/* Global grid background (official SVG pattern) */}
            <div className="absolute inset-0 z-0 bg-official opacity-100 pointer-events-none" />

            <Sidebar />

            <main className="flex-1 ml-72 flex flex-col min-h-screen relative z-10 overflow-y-auto">
                {/* Decoration top gradient */}
                <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-cgr-navy/[0.03] via-transparent to-transparent pointer-events-none -z-10" />

                <div className="w-full h-full flex-grow max-w-[1600px] mx-auto p-4 md:p-8 lg:p-10 transition-all duration-300">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
