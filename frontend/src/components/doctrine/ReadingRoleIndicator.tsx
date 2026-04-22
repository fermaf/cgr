import { BookOpen, History, Zap, Lightbulb, ArrowRight, HelpCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface ReadingRoleIndicatorProps {
  role: string;
  weight: number;
  className?: string;
}

const ROLE_CONFIG: Record<string, {
  icon: typeof BookOpen;
  label: string;
  color: string;
  guidance: string;
}> = {
  entrada_doctrinal: {
    icon: BookOpen,
    label: "Entrada doctrinal",
    color: "text-blue-600",
    guidance: "Punto de entrada recomendado. Empiece por aquí."
  },
  entrada_semantica: {
    icon: Lightbulb,
    label: "Entrada semántica",
    color: "text-yellow-600",
    guidance: "Buen punto de partida para entender el tema."
  },
  estado_actual: {
    icon: ArrowRight,
    label: "Estado actual",
    color: "text-green-600",
    guidance: "Representa el criterio vigente en este momento."
  },
  ancla_historica: {
    icon: History,
    label: "Ancla histórica",
    color: "text-purple-600",
    guidance: "Referencia histórica importante. Útil para contexto."
  },
  pivote_de_cambio: {
    icon: Zap,
    label: "Pivote de cambio",
    color: "text-red-600",
    guidance: "Indica un cambio relevante en el criterio. Leer con atención."
  },
  soporte_contextual: {
    icon: HelpCircle,
    label: "Soporte contextual",
    color: "text-gray-600",
    guidance: "Provee contexto pero no es entrada principal."
  }
};

export function ReadingRoleIndicator({ role, weight, className }: ReadingRoleIndicatorProps) {
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.soporte_contextual;
  const Icon = config.icon;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn("flex items-center gap-2 text-sm font-medium", config.color)}>
        <Icon className="w-4 h-4" />
        <span>{config.label}</span>
        {weight >= 0.8 && (
          <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
            Alta prioridad
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">{config.guidance}</p>
    </div>
  );
}