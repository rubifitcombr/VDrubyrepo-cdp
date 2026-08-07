#!/usr/bin/env bash
set -euo pipefail
# Testes 1, 2, 3 e 5 (sync entre abas). O 4 (flicker/latência) fica na suíte de concorrência.
export CI=1
export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3100}"
export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${PLAYWRIGHT_PORT}"
SYNC_SPECS=(
  e2e/sync/01-background-sync.spec.ts
  e2e/sync/02-client-version.spec.ts
  e2e/sync/03-garcom-pin.spec.ts
  e2e/sync/05-plan-consistency.spec.ts
)
for run in 1 2 3; do
  echo ""
  echo "========== Playwright sync run ${run}/3 =========="
  npx playwright test "${SYNC_SPECS[@]}" --reporter=list
done
