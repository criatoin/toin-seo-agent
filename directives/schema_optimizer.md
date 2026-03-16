# Schema Optimizer Directive

Generates JSON-LD schema markup proposals for pages.

## Trigger
```bash
POST /api/jobs/generate-proposals
Body: {"site_id": "uuid"}
```

Runs alongside meta optimizer in the same job.

## Execution flow
1. `execution/schema_optimizer.py` → `run(site_id)`
2. Identifies pages with `needs_schema_opt = true` or missing schema
3. Determines appropriate schema type by page characteristics:
   - **Article**: Blog posts, news articles (post_type = post)
   - **WebPage**: Generic pages (post_type = page)
   - **Product**: E-commerce products (if detected)
   - **Service**: Service offerings (detected via URL patterns or content)
   - **LocalBusiness**: For service pages with location data
   - **FAQPage**: For FAQ-style content
   - **HowTo**: For tutorial or how-to content
4. Generates complete, valid JSON-LD markup using DeepSeek
5. Includes required fields based on schema type
6. Stores in `schema_proposals` table with `status = "pending"`

## Schema types & required fields

| Type | Fields |
|------|--------|
| Article | @type, headline, description, author, datePublished, image |
| WebPage | @type, name, description, url |
| Product | @type, name, description, price, priceCurrency, image |
| Service | @type, name, description, provider, image |
| LocalBusiness | @type, name, address, telephone, image |
| FAQPage | @type, mainEntity (array of Question/Answer pairs) |

## AI model
Uses DeepSeek V3.2 to generate semantically correct, complete schemas.
Includes `rationale` for each proposal.

## Safety & Autonomy
- **No automatic application**: all proposals require manager approval
- Validates JSON-LD syntax before storing
- Never modifies WordPress directly
- Stores proposals for manager review in panel
