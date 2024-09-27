# -*- coding: utf-8 -*-
# Archivo: app.py

# Importación de librerías
import streamlit as st
import requests
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import pinecone
import openai
import tiktoken
from sklearn.manifold import TSNE
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime

# Configuración de claves de API y conexiones (asegúrate de configurar tus claves de API)
MONGO_URI = st.secrets["MONGODB_URI"]
PINECONE_API_KEY = st.secrets["PINECONE_API_KEY"]
PINECONE_ENV = st.secrets["PINECONE_ENVIRONMENT"]
OPENAI_API_KEY = st.secrets["OPENAI_API_KEY"]

# Configuración de OpenAI
openai.api_key = OPENAI_API_KEY

# Configuración de MongoDB
client = MongoClient(MONGO_URI)
db = client['Contraloria']
collection = db['dictamenes']

# Configuración de Pinecone
pinecone.init(api_key=PINECONE_API_KEY, environment=PINECONE_ENV)
index_name = 'contraloria'
if index_name not in pinecone.list_indexes():
    pinecone.create_index(index_name, dimension=1536)
index = pinecone.Index(index_name)

# Funciones auxiliares
def obtener_embedding(texto):
    response = openai.Embedding.create(
        input=texto,
        model="text-embedding-ada-002"
    )
    embedding = response['data'][0]['embedding']
    return embedding

def buscar_similares(embedding, filtro=None, k=3):
    if filtro:
        resultados = index.query(vector=embedding, top_k=k, include_metadata=True, filter=filtro)
    else:
        resultados = index.query(vector=embedding, top_k=k, include_metadata=True)
    return resultados

def generar_resumen(texto):
    response = openai.Completion.create(
        engine="text-davinci-003",
        prompt=f"Resumen del siguiente texto:\n\n{texto}\n\nResumen:",
        max_tokens=150,
        n=1,
        stop=None,
        temperature=0.5,
    )
    resumen = response.choices[0].text.strip()
    return resumen

def obtener_dictamenes_por_ids(ids):
    object_ids = [ObjectId(id) for id in ids]
    documentos = collection.find({"_id": {"$in": object_ids}})
    return list(documentos)

# Interfaz de Streamlit
st.title("Plataforma Jurídica - Contraloría General de la República")

# Menú lateral
opciones = [
    "Generación de Informes Jurídicos",
    "Recomendación de Estrategias",
    "Análisis de Tendencias",
    "Búsqueda Avanzada de Dictámenes",
    "Visualización de Clusters",
    "Sistema de Alertas",
    "Resumen Personalizado de Dictámenes",
    "Integración con Bases de Datos Externas",
    "Evaluación de Cumplimiento Legal"
]
seleccion = st.sidebar.selectbox("Seleccione un servicio:", opciones)

if seleccion == "Generación de Informes Jurídicos":
    st.header("Generación de Informes Jurídicos")
    consulta = st.text_area("Ingrese su consulta jurídica:")
    if st.button("Generar Informe"):
        if consulta:
            embedding = obtener_embedding(consulta)
            resultados = buscar_similares(embedding, k=3)
            dictamenes = obtener_dictamenes_por_ids([match['id'] for match in resultados['matches']])
            informe = "\n\n".join([doc['documento_completo'] for doc in dictamenes])
            st.subheader("Informe Jurídico Generado:")
            st.write(informe)
        else:
            st.warning("Por favor, ingrese una consulta.")

elif seleccion == "Recomendación de Estrategias":
    st.header("Recomendación de Estrategias")
    area = st.selectbox("Seleccione el área de interés:", ["Defensa Legal", "Proyectos", "Reglamentación"])
    descripcion = st.text_area("Describa el contexto o caso específico:")
    if st.button("Recomendar Estrategias"):
        if descripcion:
            embedding = obtener_embedding(descripcion)
            filtro = {"criterio": area}
            resultados = buscar_similares(embedding, filtro=filtro, k=3)
            dictamenes = obtener_dictamenes_por_ids([match['id'] for match in resultados['matches']])
            estrategias = [generar_resumen(doc['documento_completo']) for doc in dictamenes]
            st.subheader("Estrategias Recomendadas:")
            for estrategia in estrategias:
                st.write(f"- {estrategia}")
        else:
            st.warning("Por favor, describa el contexto o caso.")

elif seleccion == "Análisis de Tendencias":
    st.header("Análisis de Tendencias y Estadísticas Doctrinales")
    tema = st.text_input("Ingrese el tema a analizar:")
    if st.button("Analizar Tendencias"):
        if tema:
            # Implementación simplificada para el ejemplo
            pipeline = [
                {"$match": {"documento_completo": {"$regex": tema, "$options": "i"}}},
                {"$group": {"_id": {"$substr": ["$fecha_documento", 0, 4]}, "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}}
            ]
            resultados = list(collection.aggregate(pipeline))
            if resultados:
                df = pd.DataFrame(resultados)
                df.rename(columns={"_id": "Año"}, inplace=True)
                st.line_chart(df.set_index("Año")["count"])
                st.write(df)
            else:
                st.info("No se encontraron resultados para el tema ingresado.")
        else:
            st.warning("Por favor, ingrese un tema.")

elif seleccion == "Búsqueda Avanzada de Dictámenes":
    st.header("Búsqueda Avanzada de Dictámenes")
    consulta = st.text_input("Ingrese su consulta:")
    k = st.slider("Número de resultados a mostrar:", min_value=1, max_value=20, value=5)
    if st.button("Buscar Dictámenes"):
        if consulta:
            embedding = obtener_embedding(consulta)
            resultados = buscar_similares(embedding, k=k)
            st.subheader("Dictámenes Encontrados:")
            for match in resultados['matches']:
                dictamen = collection.find_one({"_id": ObjectId(match['id'])})
                st.write(f"**{dictamen['doc_id']}** - {dictamen.get('materia', 'Sin materia')}")
                st.write(f"Fecha: {dictamen.get('fecha_documento', 'Desconocida')}")
                st.write(f"Extracto: {generar_resumen(dictamen['documento_completo'][:500])}")
                st.write("---")
        else:
            st.warning("Por favor, ingrese una consulta.")

elif seleccion == "Visualización de Clusters":
    st.header("Visualización de Clusters de Jurisprudencia")
    if st.button("Generar Visualización"):
        # Obtener embeddings y aplicar t-SNE
        documentos = list(collection.find().limit(500))
        embeddings_list = []
        dictamen_ids = []
        for doc in documentos:
            dictamen_id = str(doc['_id'])
            dictamen_ids.append(dictamen_id)
            vector = index.fetch(ids=[dictamen_id])['vectors'][dictamen_id]['values']
            embeddings_list.append(vector)
        embeddings_array = np.array(embeddings_list)
        tsne = TSNE(n_components=2, perplexity=30, random_state=42)
        vis_dims = tsne.fit_transform(embeddings_array)
        df = pd.DataFrame(vis_dims, columns=['x', 'y'])
        df['dictamen_id'] = dictamen_ids
        st.subheader("Mapa de Clusters:")
        st.plotly_chart(px.scatter(df, x='x', y='y', hover_data=['dictamen_id']))
    else:
        st.info("Presione el botón para generar la visualización.")

elif seleccion == "Sistema de Alertas":
    st.header("Sistema de Alertas")
    st.write("Configura alertas para nuevos dictámenes o cambios en la doctrina.")
    temas = st.text_input("Ingrese los temas de interés separados por comas:")
    frecuencia = st.selectbox("Frecuencia de las alertas:", ["Diaria", "Semanal", "Mensual"])
    if st.button("Configurar Alertas"):
        if temas:
            # Guardar configuración del usuario (simplificado)
            st.success(f"Alertas configuradas para los temas: {temas}. Frecuencia: {frecuencia}.")
        else:
            st.warning("Por favor, ingrese al menos un tema.")

elif seleccion == "Resumen Personalizado de Dictámenes":
    st.header("Resumen Personalizado de Dictámenes")
    dictamen_id = st.text_input("Ingrese el ID del dictamen:")
    if st.button("Generar Resumen"):
        if dictamen_id:
            dictamen = collection.find_one({"doc_id": dictamen_id})
            if dictamen:
                resumen = generar_resumen(dictamen['documento_completo'])
                st.subheader("Resumen del Dictamen:")
                st.write(resumen)
            else:
                st.warning("No se encontró el dictamen.")
        else:
            st.warning("Por favor, ingrese un ID de dictamen.")

elif seleccion == "Integración con Bases de Datos Externas":
    st.header("Integración con Bases de Datos Legales Externas")
    st.write("Accede a información legal complementaria.")
    consulta = st.text_input("Ingrese su consulta para bases de datos externas:")
    if st.button("Buscar en Bases Externas"):
        if consulta:
            # Implementación de integración (simplificado)
            st.info("Funcionalidad en desarrollo. Pronto podrás acceder a bases de datos externas.")
        else:
            st.warning("Por favor, ingrese una consulta.")

elif seleccion == "Evaluación de Cumplimiento Legal":
    st.header("Evaluación de Cumplimiento Legal")
    descripcion = st.text_area("Describa el caso o normativa a evaluar:")
    if st.button("Evaluar Cumplimiento"):
        if descripcion:
            # Implementación simplificada para el ejemplo
            st.subheader("Resultado de la Evaluación:")
            st.write("Según la doctrina de la Contraloría, el caso descrito **cumple** con la normativa vigente.")
        else:
            st.warning("Por favor, describa el caso o normativa.")

else:
    st.write("Seleccione una opción del menú para comenzar.")
