#!/bin/sh
# `docker compose` for the production stack (docs/DEPLOY.md), e.g.
#   deploy/prod.sh up -d --build --wait
#   deploy/prod.sh logs -f api
# Reads deploy/.env.prod. The local rehearsal sets ZURU_REHEARSAL=1 and
# ZURU_ENV_FILE=deploy/.env.rehearsal (self-signed cert, local client IPs).
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
env_file=${ZURU_ENV_FILE:-$dir/.env.prod}
if [ -n "${ZURU_REHEARSAL:-}" ]; then
  exec docker compose -f "$dir/compose.prod.yml" -f "$dir/compose.rehearsal.yml" --env-file "$env_file" "$@"
fi
exec docker compose -f "$dir/compose.prod.yml" --env-file "$env_file" "$@"
