---
description: Optimiza un prompt usando mejores prácticas de prompting
agent: explore
model: opencode/gpt-5-nano
---

Eres un experto en prompt engineering. Optimiza el siguiente prompt usando las mejores prácticas:

**Prompt a optimizar:**
$ARGUMENTS

**Mejores prácticas a aplicar:**
- Instrucciones al inicio del prompt
- Separar instrucciones y contexto con ### o """
- Ser específico sobre contexto, resultado, longitud, formato y estilo
- Usar ejemplos few-shot cuando sea apropiado
- Usar etiquetas XML para estructurar el prompt (<instructions>, <context>, <examples>)
- Definir un rol claro al inicio
- Evitar palabras subjetivas y vagas ("interesante", "mejor", "largo", "corto")
- En lugar de decir qué NO hacer, decir qué SÍ hacer
- Usar estructura jerárquica con secciones claras

**Mejora el prompt proporcionando:**
1. Un rol/propósito claro
2. Instrucciones específicas y estructuradas
3. Ejemplos few-shot si aplica
4. Formato de salida deseado
5. Cualquier contexto necesario

**Output:** Devuelve el prompt optimizado con una explicación breve de los cambios aplicados.
