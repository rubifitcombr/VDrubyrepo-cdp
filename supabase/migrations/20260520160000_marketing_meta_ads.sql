-- Conexões com redes sociais (Meta/Facebook)
CREATE TABLE IF NOT EXISTS social_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  provider text DEFAULT 'meta',
  access_token text NOT NULL,
  long_lived_token text,
  token_expires_at timestamptz,
  facebook_user_id text,
  instagram_id text,
  page_id text,
  page_name text,
  page_access_token text,
  ad_account_id text,
  instagram_username text,
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id, provider)
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES social_connections(id),
  name text NOT NULL,
  type text DEFAULT 'boost'
    CHECK (type IN ('boost', 'campaign')),
  status text DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'error')),
  post_id text,
  post_thumbnail_url text,
  post_type text,
  media_url text,
  media_type text,
  headline text,
  caption text,
  cta_type text,
  objective text,
  daily_budget numeric,
  start_date date,
  end_date date,
  target_city text,
  target_radius_km int DEFAULT 10,
  target_age_min int DEFAULT 18,
  target_age_max int DEFAULT 65,
  target_gender text DEFAULT 'all',
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  spent numeric DEFAULT 0,
  reach int DEFAULT 0,
  clicks int DEFAULT 0,
  messages int DEFAULT 0,
  impressions int DEFAULT 0,
  metrics_updated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_connections_store_provider_idx
  ON social_connections (store_id, provider);

CREATE INDEX IF NOT EXISTS ad_campaigns_store_created_idx
  ON ad_campaigns (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ad_campaigns_active_metrics_idx
  ON ad_campaigns (status, meta_ad_id)
  WHERE status = 'active' AND meta_ad_id IS NOT NULL;

ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners manage social connections"
  ON social_connections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = social_connections.store_id
        AND stores.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = social_connections.store_id
        AND stores.owner_id = auth.uid()
    )
  );

CREATE POLICY "Store owners manage ad campaigns"
  ON ad_campaigns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = ad_campaigns.store_id
        AND stores.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = ad_campaigns.store_id
        AND stores.owner_id = auth.uid()
    )
  );
