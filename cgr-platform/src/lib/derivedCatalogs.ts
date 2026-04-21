import {
  normalizeLegalSourceForStorage,
  formatCanonicalLegalSourceLabel,
  type LegalSourceLike
} from './legalSourcesCanonical';

/**
 * Normaliza una etiqueta para su uso como clave de busqueda/identidad (etiqueta_norm).
 * Requisitos: trim, lowercase, quitar punto final, colapsar espacios.
 */
export function normalizeEtiquetaNorm(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '') // Quitar puntos al final
    .replace(/\s+/g, ' ') // Colapsar espacios internos
    .trim();
}

/**
 * Normaliza una etiqueta para su visualizacion (etiqueta_display).
 * Requisitos: Primera mayuscula, con punto final.
 */
export function normalizeEtiquetaDisplay(input: string): string {
  const norm = normalizeEtiquetaNorm(input);
  if (!norm) return '';

  // Capitalizar primera letra
  const display = norm.charAt(0).toUpperCase() + norm.slice(1);

  // Asegurar punto final
  return display.endsWith('.') ? display : `${display}.`;
}

/**
 * Genera un slug estable a partir de la forma normalizada.
 * Requisitos: remover diacriticos, kebab-case.
 */
export function etiquetaSlugFromNorm(norm: string): string {
  if (!norm) return '';
  return norm
    .normalize('NFD') // Descomponer caracteres con acento
    .replace(/[\u0300-\u036f]/g, '') // Quitar diacriticos
    .replace(/[^a-z0-9]+/g, '-') // Reemplazar no-alfanumericos por guion
    .replace(/(^-|-$)/g, ''); // Quitar guiones al inicio/final
}

/**
 * Genera una clave unica deterministica para una norma juridica (norma_key).
 * Reutiliza las reglas de normalización de legalSourcesCanonical.
 */
export function buildFuenteNormaKey(input: {
  tipo_norma?: string | null;
  numero?: string | null;
  articulo?: string | null;
  year?: string | null;
  sector?: string | null;
}): string | null {
  if (!input.tipo_norma) return null;

  // Helpers internos para normalización local
  const keyPart = (value: string | null | undefined): string => {
    return value && value.trim() ? value.trim() : '-';
  };

  const normalizeKeyPart = (value: string | null | undefined): string => {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  const isRellenoLocal = (val: string | null | undefined): boolean => {
    if (!val) return false;
    const v = normalizeKeyPart(val);
    return v.includes('valor de relleno') || v === 'n/a' || v === 'desconocido';
  };

  // Filtrar si el tipo o el número son explícitamente valores de relleno.
  // SE MANTIENE el descarte si el campo número tiene basura explícita ('n/a', 'relleno').
  // Pero permitimos que sea null/vacío para rescatar códigos.
  if (isRellenoLocal(input.tipo_norma) || isRellenoLocal(input.numero)) return null;

  // Normalizar campos utilizando la lógica compartida (reutiliza compact, normalizeNumber, etc.)
  const norm = normalizeLegalSourceForStorage(input as LegalSourceLike);

  if (!norm.tipo_norma || isRellenoLocal(norm.tipo_norma)) return null;

  const typeKey = normalizeKeyPart(norm.tipo_norma);

  // Caso 1: Leyes y Decretos Ley (Tipo|Numero|Articulo)
  if (typeKey === 'ley' || typeKey === 'dl') {
    return [
      norm.tipo_norma,
      keyPart(norm.numero),
      keyPart(norm.articulo)
    ].join('|');
  }

  // Caso 2: Constitución y Códigos (Tipo|Articulo)
  if (typeKey.includes('constitucion') || typeKey.includes('codigo')) {
    return [
      norm.tipo_norma,
      keyPart(norm.articulo)
    ].join('|');
  }

  // Caso 3: Normas administrativas (DFL, Decretos, Resoluciones) (Tipo|Numero|Year|Sector|Articulo)
  return [
    norm.tipo_norma,
    keyPart(norm.numero),
    keyPart(norm.year),
    keyPart(norm.sector),
    keyPart(norm.articulo)
  ].join('|');
}

/**
 * Construye una etiqueta legible para la norma.
 */
export function buildFuenteDisplayLabel(input: {
  tipo_norma: string;
  numero?: string | null;
  articulo?: string | null;
  year?: string | null;
  sector?: string | null;
}): string {
  let label = formatCanonicalLegalSourceLabel(input as LegalSourceLike);

  if (!label) {
    // Fallback simple si el formatter falla
    const parts = [input.tipo_norma];
    if (input.numero) parts.push(input.numero);
    if (input.year) parts.push(`(${input.year})`);
    label = parts.join(' ');
  }

  // Si existe artículo y no está ya incluido en el label (para nombres canónicos), lo agregamos
  if (input.articulo && !label.toLowerCase().includes(`art. ${input.articulo.toLowerCase()}`)) {
    return `${label}, art. ${input.articulo}`;
  }

  return label;
}
