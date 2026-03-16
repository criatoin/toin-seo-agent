# Skill: toin.seo.schema-optimizer

Generates JSON-LD schema markup proposals.

## Entry point
```bash
python execution/schema_optimizer.py --site-id <uuid>
```

Or via API (runs alongside meta-optimizer):
```bash
POST /api/jobs/generate-proposals
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## Schema type detection
Determines appropriate schema by analyzing page content and metadata:

| Page Type | Schema | Fields |
|-----------|--------|--------|
| Blog post (post_type=post) | Article | headline, description, author, datePublished, image, dateModified |
| Generic page | WebPage | name, description, url, publisher |
| Product | Product | name, description, price, priceCurrency, image, availability |
| Service offering | Service | name, description, provider, image, areaServed |
| Location-specific | LocalBusiness | name, address, telephone, image, coordinates |
| FAQ page | FAQPage | mainEntity (Q&A pairs) |
| Tutorial | HowTo | name, steps (with images), totalTime |

## Generation process
1. Identifies pages with `needs_schema_opt = true` or missing schema
2. Analyzes page content and metadata
3. Selects appropriate schema type
4. Generates complete JSON-LD using DeepSeek V3.2
5. Includes all required fields per schema.org specification
6. Validates JSON syntax
7. Stores in `schema_proposals` table

## Output
```json
{
  "page_id": "uuid",
  "schema_type": "Article",
  "schema_json": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "...",
    "description": "...",
    "author": {...},
    "datePublished": "...",
    "image": "...",
    "dateModified": "..."
  },
  "rationale": "Detected blog post with publication date; Article schema provides rich snippet for SERPs",
  "status": "pending"
}
```

## Safety
- No automatic application — all proposals require manager approval
- Validates JSON-LD before storing
- Uses DeepSeek for semantic accuracy
- Never modifies WordPress directly
- Manager reviews and can edit before applying

## Schedule
Runs as part of `generate-proposals` job, typically quarterly or on demand.
