#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"SQL\"" >&2
  exit 1
fi
SQL="$1"
wrangler d1 execute cgr-dictamenes --remote --command "$SQL"
