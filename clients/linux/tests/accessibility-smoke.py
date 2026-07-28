#!/usr/bin/env python3
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

import pyatspi


REPO_ROOT = Path(__file__).resolve().parents[3]
APP_PATH = REPO_ROOT / "clients" / "linux" / "src" / "app.mjs"
SERVER_PATH = REPO_ROOT / "dist" / "server.js"


def unused_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def wait_for_runtime(path, service, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if service.poll() is not None:
            raise RuntimeError(f"Praxis service exited before readiness: {service.returncode}")
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            time.sleep(0.1)
    raise TimeoutError("Praxis service did not create runtime state")


def accessible_snapshot(root, limit=500):
    result = []
    pending = [(root, 0)]
    while pending and len(result) < limit:
        node, depth = pending.pop(0)
        try:
            name = node.name or ""
            role = node.getRoleName() or ""
            child_count = node.childCount
        except Exception:
            continue
        result.append({"depth": depth, "role": role, "name": name})
        for index in range(child_count):
            try:
                pending.append((node.getChildAtIndex(index), depth + 1))
            except Exception:
                continue
    return result


def wait_for_accessibility(timeout=12):
    deadline = time.monotonic() + timeout
    latest = []
    while time.monotonic() < deadline:
        desktop = pyatspi.Registry.getDesktop(0)
        latest = accessible_snapshot(desktop)
        names = {item["name"] for item in latest}
        if {"Praxis Control", "打开 Web", "安全关闭服务", "核心 WIP"}.issubset(names) and any(
            name.startswith("已连接 http://127.0.0.1:") for name in names
        ):
            return latest
        time.sleep(0.2)
    raise AssertionError("Linux GUI accessibility tree incomplete:\n" + json.dumps(latest, ensure_ascii=False, indent=2))


def find_button(name):
    desktop = pyatspi.Registry.getDesktop(0)
    pending = [desktop]
    while pending:
        node = pending.pop(0)
        try:
            if node.name == name and node.getRoleName() == "button":
                return node
            pending.extend(node.getChildAtIndex(index) for index in range(node.childCount))
        except Exception:
            continue
    raise AssertionError(f"accessible button not found: {name}")


def invoke_button(name):
    button = find_button(name)
    action = button.queryAction()
    if action.nActions < 1 or not action.doAction(0):
        raise AssertionError(f"accessible button action failed: {name}")


def capture_root_window(target):
    import_command = shutil.which("import")
    if import_command:
        command = [import_command, "-window", "root", str(target)]
    else:
        magick = shutil.which("magick")
        if not magick:
            raise RuntimeError("ImageMagick import command is unavailable")
        command = [magick, "import", "-window", "root", str(target)]
    subprocess.run(command, check=True, timeout=10)
    if target.stat().st_size < 1_000:
        raise AssertionError(f"GUI screenshot is unexpectedly small: {target.stat().st_size} bytes")


def stop_process(process):
    if not process or process.poll() is not None:
        return
    process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


temporary_root = Path(tempfile.mkdtemp(prefix="praxis-linux-a11y-"))
runtime_root = temporary_root / "runtime"
runtime_state_path = runtime_root / "praxis-control" / "service.json"
requested_screenshot = os.environ.get("PRAXIS_SCREENSHOT_PATH")
screenshot_path = Path(requested_screenshot).resolve() if requested_screenshot else temporary_root / "linux-gui.png"
service = None
gui = None

try:
    port = unused_port()
    environment = {
        **os.environ,
        "NODE_ENV": "test",
        "APP_HOST": "127.0.0.1",
        "APP_PORT": str(port),
        "PRAXIS_DATA_DIR": str(temporary_root / "data"),
        "XDG_RUNTIME_DIR": str(runtime_root),
        "GTK_A11Y": "atspi",
        "GSK_RENDERER": "cairo",
    }
    service = subprocess.Popen(
        ["node", str(SERVER_PATH)],
        cwd=REPO_ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    runtime = wait_for_runtime(runtime_state_path, service)
    with urllib.request.urlopen(f"{runtime['url']}/api/meta", timeout=5) as response:
        metadata = json.load(response)
    if metadata.get("backend") != "pglite":
        raise AssertionError(f"unexpected backend: {metadata}")

    gui = subprocess.Popen(
        ["gjs", "-m", str(APP_PATH)],
        cwd=REPO_ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    snapshot = wait_for_accessibility()
    invoke_button("刷新")
    snapshot = wait_for_accessibility(timeout=5)
    if service.poll() is not None:
        raise AssertionError("service exited while refreshing from the native GUI")
    screenshot_path.parent.mkdir(parents=True, exist_ok=True)
    capture_root_window(screenshot_path)

    invoke_button("安全关闭服务")
    service.wait(timeout=12)
    if service.returncode != 0:
        raise AssertionError(f"Praxis service exited with {service.returncode}")
    if runtime_state_path.exists():
        raise AssertionError("runtime state was not removed after shutdown")

    named_nodes = [item for item in snapshot if item["name"]]
    print(json.dumps({"accessibleNodes": named_nodes, "screenshot": str(screenshot_path)}, ensure_ascii=False))
    print("Linux GTK accessibility and screenshot smoke: PASS")
finally:
    stop_process(gui)
    stop_process(service)
    shutil.rmtree(temporary_root, ignore_errors=True)
