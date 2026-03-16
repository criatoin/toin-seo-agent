# Skill: toin.seo.meta-optimizer

Generates meta title and description proposals using AI analysis.

## Entry point
```bash
python execution/meta_optimizer.py --site-id <uuid>
```

Or via API:
```bash
POST /api/jobs/generate-proposals
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## Proposal triggers
Generates proposals for pages matching any of these conditions:

1. **Empty meta description** — page has no meta description
2. **Duplicate title** — title matches another page
3. **Underperforming in search** — position 5-15 + CTR < 2% + impressions >= 200
4. **Google rewriting title** — detected mismatch between HTML title and GSC impression title

## Cooldown enforcement
**Critical rule: 60-day minimum between proposals for the same page**

Before generating a proposal:
1. Check `pages.last_meta_changed_at`
2. If value exists and is < 60 days ago, skip proposal
3. Records cooldown date in `meta_proposals.cooldown_until`
4. After manager approval and application, updates `last_meta_changed_at`

## Variants generated
**Always exactly 3 variants** (never 1 or 2):

**V1: Conservative**
- Minimal changes to current title/meta
- Focuses on clarity and readability
- Safe, incremental improvement

**V2: Benefit + CTA**
- Emphasizes user benefit
- Includes call-to-action
- Optimized for CTR

**V3: AI/Featured Snippet**
- Direct answer format
- Question-answer structure
- Optimized for AI Overviews and featured snippets

## Output
Stores in `meta_proposals` table:
```json
{
  "page_id": "uuid",
  "trigger_reason": "low_ctr",
  "v1_title": "...",
  "v1_description": "...",
  "v1_rationale": "...",
  "v2_title": "...",
  "v2_description": "...",
  "v2_rationale": "...",
  "v3_title": "...",
  "v3_description": "...",
  "v3_rationale": "...",
  "status": "pending"
}
```

## Safety
- No automatic application — all proposals require manager approval
- Respects money pages (`is_money_page = true`) — blocks proposals entirely
- Uses DeepSeek V3.2 for high-quality AI generation
- Manager chooses variant or provides custom text
- Can dismiss entire proposal (sets cooldown to 30 days)
