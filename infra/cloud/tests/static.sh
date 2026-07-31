#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cloud_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$cloud_dir/compose.yml"
dockerfile="$cloud_dir/Dockerfile"

require_text() {
  grep -F -- "$2" "$1" >/dev/null || {
    echo "missing required text in $1: $2" >&2
    exit 1
  }
}

reject_text() {
  if grep -F -- "$2" "$1" >/dev/null; then
    echo "forbidden text in $1: $2" >&2
    exit 1
  fi
}

database_block=$(sed -n '/^  database:/,/^  migration:/p' "$compose_file")
printf '%s\n' "$database_block" | grep -Eq '^    ports:' && {
  echo 'database must not publish a host port' >&2
  exit 1
}

require_text "$compose_file" 'condition: service_completed_successfully'
require_text "$compose_file" 'command: ["node", "dist/cli/migrate.js"]'
require_text "$compose_file" 'RUN_MIGRATIONS: "false"'
require_text "$compose_file" '127.0.0.1:${PRAXIS_BIND_PORT:-4310}:4310'
require_text "$compose_file" "fetch('http://127.0.0.1:4310/health/ready')"
require_text "$compose_file" 'no-new-privileges:true'
require_text "$compose_file" 'cap_drop:'
require_text "$compose_file" 'read_only: true'
require_text "$dockerfile" 'USER node'
reject_text "$compose_file" 'privileged: true'
reject_text "$compose_file" '0.0.0.0:${PRAXIS_BIND_PORT'

echo 'cloud static contract: PASS'
