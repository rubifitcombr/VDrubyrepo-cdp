#!/usr/bin/env bash
set -euo pipefail
for run in 1 2 3; do
  echo ""
  echo "========== Playwright sync run ${run}/3 =========="
  npx playwright test e2e/sync --reporter=list
done
