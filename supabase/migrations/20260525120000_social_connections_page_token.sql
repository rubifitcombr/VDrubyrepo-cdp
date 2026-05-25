ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS page_access_token text;
