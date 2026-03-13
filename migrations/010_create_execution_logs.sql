CREATE TABLE IF NOT EXISTS execution_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id       uuid REFERENCES pages(id) ON DELETE SET NULL,
  job_name      text NOT NULL,
  action        text NOT NULL,
  status        text NOT NULL CHECK (status IN ('started','success','error')),
  payload       jsonb,
  response      jsonb,
  error_message text,
  created_at    timestamptz DEFAULT now()
);
