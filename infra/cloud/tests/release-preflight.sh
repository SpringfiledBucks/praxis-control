#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cloud_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT INT TERM

mkdir "$test_root/bin" "$test_root/secrets"
chmod 0700 "$test_root/secrets"
for name in database-admin-password database-app-password access-password; do
  printf '%s\n' 'test-secret-with-more-than-sixteen-characters' > "$test_root/secrets/$name.txt"
done
printf '%s\n' 'test-session-secret-with-more-than-thirty-two-characters' > "$test_root/secrets/session-secret.txt"
chmod 0444 "$test_root/secrets"/*.txt

app_digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
postgres_digest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
app_image="registry.example.invalid/praxis/control@$app_digest"
postgres_image="registry.example.invalid/library/postgres@$postgres_digest"

cat > "$test_root/cloud.env" <<EOF
PRAXIS_APP_IMAGE=$app_image
PRAXIS_POSTGRES_IMAGE=$postgres_image
PRAXIS_BIND_PORT=44310
PRAXIS_DB_ADMIN_PASSWORD_FILE=$test_root/secrets/database-admin-password.txt
PRAXIS_DB_PASSWORD_FILE=$test_root/secrets/database-app-password.txt
PRAXIS_ACCESS_PASSWORD_FILE=$test_root/secrets/access-password.txt
PRAXIS_SESSION_SECRET_FILE=$test_root/secrets/session-secret.txt
EOF

cat > "$test_root/bin/docker" <<'MOCK_DOCKER'
#!/bin/sh
set -eu
first=${1:-}
second=${2:-}
case "$first" in
  info) exit 0 ;;
  image)
    [ "$second" = inspect ] || exit 2
    eval "reference=\${$#}"
    if [ "${MOCK_DIGEST_MISMATCH:-false}" = true ]; then
      printf '%s\n' 'registry.example.invalid/wrong/image@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    else
      printf '%s\n' "$reference"
    fi
    ;;
  inspect)
    [ "$second" = -f ] || exit 2
    eval "object=\${$#}"
    case "$object" in
      app-id)
        printf '%s\n' '127.0.0.1:44310'
        if [ "${MOCK_EXTRA_APP_BINDING:-false}" = true ]; then
          printf '%s\n' '0.0.0.0:44310'
        fi
        ;;
      database-id)
        if [ "${MOCK_DATABASE_PUBLISHED:-false}" = true ]; then
          printf '%s\n' '{"5432/tcp":[{"HostIp":"0.0.0.0","HostPort":"5432"}]}'
        else
          printf '%s\n' '{}'
        fi
        ;;
      *) exit 2 ;;
    esac
    ;;
  compose)
    [ "$second" = version ] && exit 0
    case "$*" in
      *' config --quiet') exit 0 ;;
      *' config --images')
        printf '%s\n' \
          'registry.example.invalid/library/postgres@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
          'registry.example.invalid/praxis/control@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
          'registry.example.invalid/praxis/control@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        ;;
      *' ps -q application')
        [ "${MOCK_APP_RUNNING:-false}" = true ] && printf '%s\n' app-id
        ;;
      *' ps -q database')
        [ "${MOCK_DATABASE_RUNNING:-false}" = true ] && printf '%s\n' database-id
        ;;
      *) echo "unexpected mock Compose call: $*" >&2; exit 2 ;;
    esac
    ;;
  *) echo "unexpected mock Docker call: $*" >&2; exit 2 ;;
esac
MOCK_DOCKER
chmod 0700 "$test_root/bin/docker"

cat > "$test_root/bin/ss" <<'MOCK_SS'
#!/bin/sh
set -eu
[ "${MOCK_PORT_OCCUPIED:-false}" = true ] && printf '%s\n' 'LISTEN 0 4096 127.0.0.1:44310 0.0.0.0:*'
MOCK_SS
chmod 0700 "$test_root/bin/ss"

cat > "$test_root/bin/stat" <<'MOCK_STAT'
#!/bin/sh
set -eu
if [ "${1:-}" = -c ] && [ "${2:-}" = %a ]; then
  case "${3:-}" in
    */secrets) printf '%s\n' 700; exit 0 ;;
    */secrets/*.txt) printf '%s\n' 444; exit 0 ;;
  esac
fi
exec /usr/bin/stat "$@"
MOCK_STAT
chmod 0700 "$test_root/bin/stat"

run_preflight() {
  PATH="$test_root/bin:$PATH" \
  PRAXIS_CONFIG_FILE="$test_root/cloud.env" \
  sh "$cloud_dir/release-preflight.sh"
}

run_preflight >/dev/null

cp "$test_root/cloud.env" "$test_root/mutable.env"
sed -i 's|PRAXIS_APP_IMAGE=.*|PRAXIS_APP_IMAGE=praxis-control:latest|' "$test_root/mutable.env"
if PATH="$test_root/bin:$PATH" PRAXIS_CONFIG_FILE="$test_root/mutable.env" \
  sh "$cloud_dir/release-preflight.sh" >/dev/null 2>&1; then
  echo 'release preflight accepted a mutable application tag' >&2
  exit 1
fi

if MOCK_DIGEST_MISMATCH=true run_preflight >/dev/null 2>&1; then
  echo 'release preflight accepted a mismatched local image digest' >&2
  exit 1
fi

if MOCK_PORT_OCCUPIED=true run_preflight >/dev/null 2>&1; then
  echo 'release preflight accepted a port owned outside the Compose project' >&2
  exit 1
fi

MOCK_PORT_OCCUPIED=true MOCK_APP_RUNNING=true MOCK_DATABASE_RUNNING=true run_preflight >/dev/null

if MOCK_PORT_OCCUPIED=true MOCK_APP_RUNNING=true MOCK_EXTRA_APP_BINDING=true run_preflight >/dev/null 2>&1; then
  echo 'release preflight accepted an additional application port binding' >&2
  exit 1
fi

if MOCK_DATABASE_RUNNING=true MOCK_DATABASE_PUBLISHED=true run_preflight >/dev/null 2>&1; then
  echo 'release preflight accepted a published database port' >&2
  exit 1
fi

echo 'cloud release preflight contract: PASS'
