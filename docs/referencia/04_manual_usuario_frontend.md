# 04 - Manual de Usuario (Interfaz Frontend)

Esta guía explica a los operadores y analistas el comportamiento de la interfaz gráfica y qué ocurre tras bambalinas cuando se realiza una consulta.

---

## 🔍 1. Comportamiento del Buscador Central

El _Omnibox_ de la página de inicio admite lenguaje 100% natural. No es necesario utilizar jerga técnica ni comillas exactas.

Ejemplos de interacción:
- *"Conflictos por licencias maternales en municipios rurales"*
- *"Prohibición legal para horas extras de alcaldes directos"*
- `E129499N25` (Saltar directamente al ID).

### ¿Por qué obtengo los resultados que obtengo?
El sistema cruza tu texto por el modelo `llama-text-embed-v2` de Pinecone (1024 dimensiones) para calcular distancias matemáticas con todos los dictámenes. Si buscas "retraso", el sistema entenderá "demora", "dilación" y "plazo fuera de límite" porque su comprensión es **semántica**.

---

## 📛 2. Significado de los Badges (Indicadores Visuales)

El resultado de cada dictamen porta diferentes etiquetas visuales:

### Badge Violeta: "Búsqueda Semántica"
- Es el resultado ideal y aparecerá el 99% del tiempo.
- Garantiza que el dictamen listado fue traído debido a su relevancia conceptual (Pinecone) respecto a tu prompt.

### Badge Gris: "Búsqueda Literal"
- Ocurre cuando el Worker sufre un fallo de red consultando al servicio de IA, activando la heurística de resiliencia (Fallback).
- El sistema ejecutó en su defecto un `SELECT ... LIKE '%texto%'` en D1. Los resultados son válidos, pero puramente literales.

### Badge Azul: "Análisis IA"
- Confirma que el dictamen expone Metadata V2.
- Indica que el "Resumen Ejecutivo", el "Análisis Jurídico Explicado", las etiquetas temáticas y las citas legales fueron auto-generadas extrayendo sentido del texto original mediante Mistral_2512.

---

## ❓ 3. Preguntas Frecuentes

**¿Por qué un dictamen no tiene análisis IA?**
Puede haber sido escroleado esta misma madrugada y se encuentra en estado `ingested` en la base D1, a la espera que el `BackfillWorkflow` lo engulla. El texto nativo completo seguirá disponible en el panel izquierdo.

**¿Puedo confiar "a ciegas" en el resumen IA?**
La IA es **asistencial**. El Modelo está entrenado con _prompts_ restrictivos que prohíben la alucinación (exigiendo citas textuales o interpretaciones fieles), pero la responsabilidad final reside en el operador de cruzar el fallo leyendo el bloque del "Documento Original".
