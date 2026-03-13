CREATE TABLE IF NOT EXISTS meta_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id          uuid REFERENCES pages(id) ON DELETE CASCADE,
  trigger_reason   text CHECK (trigger_reason IN ('empty_meta','low_ctr','duplicate_title','google_rewriting')),
  v1_title         text, v1_description text, v1_rationale text,
  v2_title         text, v2_description text, v2_rationale text,
  v3_title         text, v3_description text, v3_rationale text,
  chosen_variant   text CHECK (chosen_variant IN ('v1','v2','v3','custom','none')),
  custom_title     text,
  custom_description text,
  status           text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  applied_at       timestamptz,
  cooldown_until   timestamptz,
  created_at       timestamptz DEFAULT now()
);
