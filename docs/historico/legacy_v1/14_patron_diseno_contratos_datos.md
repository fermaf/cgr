# 14 - Patrón de Arquitectura: Diseño por Contratos y Homologación en Origen

> **Nota**: Este documento forma parte de los estándares arquitectónicos del proyecto y debe ser respetado por cualquier desarrollo o agente de IA ("El Librero").

## 1. Visión General: El Problema de la "Entropía del Cliente"

En arquitecturas distribuidas que se integran con servicios externos, es un antipatrón común que el código cliente o adaptador final (ej. `src/clients/pinecone.ts`) intente "adivinar", parsear o arreglar ("cliente complaciente") los datos mal formados, anidados o serializados que recibe de los módulos internos o bases de datos.

Esto incrementa la **entropía del sistema** porque:
- La lógica de negocio y transformación se dispersa y duplica en los clientes.
- Si el cliente asume un formato específico (ej. un JSON string) y otro controlador envía un arreglo (Array), los flujos fallan en tiempo de ejecución.
- Fomenta la deuda técnica al permitir que los invocadores (controladores, workflows) alimenten al cliente con esquemas impredecibles.

## 2. Paradigma: Contract-First y Homologación en Origen

Para mitigar esto, CGR-Platform adopta el **Diseño por Contratos** (Contract-First) para todas las integraciones de bajo nivel (ej. interacción HTTP final con Pinecone).

### Reglas de Oro
1. **El Cliente Establece el Contrato**: Los módulos en `src/clients/` definen e imponen interfaces estrictas (`Interfaces` o `Types` en TypeScript) que mapean 1:1 con la realidad del proveedor externo.
2. **El Cliente Concentra la Lógica de Comunicación Enriquecida**: Aunque el cliente recibe datos homologados (tipos nativos), es responsable de realizar operaciones internas necesarias para la optimización del servicio externo (ej. concatenar `Titulo + Resumen + Analisis`). Esto centraliza el control de futuros cambios en el formato del payload dirigido al proveedor.
3. **El Invocador Homologa en Origen**: Son los Controladores (`index.ts`) o Workflows (`backfillWorkflow.ts`) los únicos responsables de extraer la data de D1 o Mistral, decodificar JSONs y entregar los campos base (Título, Resumen, etc.) como tipos TS puros.

---

## 3. Estudio de Caso Analizado: Pinecone Metadata

El esquema de metadatos de Pinecone en este proyecto exige una comunicación enriquecida donde el campo `analisis` debe contener la suma semántica de varios atributos.

### El Contrato Estricto vs Lógica Interna

#### 3.1 El Contrato (Definido en el cliente)
```typescript
// src/clients/pinecone.ts
export type PineconeMetadataInput = {
  titulo: string;
  resumen: string;
  analisis: string; // El análisis original (sin concatenar todavía)
  descriptores_AI: string[]; // Ya homologado como array de strings
  // ... resto de campos
};
```

#### 3.2 La Concatenación Centralizada (En el cliente)
El cliente asume la responsabilidad de construir el campo final para Pinecone. Esto evita que cada controlador tenga su propia versión de "cómo concatenar".

```typescript
// En src/clients/pinecone.ts -> normalizePineconeMetadata
const fullText = `
    Título: ${input.titulo}
    Resumen: ${input.resumen}
    Análisis: ${input.analisis}
`.trim();

const normalizedMetadata = {
    ...input,
    analisis: fullText // Aquí se centraliza la "comunicación enriquecida"
};
```

#### 3.3 La Homologación (En el Invocador)
El invocador que conoce de dónde vienen los datos (ej. un registro de la tabla `enriquecimiento` de D1) es quien asume el trabajo de entregar los tipos correctos.

```typescript
// En src/index.ts (Ej: endpoint de sync-vector)
const enrichment = await getLatestEnrichment(db, id);

// El Invocador solo homologa tipos (parseo JSON de la BD)
const arregloEtiquetas = enrichment.etiquetas_json ? JSON.parse(enrichment.etiquetas_json) : [];

// El Invocador entrega los campos BASE, no la concatenación
await upsertRecord(env, {
  id: id,
  metadata: {
     ...enrichment,
     descriptores_AI: arregloEtiquetas,
     materia: sourceData.materia || "",
     // El invocador NO hace: `analisis: Título + Resumen + Analisis`
  }
});
```

---

## 4. Patrón de "Propiedades Efectivas" en Prompts LLM

Un extensión crítica del diseño por contratos en CGR-Platform es el envío selectivo de datos a los Modelos de Lenguaje (LLMs).

### El Problema: El RAW como Ruido
Enviar un objeto `JSON.stringify(raw)` completo a un LLM es un antipatrón que genera:
1. **Gasto Innecesario de Tokens**: Se pagan tokens por trackers, HTMLs redundantes y campos vacíos.
2. **Confusión del Modelo**: El ruido informativo disminuye la precisión de las tareas de extracción y clasificación.

### La Solución: Selección Explícita
El módulo `src/clients/mistral.ts` implementa este patrón en `buildPromptConsolidado`. En lugar de desestructurar el objeto (`...source`), se construye un nuevo objeto literal que contiene únicamente las **propiedades efectivas** identificadas en el análisis histórico del proyecto (14 campos clave).

**Implementación Estándar:**
```typescript
const inputData = JSON.stringify({
  documento_completo: source.documento_completo,
  fuentes_legales: source.fuentes_legales,
  // Solo los 12 booleanos de clasificación necesarios
  nuevo: source.nuevo,
  aclarado: source.aclarado,
  // ...
}, null, 2);
```

Este patrón garantiza la **eficiencia económica** y la **robustez semántica** del sistema de enriquecimiento.

---

## 5. Conclusión y Verificación (Test Plans)

Al diseñar por contratos, garantizamos que sin importar la vía de entrada de los datos (Crawler -> LLM directo, o Reproceso desde la Base de Datos D1), el objeto final entregado a Pinecone sea **idéntico**.

Para futuras modificaciones en este flujo, se exige que las pruebas unitarias y de integración incluyan la lectura del registro en todas las tablas de D1 asociadas, la ejecución del script/endpoint, y una nueva lectura de validación asegurando que los registros permean idénticos y sin mutaciones no deseadas en la base de datos local.
