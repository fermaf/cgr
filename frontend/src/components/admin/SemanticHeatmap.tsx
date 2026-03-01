import { ResponsiveContainer, Treemap, Tooltip as RechartsTooltip } from 'recharts';
import { Brain, Gavel, Scale, AlertTriangle } from 'lucide-react';

type SemanticData = {
    topMaterias: { materia: string; count: number }[];
    impacto: { relevantes: number; recursos: number; genera_juris: number };
};

export function SemanticHeatmap({ data }: { data: SemanticData }) {
    // Transformar materias para el Treemap
    const treemapData = data.topMaterias.map((item, index) => ({
        name: item.materia,
        size: item.count,
        fill: [
            '#0f172a', '#1e293b', '#334155', '#475569', '#64748b',
            '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc',
            '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'
        ][index % 15]
    }));

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-cgr-navy/80 to-slate-900 border border-cgr-gold/20 p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Brain className="w-32 h-32 text-cgr-gold" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm text-slate-400 font-semibold tracking-widest uppercase mb-2">Dictámenes Relevantes</p>
                        <p className="text-4xl font-black text-white">{data.impacto.relevantes.toLocaleString()}</p>
                        <p className="text-xs text-cgr-gold mt-2">Marcados por atributos_juridicos</p>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-red-500/20 p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Gavel className="w-32 h-32 text-red-500" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm text-slate-400 font-semibold tracking-widest uppercase mb-2">Recursos Protección</p>
                        <p className="text-4xl font-black text-white">{data.impacto.recursos.toLocaleString()}</p>
                        <p className="text-xs text-red-400 mt-2">Casos judicializados detectados</p>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-cgr-blue/80 to-slate-900 border border-blue-400/20 p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Scale className="w-32 h-32 text-blue-400" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm text-slate-400 font-semibold tracking-widest uppercase mb-2">Genera Jurisprudencia</p>
                        <p className="text-4xl font-black text-white">{data.impacto.genera_juris.toLocaleString()}</p>
                        <p className="text-xs text-blue-300 mt-2">Marcados por IA Generativa</p>
                    </div>
                </div>
            </div>

            {/* Treemap de Materias (Top 15) */}
            <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="text-cgr-gold w-5 h-5" />
                    Mapa de Calor Topológico (Materias más frecuentes)
                </h3>
                <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                            data={treemapData}
                            dataKey="size"
                            stroke="#1e293b"
                            fill="#8884d8"
                            content={<CustomizedContent />}
                        >
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#475569', borderRadius: '0.5rem', color: '#f8fafc' }}
                            />
                        </Treemap>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

const CustomizedContent = (props: any) => {
    const { depth, x, y, width, height, name, fill } = props;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill,
                    stroke: '#0f172a',
                    strokeWidth: 2 / (depth + 1e-10),
                    strokeOpacity: 1 / (depth + 1e-10),
                }}
            />
            {width > 50 && height > 30 && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 7}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={12}
                    className="font-medium pointer-events-none drop-shadow-md"
                >
                    {name.length > 20 ? name.substring(0, 18) + '...' : name}
                </text>
            )}
        </g>
    );
};
