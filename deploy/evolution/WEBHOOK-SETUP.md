# Webhook Evolution - Setup pós deploy

Este projeto já está preparado para resposta automática via endpoint:

- `/api/webhooks/whatsapp`

Depois de publicar o sistema (URL pública HTTPS), configure o webhook da instância da loja.

## 1) Dados necessários

- `EVOLUTION_BASE_URL` (ex: `http://185.225.233.14:8080`)
- `EVOLUTION_API_KEY` (a mesma da Evolution)
- `INSTANCE_NAME` (ex: `store_<uuid_da_loja>`)
- `APP_BASE_URL` (ex: `https://meuapp.com`)

## 2) Rodar script pronto

No diretório do projeto:

```bash
chmod +x deploy/evolution/configure-webhook.sh
./deploy/evolution/configure-webhook.sh "http://185.225.233.14:8080" "SUA_KEY" "store_SEU_ID" "https://SEU_DOMINIO"
```

O script:

- grava webhook da instância com evento `MESSAGES_UPSERT`
- consulta em seguida para validar que salvou

## 3) Teste rápido

1. Loja conectada (status `open`) no card de Automações.
2. Automação ativa em `Automações` > `Resposta automática no WhatsApp`.
3. Envie mensagem de outro número para o WhatsApp conectado.
4. Verifique resposta automática no WhatsApp.

## 4) Se não responder

- confirme URL pública HTTPS do app
- verifique se a instância está conectada
- confirme se webhook aponta para `/api/webhooks/whatsapp`
- revise logs:
  - app web (Next.js)
  - Evolution: `docker compose logs -f evolution`
