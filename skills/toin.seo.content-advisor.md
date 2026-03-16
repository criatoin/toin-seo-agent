# Skill: toin.seo.content-advisor

Generates monthly content strategy briefing with trends and gaps.

## Entry point
```bash
python execution/monthly_briefing.py --site-id <uuid>
```

Or via API:
```bash
POST /api/jobs/monthly-briefing
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## Schedule
Automatic: **1st of each month at 08h BRT** (11:00 UTC)

Cron: `0 11 1 * *`

## What it analyzes

**Trending topics** (via Google Trends)
- Identifies trending searches in site's categories
- Growth > 30% in last month flagged as priority
- Suggests seasonal content opportunities

**Content gaps** (via GSC data)
- Queries with impressions but zero clicks
- Indicates search intent not met by current pages
- High-value opportunities for new content

**Weak pages** (internal analysis)
- Pages with < 10 clicks in last 6 months
- Candidates for consolidation, improvement, or deletion
- Avoid duplicate/cannibalizing content

## Briefing structure
```json
{
  "site_id": "uuid",
  "month": "2026-03-01",
  "trends_data": [
    {
      "topic": "AI development",
      "growth_percentage": 145,
      "category": "technology",
      "search_volume": 2400
    }
  ],
  "content_gaps": [
    {
      "query": "how to implement feature X",
      "impressions": 450,
      "clicks": 0,
      "average_position": 22
    }
  ],
  "suggested_pautas": [
    {
      "title": "Complete Guide to AI Development",
      "intent": "informational",
      "target_queries": [
        "how to learn AI",
        "AI development tutorial",
        "AI programming guide"
      ],
      "recommended_format": "blog post",
      "estimated_monthly_traffic": 250,
      "priority": 1
    }
  ],
  "pages_to_merge": [
    {
      "url": "/old-article",
      "clicks": 3,
      "impressions": 120,
      "reason": "low engagement, overlaps with /new-article"
    }
  ],
  "status": "pending"
}
```

## Pauta recommendation
3-5 suggested topics for the month, prioritized by:
- Search volume (GSC data)
- Content gap size (queries with impressions, zero clicks)
- Trend growth rate
- Estimated traffic potential

## Safety
- **No content writing**: briefing is suggestions only
- **No publishing**: manager reviews and approves pauta
- **No automation**: manager produces content based on approved pauta
- Uses DeepSeek for trend analysis and pauta generation
- Briefing stored for historical reference

## Manager workflow
1. Reviews briefing in `/conteudo` panel
2. Selects pautas to approve or dismisses entire briefing
3. Produces content based on approved pauta
4. Publishes to WordPress
5. Agent handles schema, meta, internal links post-publication
