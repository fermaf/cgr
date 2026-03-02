---
description: Auditoría del proceso de enriquecimiento de dictámenes con Mistral 2512 y revisión de persistencia
---
# Flujo de Trabajo: Auditoría Enriquecimiento de Dictámenes

Este flujo de trabajo audita paso a paso el proceso de enriquecimiento, verificando las inserciones en la base de datos D1 y Pinecone, validando el uso del modelo \`mistral-large-2512\` y la aplicación del prompt consolidado de profundidad semántica. Se utilizarán los 3 primeros dictámenes de la base de datos a modo de muestra.

// turbo-all

## Paso 1: Obtener la muestra de 3 dictámenes
Obtenemos los 3 primeros dictámenes disponibles de la tabla \`dictamenes\`.
\`\`\`bash
cd cgr-platform && npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT id FROM dictamenes LIMIT 3"
\`\`\`

## Paso 2: Ejecutar el Enriquecimiento (Re-process)
Se asume que los 3 dictámenes extraídos en el paso 1 (por ejemplo: 000000N12, 000001N01, 000001N17) serán reprocesados llamando a la API del Worker en producción. *(Reemplace los IDs según el resultado del Paso 1)*.
\`\`\`bash
# Reemplazar con los IDs obtenidos
for id in "000000N12" "000001N01" "000001N17"; do
  curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/$id/re-process"
  sleep 2
done
\`\`\`

## Paso 3: Auditar la tabla primaria de Enriquecimiento (D1)
Verificamos que los registros en la tabla \`enriquecimiento\` contengan los \`booleanos_json\`, \`fuentes_legales_json\`, y el modelo \`mistral-large-2512\` correctos.
\`\`\`bash
cd cgr-platform && npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT dictamen_id, LENGTH(booleanos_json) as len_bools, LENGTH(fuentes_legales_json) as len_fuentes, modelo_llm, fecha_enriquecimiento FROM enriquecimiento WHERE dictamen_id IN ('000000N12', '000001N01', '000001N17')"
\`\`\`

## Paso 4: Auditar las tablas relacionales M:N (D1)
Se comprueba que las tablas de asociación contienen datos para los booleanos y las fuentes legales extraídas.
\`\`\`bash
cd cgr-platform && npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT * FROM atributos_juridicos WHERE dictamen_id IN ('000000N12', '000001N01', '000001N17') LIMIT 10"
cd cgr-platform && npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT * FROM dictamen_fuentes_legales WHERE dictamen_id IN ('000000N12', '000001N01', '000001N17') LIMIT 10"
\`\`\`

## Paso 5: Auditar índices y estado de sincronización (D1)
Comprobamos que las tablas de status indiquen que el registro ha sido vectorizado y enviado a la cola KV "Paso".
\`\`\`bash
cd cgr-platform && npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT dictamen_id, metadata_version FROM pinecone_sync_status WHERE dictamen_id IN ('000000N12', '000001N01', '000001N17')"
\`\`\`

## Paso 6: Auditar Pinecone y KV 
Revisaremos la metadata enriquecida con la que cuenta la estructura del índice de Pinecone (por medio del dashboard de Pinecone o la API) y que el JSON ensamblado en `DICTAMENES_PASO` esté correcto.
\`\`\`bash
cd cgr-platform && npx wrangler kv:key get --binding DICTAMENES_PASO "000000N12"
\`\`\`
