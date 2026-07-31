#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cloud_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$cloud_dir/compose.yml"
dockerfile="$cloud_dir/Dockerfile"
backup_script="$cloud_dir/backup.sh"
preflight_script="$cloud_dir/preflight.sh"
readme="$cloud_dir/README.md"
nginx_template="$cloud_dir/nginx/praxis-control.conf.template"

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
require_text "$backup_script" 'pg_dump -h 127.0.0.1 -U praxis_control -d praxis_control -Fc --no-owner --no-privileges'
require_text "$backup_script" 'pg_restore --list'
require_text "$backup_script" 'refusing to overwrite'
require_text "$preflight_script" 'file-backed Compose secret must have mode 0444'
require_text "$preflight_script" 'secret directory must have mode 0700'
require_text "$readme" 'chmod 0444 secrets/*.txt'
require_text "$nginx_template" 'proxy_pass http://127.0.0.1:@@UPSTREAM_PORT@@;'
require_text "$nginx_template" 'proxy_set_header X-Forwarded-For $remote_addr;'
require_text "$nginx_template" 'proxy_set_header Tailscale-User-Login "";'
require_text "$nginx_template" 'proxy_set_header Authorization "";'
reject_text "$compose_file" 'privileged: true'
reject_text "$compose_file" '0.0.0.0:${PRAXIS_BIND_PORT'

echo 'cloud static contract: PASS'
