# GEO Optimizer Directive

Optimizes sites for AI search visibility and AIOverviews.

## Trigger
Runs as part of technical audit:
```bash
POST /api/jobs/technical-audit
Body: {"site_id": "uuid"}
```

## Execution flow
1. `execution/geo_optimizer.py` → `run(site_id)`
2. Checks for `llms.txt` file at site root (https://site.com/llms.txt)
3. Evaluates schema completeness:
   - Presence of Organization schema
   - Presence of entity markup on key pages
   - Completeness of structured data
4. Analyzes content for AI search readiness:
   - Direct answer structure (how-to, what is, why)
   - Entity coverage and relationships
   - Question-answer format on FAQ pages
5. If `llms.txt` is missing:
   - Generates llms.txt content via DeepSeek
   - Stores as `schema_proposals` with `schema_type = "llms_txt"`
   - Includes guidelines for AI crawlers and content usage
6. If schema is incomplete:
   - Generates schema improvement proposals
   - Stores recommendations in audit issues

## llms.txt structure
```
# Large Language Models Configuration

Site: [domain]
Purpose: [site description]

## Content Policy
- [Usage guidelines]
- [Attribution requirements]

## Endpoints
- [API endpoints if any]

## About
- [Organization info]
```

## Safety & Autonomy
- **Never auto-publishes llms.txt**: proposal goes to manager for review
- Read-only analysis for schema evaluation
- Stores proposals for manager approval
- Never modifies site content
- Only reads public-facing information
