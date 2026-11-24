#!/bin/sh
# `docker compose` for the production stack (docs/DEPLOY.md), e.g.
#   deploy/prod.sh up -d --build --wait
#   deploy/prod.sh logs -f api
# Reads deploy/.env.prod. The local rehearsal sets ZURU_REHEARSAL=1 and
# ZURU_ENV_FILE=deploy/.env.rehearsal (self-signed cert, local client IPs).
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
env_file=${ZURU_ENV_FILE:-$dir/.env.prod}
# Build version (D-057): the commit's date (Jakarta) and short hash, e.g.
# 2026.11.24-debc0cb, "-modified" when tracked files differ from that commit.
# Baked into the images at build time, so it always names the code that runs.
if [ -z "${ZURU_VERSION:-}" ] && git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
  ZURU_VERSION=$(TZ=Asia/Jakarta git -C "$dir" log -1 --format=%cd --date=format-local:%Y.%m.%d)-$(git -C "$dir" rev-parse --short HEAD)
  git -C "$dir" diff --quiet HEAD -- || ZURU_VERSION=$ZURU_VERSION-modified
  export ZURU_VERSION
fi
if [ -n "${ZURU_REHEARSAL:-}" ]; then
  exec docker compose -f "$dir/compose.prod.yml" -f "$dir/compose.rehearsal.yml" --env-file "$env_file" "$@"
fi
exec docker compose -f "$dir/compose.prod.yml" --env-file "$env_file" "$@"
