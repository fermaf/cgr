#!/bin/bash
# scripts/trigger_reprocess_batch.sh
# Lista de IDs afectados por iniciales malformadas
IDS=(
"E121666N25" "E119093N25" "E119202N25" "E119112N25" "E119184N25" "E118595N25" "E118729N25" 
"E116947N25" "E116883N25" "E115934N25" "E116456N25" "E116592N25" "E114692N25" "E114696N25" 
"E114694N25" "E113060N25" "E113229N25" "E112088N25" "E111812N25" "E111407N25" "E111876N25" 
"E111805N25" "E97876N25" "E97963N25" "E97874N25" "E97019N25" "E96979N25" "E95430N25" 
"E95168N25" "E92203N25" "E92090N25" "E91384N25" "E91509N25" "E91365N25" "E91380N25" "E91377N25" "E91271N25"
)

# Base URL de la plataforma
BASE_URL="https://cgr-platform.abogado.workers.dev"

echo "Iniciando reprocesamiento de ${#IDS[@]} dictámenes..."

for id in "${IDS[@]}"; do
    echo "Processing $id..."
    # Como no tenemos el token de admin aquí, y es una tarea de backend, 
    # se asume que el usuario o el agente puede ejecutar esto si el endpoint es accesible
    # o si se usa wrangler dev para tunelizar.
    curl -X POST "$BASE_URL/api/v1/dictamenes/$id/re-process"
    echo -e "\nDone $id"
    sleep 1
done

echo "Lote completado."
