import { Brain, Gavel, Scale, TrendingUp } from 'lucide-react';

type SemanticData = {
    topMaterias: { materia: string; count: number }[];
    impacto: { relevantes: number; recursos: number; jurisprudencia: number };
};

export function SemanticHeatmap({ data }: { data: SemanticData }) {
    const maxCount = Math.max(...data.topMaterias.map(m => m.count), 1);

    return (
        <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Brain className="w-32 h-32 text-cgr-gold" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">Dictámenes Relevantes</p>
                        <p className="text-4xl font-black text-cgr-navy tracking-tighter">{data.impacto.relevantes.toLocaleString()}</p>
                        <p className="text-[10px] text-cgr-gold mt-2 font-bold uppercase tracking-tight">Atributos Jurídicos Detectados</p>
                    </div>
                </div>

                <div className="bg-white border border-red-100 shadow-sm p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Gavel className="w-32 h-32 text-red-500" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">Recursos Protección</p>
                        <p className="text-4xl font-black text-slate-800 tracking-tighter">{data.impacto.recursos.toLocaleString()}</p>
                        <p className="text-[10px] text-red-500 mt-2 font-bold uppercase tracking-tight">Casos Judicializados</p>
                    </div>
                </div>

                <div className="bg-white border border-blue-100 shadow-sm p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Scale className="w-32 h-32 text-blue-500" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">Genera Jurisprudencia</p>
                        <p className="text-4xl font-black text-slate-800 tracking-tighter">{data.impacto.jurisprudencia.toLocaleString()}</p>
                        <p className="text-[10px] text-blue-600 mt-2 font-bold uppercase tracking-tight">Criterio Oficial</p>
                    </div>
                </div>
            </div>

            {/* Ranking de Densidad de Materias */}
            <div className="bg-white border border-slate-200 shadow-sm p-8 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <TrendingUp className="w-32 h-32 text-cgr-blue" />
                </div>

                <div className="mb-10 relative z-10">
                    <h3 className="text-xl font-black text-cgr-navy font-sans uppercase tracking-tight flex items-center gap-3">
                        <span className="w-10 h-1 bg-gradient-to-r from-cgr-blue to-cyan-400 rounded-full"></span>
                        Ranking de Densidad Semántica
                    </h3>
                    <p className="text-slate-500 mt-2 font-medium">Materias más frecuentes y su volumen de impacto institucional.</p>
                </div>

                <div className="space-y-4 relative z-10">
                    {data.topMaterias.map((item, idx) => {
                        const colors = ['bg-rose-500', 'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500'];
                        const color = colors[idx % colors.length];
                        const percentage = (item.count / maxCount) * 100;

                        return (
                            <div key={idx} className="group flex flex-col space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-[13px] font-black text-slate-700 uppercase tracking-tight group-hover:text-cgr-blue transition-colors max-w-[85%] truncate">
                                        {idx + 1}. {item.materia}
                                    </span>
                                    <span className="text-sm font-mono font-black text-slate-400 group-hover:text-slate-900 transition-colors">
                                        {item.count.toLocaleString()}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-100 ring-1 ring-black/5">
                                    <div
                                        className={`${color} h-full rounded-full transition-all duration-1000 ease-out shadow-lg opacity-80 group-hover:opacity-100 group-hover:shadow-[0_0_15px_rgba(0,0,0,0.2)]`}
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
