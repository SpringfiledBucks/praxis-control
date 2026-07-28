#!/bin/sh
set -eu

for command_name in docker curl jq openssl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "$command_name is required" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
full_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
repo_root=$(CDPATH= cd -- "$full_dir/../.." && pwd)
run_id="$$-$(date -u +%Y%m%dt%H%M%Sz)"
prefix="praxis-full-smoke-$run_id"
database_container="$prefix-db"
application_container="$prefix-app"
restore_container="$prefix-restore"
backend_network="$prefix-backend"
edge_network="$prefix-edge"
database_volume="$prefix-data"
application_image="$prefix:local"
bind_port=${PRAXIS_SMOKE_PORT:-4312}
case "$bind_port" in
  ''|*[!0-9]*) echo 'PRAXIS_SMOKE_PORT must be numeric' >&2; exit 1 ;;
esac
[ "$bind_port" -ge 1024 ] && [ "$bind_port" -le 65535 ] || {
  echo 'PRAXIS_SMOKE_PORT must be between 1024 and 65535' >&2
  exit 1
}
allowed_user=smoke@example.invalid
temporary_directory=$(mktemp -d "/tmp/$prefix.XXXXXX")
admin_secret="$temporary_directory/admin-password"
application_secret="$temporary_directory/application-password"
backup_file="$temporary_directory/praxis-control.dump"

cleanup() {
  docker rm -fv "$restore_container" "$application_container" "$database_container" >/dev/null 2>&1 || true
  docker network rm "$edge_network" "$backend_network" >/dev/null 2>&1 || true
  docker volume rm "$database_volume" >/dev/null 2>&1 || true
  docker image rm "$application_image" >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT INT TERM

umask 077
openssl rand -hex 32 >"$admin_secret"
openssl rand -hex 32 >"$application_secret"
chmod 0444 "$admin_secret" "$application_secret"

sh "$script_dir/credential-guard.sh"
docker build --network host -t "$application_image" -f "$full_dir/Dockerfile" "$repo_root" >/dev/null
docker network create --internal "$backend_network" >/dev/null
docker network create "$edge_network" >/dev/null
docker volume create "$database_volume" >/dev/null

docker run -d --name "$database_container" --network "$backend_network" --restart=no \
  -e POSTGRES_USER=praxis_cluster_admin \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/admin \
  -e NO_TS_TUNE=true \
  -v "$admin_secret:/run/secrets/admin:ro" \
  -v "$application_secret:/run/secrets/praxis_db_password:ro" \
  -v "$full_dir/init-database.sh:/docker-entrypoint-initdb.d/010-praxis-control.sh:ro" \
  -v "$database_volume:/var/lib/postgresql/data" \
  timescale/timescaledb@sha256:51eb3bcdfc41f481c797026813d9d457fb5cbc8ea370a65640d8cda13a4040c1 >/dev/null

i=0
until docker logs "$database_container" 2>&1 | grep -q 'PostgreSQL init process complete' \
  && docker exec "$database_container" pg_isready -U praxis_cluster_admin -d postgres >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    docker logs --tail 120 "$database_container" >&2
    exit 1
  fi
  sleep 2
done

role_flags=$(docker exec "$database_container" psql -U praxis_cluster_admin -d postgres -Atc \
  "select rolname,rolsuper,rolcreatedb,rolcreaterole,rolinherit from pg_roles where rolname='praxis_control';")
[ "$role_flags" = 'praxis_control|f|f|f|f' ] || {
  echo "unexpected application role: $role_flags" >&2
  exit 1
}

timescale_count=$(docker exec "$database_container" psql -U praxis_cluster_admin -d praxis_control -Atc \
  "select count(*) from pg_extension where extname='timescaledb';")
[ "$timescale_count" = 0 ] || {
  echo 'application database unexpectedly contains TimescaleDB catalogs' >&2
  exit 1
}

create_application() {
  container_name=$1
  database_name=$2
  published_port=$3
  migration_mode=$4
  port_arguments=''
  if [ -n "$published_port" ]; then
    port_arguments="-p 127.0.0.1:$published_port:4310"
  fi
  # shellcheck disable=SC2086
  docker create --name "$container_name" --network "$edge_network" --restart=no --init \
    $port_arguments --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=1000,gid=1000,mode=0700 \
    --tmpfs /data:rw,noexec,nosuid,nodev,uid=1000,gid=1000,mode=0700 \
    --cap-drop ALL --security-opt no-new-privileges:true \
    -e NODE_ENV=production -e APP_HOST=0.0.0.0 -e APP_PORT=4310 \
    -e PRAXIS_DATA_DIR=/tmp/praxis-control -e XDG_RUNTIME_DIR=/tmp/praxis-runtime \
    -e DATABASE_MODE=postgres -e DATABASE_HOST="$database_container" -e DATABASE_PORT=5432 \
    -e DATABASE_NAME="$database_name" -e DATABASE_USER=praxis_control \
    -e DATABASE_PASSWORD_FILE=/run/secrets/praxis_db_password -e DATABASE_SSL=false \
    -e ACCESS_MODE=tailscale -e TAILSCALE_ALLOWED_USER="$allowed_user" \
    -e RUN_MIGRATIONS="$migration_mode" -e RULESET_VERSION=2026.07.28-mvp1 \
    -v "$application_secret:/run/secrets/praxis_db_password:ro" \
    "$application_image" >/dev/null
  docker network connect "$backend_network" "$container_name"
  docker start "$container_name" >/dev/null
}

create_application "$application_container" praxis_control "$bind_port" true
i=0
until curl -fsS "http://127.0.0.1:$bind_port/health" >/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    docker logs --tail 100 "$application_container" >&2
    exit 1
  fi
  sleep 2
done

[ "$(docker port "$application_container" 4310/tcp)" = "127.0.0.1:$bind_port" ]
[ -z "$(docker port "$database_container")" ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$bind_port/api/dashboard")" = 401 ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Tailscale-User-Login: wrong@example.invalid' "http://127.0.0.1:$bind_port/api/dashboard")" = 401 ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Tailscale-User-Login: $allowed_user" "http://127.0.0.1:$bind_port/api/dashboard")" = 200 ]

api_token=$(docker exec "$application_container" cat /tmp/praxis-runtime/praxis-control/service.json | jq -r .apiToken)
curl -fsS -X POST "http://127.0.0.1:$bind_port/api/checkins" \
  -H "Authorization: Bearer $api_token" \
  -H "Tailscale-User-Login: $allowed_user" \
  -H 'Content-Type: application/json' \
  --data-binary "@$repo_root/src/infrastructure/test-fixtures/daily-input.json" >/dev/null

curl -fsS -H "Tailscale-User-Login: $allowed_user" \
  "http://127.0.0.1:$bind_port/api/audit/verify" \
  | jq -e '.valid == true and (.failures | length == 0)' >/dev/null

docker exec "$database_container" pg_dump -U praxis_control -d praxis_control \
  -Fc --no-owner --no-privileges >"$backup_file"
[ -s "$backup_file" ]
docker exec -i "$database_container" pg_restore --list <"$backup_file" >/dev/null
docker exec "$database_container" createdb -U praxis_cluster_admin -T template0 -O praxis_control praxis_restore_verify
docker exec -i "$database_container" pg_restore -U praxis_control -d praxis_restore_verify \
  --no-owner --no-privileges <"$backup_file"

[ "$(docker exec "$database_container" psql -U praxis_control -d praxis_restore_verify -Atc 'select count(*) from decision.daily_checkins;')" = 1 ]
create_application "$restore_container" praxis_restore_verify '' false
i=0
until docker exec "$restore_container" node -e \
  "fetch('http://127.0.0.1:4310/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    docker logs --tail 100 "$restore_container" >&2
    exit 1
  fi
  sleep 2
done

docker exec "$restore_container" node -e \
  "fetch('http://127.0.0.1:4310/api/audit/verify',{headers:{'Tailscale-User-Login':'$allowed_user'}}).then(r=>r.json()).then(v=>{if(!v.valid||v.failures.length)process.exit(1)})"

printf '%s\n' 'Praxis Control full-profile smoke: PASS'
