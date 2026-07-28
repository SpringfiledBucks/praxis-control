#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
full_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
prefix="praxis-control-credential-test-$$"
temporary_directory=$(mktemp -d "/tmp/$prefix.XXXXXX")
state_dir="$full_dir/.state/$prefix"
admin_secret="$temporary_directory/admin"
application_secret="$temporary_directory/application"
runtime_secret_dir="$state_dir/runtime-secrets"
log_file="$temporary_directory/manage.log"
database_image='timescale/timescaledb@sha256:51eb3bcdfc41f481c797026813d9d457fb5cbc8ea370a65640d8cda13a4040c1'
application_container="$prefix-application"
database_container="$prefix-database"
created_application_container=false
created_database_container=false

cleanup() {
  if [ "$created_application_container" = true ]; then docker rm -f -v "$application_container" >/dev/null 2>&1 || true; fi
  if [ "$created_database_container" = true ]; then docker rm -f -v "$database_container" >/dev/null 2>&1 || true; fi
  rm -rf "$temporary_directory" "$state_dir"
}
trap cleanup EXIT INT TERM

umask 077
openssl rand -hex 32 >"$admin_secret"
openssl rand -hex 32 >"$application_secret"
mkdir -p "$runtime_secret_dir"
chmod 0700 "$state_dir" "$runtime_secret_dir"
install -m 0444 "$admin_secret" "$runtime_secret_dir/database-admin-password.txt"
install -m 0444 "$application_secret" "$runtime_secret_dir/database-app-password.txt"
admin_hash=$(sha256sum "$admin_secret" | awk '{ print $1 }')
application_hash=$(sha256sum "$application_secret" | awk '{ print $1 }')
printf '%s %s\n' "$admin_hash" "$application_hash" >"$state_dir/credential.sha256"
runtime_hash_before=$(sha256sum "$runtime_secret_dir/database-app-password.txt" | awk '{ print $1 }')

docker create --name "$application_container" --label "io.praxiscontrol.stack=$prefix" \
  --entrypoint /bin/true "$database_image" >/dev/null
created_application_container=true
docker create --name "$database_container" --label "io.praxiscontrol.stack=$prefix" \
  --entrypoint /bin/true "$database_image" >/dev/null
created_database_container=true

openssl rand -hex 32 >"$application_secret"
if PRAXIS_STACK_PREFIX="$prefix" \
  PRAXIS_DB_ADMIN_PASSWORD_FILE="$admin_secret" \
  PRAXIS_DB_PASSWORD_FILE="$application_secret" \
  ACCESS_MODE=tailscale \
  TAILSCALE_ALLOWED_USER=credential-test@example.invalid \
  PRAXIS_BIND_PORT=4315 \
  sh "$full_dir/manage.sh" start >"$log_file" 2>&1; then
  echo 'credential rotation was unexpectedly accepted' >&2
  exit 1
fi

grep -F 'database credentials changed; refusing implicit credential rotation' "$log_file" >/dev/null
runtime_hash_after=$(sha256sum "$runtime_secret_dir/database-app-password.txt" | awk '{ print $1 }')
[ "$runtime_hash_before" = "$runtime_hash_after" ] || {
  echo 'runtime credential changed after rejected rotation' >&2
  exit 1
}
docker container inspect "$application_container" >/dev/null 2>&1 || {
  echo 'application container was removed after rejected rotation' >&2
  exit 1
}
docker container inspect "$database_container" >/dev/null 2>&1 || {
  echo 'database container was removed after rejected rotation' >&2
  exit 1
}

printf '%s\n' 'Praxis Control credential guard: PASS'
