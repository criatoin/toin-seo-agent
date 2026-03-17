from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_db
from auth import require_user
import os, sys
_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)

router = APIRouter()

PAGE_SIZE = 50

SORT_FIELDS = {"gsc_clicks", "gsc_impressions", "gsc_position", "gsc_ctr", "url"}

@router.get("/{site_id}/pages")
async def list_pages(
    site_id: str,
    page: int = Query(1, ge=1),
    sort_by:  str = Query("gsc_clicks"),
    sort_dir: str = Query("desc"),
    user=Depends(require_user)
):
    db     = get_db()
    offset = (page - 1) * PAGE_SIZE

    # Validate sort params
    if sort_by not in SORT_FIELDS:
        sort_by = "gsc_clicks"
    desc = sort_dir != "asc"

    # Total count
    count_res = db.table("pages").select("id", count="exact").eq("site_id", site_id).execute()
    total = count_res.count or 0

    # Site URL for homepage detection
    site_res = db.table("sites").select("url").eq("id", site_id).execute().data
    site_url = site_res[0]["url"].rstrip("/") if site_res else ""

    rows = (db.table("pages")
        .select("id,url,title_current,meta_desc_current,gsc_clicks,gsc_position,gsc_ctr,gsc_impressions,needs_meta_opt,has_empty_meta,audit_has_h1,audit_lcp_score,last_synced_at")
        .eq("site_id", site_id)
        .order(sort_by, desc=desc)
        .order("url", desc=False)
        .range(offset, offset + PAGE_SIZE - 1)
        .execute().data)

    # Pin homepage to top on first page regardless of sort
    if page == 1 and site_url:
        home = [p for p in rows if p["url"].rstrip("/") == site_url]
        rest  = [p for p in rows if p["url"].rstrip("/") != site_url]
        rows  = home + rest

    return {
        "pages":      rows,
        "total":      total,
        "page":       page,
        "per_page":   PAGE_SIZE,
        "total_pages": max(1, -(-total // PAGE_SIZE)),
        "site_url":   site_url,
        "sort_by":    sort_by,
        "sort_dir":   sort_dir,
    }


@router.get("/{site_id}/pages/schema-stats")
async def schema_stats(site_id: str, _user=Depends(require_user)):
    """Count of pages needing schema generation."""
    db = get_db()
    res = db.table("pages").select("id", count="exact").eq("site_id", site_id).eq("needs_schema_opt", True).execute()
    return {"without_schema": res.count or 0}


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


@router.post("/{site_id}/pages/{page_id}/schema/apply")
async def apply_schema_for_page(site_id: str, page_id: str, _user=Depends(require_user)):
    """Apply the pending schema proposal for a page directly to WordPress."""
    import asyncio, functools, requests as _req, base64
    db = get_db()

    page_res = db.table("pages").select("*").eq("id", page_id).eq("site_id", site_id).execute()
    if not page_res.data:
        raise HTTPException(404, "Page not found")
    page = page_res.data[0]

    if not page.get("post_id"):
        raise HTTPException(400, "Page has no WordPress post_id — cannot apply via plugin")

    proposal_res = (db.table("schema_proposals")
        .select("*").eq("page_id", page_id).eq("status", "pending")
        .order("created_at", desc=True).limit(1).execute())
    if not proposal_res.data:
        raise HTTPException(404, "No pending schema proposal for this page")
    proposal = proposal_res.data[0]

    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not site_res.data:
        raise HTTPException(404, "Site not found")
    site = site_res.data[0]

    creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
    headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}

    r = _req.post(
        f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/schema",
        headers=headers,
        json={"schema_json": proposal["schema_json"]},
        timeout=10
    )
    if not r.ok:
        raise HTTPException(502, f"WordPress plugin error: {r.text}")

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db.table("schema_proposals").update({"status": "applied", "applied_at": now}).eq("id", proposal["id"]).execute()
    db.table("pages").update({"schema_current": proposal["schema_json"], "needs_schema_opt": False}).eq("id", page_id).execute()

    return {"success": True, "schema_type": proposal["schema_type"]}
