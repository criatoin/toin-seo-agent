-- Migration: create gsc_snapshots table for weekly historical comparison
-- Run via: Supabase SQL Editor or psql

CREATE TABLE IF NOT EXISTS gsc_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id     uuid REFERENCES pages(id) ON DELETE CASCADE,
  week_date   date NOT NULL,
  impressions integer,
  clicks      integer,
  ctr         numeric,
  position    numeric,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(page_id, week_date)
);

-- Index for site-level queries (UNIQUE already covers page_id + week_date lookups)
CREATE INDEX IF NOT EXISTS gsc_snapshots_site_week_idx ON gsc_snapshots(site_id, week_date);
