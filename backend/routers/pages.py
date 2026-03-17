from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_db
from auth import require_user
import os, sys
_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)

router = APIRouter()

PAGE_SIZE = 50

@router.get("/{site_id}/pages")
async def list_pages(
    site_id: str,
    page: int = Query(1, ge=1),
    user=Depends(require_user)
):
    db     = get_db()
    offset = (page - 1) * PAGE_SIZE

    # Total count
    count_res = db.table("pages").select("id", count="exact").eq("site_id", site_id).execute()
    total = count_res.count or 0

    # Paginated data — pages with GSC data first, then the rest, ordered by clicks desc
    rows = (db.table("pages")
        .select("id,url,title_current,meta_desc_current,gsc_clicks,gsc_position,gsc_ctr,gsc_impressions,needs_meta_opt,has_empty_meta,audit_has_h1,audit_lcp_score,last_synced_at")
        .eq("site_id", site_id)
        .order("gsc_clicks", desc=True, nulls_last=True)
        .range(offset, offset + PAGE_SIZE - 1)
        .execute().data)

    return {
        "pages":    rows,
        "total":    total,
        "page":     page,
        "per_page": PAGE_SIZE,
        "total_pages": max(1, -(-total // PAGE_SIZE)),  # ceiling division
    }


@router.get("/{site_id}/pages/{page_id}")
async def get_page(site_id: str, page_id: str, user=Depends(require_user)):
    db = get_db()
    result = db.table("pages").select("*").eq("id", page_id).eq("site_id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Page not found")
    return result.data[0]


@router.post("/{site_id}/pages/{page_id}/schema/generate")
async def generate_schema_for_page(site_id: str, page_id: str, user=Depends(require_user)):
    """Generate a schema JSON-LD proposal for a single page using AI."""
    import asyncio, functools
    from schema_optimizer import generate_for_page
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, functools.partial(generate_for_page, site_id, page_id)
        )
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Schema generation failed: {e}")
