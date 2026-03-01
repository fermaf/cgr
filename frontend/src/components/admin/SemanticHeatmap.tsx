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
            '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9',
            '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6',
            '#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8'
        ][index % 15]
    }));

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Brain className="w-32 h-32 text-cgr-gold" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm text-slate-500 font-semibold tracking-widest uppercase mb-2">Dictámenes Relevantes</p>
                        <p className="text-4xl font-black text-slate-800">{data.impacto.relevantes.toLocaleString()}</p>
                        <p className="text-xs text-cgr-gold mt-2 font-medium">Marcados por atributos_juridicos</p>
                    </div>
                </div>

                <div className="bg-white border border-red-200 shadow-sm p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Gavel className="w-32 h-32 text-red-500" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm text-slate-500 font-semibold tracking-widest uppercase mb-2">Recursos Protección</p>
                        <p className="text-4xl font-black text-slate-800">{data.impacto.recursos.toLocaleString()}</p>
                        <p className="text-xs text-red-500 mt-2 font-medium">Casos judicializados detectados</p>
                    </div>
                </div>

                <div className="bg-white border border-blue-200 shadow-sm p-6 rounded-2xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Scale className="w-32 h-32 text-blue-500" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-sm text-slate-500 font-semibold tracking-widest uppercase mb-2">Genera Jurisprudencia</p>
                        <p className="text-4xl font-black text-slate-800">{data.impacto.genera_juris.toLocaleString()}</p>
                        <p className="text-xs text-blue-600 mt-2 font-medium">Marcados por IA Generativa</p>
                    </div>
                </div>
            </div>

            {/* Treemap de Materias (Top 15) */}
            <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <AlertTriangle className="text-cgr-gold w-5 h-5" />
                    Mapa de Calor Topológico (Materias más frecuentes)
                </h3>
                <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                            data={treemapData}
                            dataKey="size"
                            stroke="#ffffff"
                            fill="#8884d8"
                            content={<CustomizedContent />}
                        >
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: '#e2e8f0', borderRadius: '0.5rem', color: '#1e293b' }}
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

    // No dibujar fondo para el nodo root para evitar que cubra u oscurezca los hijos
    if (depth === 0) {
        return null;
    }

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill,
                    stroke: '#ffffff',
                    strokeWidth: 2,
                }}
            />
            {width > 50 && height > 30 && name && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 7}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize={13}
                    fontWeight={600}
                    className="pointer-events-none"
                    style={{ textShadow: '0px 1px 2px rgba(255,255,255,0.9)' }}
                >
                    {name.length > 20 ? name.substring(0, 18) + '...' : name}
                </text>
            )}
        </g>
    );
};
