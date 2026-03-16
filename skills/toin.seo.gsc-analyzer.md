# Skill: toin.seo.gsc-analyzer

Syncs Google Search Console data into the pages table.

## Entry point
```bash
python execution/gsc_client.py --site-id <uuid>
```

Or via API:
```bash
POST /api/jobs/sync-gsc
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## What it syncs
Retrieves data from Google Search Console API v3 for the **last 90 days**:

Per page (URL):
- **Impressions**: total times page appeared in search results
- **Clicks**: total clicks from search results
- **CTR**: click-through rate (clicks / impressions)
- **Average position**: ranking position in search results
- **Top 10 queries**: queries that drove traffic to this page

## Process
1. Authenticates with GSC using OAuth refresh token
2. Lists all URLs in site's Search Console property
3. Queries performance data for each URL
4. Groups by page URL
5. Creates `pages` records if they don't exist
6. Updates `pages` metrics
7. Stores top 10 queries as JSON in `gsc_top_queries`
8. Updates `pages.last_synced_at` timestamp

## Data structure
```json
{
  "gsc_impressions": 4820,
  "gsc_clicks": 187,
  "gsc_ctr": 0.0388,
  "gsc_position": 18.4,
  "gsc_top_queries": [
    {"query": "seo agency", "clicks": 45, "impressions": 920},
    {"query": "digital marketing", "clicks": 32, "impressions": 740},
    ...
  ]
}
```

## Safety
- Read-only GSC access
- Site URL must be in `GSC_ALLOWED_SITES`
- Never modifies WordPress or site content
- Scheduled: every Monday at 09h BRT (12:00 UTC)
