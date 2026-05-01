#!/usr/bin/env bash
set -euo pipefail

NAME="tie-onboarding"
PORT=5101
APP_DIR="/home/azureuser/tie-onboarding"
SRC_DIR="${APP_DIR}/src"
ENV_FILE="${APP_DIR}/.env"
IMAGE="tie-onboarding:latest"

echo "[deploy] building image from ${SRC_DIR}"
cd "${SRC_DIR}"
docker build -t "${IMAGE}" .

echo "[deploy] stopping previous container (if any)"
docker stop "${NAME}" >/dev/null 2>&1 || true
docker rm   "${NAME}" >/dev/null 2>&1 || true

echo "[deploy] starting ${NAME} on port ${PORT}"
docker run -d \
  --name "${NAME}" \
  --restart unless-stopped \
  --memory=400m \
  --memory-swap=600m \
  -p 127.0.0.1:${PORT}:5101 \
  --env-file "${ENV_FILE}" \
  "${IMAGE}"

echo "[deploy] waiting for health"
for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null; then
    echo "[deploy] healthy"
    curl -s "http://127.0.0.1:${PORT}/health"; echo
    break
  fi
  sleep 2
  if [ "$i" = "20" ]; then
    echo "[deploy] FAILED health check"
    docker logs --tail=80 "${NAME}"
    exit 1
  fi
done

docker image prune -f >/dev/null
echo "[deploy] done — https://tie-onboarding.t2ai.live"
