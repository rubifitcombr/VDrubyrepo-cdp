#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./configure-webhook.sh <EVOLUTION_BASE_URL> <EVOLUTION_API_KEY> <INSTANCE_NAME> <APP_BASE_URL>
#
# Example:
#   ./configure-webhook.sh "http://185.225.233.14:8080" "minha_chave" "store_xxx" "https://meuapp.com"

if [ "$#" -ne 4 ]; then
  echo "Uso: $0 <EVOLUTION_BASE_URL> <EVOLUTION_API_KEY> <INSTANCE_NAME> <APP_BASE_URL>"
  exit 1
fi

EVOLUTION_BASE_URL="${1%/}"
EVOLUTION_API_KEY="$2"
INSTANCE_NAME="$3"
APP_BASE_URL="${4%/}"
WEBHOOK_URL="${APP_BASE_URL}/api/webhooks/whatsapp"

echo "Configurando webhook da instância: ${INSTANCE_NAME}"
echo "URL do webhook: ${WEBHOOK_URL}"

curl -sS -X POST "${EVOLUTION_BASE_URL}/webhook/set/${INSTANCE_NAME}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -d "{
    \"webhook\": {
      \"url\": \"${WEBHOOK_URL}\",
      \"enabled\": true
    },
    \"events\": [\"MESSAGES_UPSERT\"]
  }"

echo ""
echo "Conferindo configuração salva:"
curl -sS -X GET "${EVOLUTION_BASE_URL}/webhook/find/${INSTANCE_NAME}" \
  -H "apikey: ${EVOLUTION_API_KEY}"

echo ""
echo "OK. Webhook configurado."
