export type RelationAction =
  | 'aplicado'
  | 'confirmado'
  | 'complementado'
  | 'aclarado'
  | 'reconsiderado'
  | 'reactivado'
  | 'alterado'
  | 'reconsiderado_parcialmente';

export type RelationEffectCategory =
  | 'fortalece'
  | 'desarrolla'
  | 'ajusta'
  | 'limita'
  | 'desplaza';

export type LegacyRelationBucket = 'consolida' | 'desarrolla' | 'ajusta';

export type GraphDoctrinalStatus =
  | 'criterio_estable'
  | 'criterio_en_evolucion'
  | 'criterio_fragmentado'
  | 'criterio_tensionado'
  | 'criterio_en_revision';

const ACTION_ALIASES: Record<string, RelationAction> = {
  aplicado: 'aplicado',
  confirmado: 'confirmado',
  complementado: 'complementado',
  aclarado: 'aclarado',
  reconsiderado: 'reconsiderado',
  reactivado: 'reactivado',
  alterado: 'alterado',
  reconsiderado_parcialmente: 'reconsiderado_parcialmente',
  reconsideradoparcialmente: 'reconsiderado_parcialmente',
  reconsideradoparcial: 'reconsiderado_parcialmente',
  reconsideradoparcialmente_: 'reconsiderado_parcialmente',
  reconsideradoparcialmentelegacy: 'reconsiderado_parcialmente',
  reconsideradoparcialmentev1: 'reconsiderado_parcialmente',
  reconsideradoparcialmentecanonical: 'reconsiderado_parcialmente',
  reconsideradoparcialmentecanonicalv1: 'reconsiderado_parcialmente',
  reconsideradoparcialmentecanonical_v1: 'reconsiderado_parcialmente',
  reconsideradoparcialmentecanonicalv2: 'reconsiderado_parcialmente',
  reconsideradoparcialmentecanonical_v2: 'reconsiderado_parcialmente',
  reconsideradoparcialmentev2: 'reconsiderado_parcialmente',
  reconsideradoparcialmentelegacyv1: 'reconsiderado_parcialmente',
  reconsideradoParcialmente: 'reconsiderado_parcialmente',
};

export function normalizeRelationAction(value: string | null | undefined): RelationAction | null {
  if (!value) return null;
  const compact = value.trim();
  if (!compact) return null;
  return ACTION_ALIASES[compact] ?? ACTION_ALIASES[compact.toLowerCase().replace(/\s+/g, '_')] ?? null;
}

export function classifyRelationEffect(action: string | null | undefined): RelationEffectCategory {
  const normalized = normalizeRelationAction(action);
  switch (normalized) {
    case 'aplicado':
    case 'confirmado':
      return 'fortalece';
    case 'complementado':
    case 'aclarado':
      return 'desarrolla';
    case 'reactivado':
    case 'alterado':
      return 'ajusta';
    case 'reconsiderado_parcialmente':
      return 'limita';
    case 'reconsiderado':
      return 'desplaza';
    default:
      return 'ajusta';
  }
}

export function toLegacyRelationBucket(action: string | null | undefined): LegacyRelationBucket {
  const effect = classifyRelationEffect(action);
  if (effect === 'fortalece') return 'consolida';
  if (effect === 'desarrolla') return 'desarrolla';
  return 'ajusta';
}

export function relationEffectLabel(effect: RelationEffectCategory): string {
  switch (effect) {
    case 'fortalece':
      return 'fortalece criterio';
    case 'desarrolla':
      return 'desarrolla criterio';
    case 'ajusta':
      return 'ajusta criterio';
    case 'limita':
      return 'limita criterio';
    case 'desplaza':
      return 'desplaza criterio';
  }
}
