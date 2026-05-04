#!/usr/bin/env bash
set -uo pipefail

LOG="/home/azureuser/tie-onboarding/maintenance.log"
TS() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(TS)] $*" | tee -a "$LOG"; }

CONTAINERS=(tie-onboarding il2-frontend il2-backend meraki-calling-agent signal-client signal-api meraki-api)

log "===== weekly maintenance start ====="
log "--- pre-state ---"
{ free -h | head -2; df -h /; docker ps --format 'table {{.Names}}\t{{.Status}}'; } | tee -a "$LOG"

restart_one() {
  local name="$1"
  if ! docker ps --format '{{.Names}}' | grep -qx "$name"; then
    log "  [$name] not running, skipping"
    return 0
  fi
  log "  [$name] restarting"
  if ! docker restart "$name" >/dev/null 2>>"$LOG"; then
    log "  [$name] RESTART FAILED"
    return 1
  fi
  local state="" health=""
  for i in $(seq 1 60); do
    state=$(docker inspect "$name" --format '{{.State.Status}}' 2>/dev/null || echo "?")
    health=$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo "?")
    if [ "$state" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "none" ]; }; then
      log "  [$name] up (state=$state health=$health) after ${i}x2s"
      return 0
    fi
    case "$state" in
      exited|dead|removing)
        log "  [$name] FAILED state=$state"
        return 1
        ;;
    esac
    sleep 2
  done
  if [ "$state" = "running" ]; then
    log "  [$name] still starting after 120s (state=running health=$health) — continuing"
    return 0
  fi
  log "  [$name] timed out (state=$state health=$health)"
  return 1
}

log "--- restarting containers ---"
FAILED=""
for c in "${CONTAINERS[@]}"; do
  if ! restart_one "$c"; then
    FAILED="$c"
    log "ABORT: $c failed; not touching the remaining containers"
    break
  fi
done

log "--- prune ---"
docker image prune -f 2>&1 | tee -a "$LOG"
docker container prune -f 2>&1 | tee -a "$LOG"

log "--- fs cache flush ---"
sync && echo 1 | sudo tee /proc/sys/vm/drop_caches >/dev/null && log "  caches dropped"

log "--- cert expiry ---"
sudo certbot certificates 2>&1 | grep -E 'Certificate Name|Expiry' | tee -a "$LOG"

log "--- post-state ---"
{ free -h | head -2; df -h /; docker ps --format 'table {{.Names}}\t{{.Status}}'; } | tee -a "$LOG"

if [ -n "$FAILED" ]; then
  log "===== FINISHED WITH FAILURE: $FAILED ====="
  exit 1
else
  log "===== finished cleanly ====="
fi
