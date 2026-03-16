# Monthly Briefing Directive

Generates content strategy briefing with trending topics, gaps, and suggested pautas.

## Trigger
Automatic schedule: **1st of each month at 08h BRT** (11:00 UTC)
```
0 11 1 * *
```

Or manual:
```bash
POST /api/jobs/monthly-briefing
Body: {"site_id": "uuid"}
```

## Execution flow
1. `execution/monthly_briefing.py` → `run(site_id)`
2. Identifies site's content categories from existing pages
3. Analyzes three data sources:
   - **Google Trends**: trending topics in site's categories (last 30 days)
   - **GSC data**: queries with impressions but zero clicks (content gaps)
   - **Page analysis**: pages with < 10 clicks in 6 months (consolidation candidates)
4. Generates 3-5 suggested pautas:
   - Title
   - Search intent (informational / transactional / navigational)
   - Target queries (real GSC data or trend data)
   - Recommended format (blog post / landing page / FAQ / video + text)
   - Traffic potential (estimated monthly searches)
5. Identifies weak pages for consolidation or deletion
6. Stores in `content_briefings` table with `status = "pending"`

## Briefing structure
```json
{
  "month": "2026-03-01",
  "trends_data": [
    {"topic": "AI development", "growth": 145, "category": "technology"},
    {...}
  ],
  "content_gaps": [
    {"query": "how to implement X", "impressions": 450, "clicks": 0},
    {...}
  ],
  "suggested_pautas": [
    {
      "title": "Complete Guide to X",
      "intent": "informational",
      "target_queries": ["how to X", "X tutorial"],
      "format": "blog post",
      "estimated_traffic": 250
    },
    {...}
  ],
  "pages_to_merge": [
    {"url": "/old-page", "clicks": 5, "reason": "low engagement"}
  ]
}
```

## AI model
Uses DeepSeek V3.2 to:
- Analyze GSC data for gaps
- Generate compelling pauta titles
- Estimate traffic potential
- Suggest content formats

## Safety & Autonomy
- **No content writing or publishing**: briefing is suggestions only
- Manager reviews and approves pauta in panel
- Manager produces content based on approved pauta
- Agent never auto-publishes or modifies content
- Briefing stored for historical reference
