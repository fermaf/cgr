# Prioridad Jurídica y Vigencia Doctrinal

## Problema corregido

Indubia ya mostraba líneas doctrinales y relaciones entre dictámenes, pero todavía arrastraba tres debilidades visibles:

1. Las normas citadas podían aparecer con un nivel de detalle que sugería más precisión de la realmente disponible.
2. La posición doctrinal del dictamen se mostraba como un panel de buckets, sin dejar suficientemente claro qué relaciones reales la sostenían.
3. La lectura sugerida seguía pesando demasiado la centralidad del cluster y demasiado poco la vigencia jurídica visible del criterio.

## Decisión tomada

Se introdujo una capa conservadora de prioridad jurídica basada en vigencia doctrinal visible.

La lectura sugerida ahora favorece dictámenes que:

- siguen siendo retomados por decisiones posteriores;
- aparecen en la parte reciente de la línea;
- no muestran señales fuertes de haber sido desplazados por ajustes o reconsideraciones posteriores;
- siguen concentrando el núcleo del criterio.

Esto no reemplaza la relevancia semántica ni la organización doctrinal. La complementa.

## Citas normativas endurecidas

La interfaz ahora privilegia precisión sobre detalle aparente.

Cambios aplicados:

- se consolidan referencias repetidas a una misma norma;
- se muestran artículos cuando el dato parece razonablemente estable;
- se evita mostrar subdivisiones dudosas como `inciso primero` cuando no hay suficiente base para sostenerlas;
- cuando la norma no se identifica sola, se prioriza año y órgano emisor antes que pseudo-precisión.

En términos de UX jurídica:

- mejor `Ley 18.834 · art. 10`
- peor `Ley 18.834 · inciso primero · art. 10` si ese inciso no está realmente fundado

## Posición doctrinal reanclada

La sección `Posición doctrinal` ya no depende solo de labels como `consolida`, `desarrolla` o `ajusta`.

Ahora se explica desde relaciones reales entre dictámenes:

- si el dictamen toma criterio previo;
- si lo desarrolla;
- si lo ajusta;
- o si luego fue retomado por decisiones posteriores.

Los contadores siguen existiendo, pero pasan a segundo plano. Lo principal es la lectura jurídica.

## Qué cambia para el usuario

En la web el usuario debería notar:

- normativa citada más sobria y confiable;
- menos repeticiones defectuosas del mismo detalle normativo;
- mejor explicación de por qué un dictamen ocupa cierta posición en la red doctrinal;
- orden de lectura menos arbitrario y más sensible a vigencia visible.

## Qué no hace todavía

Esta iteración no resuelve toda la teoría de vigencia jurídica.

No determina automáticamente:

- derogación normativa plena;
- pérdida de vigencia por cambio legal externo;
- obsolescencia material completa del criterio.

La heurística trabaja solo con señales visibles del corpus:

- fecha del dictamen;
- relaciones jurídicas posteriores;
- continuidad o ajuste del criterio dentro de la línea.

## Próximo paso natural

Usar la misma lógica de prioridad jurídica para reforzar líneas con relaciones huérfanas de alto valor visible, especialmente donde un dictamen posterior parece matizar o desplazar el criterio, pero la relación todavía no está materializada con suficiente claridad.
