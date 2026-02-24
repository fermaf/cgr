#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 table_name" >&2
  exit 1
fi
T="$1"
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info($T);"
wrangler d1 execute cgr-dictamenes --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='$T';"
