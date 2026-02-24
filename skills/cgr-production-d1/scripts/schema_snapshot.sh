#!/usr/bin/env bash
set -euo pipefail
for t in dictamenes enriquecimiento cat_abogados cat_descriptores dictamen_abogados dictamen_descriptores kv_sync_status; do
  echo "=== $t ==="
  wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info($t);"
  echo
 done
