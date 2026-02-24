#!/usr/bin/env bash
set -euo pipefail
git diff -- README.md docs/README.md docs/03_guia_desarrollo.md docs/04_operacion_y_mantenimiento.md docs/99_briefing_agente_experto.md
