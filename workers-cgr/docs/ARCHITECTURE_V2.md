# Arquitectura de Búsqueda Inteligente CGR (V2)

Este documento describe la integración entre el Frontend (React), el Backend (Cloudflare Workers) y la base de datos vectorial (Pinecone) utilizando el paradigma de **Inferencia Integrada** y **Query Expansion**.

## 1. Paradigma de Búsqueda: "Senior Search"

A diferencia de una búsqueda semántica simple, este sistema implementa una lógica de detección de intención para maximizar la relevancia.

### Flujo de Consulta
1.  **Detección de Intención**: El Worker analiza si la consulta parece un ID de dictamen (ej: `E123456N25`).
2.  **Búsqueda Híbrida**:
    *   **Si es ID**: Aplica un filtro de metadata en Pinecone (`$eq`) para garantizar precisión del 100%.
    *   **Si es Concepto**: Activa el motor de **Query Expansion**.
3.  **Query Expansion (Mistral)**: Traduce el lenguaje ciudadano a terminología técnica de la CGR (ej: "muni" -> "municipalidad").
4.  **Inferencia Integrada (Pinecone)**: Se envía el texto directamente a Pinecone. La vectorización ocurre en el backend de Pinecone, reduciendo la latencia del Worker.

## 2. Componentes Técnicos

### Backend (Cloudflare Worker)
- **Endpoint `/search`**: Orquestador de la lógica de búsqueda.
- **`mistralClient.ts`**: Maneja la expansión de consultas y el análisis de dictámenes.
- **`pineconeClient.ts`**: Cliente optimizado para el paradigma de texto directo (Inference-First).

### Frontend (React + Vite)
- **UI Premium**: Interfaz oscura con micro-animaciones (`framer-motion`).
- **Feedback de IA**: Muestra al usuario cómo se expandió su consulta para generar confianza.
- **Servicio API**: Consumo del endpoint `/search` con manejo de metadatos de búsqueda.

## 3. Configuración de Pinecone
Para que este sistema funcione, el índice de Pinecone debe estar configurado con:
- **Inference**: Habilitado para el modelo deseado (ej: `multilingual-e5-large`).
- **Metadata**: Los campos `id`, `n_dictamen`, `text`, `titulo` y `materia` deben estar indexados para permitir el filtrado.

## 4. Próximos Pasos de Desarrollo
1.  **Despliegue**: Configurar Cloudflare Pages para el frontend.
2.  **Ingesta**: Ejecutar el pipeline de crawling para poblar el índice vectorial.
3.  **Refinamiento**: Ajustar el prompt de expansión según el feedback de los abogados.
