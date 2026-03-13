CREATE TABLE IF NOT EXISTS gsc_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid REFERENCES sites(id) ON DELETE CASCADE,
  google_email  text,
  access_token  text,
  refresh_token text,
  token_expiry  timestamptz,
  scopes        text[],
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
