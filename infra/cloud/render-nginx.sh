#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
template="$script_dir/nginx/praxis-control.conf.template"
target=${1:-}

fail() {
  echo "$*" >&2
  exit 1
}

[ -n "$target" ] || fail 'usage: render-nginx.sh TARGET'
[ ! -e "$target" ] || fail "refusing to overwrite $target"

server_name=${PRAXIS_SERVER_NAME:-}
certificate=${PRAXIS_CERTIFICATE:-}
certificate_key=${PRAXIS_CERTIFICATE_KEY:-}
upstream_port=${PRAXIS_BIND_PORT:-4310}

printf '%s' "$server_name" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*$' || fail 'PRAXIS_SERVER_NAME is invalid'
for path_value in "$certificate" "$certificate_key"; do
  printf '%s' "$path_value" | grep -Eq '^/[A-Za-z0-9_./-]+$' || fail 'certificate paths must be safe absolute paths'
done
case "$upstream_port" in ''|*[!0-9]*) fail 'PRAXIS_BIND_PORT must be numeric' ;; esac
[ "$upstream_port" -ge 1024 ] && [ "$upstream_port" -le 65535 ] || fail 'PRAXIS_BIND_PORT must be between 1024 and 65535'

target_parent=$(CDPATH= cd -- "$(dirname -- "$target")" && pwd)
temporary=$(mktemp "$target_parent/.praxis-nginx.XXXXXX")
cleanup() { rm -f "$temporary"; }
trap cleanup EXIT INT TERM

sed \
  -e "s|@@SERVER_NAME@@|$server_name|g" \
  -e "s|@@CERTIFICATE@@|$certificate|g" \
  -e "s|@@CERTIFICATE_KEY@@|$certificate_key|g" \
  -e "s|@@UPSTREAM_PORT@@|$upstream_port|g" \
  "$template" >"$temporary"

! grep -q '@@' "$temporary" || fail 'nginx template still contains unresolved placeholders'
chmod 0644 "$temporary"
ln "$temporary" "$target" 2>/dev/null || fail "refusing to overwrite $target"
printf '%s\n' "$target"
