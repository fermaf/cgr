#!/bin/bash
export PATH="$HOME/.hermes/node/bin:$PATH"
set -a
source /home/fermaf/github/divulgadorCONTRA/.env 2>/dev/null
set +a
cd /home/fermaf/github/indubia/cgr/cgr-platform

echo "=== D1 TABLE ROW COUNTS (production) ==="
for table in dictamen_metadata_doctrinal regimenes_jurisprudenciales dictamen_relaciones_juridicas relation_evidence relation_assertions problemas_juridicos_operativos pjo_dictamenes norma_regimen regimen_timeline dictamenes; do
  result=$(wrangler d1 execute cgr-dictamenes --env production --remote --command "SELECT COUNT(*) as cnt FROM $table" --json 2>/dev/null)
  if [ $? -eq 0 ]; then
    cnt=$(echo "$result" | grep -o '"cnt":[0-9]*' | head -1 | cut -d: -f2)
    echo "  $table: $cnt"
  else
    echo "  $table: QUERY_FAILED"
  fi
done
