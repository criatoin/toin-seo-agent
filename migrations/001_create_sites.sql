CREATE TABLE IF NOT EXISTS sites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  url                text NOT NULL UNIQUE,
  type               text NOT NULL CHECK (type IN ('wordpress', 'generic')),
  active             boolean DEFAULT true,
  gsc_site_url       text,
  wp_user            text,
  wp_app_password    text,
  seo_plugin         text CHECK (seo_plugin IN ('yoast','rankmath','aioseo','seopress','none')),
  audit_completed_at timestamptz,
  last_crawled_at    timestamptz,
  created_at         timestamptz DEFAULT now()
);
