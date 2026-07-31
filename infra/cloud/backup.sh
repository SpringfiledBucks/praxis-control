#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_file=${PRAXIS_CONFIG_FILE:-"$script_dir/.env"}
target_dir=${1:-"$script_dir/backups"}

fail() {
  echo "$*" >&2
  exit 1
}

for command_name in docker date grep ln rm; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is unavailable"
done
[ -f "$config_file" ] || fail "configuration file is missing: $config_file"
docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is unavailable'

compose() {
  docker compose --env-file "$config_file" -f "$script_dir/compose.yml" "$@"
}

compose ps --status running --services | grep -Fx database >/dev/null || fail 'database service is not running'
mkdir -p "$target_dir"
target_dir=$(CDPATH= cd -- "$target_dir" && pwd)
umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$target_dir/praxis-control-$timestamp.dump"
temporary="$target_dir/.praxis-control-$timestamp.dump.partial.$$"
[ ! -e "$target" ] || fail "refusing to overwrite $target"

cleanup() { rm -f "$temporary"; }
trap cleanup EXIT INT TERM

compose exec -T database sh -c '
  PGPASSWORD=$(cat /run/secrets/praxis_db_password)
  export PGPASSWORD
  exec pg_dump -h 127.0.0.1 -U praxis_control -d praxis_control -Fc --no-owner --no-privileges
' >"$temporary"
[ -s "$temporary" ] || fail 'backup is empty'
compose exec -T database pg_restore --list <"$temporary" >/dev/null
ln "$temporary" "$target" || fail "refusing to overwrite $target"
rm -f "$temporary"
trap - EXIT INT TERM
printf '%s\n' "$target"
