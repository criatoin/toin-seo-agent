CREATE TABLE IF NOT EXISTS reports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              uuid REFERENCES sites(id) ON DELETE CASCADE,
  period_start         date NOT NULL,
  period_end           date NOT NULL,
  markdown             text,
  kpi_impressions      integer,
  kpi_clicks           integer,
  kpi_ctr              numeric,
  kpi_avg_position     numeric,
  kpi_issues_fixed     integer,
  kpi_schema_coverage  numeric,
  kpi_pages_optimized  integer,
  created_at           timestamptz DEFAULT now()
);
