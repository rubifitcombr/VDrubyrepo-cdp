/**
 * Segmentos iniciais reservados pela app (não são slugs de loja em /[slug]).
 * Usado para normalizar maiúsculas na URL e evitar 404 por confusão com o cardápio público.
 */
export const APP_RESERVED_FIRST_SEGMENTS = new Set([
  'admin',
  'blog',
  'dashboard',
  'login',
  'register',
  'acesso-suspenso',
  'planos',
])
