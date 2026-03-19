# 03 - Guía de Desarrollo Avanzada y Lecciones de Incidentes

Complementario al Onboarding Básico, esta guía cubre los patrones severos que un ingeniero debe seguir para mantener el backend de `cgr-platform` inmune a timeouts y memory leaks operando bajo Cloudflare Workers.

---

## 🧠 1. Patrones Obligatorios en Workflows

El orquestador de Workflows en Cloudflare guarda el estado en disco tras cada `step.do()`. Esto impone estrictas restricciones de serialización (V8 rpc).

### Patrón CRÍTICO: No captures `this` dentro de los pasos
**Motivo**: El objeto `this` de la clase `WorkflowEntrypoint` contiene conexiones TCP (Bindings de bases de datos, APIs o colas) que **no se pueden guardar en disco**. Si omites esta regla arrojará un error silencioso de tipo `outcome: exception`.

```typescript
// ❌ INCORRECTO: Capturando "this"
async run(event: WorkflowEvent<any>, step: WorkflowStep) {
  await step.do("algo", async () => {
    // Al acceder a this.env se romperá el paso al intentar serializar.
    await this.env.DB.prepare("SELECT 1").first();
  });
}

// ✅ CORRECTO: Aislamiento del Environment
async run(event: WorkflowEvent<any>, step: WorkflowStep) {
  const env = this.env; // Clausura previa

  await step.do("algo", async () => {
    // Es perfectamente seguro.
    await env.DB.prepare("SELECT 1").first();
  });
}
```

### Patrón 2: Respuestas Ligeras en Pasos
Todo lo que `step.do()` devuelva con `return` quedará escrito en la memoria de estado del workflow en Cloudflare. Nunca retornes un dictamen completo (100KB+ JSON) al estado del Workflow; guárdalo en KV/D1 y retorna solo el Booleano de éxito o su `ID`.

---

## ☠️ 2. Archivo de Incidentes y Post-Mortems

Para no repetir los errores del pasado, la plataforma registra incidentes operacionales históricos que definieron refactorizaciones actuales:

### Incidente B: Desalineación de Esquemas (D1)
- **Síntoma**: Errores 500 informando `table cat_abogados has no column named nombre`.
- **Causa**: El desarrollador asumió el nombre de columna en memoria. La tabla productiva usaba `.iniciales`.
- **Lección**: Nunca asumas el esquema productivo al desarrollar. Valídalo siempre consultando los PRAGMA con la flag remota:
  ```bash
  npx wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_abogados);"
  ```

### Incidente C: Ruido Masivo en Catálogos por Splitters Inocentes
- **Síntoma**: El catálogo de abogados se sobrepobló de entidades que decían `EMV APT` y los descriptores se llenaron de preposiciones (`de`, `con`, `el`).
- **Causa**: El parser usaba un `.split(',')` rudimentario.
- **Saneamiento Realizado**: Se reescribió la heurística de limpieza (ver Gobernanza y Estratigrafía) con una expresión regular multicaso (`/[\s,;\n]+/`) y un Regex validador purista (`/^[A-Z]{2,5}$/`). Se mandó a re-ingerir a más de 37 sentencias masivas para corregir el daño.
- **Lección**: Cualquier lógica de extracción de Metadata que afecte tablas distintas a la central (`dictamenes`) debe escribirse asumiendo el ingreso de "cadenas hostiles".
