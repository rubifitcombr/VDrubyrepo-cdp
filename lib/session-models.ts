/**
 * Modelos de sessão — Vyria Delivery SaaS
 *
 * Três papéis com responsabilidades distintas. A LEITURA de dados operacionais
 * (comandas, mesas, pedidos) é sempre a mesma para todos os papéis autenticados
 * na loja; apenas a AUTORIA de escrita muda.
 *
 * a) Dono / Admin Vyria
 *    - Identidade: Supabase Auth (`auth.users.id`)
 *    - Loja: `stores.owner_id = user.id`
 *    - Admin: `VYRIA_ADMIN_USER_ID` + cookie `vyria_panel_mode=admin`
 *    - Impersonação: cookies do dono + `vyria_impersonating` (gates de merchant
 *      ignorados no proxy — ver comentários em proxy.ts)
 *
 * b) Funcionário (garçom com PIN)
 *    - Identidade operacional: `garcom_id` gravado em `orders` ao criar/editar
 *    - PIN: desbloqueia escrita no painel Garçom; NÃO filtra leitura de comandas
 *    - Persistência: `localStorage` por `store_id`, TTL 12h (`GARCOM_PIN_SESSION_TTL_MS`)
 *    - Caixa/cozinha: mesma sessão Supabase do dono; sem PIN separado
 *
 * c) Cliente final
 *    - Checkout público: sem sessão persistente de painel
 *    - Telefone/pedido: escopo limitado ao pedido em curso
 *    - Cardápio público: cache CDN/ISR; dados frescos via API no checkout
 */

export type OperationalSessionRole = 'owner' | 'staff_garcom' | 'customer'
