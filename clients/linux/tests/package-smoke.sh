#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
temporary_root=$(mktemp -d -t praxis-linux-package.XXXXXX)
trap 'rm -rf -- "$temporary_root"' EXIT HUP INT TERM

prefix="$temporary_root/prefix"
meson setup "$temporary_root/build" "$repo_root/clients/linux" --prefix="$prefix"
meson install -C "$temporary_root/build"

launcher="$prefix/bin/praxis-control-linux"
desktop_file="$prefix/share/applications/io.praxiscontrol.App.desktop"
icon_file="$prefix/share/icons/hicolor/scalable/apps/io.praxiscontrol.App.svg"

test -x "$launcher"
test -f "$icon_file"
desktop-file-validate "$desktop_file"
"$launcher" --smoke-test

echo "Linux Meson package smoke: PASS"
