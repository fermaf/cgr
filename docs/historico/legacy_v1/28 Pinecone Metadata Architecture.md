# 28 Pinecone Metadata Architecture - CGR Standard

Este documento define el esquema estricto de metadatos para los vectores de Pinecone en la plataforma CGR. Este estándar busca la paridad total con el sistema histórico de n8n y el cumplimiento de las políticas de integridad de datos.

## 1. Políticas de Integridad
- **Invariabilidad**: Cada registro DEBE contener exactamente las mismas claves de metadata.
- **Prohibición de Nulos**: Pinecone no admite valores `null`. Se deben usar valores por defecto del tipo correspondiente.
- **Normalización de Strings**: Los valores vacíos se representarán como un string vacío `""` para asegurar que la clave siempre exista y mantenga un esquema de tamaño constante.
- **Depuración**: El campo erróneo `eactivado` queda terminantemente fuera del esquema.

## 2. Definición del Esquema (21 Claves)

| Clave | Tipo | Valor Default | Lógica de Cálculo / Origen |
| :--- | :--- | :--- | :--- |
| **`Resumen`** | string | `""` | `enrichment.resumen` (Capitalizado) |
| **`titulo`** | string | `""` | `enrichment.titulo` |
| **`materia`** | string | `""` | `source.materia` |
| **`fecha`** | string | `""` | `ISO string` sin zona horaria de `source.fecha_documento` |
| **`u_time`** | number | `(calc)` | `Unix Timestamp` derivado de `fecha`. No admite 0; debe fallar o emitir alerta si la fecha es inválida. |
| **`model`** | string | `env.MISTRAL_MODEL` | Nombre del modelo LLM utilizado. |
| **`descriptores_AI`** | array | `[]` | Lista de etiquetas generadas por la IA. |
| **`descriptores_originales`** | array | `[]` | Lista de descriptores de la fuente CGR. |
| **`created_at`** | string | `now()` | Fecha actual en formato `YYYY-MM-DD HH:mm:ss`. |
| **`analisis`** | string | `""` | Narrativa jurisprudencial completa. |
| **`aclarado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`alterado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`aplicado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`boletin`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`complementado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`confirmado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`relevante`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`reconsiderado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`reconsideradoParcialmente`** | boolean | `false` | Booleano jurídico (CamelCase) |
| **`reactivado`** | boolean | `false` | Booleano jurídico (D1/Mistral) |
| **`recursoProteccion`** | boolean | `false` | Booleano jurídico (CamelCase) |
| **`nuevo`** | boolean | `false` | Booleano jurídico (D1/Mistral) |

## 3. Control de Versiones de Metadata
Se implementa un seguimiento en la tabla `pinecone_sync_status` de D1:
- `v1`: Esquema básico (Imagen 2).
- `v2`: Esquema completo de 21 claves (n8n Gold Standard).

## 4. Auditoría y Barrido
Cualquier dictamen con `metadata_version < 2` será marcado para re-vectorización automática mediante el `SweepWorkflow`, el cual reconstruirá el objeto de metadata usando la data local enriquecida (D1 y KV).
