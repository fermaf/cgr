# RFC: Conectividad de Metadata Doctrinal al Frontend

## Status
**IMPLEMENTADO** - 2026-04-22 (Fases 1-5 completadas)

## Estado de Implementación

| Fase | Descripción | Estado |
|------|-------------|--------|
| FASE 1 | Tipos sincronizados en frontend (`DoctrinalMetadata`, `DoctrinalRole`, `DoctrinalValidityState`, `ReadingRole`) | ✅ Implementado |
| FASE 2 | Extender `DictamenMeta` y `DoctrineLine` con campo `doctrinal_metadata` | ✅ Implementado |
| FASE 3 | Componente `DoctrineVigilanceBadge` | ✅ Implementado (`frontend/src/components/doctrine/`) |
| FASE 4 | Componente `ReadingRoleIndicator` | ✅ Implementado (`frontend/src/components/doctrine/`) |
| FASE 5 | Integración en `DictamenDetail.tsx` | ✅ Implementado |
| FASE 6 | Endpoint `/api/v1/dictamenes` con filtros de metadata | ✅ Implementado |
| FASE 7 | Metadata en Pinecone | ⏳ Pendiente (propuesta abajo) |

## Contexto

La metadata doctrinal (`estado_vigencia`, `reading_role`, `reading_weight`, `currentness_score`, `confidence_global`) existe en el backend y es calculada por el pipeline en `doctrinalMetadata.ts`, pero:

1. **Tipos frontend desincronizados**: `DoctrineLine` (types.ts:275) no define `doctrinal_metadata`
2. **Solo 1 componente lo consume parcialmente**: `RegimenView.tsx` muestra `estado_vigencia` de forma binaria
3. **Sin filtros en API**: No se puede buscar "solo dictámenes vigentes" o "entradas doctrine actuales"
4. **Metadata no está en Pinecone**: No permite filtering vectorial

## Proposal

### FASE 1: Sincronización de Tipos (1 día)

Agregar tipos sincronizados al frontend que reflejen la metadata real del backend.

```typescript
// frontend/src/types.ts - AGREGAR

export type DoctrinalRole =
  | 'nucleo_doctrinal'
  | 'aplicacion'
  | 'aclaracion'
  | 'complemento'
  | 'ajuste'
  | 'limitacion'
  | 'desplazamiento'
  | 'reactivacion'
  | 'cierre_competencial'
  | 'materia_litigiosa'
  | 'abstencion'
  | 'criterio_operativo_actual'
  | 'hito_historico'
  | 'contexto_no_central';

export type DoctrinalValidityState =
  | 'vigente_visible'
  | 'vigente_tensionado'
  | 'vigente_en_revision'
  | 'desplazado_parcialmente'
  | 'desplazado'
  | 'valor_historico'
  | 'indeterminado';

export type ReadingRole =
  | 'entrada_semantica'
  | 'entrada_doctrinal'
  | 'estado_actual'
  | 'ancla_historica'
  | 'pivote_de_cambio'
  | 'soporte_contextual';

export interface DoctrinalMetadata {
  rol_principal: DoctrinalRole;
  estado_vigencia: DoctrinalValidityState;
  estado_intervencion_cgr: string;
  reading_role: ReadingRole;
  reading_weight: number;
  currentness_score: number;
  confidence_global: number;
}
```

### FASE 2: Extender `DictamenMeta` y `DoctrineLine`

```typescript
// En frontend/src/types.ts

// Extender DictamenMeta (línea 52) - AGREGAR CAMPO:
export interface DictamenMeta {
  // ... campos existentes ...
  doctrinal_metadata?: DoctrinalMetadata;  // NUEVO
  // ...
}

// Extender DoctrineLine (línea 275) - AGREGAR CAMPO:
export interface DoctrineLine {
  // ... campos existentes ...
  doctrinal_metadata?: DoctrinalMetadata;  // NUEVO
  // ...
}
```

### FASE 3: Componente `DoctrineVigilanceBadge` (2 días)

Componente reutilizable que traduce `estado_vigencia` a señal visual clara.

```tsx
// frontend/src/components/DoctrineVigilanceBadge.tsx

import { cn } from "../lib/utils";

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
```

### FASE 4: Componente `ReadingRoleIndicator` (1 día)

Guía visual para el cliente sobre cómo leer e interpretar un dictamen.

```tsx
// frontend/src/components/ReadingRoleIndicator.tsx

import { BookOpen, History, Zap, Lightbulb, ArrowRight, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";

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
```

### FASE 5: Nuevo Endpoint con Filtros de Metadata (3 días)

Extender `/api/v1/dictamenes` para permitir filtering por metadata doctrinal.

```typescript
// cgr-platform/src/index.ts - AGREGAR endpoint o parámetros

// GET /api/v1/dictamenes?estado_vigencia=vigente_visible&reading_role=estado_actual&min_confidence=0.7

// Query params propuestos:
interface DictamenFilterParams {
  // Filtros existentes
  materia?: string;
  anio?: number;
  page?: number;
  limit?: number;

  // NUEVOS Filtros de metadata doctrinal
  estado_vigencia?: DoctrinalValidityState | DoctrinalValidityState[];
  reading_role?: ReadingRole | ReadingRole[];
  rol_principal?: DoctrinalRole | DoctrinalRole[];
  min_confidence?: number;
  max_confidence?: number;
  min_currentness?: number;
  max_currentness?: number;
  supports_state_current?: boolean;
  signals_abstention?: boolean;
  signals_litigious_matter?: boolean;
}
```

### FASE 6: Metadata en Pinecone para Filtering Híbrido (5 días)

Extender el schema de Pinecone para incluir `estado_vigencia` y `reading_role`.

```typescript
// En vectorizationWorkflow.ts - MODIFICAR upsertRecord

interface DictamenVectorRecord {
  id: string;
  values: number[];  // embedding
  metadata: {
    // ... campos existentes ...
    // NUEVOS - metadata doctrinal
    estado_vigencia?: string;
    reading_role?: string;
    reading_weight?: number;
    currentness_score?: number;
    confidence_global?: number;
    rol_principal?: string;
  };
}

// Beneficio: permite filtering vectorial como:
// await pinecone.queryRecords({
//   vector: queryEmbedding,
//   filter: {
//     estado_vigencia: { $eq: 'vigente_visible' },
//     reading_weight: { $gte: 0.7 }
//   },
//   topK: 20
// });
```

### FASE 7: Componente `DoctrineSearchFilters` (2 días)

UI para que el cliente final filtre resultados por metadata.

```tsx
// frontend/src/components/DoctrineSearchFilters.tsx

interface DoctrineSearchFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  activeFilters: FilterState;
}

interface FilterState {
  estadoVigencia: string[];
  readingRole: string[];
  minConfidence: number;
  minCurrentness: number;
  onlySupportsCurrent: boolean;
}

const VIGENCIA_OPTIONS = [
  { value: 'vigente_visible', label: 'Vigente' },
  { value: 'vigente_tensionado', label: 'En tensión' },
  { value: 'vigente_en_revision', label: 'En revisión' },
  { value: 'desplazado_parcialmente', label: 'Parcialmente desplazado' },
  { value: 'desplazado', label: 'Desplazado' },
  { value: 'valor_historico', label: 'Valor histórico' },
];

const READING_ROLE_OPTIONS = [
  { value: 'estado_actual', label: 'Estado actual' },
  { value: 'entrada_doctrinal', label: 'Entrada doctrinal' },
  { value: 'pivote_de_cambio', label: 'Pivote de cambio' },
  { value: 'ancla_historica', label: 'Ancla histórica' },
  { value: 'entrada_semantica', label: 'Entrada semántica' },
];

export function DoctrineSearchFilters({ onFilterChange, activeFilters }: DoctrineSearchFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
      {/* Filtro por vigencia */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Estado de vigencia</label>
        <select
          multiple
          className="border rounded px-2 py-1 text-sm"
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, opt => opt.value);
            onFilterChange({ ...activeFilters, estadoVigencia: selected });
          }}
        >
          {VIGENCIA_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Filtro por reading role */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Rol de lectura</label>
        <select
          multiple
          className="border rounded px-2 py-1 text-sm"
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, opt => opt.value);
            onFilterChange({ ...activeFilters, readingRole: selected });
          }}
        >
          {READING_ROLE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Filtro por confianza mínima */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">
          Confianza mínima: {activeFilters.minConfidence.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={activeFilters.minConfidence}
          onChange={(e) => onFilterChange({
            ...activeFilters,
            minConfidence: parseFloat(e.target.value)
          })}
        />
      </div>

      {/* Toggle solo vigentes */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="supports-current"
          checked={activeFilters.onlySupportsCurrent}
          onChange={(e) => onFilterChange({
            ...activeFilters,
            onlySupportsCurrent: e.target.checked
          })}
        />
        <label htmlFor="supports-current" className="text-sm">
          Solo criterios que soporta estado actual
        </label>
      </div>
    </div>
  );
}
```

## Impacto Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Componentes que usan metadata | 1 (parcial) | 6+ |
| Tipos sincronizados | NO | SÍ |
| Filtros de búsqueda | 0 | 8+ |
| Metadata en vector store | NO | SÍ |
| Guia visible para cliente | NO | SÍ (badges + indicators) |

## Riskos y Mitigaciones

1. **Riesgo**: Agregar muchos campos a Pinecone aumenta latency de upsert
   - **Mitigación**: Solo agregar campos filtrables, no todo el snapshot

2. **Riesgo**: Breaking changes en API
   - **Mitigación**: Nuevos parámetros son opcionales, backward compatible

3. **Riesgo**: Sobrecarga de información para el usuario
   - **Mitigación**: Usar componentes compuestos que se muestran solo cuando hay data relevante

## Orden de Implementación Recomendada

1. FASE 1 + 2 (Types) - Inmediato, bajo riesgo
2. FASE 3 (DoctrineVigilanceBadge) - UI rápida, alto impacto visual
3. FASE 4 (ReadingRoleIndicator) - UI rápida, alto impacto en UX
4. FASE 5 (Endpoint filters) - Backend, necesario para FASE 7
5. FASE 6 (Pinecone metadata) - Background, mejora gradual
6. FASE 7 (SearchFilters UI) - Completa el loop

## Alternativas Consideradas

1. **No hacer nada**: La metadata ya existe en backend, pero el cliente no se beneficia
2. **Rediseño completo**: Reemplazar todo el sistema de búsqueda con metadata - demasiado riesgo
3. **Esta propuesta**: Iterativa, cada fase aporta valor independiente