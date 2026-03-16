# GSC Analyzer Directive

Syncs Google Search Console data into the pages table.

## Trigger
```bash
POST /api/jobs/sync-gsc
Body: {"site_id": "uuid"}
```

## Execution flow
1. `execution/gsc_client.py` → `run(site_id)`
2. Retrieves GSC OAuth credentials for the site
3. Queries Google Search Console API v3 for the last 90 days
4. Aggregates data by page URL:
   - Total impressions
   - Total clicks
   - CTR (clicks / impressions)
   - Average position
   - Top 10 queries for each page
5. Creates or updates page records in `pages` table
6. Stores `gsc_top_queries` as JSON
7. Updates `pages.last_synced_at` timestamp

## Safety validations
- Site URL must be in `GSC_ALLOWED_SITES` environment variable
- Only reads GSC data, never modifies
- Skips pages with no GSC data (they appear in audit but have no search traffic)

## Output
Updated `pages` records with:
- `gsc_impressions`
- `gsc_clicks`
- `gsc_ctr`
- `gsc_position`
- `gsc_top_queries` (JSON array of {query, clicks, impressions})
