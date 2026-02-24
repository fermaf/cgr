#!/usr/bin/env bash
set -euo pipefail
echo "Set LOG_LEVEL=debug in wrangler vars, deploy, then tail:"
wrangler tail
