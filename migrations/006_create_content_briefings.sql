CREATE TABLE IF NOT EXISTS content_briefings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          uuid REFERENCES sites(id) ON DELETE CASCADE,
  month            date NOT NULL,
  trends_data      jsonb,
  content_gaps     jsonb,
  suggested_pautas jsonb,
  pages_to_merge   jsonb,
  status           text DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
  approved_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);
