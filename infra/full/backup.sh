#!/bin/sh
set -eu
umask 077

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_dir=${1:-"$script_dir/backups"}
mkdir -p "$target_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$target_dir/praxis-control-$timestamp.dump"

if [ -e "$target" ]; then
  echo "refusing to overwrite $target" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "Docker Compose is unavailable" >&2
  exit 1
fi

compose --project-directory "$script_dir" --project-name praxis-control-full -f "$script_dir/compose.yml" \
  exec -T database pg_dump \
  --username praxis_control \
  --dbname praxis_control \
  --format custom \
  --no-owner \
  --no-privileges >"$target"

if [ ! -s "$target" ]; then
  rm -f "$target"
  echo "backup is empty" >&2
  exit 1
fi

compose --project-directory "$script_dir" --project-name praxis-control-full -f "$script_dir/compose.yml" \
  exec -T database pg_restore --list <"$target" >/dev/null
printf '%s\n' "$target"
