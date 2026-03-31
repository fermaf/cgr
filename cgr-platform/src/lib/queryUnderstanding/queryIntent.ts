function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return [...new Set(
    normalize(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )];
}

type IntentDefinition = {
  label: string;
  phrases: string[];
};

type SearchLikeMatch = {
  metadata?: Record<string, unknown>;
};

type ClusterLike = {
  cluster_label?: string;
  top_descriptores_AI?: string[];
};

export type QueryIntentDetection = {
  intent_label: string;
  confidence: number;
  matched_terms: string[];
};

const CANONICAL_INTENTS: IntentDefinition[] = [
  { label: 'confianza legítima', phrases: ['confianza legitima', 'empleo a contrata', 'no renovacion', 'termino contrata', 'renovacion arbitraria'] },
  { label: 'empleo público', phrases: ['empleo publico', 'funcionario publico', 'contrata', 'estatuto administrativo'] },
  { label: 'procedimiento administrativo', phrases: ['procedimiento administrativo', 'acto administrativo', 'tramitacion', 'fundamentacion'] },
  { label: 'subsidios habitacionales', phrases: ['subsidio habitacional', 'subsidio', 'recepcion municipal', 'vivienda'] },
  { label: 'responsabilidad administrativa', phrases: ['responsabilidad administrativa', 'sumario', 'falta de servicio', 'investigacion sumaria'] },
  { label: 'invalidación administrativa', phrases: ['invalidacion administrativa', 'potestad invalidatoria', 'plazo razonable', 'dos anos'] },
  { label: 'caso fortuito', phrases: ['caso fortuito', 'fuerza mayor', 'incendio forestal', 'evento imprevisible'] },
  { label: 'potestad sancionadora', phrases: ['potestad sancionadora', 'sancion administrativa', 'procedimiento sancionatorio', 'tipicidad'] },
  { label: 'competencia administrativa', phrases: ['competencia administrativa', 'organo incompetente', 'atribuciones', 'autonomia local'] },
  { label: 'CORFO y garantías', phrases: ['corfo', 'subrogacion', 'prenda acciones', 'garantias', 'acreedor'] }
];

function matchIntent(definition: IntentDefinition, tokens: string[], semanticText: string) {
  const matchedTerms = new Set<string>();

  for (const phrase of definition.phrases) {
    const normalizedPhrase = normalize(phrase);
    if (semanticText.includes(normalizedPhrase)) {
      matchedTerms.add(phrase);
      continue;
    }

    const phraseTokens = tokenize(phrase);
    const tokenOverlap = phraseTokens.filter((token) => tokens.includes(token)).length;
    if (tokenOverlap >= Math.max(1, Math.ceil(phraseTokens.length * 0.5))) {
      matchedTerms.add(phrase);
    }
  }

  const directLabelMatch = semanticText.includes(normalize(definition.label));
  const score = matchedTerms.size + (directLabelMatch ? 1.2 : 0);
  return {
    matchedTerms: [...matchedTerms],
    score
  };
}

export function detectQueryIntent(params: {
  query: string;
  rewrittenQuery?: string | null;
  matches?: SearchLikeMatch[];
  clusters?: ClusterLike[];
}): QueryIntentDetection | null {
  const semanticFragments: string[] = [params.query];
  if (params.rewrittenQuery) semanticFragments.push(params.rewrittenQuery);

  for (const match of params.matches ?? []) {
    const metadata = match.metadata ?? {};
    semanticFragments.push(String(metadata.materia ?? ''));
    semanticFragments.push(String(metadata.titulo ?? ''));
    semanticFragments.push(String(metadata.Resumen ?? metadata.resumen ?? ''));
    if (Array.isArray(metadata.descriptores_AI)) {
      semanticFragments.push(metadata.descriptores_AI.map(String).join(' '));
    }
  }

  for (const cluster of params.clusters ?? []) {
    semanticFragments.push(String(cluster.cluster_label ?? ''));
    if (Array.isArray(cluster.top_descriptores_AI)) {
      semanticFragments.push(cluster.top_descriptores_AI.join(' '));
    }
  }

  const semanticText = normalize(semanticFragments.join(' '));
  const tokens = tokenize(semanticText);
  const scored = CANONICAL_INTENTS
    .map((definition) => ({
      definition,
      ...matchIntent(definition, tokens, semanticText)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || right.matchedTerms.length - left.matchedTerms.length
      || left.definition.label.localeCompare(right.definition.label)
    ));

  const best = scored[0];
  if (!best) return null;

  return {
    intent_label: best.definition.label,
    confidence: Math.max(0.35, Math.min(0.92, Number((best.score / 4.5).toFixed(2)))),
    matched_terms: best.matchedTerms.slice(0, 4)
  };
}

export function buildIntentBoost(params: {
  intent: QueryIntentDetection | null;
  clusterLabel: string;
  materia: string | null;
  topDescriptors: string[];
}): number {
  if (!params.intent) return 0;

  const semanticText = normalize([
    params.clusterLabel,
    params.materia ?? '',
    ...params.topDescriptors
  ].join(' '));

  const matchedTerms = params.intent.matched_terms.filter((term) => semanticText.includes(normalize(term))).length;
  const labelMatch = semanticText.includes(normalize(params.intent.intent_label));

  if (!labelMatch && matchedTerms === 0) return 0;

  const baseBoost = labelMatch ? 0.18 : 0.08;
  const detailBoost = Math.min(0.14, matchedTerms * 0.04);
  return Number(((baseBoost + detailBoost) * params.intent.confidence).toFixed(2));
}
