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
allowed_lan=${PRAXIS_ALLOWED_LAN_CIDR:-}
allowed_tailscale=${PRAXIS_ALLOWED_TAILSCALE_CIDR:-100.64.0.0/10}
allowed_tailscale_ipv6=${PRAXIS_ALLOWED_TAILSCALE_IPV6_CIDR:-fd7a:115c:a1e0::/48}

printf '%s' "$server_name" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*$' || fail 'PRAXIS_SERVER_NAME is invalid'
for path_value in "$certificate" "$certificate_key"; do
  printf '%s' "$path_value" | grep -Eq '^/[A-Za-z0-9_./-]+$' || fail 'certificate paths must be safe absolute paths'
done
printf '%s' "$allowed_lan" | grep -Eq '^[0-9.]+/[0-9]{1,2}$' || fail 'PRAXIS_ALLOWED_LAN_CIDR is invalid'
printf '%s' "$allowed_tailscale" | grep -Eq '^[0-9.]+/[0-9]{1,2}$' || fail 'PRAXIS_ALLOWED_TAILSCALE_CIDR is invalid'
printf '%s' "$allowed_tailscale_ipv6" | grep -Eq '^[0-9A-Fa-f:]+/[0-9]{1,3}$' || fail 'PRAXIS_ALLOWED_TAILSCALE_IPV6_CIDR is invalid'

target_parent=$(CDPATH= cd -- "$(dirname -- "$target")" && pwd)
temporary=$(mktemp "$target_parent/.praxis-nginx.XXXXXX")
cleanup() { rm -f "$temporary"; }
trap cleanup EXIT INT TERM

sed \
  -e "s|@@SERVER_NAME@@|$server_name|g" \
  -e "s|@@CERTIFICATE@@|$certificate|g" \
  -e "s|@@CERTIFICATE_KEY@@|$certificate_key|g" \
  -e "s|@@ALLOWED_LAN_CIDR@@|$allowed_lan|g" \
  -e "s|@@ALLOWED_TAILSCALE_CIDR@@|$allowed_tailscale|g" \
  -e "s|@@ALLOWED_TAILSCALE_IPV6_CIDR@@|$allowed_tailscale_ipv6|g" \
  "$template" >"$temporary"

! grep -q '@@' "$temporary" || fail 'nginx template still contains unresolved placeholders'
chmod 0644 "$temporary"
ln "$temporary" "$target" 2>/dev/null || fail "refusing to overwrite $target"
printf '%s\n' "$target"
