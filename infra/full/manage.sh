#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
config_file=${PRAXIS_CONFIG_FILE:-"$script_dir/.env"}
stack_prefix=${PRAXIS_STACK_PREFIX:-praxis-control-full}
application_image=${PRAXIS_APPLICATION_IMAGE:-praxis-control-full:0.2.0-beta.1}
database_image='timescale/timescaledb@sha256:51eb3bcdfc41f481c797026813d9d457fb5cbc8ea370a65640d8cda13a4040c1'
database_container="$stack_prefix-database"
application_container="$stack_prefix-application"
backend_network="$stack_prefix-backend"
edge_network="$stack_prefix-edge"
database_volume="$stack_prefix-database"
state_dir="$script_dir/.state/$stack_prefix"
runtime_secret_dir="$state_dir/runtime-secrets"
source_admin_secret=${PRAXIS_DB_ADMIN_PASSWORD_FILE:-"$script_dir/secrets/database-admin-password.txt"}
source_application_secret=${PRAXIS_DB_PASSWORD_FILE:-"$script_dir/secrets/database-app-password.txt"}
source_access_password=${PRAXIS_ACCESS_PASSWORD_FILE:-"$script_dir/secrets/access-password.txt"}
source_session_secret=${PRAXIS_SESSION_SECRET_FILE:-"$script_dir/secrets/session-secret.txt"}
runtime_admin_secret="$runtime_secret_dir/database-admin-password.txt"
runtime_application_secret="$runtime_secret_dir/database-app-password.txt"
runtime_access_password="$runtime_secret_dir/access-password.txt"
runtime_session_secret="$runtime_secret_dir/session-secret.txt"
label_key='io.praxiscontrol.stack'
credential_fingerprint_preexisting=false
[ -f "$state_dir/credential.sha256" ] && credential_fingerprint_preexisting=true

config_value() {
  key=$1
  [ -f "$config_file" ] || return 0
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); print; exit }' "$config_file"
}

access_mode=${ACCESS_MODE:-$(config_value ACCESS_MODE)}
access_mode=${access_mode:-password}
allowed_user=${TAILSCALE_ALLOWED_USER:-$(config_value TAILSCALE_ALLOWED_USER)}
bind_port=${PRAXIS_BIND_PORT:-$(config_value PRAXIS_BIND_PORT)}
bind_port=${bind_port:-4310}

fail() {
  echo "$*" >&2
  exit 1
}

validate_inputs() {
  for command_name in docker curl openssl awk grep head install sed sha256sum tr; do
    command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is unavailable"
  done
  docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
  printf '%s' "$stack_prefix" | grep -Eq '^[a-z0-9][a-z0-9_.-]*$' || fail 'PRAXIS_STACK_PREFIX contains unsupported characters'
  case "$bind_port" in ''|*[!0-9]*) fail 'PRAXIS_BIND_PORT must be numeric' ;; esac
  [ "$bind_port" -ge 1024 ] && [ "$bind_port" -le 65535 ] || fail 'PRAXIS_BIND_PORT must be between 1024 and 65535'
  case "$access_mode" in
    tailscale)
      [ -n "$allowed_user" ] || fail 'TAILSCALE_ALLOWED_USER is required'
      printf '%s' "$allowed_user" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9@._+-]*$' || fail 'TAILSCALE_ALLOWED_USER contains unsupported characters'
      ;;
    password) ;;
    *) fail 'ACCESS_MODE must be password or tailscale' ;;
  esac
  for secret_file in "$source_admin_secret" "$source_application_secret"; do
    [ -f "$secret_file" ] && [ -r "$secret_file" ] && [ -s "$secret_file" ] || fail "secret file is missing or empty: $secret_file"
    [ "$(awk 'END { print NR }' "$secret_file")" -eq 1 ] || fail "secret file must contain exactly one line: $secret_file"
  done
  if [ "$access_mode" = password ]; then
    for secret_file in "$source_access_password" "$source_session_secret"; do
      [ -f "$secret_file" ] && [ -r "$secret_file" ] && [ -s "$secret_file" ] || fail "secret file is missing or empty: $secret_file"
      [ "$(awk 'END { print NR }' "$secret_file")" -eq 1 ] || fail "secret file must contain exactly one line: $secret_file"
    done
    [ "$(awk 'NR == 1 { print length($0) }' "$source_access_password")" -ge 16 ] || fail 'access password must contain at least 16 characters'
    [ "$(awk 'NR == 1 { print length($0) }' "$source_session_secret")" -ge 32 ] || fail 'session secret must contain at least 32 characters'
  fi
}

container_label() {
  docker container inspect --format '{{ index .Config.Labels "io.praxiscontrol.stack" }}' "$1" 2>/dev/null || true
}

network_label() {
  docker network inspect --format '{{ index .Labels "io.praxiscontrol.stack" }}' "$1" 2>/dev/null || true
}

volume_label() {
  docker volume inspect --format '{{ index .Labels "io.praxiscontrol.stack" }}' "$1" 2>/dev/null || true
}

assert_owned_container() {
  [ "$(container_label "$1")" = "$stack_prefix" ] || fail "refusing to manage unowned container: $1"
}

assert_owned_network() {
  [ "$(network_label "$1")" = "$stack_prefix" ] || fail "refusing to manage unowned network: $1"
}

assert_owned_volume() {
  [ "$(volume_label "$1")" = "$stack_prefix" ] || fail "refusing to manage unowned volume: $1"
}

prepare_runtime_secrets() {
  mkdir -p "$runtime_secret_dir"
  chmod 0700 "$state_dir" "$runtime_secret_dir"
  current_admin_hash=$(sha256sum "$source_admin_secret" | awk '{ print $1 }')
  current_application_hash=$(sha256sum "$source_application_secret" | awk '{ print $1 }')
  if [ -f "$state_dir/credential.sha256" ]; then
    saved_hashes=$(cat "$state_dir/credential.sha256")
    [ "$saved_hashes" = "$current_admin_hash $current_application_hash" ] || fail 'database credentials changed; refusing implicit credential rotation'
  else
    umask 077
    printf '%s %s\n' "$current_admin_hash" "$current_application_hash" >"$state_dir/credential.sha256"
    credential_fingerprint_preexisting=false
  fi
  install -m 0444 "$source_admin_secret" "$runtime_admin_secret"
  install -m 0444 "$source_application_secret" "$runtime_application_secret"
  if [ "$access_mode" = password ]; then
    install -m 0444 "$source_access_password" "$runtime_access_password"
    install -m 0444 "$source_session_secret" "$runtime_session_secret"
  else
    rm -f "$runtime_access_password" "$runtime_session_secret"
  fi
}

ensure_networks() {
  if docker network inspect "$backend_network" >/dev/null 2>&1; then
    assert_owned_network "$backend_network"
    [ "$(docker network inspect --format '{{.Internal}}' "$backend_network")" = true ] || fail 'backend network is not internal'
  else
    docker network create --internal --label "$label_key=$stack_prefix" "$backend_network" >/dev/null
    created_backend_network=true
  fi

  if docker network inspect "$edge_network" >/dev/null 2>&1; then
    assert_owned_network "$edge_network"
  else
    docker network create --label "$label_key=$stack_prefix" "$edge_network" >/dev/null
    created_edge_network=true
  fi
}

ensure_volume() {
  if docker volume inspect "$database_volume" >/dev/null 2>&1; then
    assert_owned_volume "$database_volume"
    [ "$credential_fingerprint_preexisting" = true ] || fail 'existing database volume has no trusted credential fingerprint'
  else
    docker volume create --label "$label_key=$stack_prefix" "$database_volume" >/dev/null
    created_database_volume=true
  fi
}

remove_owned_container_if_present() {
  target=$1
  if docker container inspect "$target" >/dev/null 2>&1; then
    assert_owned_container "$target"
    if [ "$(docker container inspect --format '{{.State.Running}}' "$target")" = true ]; then
      docker stop --time 30 "$target" >/dev/null
    fi
    docker rm -v "$target" >/dev/null
  fi
}

assert_existing_containers_owned() {
  for target in "$application_container" "$database_container"; do
    if docker container inspect "$target" >/dev/null 2>&1; then
      assert_owned_container "$target"
    fi
  done
}

rollback_start() {
  exit_code=$?
  trap - EXIT INT TERM
  if [ "$exit_code" -ne 0 ]; then
    if [ "${containers_mutated:-false}" = true ]; then
      for target in "$application_container" "$database_container"; do
        if docker container inspect "$target" >/dev/null 2>&1; then
          if [ "$(container_label "$target")" = "$stack_prefix" ]; then
            docker stop --time 30 "$target" >/dev/null 2>&1 || true
            docker rm -v "$target" >/dev/null 2>&1 || true
          else
            echo "rollback left unowned container untouched: $target" >&2
          fi
        fi
      done
    fi
    if [ "${created_database_volume:-false}" = true ]; then docker volume rm "$database_volume" >/dev/null 2>&1 || true; fi
    if [ "${created_edge_network:-false}" = true ]; then docker network rm "$edge_network" >/dev/null 2>&1 || true; fi
    if [ "${created_backend_network:-false}" = true ]; then docker network rm "$backend_network" >/dev/null 2>&1 || true; fi
    if [ "$credential_fingerprint_preexisting" = false ]; then rm -rf "$state_dir"; fi
  fi
  exit "$exit_code"
}

wait_for_database() {
  i=0
  until docker logs "$database_container" 2>&1 | grep -Eq 'PostgreSQL init process complete|Skipping initialization' \
    && docker exec "$database_container" pg_isready -U praxis_cluster_admin -d postgres >/dev/null 2>&1 \
    && [ "$(docker exec "$database_container" psql -U praxis_cluster_admin -d postgres -Atc "select rolname from pg_roles where rolname='praxis_control';" 2>/dev/null)" = praxis_control ]; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      docker logs --tail 120 "$database_container" >&2
      fail 'database did not become ready'
    fi
    sleep 2
  done
}

wait_for_application() {
  i=0
  until curl -fsS "http://127.0.0.1:$bind_port/health" >/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      docker logs --tail 100 "$application_container" >&2
      fail 'application did not become ready'
    fi
    sleep 2
  done
}

start_stack() {
  validate_inputs
  trap rollback_start EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  prepare_runtime_secrets
  docker build --network host -t "$application_image" -f "$script_dir/Dockerfile" "$repo_root"
  ensure_networks
  ensure_volume
  assert_existing_containers_owned

  containers_mutated=true
  remove_owned_container_if_present "$application_container"
  remove_owned_container_if_present "$database_container"

  set -- -e "ACCESS_MODE=$access_mode"
  if [ "$access_mode" = password ]; then
    set -- "$@" \
      -e ACCESS_PASSWORD_FILE=/run/secrets/praxis_access_password \
      -e SESSION_SECRET_FILE=/run/secrets/praxis_session_secret \
      -e SESSION_COOKIE_SECURE=true \
      -v "$runtime_access_password:/run/secrets/praxis_access_password:ro" \
      -v "$runtime_session_secret:/run/secrets/praxis_session_secret:ro"
  else
    set -- "$@" -e "TAILSCALE_ALLOWED_USER=$allowed_user"
  fi

  docker run -d --name "$database_container" --network "$backend_network" --restart unless-stopped \
    --label "$label_key=$stack_prefix" --label io.praxiscontrol.role=database \
    -e POSTGRES_USER=praxis_cluster_admin -e POSTGRES_DB=postgres \
    -e POSTGRES_PASSWORD_FILE=/run/secrets/praxis_db_admin_password -e NO_TS_TUNE=true \
    -v "$runtime_admin_secret:/run/secrets/praxis_db_admin_password:ro" \
    -v "$runtime_application_secret:/run/secrets/praxis_db_password:ro" \
    -v "$script_dir/init-database.sh:/docker-entrypoint-initdb.d/010-praxis-control.sh:ro" \
    -v "$database_volume:/var/lib/postgresql/data" \
    --health-cmd='pg_isready -U praxis_cluster_admin -d postgres' \
    --health-interval=5s --health-timeout=3s --health-retries=20 --health-start-period=10s \
    "$database_image" >/dev/null
  wait_for_database

  docker create --name "$application_container" --network "$edge_network" --restart unless-stopped --init \
    --label "$label_key=$stack_prefix" --label io.praxiscontrol.role=application \
    -p "127.0.0.1:$bind_port:4310" --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=1000,gid=1000,mode=0700 \
    --tmpfs /data:rw,noexec,nosuid,nodev,uid=1000,gid=1000,mode=0700 \
    --cap-drop ALL --security-opt no-new-privileges:true \
    -e NODE_ENV=production -e APP_HOST=0.0.0.0 -e APP_PORT=4310 \
    -e PRAXIS_DATA_DIR=/tmp/praxis-control -e XDG_RUNTIME_DIR=/tmp/praxis-runtime \
    -e DATABASE_MODE=postgres -e DATABASE_HOST="$database_container" -e DATABASE_PORT=5432 \
    -e DATABASE_NAME=praxis_control -e DATABASE_USER=praxis_control \
    -e DATABASE_PASSWORD_FILE=/run/secrets/praxis_db_password -e DATABASE_SSL=false \
    "$@" \
    -e RUN_MIGRATIONS=true -e RULESET_VERSION=2026.07.28-mvp1 \
    -v "$runtime_application_secret:/run/secrets/praxis_db_password:ro" \
    --health-cmd="node -e \"fetch('http://127.0.0.1:4310/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"" \
    --health-interval=10s --health-timeout=3s --health-retries=12 --health-start-period=15s \
    "$application_image" >/dev/null
  docker network connect "$backend_network" "$application_container"
  docker start "$application_container" >/dev/null
  wait_for_application

  [ -z "$(docker port "$database_container")" ] || fail 'database unexpectedly publishes a host port'
  [ "$(docker port "$application_container" 4310/tcp)" = "127.0.0.1:$bind_port" ] || fail 'application is not bound to the expected loopback port'
  [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$bind_port/api/dashboard")" = 401 ] || fail 'unauthenticated API request was not rejected'
  if [ "$access_mode" = tailscale ]; then
    [ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Tailscale-User-Login: $allowed_user" "http://127.0.0.1:$bind_port/api/dashboard")" = 200 ] || fail 'allowlisted identity was not accepted'
  else
    login_page=$(curl -fsS "http://127.0.0.1:$bind_port/login")
    login_csrf=$(printf '%s\n' "$login_page" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' | head -1)
    [ -n "$login_csrf" ] || fail 'login CSRF token was not found'
    login_response=$(tr -d '\r\n' <"$runtime_access_password" | curl -sS -i -X POST "http://127.0.0.1:$bind_port/login" \
      --data-urlencode "_csrf=$login_csrf" --data-urlencode 'password@-')
    printf '%s\n' "$login_response" | head -1 | grep -Eq ' 303 ' || fail 'password login did not redirect after success'
    session_cookie=$(printf '%s\n' "$login_response" | awk 'tolower($1) == "set-cookie:" { sub(/\r$/, ""); sub(/^[^:]*:[ ]*/, ""); split($0, value, ";"); print value[1]; exit }')
    [ -n "$session_cookie" ] || fail 'password login did not issue a session cookie'
    [ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: $session_cookie" "http://127.0.0.1:$bind_port/api/dashboard")" = 200 ] || fail 'password session was not accepted'
  fi

  trap - EXIT INT TERM
  printf 'Praxis Control full profile is running on http://127.0.0.1:%s\n' "$bind_port"
}

stop_stack() {
  assert_existing_containers_owned
  remove_owned_container_if_present "$application_container"
  remove_owned_container_if_present "$database_container"
  printf '%s\n' 'Praxis Control full profile stopped; database volume preserved'
}

status_stack() {
  printf 'stack=%s\n' "$stack_prefix"
  for target in "$database_container" "$application_container"; do
    if docker container inspect "$target" >/dev/null 2>&1; then
      assert_owned_container "$target"
      docker container inspect --format 'container={{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$target"
    else
      printf 'container=/%s status=absent health=none\n' "$target"
    fi
  done
  if docker volume inspect "$database_volume" >/dev/null 2>&1; then
    assert_owned_volume "$database_volume"
    printf 'database_volume=%s status=present\n' "$database_volume"
  else
    printf 'database_volume=%s status=absent\n' "$database_volume"
  fi
}

backup_stack() {
  target_dir=${2:-"$script_dir/backups"}
  docker container inspect "$database_container" >/dev/null 2>&1 || fail 'database container is absent'
  assert_owned_container "$database_container"
  [ "$(docker container inspect --format '{{.State.Running}}' "$database_container")" = true ] || fail 'database container is not running'
  mkdir -p "$target_dir"
  umask 077
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$target_dir/praxis-control-$timestamp.dump"
  [ ! -e "$target" ] || fail "refusing to overwrite $target"
  docker exec "$database_container" pg_dump -U praxis_control -d praxis_control -Fc --no-owner --no-privileges >"$target"
  if [ ! -s "$target" ]; then rm -f "$target"; fail 'backup is empty'; fi
  docker exec -i "$database_container" pg_restore --list <"$target" >/dev/null
  printf '%s\n' "$target"
}

case "${1:-}" in
  start) start_stack ;;
  stop) stop_stack ;;
  status) status_stack ;;
  backup) backup_stack "$@" ;;
  preflight) validate_inputs; printf '%s\n' 'Praxis Control full-profile preflight: PASS' ;;
  *) echo 'usage: manage.sh {preflight|start|stop|status|backup [target-directory]}' >&2; exit 2 ;;
esac
