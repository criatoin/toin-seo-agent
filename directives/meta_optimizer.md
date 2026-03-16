# Meta Optimizer Directive

Generates title and meta description proposals based on SEO data.

## Trigger
```bash
POST /api/jobs/generate-proposals
Body: {"site_id": "uuid"}
```

## Execution flow
1. `execution/meta_optimizer.py` → `run(site_id)`
2. Identifies pages that meet at least one condition:
   - Page has **empty meta description** (`has_empty_meta = true`)
   - Page has **duplicate title** with another page
   - Page has **position 5-15** + **CTR < 2%** + **impressions >= 200**
   - Google is **rewriting the title** (detected by title tag mismatch vs GSC impression title)
3. For each qualifying page:
   - Checks cooldown: `last_meta_changed_at + cooldown_days` must be in the past
   - If within cooldown, skips proposal
4. Generates **exactly 3 variants** (never 1 or 2):
   - **V1**: Conservative refinement of current title/meta (if exists)
   - **V2**: Benefit-focused with CTA (optimize for CTR)
   - **V3**: AI/featured snippet format (direct answer structure)
5. Stores proposals in `meta_proposals` table with `status = "pending"`

## Cooldown enforcement
- Minimum **60 days** between proposals for same page
- Checks `pages.last_meta_changed_at` before any proposal
- Blocks proposal if last change was < 60 days ago
- Records cooldown date in `meta_proposals.cooldown_until`

## AI model
Uses DeepSeek V3.2 via OpenRouter for proposal generation.
Each variant includes a `rationale` explaining the approach.

## Safety & Autonomy
- **No automatic application**: all proposals require manager approval
- Respects empty meta auto-fill setting but always proposes non-empty alternatives
- Never modifies WordPress directly
- Stores all proposals for review in panel
