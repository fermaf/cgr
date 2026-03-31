type CanonicalEntry = {
  canonicalType: string;
  canonicalNumber?: string | null;
  displayName?: string | null;
  aliases?: string[];
  confidence: 'alta' | 'media';
  issuer?: string | null;
  year?: string | null;
};

export type LegalSourceLike = {
  tipo_norma?: string | null;
  numero?: string | null;
  articulo?: string | null;
  extra?: string | null;
  year?: string | number | null;
  sector?: string | null;
};

export type NormalizedLegalSource = {
  tipo_norma: string | null;
  numero: string | null;
  articulo: string | null;
  extra: string | null;
  year: string | null;
  sector: string | null;
  canonical_name: string | null;
  display_label: string | null;
  confidence: 'alta' | 'media' | 'baja';
  review_status: 'alta_confianza' | 'media_confianza' | 'revisar';
  canonical_key: string;
};

function compact(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[º°]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumberForStorage(tipoNorma: string | null, numero: string | null): string | null {
  const cleanNumber = compact(numero);
  if (!cleanNumber) return null;
  const compactDigits = cleanNumber.replace(/\s+/g, '');
  const typeKey = normalizeKey(tipoNorma);
  if (
    ['ley', 'dl', 'dfl', 'decreto', 'decreto supremo', 'resolucion', 'resolucion exenta', 'oficio circular'].includes(typeKey)
    && /^[0-9.]+$/.test(compactDigits)
  ) {
    return compactDigits.replace(/\./g, '');
  }
  return cleanNumber;
}

function normalizeYear(value: string | number | null | undefined): string | null {
  const normalized = compact(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})(?:\.0)?$/);
  return match ? match[1] : normalized;
}

function normalizeArticle(value: string | null | undefined): string | null {
  const article = compact(value);
  if (!article) return null;
  return article
    .replace(/^art(?:[íi]culo)?\.?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeExtraForStorage(value: string | null | undefined): string | null {
  const note = compact(value);
  if (!note) return null;
  return note
    .replace(/\s+/g, ' ')
    .replace(/^inc(?:iso)?\/?/i, 'inciso ')
    .replace(/^lt\/?/i, 'letra ')
    .replace(/^num\/?/i, 'número ')
    .trim();
}

const TYPE_ALIAS_MAP: Record<string, CanonicalEntry> = {
  ley: { canonicalType: 'Ley', confidence: 'alta' },
  dfl: { canonicalType: 'DFL', confidence: 'alta' },
  dl: { canonicalType: 'DL', confidence: 'alta' },
  dto: { canonicalType: 'Decreto', confidence: 'alta' },
  decreto: { canonicalType: 'Decreto', confidence: 'alta' },
  ds: { canonicalType: 'Decreto Supremo', confidence: 'alta' },
  'decreto supremo': { canonicalType: 'Decreto Supremo', confidence: 'alta' },
  res: { canonicalType: 'Resolución', confidence: 'alta' },
  resolucion: { canonicalType: 'Resolución', confidence: 'alta' },
  'resolucion exenta': { canonicalType: 'Resolución Exenta', confidence: 'alta' },
  'oficio circular': { canonicalType: 'Oficio Circular', confidence: 'alta' },
  oficio: { canonicalType: 'Oficio', confidence: 'alta' },
  ctr: { canonicalType: 'Código del Trabajo', displayName: 'Código del Trabajo', confidence: 'alta' },
  cci: { canonicalType: 'Código Civil', displayName: 'Código Civil', confidence: 'alta' },
  cag: { canonicalType: 'Código de Aguas', displayName: 'Código de Aguas', confidence: 'alta' },
  csa: { canonicalType: 'Código Sanitario', displayName: 'Código Sanitario', confidence: 'alta' },
  pol: {
    canonicalType: 'Constitución Política de la República',
    displayName: 'Constitución Política de la República',
    confidence: 'alta',
  },
  constitucion: {
    canonicalType: 'Constitución Política de la República',
    displayName: 'Constitución Política de la República',
    confidence: 'alta',
  },
  'constitucion politica': {
    canonicalType: 'Constitución Política de la República',
    displayName: 'Constitución Política de la República',
    confidence: 'alta',
  },
  cpr: {
    canonicalType: 'Constitución Política de la República',
    displayName: 'Constitución Política de la República',
    confidence: 'alta',
  },
};

const CANONICAL_BY_TYPE_AND_NUMBER: CanonicalEntry[] = [
  {
    canonicalType: 'Ley',
    canonicalNumber: '18834',
    displayName: 'Estatuto Administrativo',
    confidence: 'alta',
  },
  {
    canonicalType: 'Ley',
    canonicalNumber: '18883',
    displayName: 'Estatuto Administrativo para Funcionarios Municipales',
    confidence: 'alta',
  },
  {
    canonicalType: 'Ley',
    canonicalNumber: '18575',
    displayName: 'Ley Orgánica Constitucional de Bases Generales de la Administración del Estado',
    confidence: 'alta',
  },
  {
    canonicalType: 'Ley',
    canonicalNumber: '19880',
    displayName: 'Ley de Bases de los Procedimientos Administrativos',
    confidence: 'alta',
  },
  {
    canonicalType: 'Ley',
    canonicalNumber: '19886',
    displayName: 'Ley de Compras Públicas',
    confidence: 'alta',
  },
  {
    canonicalType: 'Ley',
    canonicalNumber: '10336',
    displayName: 'Ley Orgánica de la Contraloría General de la República',
    confidence: 'alta',
  },
];

function findCanonicalEntry(tipoNorma: string | null, numero: string | null): CanonicalEntry | null {
  const typeKey = normalizeKey(tipoNorma);
  const direct = TYPE_ALIAS_MAP[typeKey];
  const normalizedType = direct?.canonicalType ?? tipoNorma ?? null;
  const normalizedNumber = normalizeNumberForStorage(normalizedType, numero);
  return CANONICAL_BY_TYPE_AND_NUMBER.find((entry) =>
    entry.canonicalType === normalizedType && (entry.canonicalNumber ?? null) === normalizedNumber
  ) ?? direct ?? null;
}

export function normalizeLegalSourceForStorage(source: LegalSourceLike) {
  const rawType = compact(source.tipo_norma);
  const entry = findCanonicalEntry(rawType, compact(source.numero));
  const tipo_norma = entry?.canonicalType ?? rawType;
  const numero = normalizeNumberForStorage(tipo_norma, compact(source.numero));
  const articulo = normalizeArticle(source.articulo ?? null);
  const extra = normalizeExtraForStorage(source.extra ?? null);
  const year = normalizeYear(source.year ?? null);
  const sector = compact(source.sector) ?? (entry?.displayName ?? null);

  return {
    tipo_norma,
    numero,
    articulo,
    extra,
    year,
    sector
  };
}

function formatLawNumber(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return value;
  if (value.length <= 4) return value;
  return `${value.slice(0, value.length - 3)}.${value.slice(-3)}`;
}

export function formatCanonicalLegalSourceLabel(source: LegalSourceLike): string | null {
  const normalized = normalizeLegalSourceForStorage(source);
  const entry = findCanonicalEntry(normalized.tipo_norma, normalized.numero);
  if (entry?.displayName) {
    const numberLabel = normalized.tipo_norma === 'Ley' && normalized.numero
      ? ` (Ley ${formatLawNumber(normalized.numero)})`
      : '';
    return `${entry.displayName}${numberLabel}`;
  }

  const numberLabel = normalized.numero
    ? (normalized.tipo_norma === 'Ley' ? formatLawNumber(normalized.numero) : normalized.numero)
    : null;
  if (normalized.tipo_norma && numberLabel) return `${normalized.tipo_norma} ${numberLabel}`;
  return normalized.tipo_norma ?? null;
}

export function normalizeLegalSourceForPresentation(source: LegalSourceLike): NormalizedLegalSource {
  const normalized = normalizeLegalSourceForStorage(source);
  const entry = findCanonicalEntry(normalized.tipo_norma, normalized.numero);
  const confidence = entry?.confidence ?? 'baja';
  const review_status = confidence === 'alta'
    ? 'alta_confianza'
    : confidence === 'media'
      ? 'media_confianza'
      : 'revisar';

  return {
    ...normalized,
    canonical_name: entry?.displayName ?? null,
    display_label: formatCanonicalLegalSourceLabel(normalized),
    confidence,
    review_status,
    canonical_key: [
      normalizeKey(normalized.tipo_norma),
      normalizeNumberForStorage(normalized.tipo_norma, normalized.numero) ?? '',
      normalizeYear(normalized.year),
      normalizeKey(normalized.sector)
    ].join('::')
  };
}
