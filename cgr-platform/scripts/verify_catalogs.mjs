import {
  normalizeEtiquetaNorm,
  normalizeEtiquetaDisplay,
  etiquetaSlugFromNorm,
  buildFuenteNormaKey,
  buildFuenteDisplayLabel
} from '../src/lib/derivedCatalogs.ts';

const cases = [
  {
    name: 'Etiqueta Normalización',
    fn: () => normalizeEtiquetaNorm(" Contratación Pública. ") === normalizeEtiquetaNorm("contratación   pública"),
    expected: true
  },
  {
    name: 'Etiqueta Display',
    fn: () => normalizeEtiquetaDisplay("contratación pública") === "Contratación pública.",
    expected: true
  },
  {
    name: 'Etiqueta Slug',
    fn: () => etiquetaSlugFromNorm("contratación pública") === "contratacion-publica",
    expected: true
  },
  {
    name: 'Fuente Key - Diferenciación por artículo (Ley)',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Ley", numero: "18.834", articulo: "1" }) !== buildFuenteNormaKey({ tipo_norma: "Ley", numero: "18.834", articulo: "2" }),
    expected: true
  },
  {
    name: 'Fuente Key - Diferenciación por artículo (Código)',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Código Civil", articulo: "1545" }) !== buildFuenteNormaKey({ tipo_norma: "Código Civil", articulo: "1546" }),
    expected: true
  },
  {
    name: 'Fuente Key - Diferenciación por artículo (Constitución)',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Constitución Política de la República", articulo: "19" }) !== buildFuenteNormaKey({ tipo_norma: "Constitución Política de la República", articulo: "20" }),
    expected: true
  },
  {
    name: 'Fuente Key - Diferenciación por artículo (Decreto)',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Decreto", numero: "250", year: "2004", articulo: "10" }) !== buildFuenteNormaKey({ tipo_norma: "Decreto", numero: "250", year: "2004", articulo: "11" }),
    expected: true
  },
  {
    name: 'Fuente Key - Valor de relleno en número',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Ley", numero: "valor de relleno" }),
    expected: null
  },
  {
    name: 'Fuente Key - Valor de relleno en tipo',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Desconocido", numero: "123" }),
    expected: null
  },
  {
    name: 'Display Label - Conserva artículo',
    fn: () => buildFuenteDisplayLabel({ tipo_norma: "Ley", numero: "18.834", articulo: "4" }).includes("4"),
    expected: true
  },
  {
    name: 'Display Label - Conserva artículo en nombre canónico',
    fn: () => buildFuenteDisplayLabel({ tipo_norma: "Ley", numero: "18.834", articulo: "4" }).includes("Estatuto Administrativo"),
    expected: true
  },
  {
    name: 'Código Civil con número nulo genera norma_key',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Código Civil", numero: null, articulo: "2174" }) !== null,
    expected: true
  },
  {
    name: 'Código del Trabajo con número nulo genera norma_key',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Código del Trabajo", numero: "", articulo: "10" }) !== null,
    expected: true
  },
  {
    name: 'Placeholder valor de relleno debe ser descartado',
    fn: () => buildFuenteNormaKey({ tipo_norma: "valor de relleno", numero: "123" }),
    expected: null
  },
  {
    name: 'Término n/a debe ser descartado',
    fn: () => buildFuenteNormaKey({ tipo_norma: "Ley", numero: "n/a" }),
    expected: null
  },
  {
    name: 'Alias ctb colisiona con Código del Trabajo (Norma Key)',
    fn: () => {
      const keyCtb = buildFuenteNormaKey({ tipo_norma: "ctb", articulo: "68" });
      const keyCod = buildFuenteNormaKey({ tipo_norma: "Código del Trabajo", articulo: "68" });
      return keyCtb === keyCod && keyCtb !== null;
    },
    expected: true
  },
  {
    name: 'Alias ctb genera display label canónico',
    fn: () => buildFuenteDisplayLabel({ tipo_norma: "ctb", articulo: "68" }).includes("Código del Trabajo"),
    expected: true
  }
];

console.log('--- VERIFICACIÓN DE CATÁLOGOS DERIVADOS (REV 1) ---');
let success = 0;
for (const c of cases) {
  try {
    const result = c.fn();
    if (result === c.expected) {
      console.log(`[OK] ${c.name}`);
      success++;
    } else {
      console.error(`[FAIL] ${c.name}: esperado ${c.expected}, obtenido ${result}`);
    }
  } catch (e) {
    console.error(`[ERROR] ${c.name}: ${e.message}`);
  }
}

console.log(`--- RESULTADO: ${success}/${cases.length} ---`);
if (success !== cases.length) process.exit(1);
