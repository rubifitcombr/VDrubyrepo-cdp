#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Installing Docker and Compose plugin..."
apt update
apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

echo "[2/3] Preparing deployment directory..."
mkdir -p /opt/evolution
cd /opt/evolution

if [ ! -f docker-compose.yml ] || [ ! -f .env ]; then
  echo "Missing /opt/evolution/docker-compose.yml or /opt/evolution/.env"
  echo "Upload files first, then run again."
  exit 1
fi

echo "[3/3] Starting containers..."
docker compose up -d
docker compose ps
echo "Done."
