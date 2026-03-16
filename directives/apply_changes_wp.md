# Apply Changes to WordPress Directive

Applies approved SEO changes and safe routines to WordPress sites.

## Two modes of operation

### 1. Safe Routines (automatic, no approval needed)
Triggered by settings on `settings` table:

**Auto-fill empty meta descriptions**
- Condition: `auto_fill_empty_meta = true` AND page has empty meta_description
- Action: Uses DeepSeek to generate description based on page title and H1
- Applies via WordPress REST API
- Records in `execution_logs` with before/after values
- Only once per page (sets `has_empty_meta = false`)

**Auto-fix missing canonicals**
- Condition: `auto_fix_canonical = true` AND page has no canonical AND has duplicate content
- Action: Sets canonical to primary page URL
- Applies via WordPress REST API
- Records in `execution_logs`

### 2. Approved Changes (requires manager approval)

**Apply meta proposals**
- Trigger: Manager selects variant in panel (`meta_proposals.status = "approved"`)
- Action: Updates WordPress title and meta description
- Uses adapter for detected SEO plugin (Yoast/RankMath/AIOSEO/SEOPress/native)
- Records in `execution_logs`
- Updates `pages.last_meta_changed_at` timestamp
- Sets `meta_proposals.applied_at`

**Apply schema proposals**
- Trigger: Manager approves schema in panel (`schema_proposals.status = "approved"`)
- Action: Injects JSON-LD into page via WordPress hook
- Stores in page meta field for persistence
- Records in `execution_logs`
- Sets `schema_proposals.applied_at`

## Safety validations (all must pass)
1. Site URL is in `GSC_ALLOWED_SITES`
2. Site type is `wordpress`
3. Site is active (`sites.deleted_at IS NULL`)
4. WordPress credentials are valid
5. For meta changes: cooldown respected (`last_meta_changed_at + cooldown_days <= now()`)
6. For money pages: meta proposals blocked entirely
7. All writes logged to `execution_logs` with user, timestamp, before/after values
8. Rate limit: max 5 changes per site per day

## API endpoint

```bash
POST /api/jobs/apply-approved
Body: {"site_id": "uuid"}

POST /api/jobs/apply-safe-routines
Body: {"site_id": "uuid"}
```

## Error handling
- If WordPress API fails: retry up to 3 times
- Log error to `execution_logs` with full stack trace
- Alert manager via panel
- Do not retry safe routines more than once per day
