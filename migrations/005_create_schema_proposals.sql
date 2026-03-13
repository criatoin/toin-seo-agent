CREATE TABLE IF NOT EXISTS schema_proposals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid REFERENCES pages(id) ON DELETE CASCADE,
  schema_type text,
  schema_json jsonb,
  rationale   text,
  status      text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  applied_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);
