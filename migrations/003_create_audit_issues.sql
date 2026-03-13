CREATE TABLE IF NOT EXISTS audit_issues (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id        uuid REFERENCES pages(id) ON DELETE CASCADE,
  severity       text NOT NULL CHECK (severity IN ('critical','important','improvement')),
  category       text NOT NULL CHECK (category IN ('indexation','speed','structure','links','schema','onpage')),
  issue_type     text NOT NULL,
  description    text NOT NULL,
  recommendation text,
  auto_fixable   boolean DEFAULT false,
  status         text DEFAULT 'open' CHECK (status IN ('open','fixed','dismissed','in_progress')),
  fixed_at       timestamptz,
  created_at     timestamptz DEFAULT now()
);
