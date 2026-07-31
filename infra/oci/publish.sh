#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
lock_file="$script_dir/base-images.lock"
docker_bin=${DOCKER_BIN:-docker}
output_dir=${OCI_OUTPUT_DIR:-$repository_root/artifacts/oci}

fail() {
  echo "OCI publish refused: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

case ${OCI_GITEA_SERVER_URL:-} in
  https://*) ;;
  http://127.0.0.1:*|http://localhost:*) ;;
  http://*) fail 'plain HTTP authentication is allowed only through a loopback URL' ;;
  *) fail 'OCI_GITEA_SERVER_URL must use HTTPS or an explicit loopback HTTP URL' ;;
esac

registry=${OCI_GITEA_SERVER_URL#*://}
registry=${registry%/}
case "$registry" in
  ''|*/*|*@*) fail 'invalid registry authority' ;;
esac

repository=${OCI_REPOSITORY:-}
case "$repository" in
  */*) ;;
  *) fail 'OCI_REPOSITORY must be owner/name' ;;
esac
owner=${repository%%/*}
name=${repository#*/}
case "$name" in
  ''|*/*) fail 'OCI_REPOSITORY must contain exactly one slash' ;;
esac
printf '%s\n' "$owner" "$name" | grep -Eq '^[a-z0-9][a-z0-9._-]*$' \
  || fail 'OCI_REPOSITORY contains unsupported characters or uppercase letters'

commit=${OCI_COMMIT_SHA:-}
printf '%s\n' "$commit" | grep -Eq '^[0-9a-f]{40}$' \
  || fail 'OCI_COMMIT_SHA must be a full lowercase Git SHA-1'
[ -n "${OCI_REGISTRY_TOKEN:-}" ] || fail 'OCI_REGISTRY_TOKEN is required'
[ -r "$lock_file" ] || fail 'base image lock is unavailable'

# shellcheck disable=SC1090
. "$lock_file"
for value in NODE_BASE_REF NODE_BASE_PLATFORM NODE_BASE_PLATFORM_DIGEST NODE_BASE_LOCAL_ID; do
  eval "current=\${$value:-}"
  [ -n "$current" ] || fail "missing $value in base image lock"
done

require_command "$docker_bin"
require_command jq
"$docker_bin" buildx version >/dev/null 2>&1 \
  || fail 'Docker Buildx is unavailable'

loaded_id=$("$docker_bin" image inspect --format '{{.Id}}' "$NODE_BASE_REF" 2>/dev/null) \
  || fail "locked base image is not loaded: $NODE_BASE_REF"
[ "$loaded_id" = "$NODE_BASE_LOCAL_ID" ] \
  || fail 'loaded base image ID does not match base-images.lock'
loaded_platform=$("$docker_bin" image inspect --format '{{.Os}}/{{.Architecture}}' "$NODE_BASE_REF" 2>/dev/null) \
  || fail "cannot inspect base image platform: $NODE_BASE_REF"
[ "$loaded_platform" = "$NODE_BASE_PLATFORM" ] \
  || fail "loaded base image platform is $loaded_platform, expected $NODE_BASE_PLATFORM"

image="$registry/$owner/$name"
tag="sha-$commit"
temporary_root=$(mktemp -d)
metadata_file="$temporary_root/build-metadata.json"
logged_in=false
cleanup() {
  if [ "$logged_in" = true ]; then
    "$docker_bin" logout "$registry" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT INT TERM

printf '%s' "$OCI_REGISTRY_TOKEN" \
  | "$docker_bin" login "$registry" --username "$owner" --password-stdin >/dev/null
logged_in=true

"$docker_bin" buildx build \
  --builder default \
  --platform "$NODE_BASE_PLATFORM" \
  --pull=false \
  --provenance=mode=min \
  --metadata-file "$metadata_file" \
  --build-arg "NODE_BASE_IMAGE=$NODE_BASE_REF" \
  --label "org.opencontainers.image.revision=$commit" \
  --label 'org.opencontainers.image.source=https://github.com/SpringfiledBucks/praxis-control' \
  --tag "$image:$tag" \
  --push \
  --file "$repository_root/infra/cloud/Dockerfile" \
  "$repository_root"

digest=$(jq -er '."containerimage.digest"' "$metadata_file") \
  || fail 'Buildx did not return a container image digest'
printf '%s\n' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$' \
  || fail 'Buildx returned a malformed container image digest'
"$docker_bin" buildx imagetools inspect "$image@$digest" >/dev/null

mkdir -p "$output_dir"
record="$output_dir/image-lock.json"
jq -n \
  --arg package "$owner/$name" \
  --arg tag "$tag" \
  --arg digest "$digest" \
  --arg commit "$commit" \
  --arg platform "$NODE_BASE_PLATFORM" \
  --arg baseRef "$NODE_BASE_REF" \
  --arg baseDigest "$NODE_BASE_PLATFORM_DIGEST" \
  '{schemaVersion: 1, package: $package, tag: $tag, digest: $digest, commit: $commit, platform: $platform, base: {ref: $baseRef, platformDigest: $baseDigest}}' \
  > "$record"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'digest=%s\ntag=%s\nrecord=%s\n' "$digest" "$tag" "$record" >> "$GITHUB_OUTPUT"
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '### OCI image published\n\n'
    printf -- '- Commit: `%s`\n' "$commit"
    printf -- '- Tag: `%s`\n' "$tag"
    printf -- '- Digest: `%s`\n' "$digest"
    printf -- '- Platform: `%s`\n' "$NODE_BASE_PLATFORM"
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo "OCI image publish verified: $tag@$digest"
