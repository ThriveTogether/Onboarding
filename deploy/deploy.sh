#!/usr/bin/env bash
set -euo pipefail

IMAGE="ghcr.io/thrivetogether/onboarding:latest"
NAME="tie-onboarding"
PORT=5101
ENV_FILE="/home/azureuser/tie-onboarding/.env"

echo "[deploy] pulling $IMAGE"
docker pull "$IMAGE"

echo "[deploy] stopping previous container (if any)"
docker stop "$NAME" >/dev/null 2>&1 || true
docker rm   "$NAME" >/dev/null 2>&1 || true

echo "[deploy] starting $NAME on port $PORT"
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  --memory=400m \
  --memory-swap=600m \
  -p 127.0.0.1:${PORT}:5101 \
  --env-file "$ENV_FILE" \
  "$IMAGE"

echo "[deploy] waiting for health"
for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "[deploy] healthy"
    break
  fi
  sleep 2
  if [ "$i" = "20" ]; then
    echo "[deploy] FAILED health check"
    docker logs --tail=80 "$NAME"
    exit 1
  fi
done

echo "[deploy] pruning dangling images"
docker image prune -f >/dev/null

echo "[deploy] done — https://tie-onboarding.t2ai.live"
