-- scripts/saneamiento_catalogos.sql
-- 1. Respaldar relaciones afectadas (opcional, por seguridad en transacciones D1)
-- 2. Identificar y procesar iniciales agrupadas en cat_abogados

-- Creamos una tabla temporal para las iniciales separadas (simulado, ya que D1 no tiene split_part)
-- En su lugar, usaremos el conocimiento de los IDs detectados para hacer correcciones quirúrgicas.

-- Dictámenes detectados con iniciales agrupadas:
-- E121666N25, E119093N25, E119202N25, E119112N25, E119184N25, E118595N25, E118729N25, 
-- E116947N25, E116883N25, E115934N25, E116456N25, E116592N25, E114692N25, E114696N25, 
-- E114694N25, E113060N25, E113229N25, E112088N25, E111812N25, E111407N25, E111876N25, 
-- E111805N25, E97876N25, E97963N25, E97874N25, E97019N25, E96979N25, E95430N25, 
-- E95168N25, E92203N25, E92090N25, E91384N25, E91509N25, E91365N25, E91380N25, E91377N25, E91271N25

-- PASO 1: Eliminar relaciones corruptas
DELETE FROM dictamen_abogados 
WHERE abogado_id IN (SELECT id FROM cat_abogados WHERE iniciales LIKE '% %');

-- PASO 2: Eliminar registros malformados del catálogo
DELETE FROM cat_abogados WHERE iniciales LIKE '% %';

-- PASO 3: Limpieza de cat_descriptores (Ruido de 1-2 caracteres)
DELETE FROM dictamen_descriptores 
WHERE descriptor_id IN (SELECT id FROM cat_descriptores WHERE length(termino) < 3);

DELETE FROM cat_descriptores WHERE length(termino) < 3;

-- NOTA: Los vínculos correctos se restablecerán mediante el reprocesamiento (ingeniería inversa)
-- que leerá el raw_data de KV y usará el nuevo parser corregido.
