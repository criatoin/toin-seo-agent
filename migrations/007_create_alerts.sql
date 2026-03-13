CREATE TABLE IF NOT EXISTS alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id     uuid REFERENCES pages(id) ON DELETE SET NULL,
  severity    text NOT NULL CHECK (severity IN ('critical','warning','opportunity')),
  alert_type  text NOT NULL CHECK (alert_type IN ('traffic_drop','deindexed','cwv_regression','opportunity','stable')),
  title       text NOT NULL,
  description text,
  data        jsonb,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
