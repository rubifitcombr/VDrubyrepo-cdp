-- Remove artefatos da funcionalidade Marketing / Impulsionar (Meta Ads).
-- IF EXISTS mantém a migration segura em ambientes onde as tabelas nunca foram criadas.
DROP TABLE IF EXISTS ad_campaigns CASCADE;
DROP TABLE IF EXISTS social_connections CASCADE;
