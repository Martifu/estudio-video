#!/usr/bin/env bash
# Thin wrapper kept for existing docs: the test is scripts/smoke_test.py (cross-platform; no `say`, no /tmp).
# Usage: scripts/smoke_test.sh [--keep]   (run dir: $SMOKE_RUN or a fresh temp dir)
set -euo pipefail
S="$(cd "$(dirname "$0")/.." && pwd)"
exec "${PYTHON:-python3}" "$S/scripts/smoke_test.py" "$@"
