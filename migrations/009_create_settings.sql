CREATE TABLE IF NOT EXISTS settings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                      uuid REFERENCES sites(id) ON DELETE CASCADE UNIQUE,
  meta_cooldown_days           integer DEFAULT 60,
  auto_fill_empty_meta         boolean DEFAULT true,
  auto_fix_canonical           boolean DEFAULT true,
  auto_apply_schema            boolean DEFAULT false,
  min_impressions_for_meta_opt integer DEFAULT 200,
  min_ctr_threshold            numeric DEFAULT 0.02,
  updated_at                   timestamptz DEFAULT now()
);
