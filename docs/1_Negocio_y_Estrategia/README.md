# 1. Negocio y Estrategia

## 1.1 Visión del Producto (CGR.ai)

La plataforma CGR.ai nace de la necesidad de modernizar, agilizar y democratizar el acceso al inmenso acervo de jurisprudencia administrativa en formato digital que produce la **Contraloría General de la República**.

Durante décadas, la recuperación de información se basaba en búsquedas textuales rudimentarias ("cadenas exactas"), lo que conllevaba enormes ineficiencias y ceguera sistémica.

**El Desiderátum:** "Entender de qué se habla" en lugar de "encontrar palabras sueltas". Una inteligencia transversal capaz de asimilar conceptos de probidad, recursos humanos, contratos y urbanismo, ofreciendo resúmenes didácticos en instantes.

## 1.2 Valor del Proyecto
- **Desbloqueo Conceptual (Búsqueda Vectorial/Semántica):** Usando Pinecone y Modelos de Lenguaje Avanzados (Mistral), el consultor puede preguntar de forma natural. 
- **Estandarización de Documentos No-Estructurados:** En la fase de migración masiva, transformamos gigabytes de archivos arcaicos y heterogéneos en una base de datos relacional Cloudflare D1 impecable de 13 tablas interconectadas.
- **Reducción de Tiempo de Análisis:** El enriquecimiento IA procesa el análisis jurídico y etiquetas (`boletin`, `relevante`, `nuevo`) sin intervención humana en milisegundos.

## 1.3 Usuarios Target
- Abogados Auditores y Administrativos.
- Consultores CGR y Funcionarios de Ministerios/Municipalidades.
- Ciudadanía y Academia.

Este proyecto tiene su base operativa fundamentada en la resiliencia en infraestructura Serverless usando la nube de Cloudflare (Workers). Múltiples nodos, orquestación de workflows pesados y despliegue a prueba de fallos.
