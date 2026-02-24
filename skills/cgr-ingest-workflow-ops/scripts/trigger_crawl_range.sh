#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 YYYY-MM-DD YYYY-MM-DD [limit]" >&2
  exit 1
fi
START="$1"
END="$2"
LIMIT="${3:-50000}"

curl -sS -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d "{\"date_start\":\"$START\",\"date_end\":\"$END\",\"limit\":$LIMIT}"
