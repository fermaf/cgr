#!/usr/bin/env bash
set -euo pipefail
BATCH="${1:-50}"
DELAY="${2:-1000}"

curl -sS -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -d "{\"batchSize\":$BATCH,\"delayMs\":$DELAY}"
