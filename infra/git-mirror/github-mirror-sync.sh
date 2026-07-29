#!/usr/bin/env bash
set -u

umask 077

readonly REPOSITORY_DIR="${PRAXIS_MIRROR_REPOSITORY_DIR:-/data/git/repositories/<GITEA_OWNER>/praxis-control.git}"
readonly REMOTE_URL="${PRAXIS_MIRROR_REMOTE_URL:-ssh://git@github-praxis-control/SpringfiledBucks/praxis-control.git}"
readonly STATE_DIR="${PRAXIS_MIRROR_STATE_DIR:-/data/git/.local/state/praxis-control-github-mirror}"
readonly MAX_ATTEMPTS="${PRAXIS_MIRROR_MAX_ATTEMPTS:-3}"
readonly PUSH_TIMEOUT_SECONDS="${PRAXIS_MIRROR_PUSH_TIMEOUT_SECONDS:-120}"

mkdir -p "${STATE_DIR}"

exec 9>"${STATE_DIR}/sync.lock"
if ! flock -n 9; then
  exit 0
fi

readonly LOG_FILE="${STATE_DIR}/sync.log"
readonly STATUS_FILE="${STATE_DIR}/status"

if [[ -f "${LOG_FILE}" ]] && [[ "$(wc -c < "${LOG_FILE}")" -gt 1048576 ]]; then
  mv -f "${LOG_FILE}" "${LOG_FILE}.1"
fi

write_status() {
  local result="$1"
  local source_sha="$2"
  local remote_sha="$3"
  local exit_code="$4"
  local temporary_status

  temporary_status="$(mktemp "${STATE_DIR}/status.XXXXXX")"
  {
    printf 'result=%s\n' "${result}"
    printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'source_sha=%s\n' "${source_sha}"
    printf 'remote_sha=%s\n' "${remote_sha}"
    printf 'exit_code=%s\n' "${exit_code}"
  } > "${temporary_status}"
  mv -f "${temporary_status}" "${STATUS_FILE}"
}

if [[ ! -d "${REPOSITORY_DIR}" ]]; then
  write_status failed "" "" 66
  exit 66
fi

source_sha="$(git --git-dir="${REPOSITORY_DIR}" rev-parse refs/heads/main 2>/dev/null || true)"
attempt=1
last_exit_code=1

while [[ "${attempt}" -le "${MAX_ATTEMPTS}" ]]; do
  printf '%s attempt=%s source_sha=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${attempt}" "${source_sha}" >> "${LOG_FILE}"

  if timeout "${PUSH_TIMEOUT_SECONDS}" git --git-dir="${REPOSITORY_DIR}" push --force --prune "${REMOTE_URL}" \
    '+refs/heads/*:refs/heads/*' \
    '+refs/tags/*:refs/tags/*' >> "${LOG_FILE}" 2>&1; then
    remote_sha="$(timeout 30 git ls-remote "${REMOTE_URL}" refs/heads/main 2>/dev/null | awk 'NR == 1 { print $1 }')"
    write_status success "${source_sha}" "${remote_sha}" 0
    printf '%s result=success remote_sha=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${remote_sha}" >> "${LOG_FILE}"
    exit 0
  else
    last_exit_code=$?
  fi

  printf '%s result=retry exit_code=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${last_exit_code}" >> "${LOG_FILE}"
  if [[ "${attempt}" -lt "${MAX_ATTEMPTS}" ]]; then
    sleep "$((attempt * 5))"
  fi
  attempt=$((attempt + 1))
done

write_status failed "${source_sha}" "" "${last_exit_code}"
printf '%s result=failed exit_code=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${last_exit_code}" >> "${LOG_FILE}"
exit "${last_exit_code}"
