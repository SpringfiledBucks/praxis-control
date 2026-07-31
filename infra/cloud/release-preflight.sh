#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_file=${PRAXIS_CONFIG_FILE:-"$script_dir/.env"}

fail() {
  echo "release preflight refused: $*" >&2
  exit 1
}

for command_name in docker grep ss; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is unavailable"
done
[ -f "$config_file" ] || fail "configuration file is missing: $config_file"

PRAXIS_CONFIG_FILE="$config_file" sh "$script_dir/preflight.sh" >/dev/null

set -a
# shellcheck disable=SC1090
. "$config_file"
set +a

app_image=${PRAXIS_APP_IMAGE:-}
postgres_image=${PRAXIS_POSTGRES_IMAGE:-}
bind_port=${PRAXIS_BIND_PORT:-4310}

require_digest_reference() {
  label=$1
  reference=$2
  printf '%s\n' "$reference" | grep -Eq '^[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}$' \
    || fail "$label must be an explicit repository@sha256 digest reference"
}

require_loaded_digest() {
  label=$1
  reference=$2
  digests=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$reference" 2>/dev/null) \
    || fail "$label is not available on the deployment host"
  printf '%s\n' "$digests" | grep -Fx "$reference" >/dev/null \
    || fail "$label does not resolve to the configured digest"
}

compose() {
  docker compose --env-file "$config_file" -f "$script_dir/compose.yml" "$@"
}

require_digest_reference PRAXIS_APP_IMAGE "$app_image"
require_digest_reference PRAXIS_POSTGRES_IMAGE "$postgres_image"
require_loaded_digest PRAXIS_APP_IMAGE "$app_image"
require_loaded_digest PRAXIS_POSTGRES_IMAGE "$postgres_image"

configured_images=$(compose config --images)
[ "$(printf '%s\n' "$configured_images" | grep -Fxc "$app_image")" -eq 2 ] \
  || fail 'migration and application must use the configured application digest'
[ "$(printf '%s\n' "$configured_images" | grep -Fxc "$postgres_image")" -eq 1 ] \
  || fail 'database must use the configured PostgreSQL digest'

application_id=$(compose ps -q application 2>/dev/null || true)
database_id=$(compose ps -q database 2>/dev/null || true)
if ss -H -ltn "sport = :$bind_port" | grep -q .; then
  [ -n "$application_id" ] \
    || fail "host port $bind_port is already occupied by a process outside this Compose application"
  application_binding=$(docker inspect -f '{{range (index .HostConfig.PortBindings "4310/tcp")}}{{.HostIp}}:{{.HostPort}}{{"\n"}}{{end}}' "$application_id" 2>/dev/null) \
    || fail 'cannot verify the current application port owner'
  [ "$application_binding" = "127.0.0.1:$bind_port" ] \
    || fail "current application must have exactly one binding at 127.0.0.1:$bind_port"
fi

if [ -n "$database_id" ]; then
  database_bindings=$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$database_id" 2>/dev/null) \
    || fail 'cannot verify the current database port boundary'
  [ "$database_bindings" = '{}' ] || [ "$database_bindings" = null ] \
    || fail 'current database container publishes a host port'
fi

printf '%s\n' 'cloud release preflight: PASS'
printf 'application_image=%s\npostgres_image=%s\nbind=127.0.0.1:%s\n' \
  "$app_image" "$postgres_image" "$bind_port"
