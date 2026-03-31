UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Ley'
WHERE LOWER(TRIM(tipo_norma)) = 'ley';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'DFL'
WHERE LOWER(TRIM(tipo_norma)) = 'dfl';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'DL'
WHERE LOWER(TRIM(tipo_norma)) = 'dl';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Decreto'
WHERE LOWER(TRIM(tipo_norma)) IN ('dto', 'decreto');

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Decreto Supremo'
WHERE LOWER(TRIM(tipo_norma)) IN ('ds', 'decreto supremo');

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Resolución'
WHERE LOWER(TRIM(tipo_norma)) IN ('res', 'resolución', 'resolucion');

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Resolución Exenta'
WHERE LOWER(TRIM(tipo_norma)) IN ('resolución exenta', 'resolucion exenta');

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Oficio Circular'
WHERE LOWER(TRIM(tipo_norma)) = 'oficio circular';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Código del Trabajo'
WHERE LOWER(TRIM(tipo_norma)) = 'ctr';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Código Civil'
WHERE LOWER(TRIM(tipo_norma)) = 'cci';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Código de Aguas'
WHERE LOWER(TRIM(tipo_norma)) = 'cag';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Código Sanitario'
WHERE LOWER(TRIM(tipo_norma)) = 'csa';

UPDATE dictamen_fuentes_legales
SET tipo_norma = 'Constitución Política de la República'
WHERE LOWER(TRIM(tipo_norma)) IN ('pol', 'constitución', 'constitucion', 'constitución política', 'constitucion politica', 'cpr');

UPDATE dictamen_fuentes_legales
SET numero = REPLACE(TRIM(numero), '.', '')
WHERE tipo_norma IN ('Ley', 'DL', 'DFL', 'Decreto', 'Decreto Supremo', 'Resolución', 'Resolución Exenta', 'Oficio Circular')
  AND numero IS NOT NULL
  AND TRIM(numero) GLOB '[0-9.]*';

UPDATE dictamen_fuentes_legales
SET year = CAST(CAST(year AS INTEGER) AS TEXT)
WHERE year IS NOT NULL
  AND TRIM(year) GLOB '[0-9]*.0';
