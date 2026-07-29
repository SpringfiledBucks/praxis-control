#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
VERSION=$(cd "$PROJECT_ROOT" && node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')).version)")
PACKAGE_NAME="PraxisControl-${VERSION}-linux"
OUTPUT_ROOT=${1:-"$PROJECT_ROOT/artifacts/linux"}
ARCHIVE_TARGET="$OUTPUT_ROOT/$PACKAGE_NAME.tar.gz"
STAGING_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/praxis-control-linux.XXXXXX")
PACKAGE_ROOT="$STAGING_ROOT/$PACKAGE_NAME"

cleanup() {
  rm -rf "$STAGING_ROOT"
}
trap cleanup EXIT HUP INT TERM

if [ -e "$ARCHIVE_TARGET" ]; then
  echo "Package archive already exists: $ARCHIVE_TARGET" >&2
  exit 1
fi

cd "$PROJECT_ROOT"
npm run build

mkdir -p "$PACKAGE_ROOT/app" "$PACKAGE_ROOT/client"
cp -R dist migrations public views "$PACKAGE_ROOT/app/"
cp package.json package-lock.json "$PACKAGE_ROOT/app/"
cp clients/linux/src/app.mjs clients/linux/src/core.mjs "$PACKAGE_ROOT/client/"
cp clients/linux/release/README.zh-CN.txt "$PACKAGE_ROOT/README.zh-CN.txt"

cat > "$PACKAGE_ROOT/praxis" <<'EOF'
#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$ROOT/app/dist/cli/praxis.js" "$@"
EOF

cat > "$PACKAGE_ROOT/install-dependencies.sh" <<'EOF'
#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT/app"
exec npm ci --omit=dev --ignore-scripts
EOF

cat > "$PACKAGE_ROOT/praxis-control" <<'EOF'
#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$ROOT/praxis" start --no-open
exec gjs -m "$ROOT/client/app.mjs"
EOF

cat > "$PACKAGE_ROOT/praxis-control-web" <<'EOF'
#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$ROOT/praxis" start
EOF

cat > "$PACKAGE_ROOT/praxis-control-tui" <<'EOF'
#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$ROOT/praxis" tui
EOF

cat > "$PACKAGE_ROOT/praxis-control-stop" <<'EOF'
#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$ROOT/praxis" stop
EOF

chmod +x \
  "$PACKAGE_ROOT/praxis" \
  "$PACKAGE_ROOT/install-dependencies.sh" \
  "$PACKAGE_ROOT/praxis-control" \
  "$PACKAGE_ROOT/praxis-control-web" \
  "$PACKAGE_ROOT/praxis-control-tui" \
  "$PACKAGE_ROOT/praxis-control-stop"

printf '{\n  "name": "Praxis Control",\n  "version": "%s",\n  "platform": "linux",\n  "bundledNode": false,\n  "bundledDesktopRuntime": false\n}\n' "$VERSION" > "$PACKAGE_ROOT/package-info.json"

for script in \
  "$PACKAGE_ROOT/praxis" \
  "$PACKAGE_ROOT/install-dependencies.sh" \
  "$PACKAGE_ROOT/praxis-control" \
  "$PACKAGE_ROOT/praxis-control-web" \
  "$PACKAGE_ROOT/praxis-control-tui" \
  "$PACKAGE_ROOT/praxis-control-stop"; do
  sh -n "$script"
done

mkdir -p "$OUTPUT_ROOT"
tar -czf "$ARCHIVE_TARGET" -C "$STAGING_ROOT" "$PACKAGE_NAME"
tar -tzf "$ARCHIVE_TARGET" >/dev/null

printf '%s\n' "$ARCHIVE_TARGET"
