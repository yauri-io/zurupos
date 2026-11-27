#!/bin/sh
# Runs every e2e spec file on its own, restarting the API first. Signup is
# rate-limited to 5 per IP per hour (D-019) and several specs sign up a shop,
# so one run of the whole suite would hit 429. The limit stays as it is.
# Usage (repo root, stack up): apps/dashboard/e2e/run-each.sh
set -e
root=$(cd "$(dirname "$0")/../../.." && pwd)
for spec in "$root"/apps/dashboard/e2e/*.spec.ts; do
  docker compose -f "$root/docker-compose.yml" restart api >/dev/null
  until curl -sf http://localhost:4000/healthz >/dev/null; do sleep 1; done
  echo "== $(basename "$spec")"
  (cd "$root/apps/dashboard" && pnpm exec playwright test "e2e/$(basename "$spec")")
done
