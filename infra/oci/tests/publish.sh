#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
oci_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
root=$(mktemp -d)
trap 'rm -rf -- "$root"' EXIT INT TERM

mock="$root/docker"
cat > "$mock" <<'MOCK'
#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$MOCK_DOCKER_LOG"
case "$1 $2" in
  'buildx version') exit 0 ;;
  'image inspect')
    case "$*" in
      *'{{.Id}}'*) printf '%s\n' "${MOCK_BASE_ID:-sha256:c825877c1c5a39d12235596e2c89f3892618ac44e99d630660a75837fca8a02f}" ;;
      *'{{.Os}}/{{.Architecture}}'*) printf '%s\n' 'linux/amd64' ;;
      *) exit 2 ;;
    esac
    ;;
  'login 127.0.0.1:3000') cat >/dev/null ;;
  'buildx build')
    while [ "$#" -gt 0 ]; do
      if [ "$1" = --metadata-file ]; then
        shift
        printf '%s\n' '{"containerimage.digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' > "$1"
        break
      fi
      shift
    done
    ;;
  'buildx imagetools') exit 0 ;;
  'logout 127.0.0.1:3000') exit 0 ;;
  *) echo "unexpected mock Docker call: $*" >&2; exit 2 ;;
esac
MOCK
chmod 0700 "$mock"

cat > "$root/jq" <<'MOCK_JQ'
#!/bin/sh
set -eu
case "$1" in
  -er)
    sed -n 's/.*"containerimage.digest":"\([^"]*\)".*/\1/p' "$3"
    ;;
  -n)
    printf '%s\n' '{"schemaVersion":1,"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    ;;
  *)
    echo "unexpected mock jq call: $*" >&2
    exit 2
    ;;
esac
MOCK_JQ
chmod 0700 "$root/jq"

run_publish() {
  MOCK_DOCKER_LOG="$root/docker.log" \
  DOCKER_BIN="$mock" \
  OCI_GITEA_SERVER_URL=http://127.0.0.1:3000 \
  OCI_REPOSITORY=test-owner/praxis-control \
  OCI_COMMIT_SHA=0123456789abcdef0123456789abcdef01234567 \
  OCI_REGISTRY_TOKEN=not-a-real-token \
  OCI_OUTPUT_DIR="$root/output" \
  GITHUB_OUTPUT="$root/github-output" \
  GITHUB_STEP_SUMMARY="$root/summary" \
  PATH="$root:$PATH" \
  "$oci_dir/publish.sh"
}

run_publish >/dev/null
grep -F -- '"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' \
  "$root/output/image-lock.json" >/dev/null
grep -F -- '--pull=false' "$root/docker.log" >/dev/null
grep -F -- '--provenance=false' "$root/docker.log" >/dev/null
if grep -F -- 'not-a-real-token' "$root/docker.log" >/dev/null; then
  echo 'registry token leaked into Docker arguments' >&2
  exit 1
fi

if OCI_GITEA_SERVER_URL=http://registry.example.invalid \
  OCI_REPOSITORY=test-owner/praxis-control \
  OCI_COMMIT_SHA=0123456789abcdef0123456789abcdef01234567 \
  OCI_REGISTRY_TOKEN=not-a-real-token \
  PATH="$root:$PATH" \
  DOCKER_BIN="$mock" "$oci_dir/publish.sh" >/dev/null 2>&1; then
  echo 'non-loopback HTTP registry was accepted' >&2
  exit 1
fi

if MOCK_DOCKER_LOG="$root/docker.log" \
  MOCK_BASE_ID=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  OCI_GITEA_SERVER_URL=http://127.0.0.1:3000 \
  OCI_REPOSITORY=test-owner/praxis-control \
  OCI_COMMIT_SHA=0123456789abcdef0123456789abcdef01234567 \
  OCI_REGISTRY_TOKEN=not-a-real-token \
  PATH="$root:$PATH" \
  DOCKER_BIN="$mock" "$oci_dir/publish.sh" >/dev/null 2>&1; then
  echo 'mismatched base image ID was accepted' >&2
  exit 1
fi

echo 'OCI publish contract: PASS'
