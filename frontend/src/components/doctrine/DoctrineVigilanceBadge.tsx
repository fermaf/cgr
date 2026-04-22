import { cn } from "../../lib/utils";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "info";

interface DoctrineVigilanceBadgeProps {
  estado: string;
  confidence?: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const VIGILANCE_CONFIG: Record<string, { label: string; variant: BadgeVariant; description: string }> = {
  vigente_visible: {
    label: "Vigente",
    variant: "success",
    description: "Criterio vigente y visible en la práctica"
  },
  vigente_tensionado: {
    label: "En tensión",
    variant: "warning",
    description: "Criterio vigente pero con tensiones recientes"
  },
  vigente_en_revision: {
    label: "En revisión",
    variant: "warning",
    description: "Criterio vigente pero bajo revisión activa"
  },
  desplazado_parcialmente: {
    label: "Parc. desplazado",
    variant: "danger",
    description: "Criterio parcialmente desplazado por nueva línea"
  },
  desplazado: {
    label: "Desplazado",
    variant: "danger",
    description: "Criterio desplazado por nueva doctrina"
  },
  valor_historico: {
    label: "Valor histórico",
    variant: "neutral",
    description: "Criterio histórico relevante para contexto"
  },
  indeterminado: {
    label: "Indeterminado",
    variant: "neutral",
    description: "Vigencia no determinada"
  }
};

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  success: "bg-green-100 text-green-800 border-green-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  danger: "bg-red-100 text-red-800 border-red-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
  info: "bg-blue-100 text-blue-800 border-blue-200"
};

export function DoctrineVigilanceBadge({
  estado,
  confidence,
  showLabel = true,
  size = "md",
  className
}: DoctrineVigilanceBadgeProps) {
  const config = VIGILANCE_CONFIG[estado] ?? {
    label: estado,
    variant: "neutral" as BadgeVariant,
    description: ""
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center rounded-full border font-medium",
          VARIANT_STYLES[config.variant],
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
        )}
        title={config.description}
      >
        {showLabel && config.label}
      </span>
      {confidence !== undefined && confidence < 0.58 && (
        <span className="text-xs text-amber-600" title="Requiere revisión manual">
          ⚠️ baja confianza
        </span>
      )}
    </div>
  );
}