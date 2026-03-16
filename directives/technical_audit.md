# Technical Audit Directive

Executes a complete technical SEO audit of a WordPress site.

## Trigger
```bash
POST /api/jobs/technical-audit
Body: {"site_id": "uuid"}
```

## Execution flow
1. `execution/technical_audit.py` → `run(site_id)`
2. Verifies site exists, is WordPress, and URL is in `GSC_ALLOWED_SITES`
3. Clears existing `status = "open"` issues for the site
4. Crawls sitemap (if present) and top pages (max 100)
5. Analyzes each page for:
   - H1 presence and uniqueness
   - Title tag (presence, length, duplicates)
   - Meta description (presence, length, duplicates)
   - Schema.org markup
   - Canonical tags (presence, correctness)
   - Internal link depth
6. Runs PageSpeed Insights for homepage (mobile + desktop)
7. Checks for `llms.txt` at site root
8. Stores audit results in `audit_issues` table

## Classification
Each issue is classified by severity:
- **🔴 Critical** (resolve this week): blocks indexation or actively penalizes ranking
  - Examples: robots.txt blocking content, soft 404s, missing canonical on duplicate pages
- **🟡 Important** (resolve this month): limits growth or CTR
  - Examples: poor Core Web Vitals, missing H1, orphan pages
- **🟢 Improvement** (next quarter): incremental optimization
  - Examples: missing alt text on images, suboptimal title length

## Autonomy & Safety
- **Read-only operation**: No site modifications
- Sets flags on pages: `has_empty_meta`, `needs_schema_opt`, `audit_has_h1`, `audit_canonical_ok`, etc.
- Stores raw audit data for review
- NEVER modifies WordPress content or settings

## Output
- Populates `audit_issues` table with detailed findings
- Sets page flags for follow-up optimization
- Updates `sites.audit_completed_at` timestamp
