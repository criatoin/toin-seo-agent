# Skill: toin.seo.technical-audit

Executes a complete technical SEO audit of a WordPress or generic site.

## Entry point
```bash
python execution/technical_audit.py --site-id <uuid>
```

Or via API:
```bash
POST /api/jobs/technical-audit
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## What it audits
- **Indexation & Crawlability**
  - Sitemap validity and updates
  - robots.txt correctness
  - GSC Coverage (indexed vs excluded pages)
  - Soft 404s and discovery status

- **Core Web Vitals (via PageSpeed Insights)**
  - LCP (Largest Contentful Paint) — target: < 2.5s
  - INP (Interaction to Next Paint) — target: < 200ms
  - CLS (Cumulative Layout Shift) — target: < 0.1
  - Mobile and desktop separately

- **On-page SEO**
  - H1 presence and uniqueness
  - Title tag (presence, length, duplicates)
  - Meta description (presence, length, duplicates)
  - Image alt text coverage
  - Heading hierarchy (H1 → H2 → H3)

- **Technical Structure**
  - Canonical tags (presence, correctness)
  - Redirect chains (should be direct, not A→B→C)
  - Orphan pages (no internal links pointing)
  - Internal link depth (pages > 3 clicks from homepage)
  - Page load time and server response

- **Schema & AI Search**
  - JSON-LD schema presence and validity
  - `llms.txt` presence at site root
  - Structured data coverage

## Output
Stores detailed findings in `audit_issues` table:
- **critical**: blocks indexation or damages ranking
- **important**: limits growth or CTR
- **improvement**: incremental optimization

Each issue includes:
- Category (indexation, speed, structure, links, schema, onpage)
- Detailed description
- Recommended fix
- Auto-fixable flag (if yes, can be fixed without approval)

## Safety
- Read-only operation
- No modifications to WordPress
- Uses public APIs (PageSpeed, GSC)
- Updates `sites.audit_completed_at` timestamp
