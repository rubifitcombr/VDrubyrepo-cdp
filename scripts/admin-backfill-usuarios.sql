-- Executar no SQL Editor (uma vez) para criar linhas em `public.usuarios`
-- para utilizadores que já existiam antes do trigger.

INSERT INTO public.usuarios (id, email, role)
SELECT id, email, 'lojista'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, public.usuarios.email);
