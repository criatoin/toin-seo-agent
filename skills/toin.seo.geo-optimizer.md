# Skill: toin.seo.geo-optimizer

Optimizes sites for AI search visibility and AI Overviews.

## Entry point
```bash
python execution/geo_optimizer.py --site-id <uuid>
```

Runs as part of technical audit:
```bash
POST /api/jobs/technical-audit
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## What it evaluates

**llms.txt presence**
- Checks for `/llms.txt` at site root
- If missing: generates content and stores as proposal
- llms.txt provides guidelines for AI crawler access and content usage

**Schema completeness**
- Verifies Organization schema on homepage or key pages
- Checks for entity markup linking pages together
- Evaluates structured data coverage across site

**AI search readiness**
- Analyzes content for direct answer structure
- Checks for question-answer format on FAQ pages
- Evaluates heading hierarchy for AI parsing
- Identifies entity relationships and context

## llms.txt generation
If `/llms.txt` is missing, generates and stores as `schema_proposals`:

```
# Large Language Models Configuration

Site: https://example.com
Purpose: [Site description and mission]

## Content Policy
- Attribution: Required (cite as "Example.com")
- Usage: Training data acceptable
- Restrictions: No commercial redistribution
- Contact: compliance@example.com

## Sitemap
https://example.com/sitemap.xml

## About
- Organization: [Company name]
- Founded: [Year]
- Description: [Mission]
```

## Output
Stores proposals in `schema_proposals` table:
```json
{
  "page_id": null,
  "schema_type": "llms_txt",
  "schema_json": {...},
  "rationale": "llms.txt is missing. AI crawlers use this to understand content policy and usage rights.",
  "status": "pending"
}
```

## Safety
- **Never auto-publishes llms.txt**: requires manager approval
- Read-only schema analysis
- Never modifies site content
- Manager reviews and approves before deployment
- Can suggest improvements to existing llms.txt

## AI search benefits
- Improves visibility in AI Overviews (Google)
- Enhances content credibility for Perplexity, ChatGPT Search
- Direct answer content ranks better in AI contexts
- Schema markup increases semantic understanding
