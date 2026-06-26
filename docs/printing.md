# Impressao termica ESC/POS

Este documento descreve a integracao de impressao termica do Vyria depois da unificacao entre o caminho do navegador e o caminho Print Agent + TCP.

## Decisoes finais

- Encoding padrao: **CP850** para os dois caminhos. O gerador envia `ESC t 2` antes do corpo do cupom para selecionar a tabela PC850 em impressoras ESC/POS compativeis.
- Largura: `print_paper_mm = 58` usa 32 colunas; `print_paper_mm = 80` usa 48 colunas.
- Template: navegador e Print Agent usam os templates de `lib/print/templates/*`, com a mesma quebra de linhas, alinhamento de precos e regras de cliente/segunda via.
- PDV duplicado: a impressao automatica acontece na criacao da venda/pedido. O fechamento do Caixa nao dispara impressao automatica novamente; continua existindo impressao manual da comanda e do resumo de turno.
- PIX: pedidos com pagamento PIX nao imprimem no checkout; a auto-impressao via agente dispara quando o cliente confirma o pagamento (`/api/public/orders/pix-status` POST).
- Deduplicacao: se `print_auto_*` (agente) e `print_auto_on_confirm` (navegador) estiverem ativos para a mesma origem, o navegador nao abre cupom ao aceitar — o agente ja imprimiu na criacao ou na confirmacao PIX.
- Falhas de impressao nunca bloqueiam criacao ou atualizacao de pedido. Em fluxos manuais, a UI cai para o preview do navegador.

## Configuracao esperada

Campos em `stores`:

- `print_paper_mm`: `58` ou `80`.
- `print_include_customer_details`: imprime nome, telefone e endereco.
- `print_delivery_copy`: imprime segunda via do entregador quando o cupom usa layout delivery.
- `print_agent_url`: URL do agente local, ex. `http://192.168.1.50:3001`.
- `print_agent_token`: token enviado no header `x-agent-token`; padrao `vyria-agent-2026`.
- `print_printer_ip`: IP da impressora na rede local.
- `print_printer_port`: porta TCP da impressora; padrao `9100`.
- `print_auto_delivery`, `print_auto_autoatendimento`, `print_auto_pdv`, `print_auto_garcom`: toggles de impressao automatica via agente.
- `print_auto_on_confirm`: auto-impressao pelo navegador quando o pedido vai para preparo.

## Fluxos

### Navegador

`openOrderTicketPrint()` monta ESC/POS via `buildOrderTicketEscPos()`, abre uma janela/iframe de preview, permite `window.print()`, download `.prn` e Web Serial.

Usado por:

- Pedidos
- KDS
- Caixa
- Garcom
- Dashboard auto-accept

### Bluetooth (Web Bluetooth)

Impressao direta da termica Bluetooth a partir do painel, sem agente nem Wi-Fi.

- `lib/bluetooth-print-client.ts`: liga via `navigator.bluetooth.requestDevice` (precisa de gesto do utilizador), procura uma caracteristica GATT com escrita e envia o ESC/POS em blocos (`WRITE_CHUNK_SIZE` bytes com `WRITE_CHUNK_DELAY_MS` de intervalo).
- O aparelho fica memorizado em `localStorage` (`vyria_print_bt_device`); `tryReconnectKnownBluetoothPrinter()` tenta reabrir via `navigator.bluetooth.getDevices()` sem novo gesto (so em navegadores que suportam).
- Configura-se em `/dashboard/printing` (seccao «Bluetooth»): ligar, imprimir teste e esquecer.
- Em `OrdersClient.printOrderDefault`, se ha impressora Bluetooth pronta (`isBluetoothPrinterReady()`), tenta Bluetooth antes do Print Agent; falha cai para o agente e depois para a pre-visualizacao do navegador.
- Suporte: Chrome/Edge em Android, Windows, Mac, Linux e ChromeOS. **Nao funciona em iOS/Safari** — usar Wi-Fi ou USB.
- Servicos GATT cobertos: ver `KNOWN_PRINTER_SERVICES` (0x18F0/0x2AF1, 0xFF00, 0xFFE0, ISSC, etc.).

### Print Agent

Rotas de pedido chamam `tryAutoThermalPrint()`, que carrega as configuracoes da loja, valida o toggle da origem, gera o cupom com os mesmos templates do navegador e envia base64 para `{print_agent_url}/print`.

O agente local (`agent/print-agent.js`) envia os bytes para `print_printer_ip:print_printer_port` via TCP.

Usado por:

- Checkout publico (exceto PIX no momento da criacao)
- Confirmacao PIX (`/api/public/orders/pix-status`)
- PDV
- Garcom
- Impressao manual via `/api/print`

O Caixa nao dispara auto-print no fechamento para evitar duplicidade; use o botao manual quando precisar de segunda via.

## Auditoria dos arquivos principais

- `lib/store-printing.ts`: normaliza todos os campos `print_*`; completo.
- `lib/print/*`: stack principal de layout ESC/POS; CP850, 58/80mm, templates ricos; agora e a fonte unica de layout.
- `lib/escpos.ts`: mantem o nome legado `gerarCupomPedido`, mas delega para `lib/print` e retorna base64 CP850.
- `lib/order-print-window.ts`: orquestra a impressao via browser e usa o helper compartilhado de variante.
- `lib/thermal-print-window.ts`: janela/iframe/Web Serial/download `.prn`; fallback visual do navegador.
- `services/thermal-print.server.ts`: carrega configuracao completa da loja, gera cupom pelo template unificado e propaga erros estruturados do agente.
- `agent/print-agent.js`: health, descoberta de impressoras e envio TCP com erros normalizados.
- `app/api/print/route.ts`: endpoint autenticado para teste e impressao manual; retorna erro detalhado.
- `PrintingClient.tsx`: diagnostico de agente, descoberta de impressoras, selecao de IP/porta e impressao de teste.

## Troubleshooting

### Agente offline

1. Confirme que o programa esta rodando: `node print-agent.js`.
2. Abra `http://IP-DO-AGENTE:3001/health` no navegador.
3. Se usa tunel, confirme que a URL publica aponta para a porta 3001.
4. Confira se `print_agent_url` comeca com `http://` ou `https://`.

### Token incorreto

1. Confira `AGENT_TOKEN` no ambiente onde o agente roda.
2. Confira `print_agent_token` na tela Impressao.
3. Se nao configurou token customizado, deixe o padrao `vyria-agent-2026`.

### Impressora nao encontrada

1. Confirme que agente e impressora estao na mesma rede.
2. Confirme se a impressora usa TCP 9100.
3. Use "Buscar impressoras na rede" na tela Impressao.
4. Se nada aparecer, imprima a pagina de teste fisica da impressora e copie o IP manualmente.
5. Se aparecer "conexao recusada", a porta pode estar errada.
6. Se aparecer "timeout", o IP pode estar errado, a impressora pode estar desligada ou a rede bloqueia conexoes.

### Layout cortado

1. Confira se `print_paper_mm` corresponde ao rolo real.
2. Para 58mm use 32 colunas; para 80mm use 48 colunas.
3. Se a impressora estiver configurada com fonte grande no firmware, reduza a fonte ou use 80mm.
4. Reimprima o teste depois de salvar o papel correto.

## Testes manuais

### 58mm e 80mm

1. Em `/dashboard/printing`, selecione 58mm.
2. Ative/desative `Dados do cliente no cupom`.
3. Ative/desative `Segunda via para entrega`.
4. Clique em `Abrir para imprimir` e valide visualmente:
   - itens aparecem;
   - quantidade aparece;
   - preco unitario aparece quando `order_items` existe;
   - total da linha e total geral aparecem;
   - linhas nao cortam precos.
5. Repita em 80mm.

### Descoberta de impressora

1. Rode o agente na rede local.
2. Configure `print_agent_url`.
3. Clique em `Buscar impressoras na rede`.
4. Se houver retorno, selecione o IP encontrado e salve.

### Teste end-to-end

1. Configure `print_agent_url`, token, `print_printer_ip` e porta.
2. Clique em `Testar conexao com agente`.
3. Clique em `Imprimir teste`.
4. Verifique se o cupom sai fisicamente e se a resposta da tela e especifica em caso de erro.
