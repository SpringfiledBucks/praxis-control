#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_file=${PRAXIS_CONFIG_FILE:-"$script_dir/.env"}

fail() {
  echo "$*" >&2
  exit 1
}

for command_name in docker awk dirname stat; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is unavailable"
done
docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is unavailable'
[ -f "$config_file" ] || fail "configuration file is missing: $config_file"

set -a
# shellcheck disable=SC1090
. "$config_file"
set +a

secret_files="
${PRAXIS_DB_ADMIN_PASSWORD_FILE:-$script_dir/secrets/database-admin-password.txt}
${PRAXIS_DB_PASSWORD_FILE:-$script_dir/secrets/database-app-password.txt}
${PRAXIS_ACCESS_PASSWORD_FILE:-$script_dir/secrets/access-password.txt}
${PRAXIS_SESSION_SECRET_FILE:-$script_dir/secrets/session-secret.txt}
"

printf '%s\n' "$secret_files" | while IFS= read -r secret_file; do
  [ -z "$secret_file" ] && continue
  [ -f "$secret_file" ] && [ -r "$secret_file" ] && [ -s "$secret_file" ] || fail "secret file is missing or empty: $secret_file"
  [ "$(awk 'END { print NR }' "$secret_file")" -eq 1 ] || fail "secret file must contain exactly one line: $secret_file"
  [ "$(stat -c '%a' "$(dirname -- "$secret_file")")" = 700 ] || fail "secret directory must have mode 0700: $(dirname -- "$secret_file")"
  [ "$(stat -c '%a' "$secret_file")" = 444 ] || fail "file-backed Compose secret must have mode 0444: $secret_file"
done

access_file=${PRAXIS_ACCESS_PASSWORD_FILE:-$script_dir/secrets/access-password.txt}
session_file=${PRAXIS_SESSION_SECRET_FILE:-$script_dir/secrets/session-secret.txt}
[ "$(awk 'NR == 1 { print length($0) }' "$access_file")" -ge 16 ] || fail 'access password must contain at least 16 characters'
[ "$(awk 'NR == 1 { print length($0) }' "$session_file")" -ge 32 ] || fail 'session secret must contain at least 32 characters'

bind_port=${PRAXIS_BIND_PORT:-4310}
case "$bind_port" in ''|*[!0-9]*) fail 'PRAXIS_BIND_PORT must be numeric' ;; esac
[ "$bind_port" -ge 1024 ] && [ "$bind_port" -le 65535 ] || fail 'PRAXIS_BIND_PORT must be between 1024 and 65535'

docker compose --env-file "$config_file" -f "$script_dir/compose.yml" config --quiet
echo 'cloud preflight: PASS'
