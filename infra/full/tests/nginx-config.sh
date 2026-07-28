#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
full_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
temporary_directory=$(mktemp -d /tmp/praxis-nginx-test.XXXXXX)
cleanup() { rm -rf "$temporary_directory"; }
trap cleanup EXIT INT TERM

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=praxis.test \
  -keyout "$temporary_directory/key.pem" -out "$temporary_directory/cert.pem" >/dev/null 2>&1

PRAXIS_SERVER_NAME=praxis.test \
PRAXIS_CERTIFICATE="$temporary_directory/cert.pem" \
PRAXIS_CERTIFICATE_KEY="$temporary_directory/key.pem" \
PRAXIS_ALLOWED_LAN_CIDR=192.0.2.0/24 \
sh "$full_dir/render-nginx.sh" "$temporary_directory/server.conf" >/dev/null
if PRAXIS_SERVER_NAME=praxis.test \
  PRAXIS_CERTIFICATE="$temporary_directory/cert.pem" \
  PRAXIS_CERTIFICATE_KEY="$temporary_directory/key.pem" \
  PRAXIS_ALLOWED_LAN_CIDR=192.0.2.0/24 \
  sh "$full_dir/render-nginx.sh" "$temporary_directory/server.conf" >/dev/null 2>&1; then
  echo 'nginx renderer overwrote an existing target' >&2
  exit 1
fi
sed -i \
  -e 's/listen 443 ssl;/listen 127.0.0.1:18443 ssl;/' \
  -e '/listen \[::\]:443 ssl;/d' \
  "$temporary_directory/server.conf"

cat >"$temporary_directory/nginx.conf" <<EOF
pid $temporary_directory/nginx.pid;
error_log stderr;
events {}
http {
  access_log $temporary_directory/access.log;
  include $temporary_directory/server.conf;
}
EOF

nginx -t -c "$temporary_directory/nginx.conf" -p "$temporary_directory" >/dev/null
grep -F 'proxy_set_header X-Forwarded-For $remote_addr;' "$temporary_directory/server.conf" >/dev/null
grep -F 'proxy_set_header Tailscale-User-Login "";' "$temporary_directory/server.conf" >/dev/null
printf '%s\n' 'Praxis Control nginx config: PASS'
