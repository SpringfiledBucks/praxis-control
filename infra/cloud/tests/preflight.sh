#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cloud_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT INT TERM

mkdir "$test_root/bin" "$test_root/secrets"
chmod 0700 "$test_root/secrets"
cat > "$test_root/bin/docker" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 0700 "$test_root/bin/docker"

printf '%s\n' 'database-admin-password-for-test' > "$test_root/secrets/database-admin-password.txt"
printf '%s\n' 'database-app-password-for-test' > "$test_root/secrets/database-app-password.txt"
printf '%s\n' 'access-password-for-test' > "$test_root/secrets/access-password.txt"
printf '%s\n' 'session-secret-for-test-at-least-32-characters' > "$test_root/secrets/session-secret.txt"
chmod 0444 "$test_root"/secrets/*.txt

cat > "$test_root/cloud.env" <<EOF
PRAXIS_DB_ADMIN_PASSWORD_FILE=$test_root/secrets/database-admin-password.txt
PRAXIS_DB_PASSWORD_FILE=$test_root/secrets/database-app-password.txt
PRAXIS_ACCESS_PASSWORD_FILE=$test_root/secrets/access-password.txt
PRAXIS_SESSION_SECRET_FILE=$test_root/secrets/session-secret.txt
PRAXIS_BIND_PORT=44310
EOF

PATH="$test_root/bin:$PATH" PRAXIS_CONFIG_FILE="$test_root/cloud.env" sh "$cloud_dir/preflight.sh" >/dev/null

chmod 0600 "$test_root/secrets/database-app-password.txt"
if PATH="$test_root/bin:$PATH" PRAXIS_CONFIG_FILE="$test_root/cloud.env" sh "$cloud_dir/preflight.sh" >"$test_root/output" 2>&1; then
  echo 'preflight accepted a 0600 file-backed secret' >&2
  exit 1
fi
grep -F 'file-backed Compose secret must have mode 0444' "$test_root/output" >/dev/null

chmod 0444 "$test_root/secrets/database-app-password.txt"
chmod 0755 "$test_root/secrets"
if PATH="$test_root/bin:$PATH" PRAXIS_CONFIG_FILE="$test_root/cloud.env" sh "$cloud_dir/preflight.sh" >"$test_root/output" 2>&1; then
  echo 'preflight accepted a traversable secret directory' >&2
  exit 1
fi
grep -F 'secret directory must have mode 0700' "$test_root/output" >/dev/null

echo 'cloud preflight permissions: PASS'
