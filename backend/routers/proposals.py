from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import require_user
import base64, requests as _req
from datetime import datetime, timezone
import os, sys
_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)

router = APIRouter()

class ApplyProposal(BaseModel):
    variant: str
    custom_title: Optional[str] = None
    custom_description: Optional[str] = None

@router.get("/{site_id}/pages/{page_id}/proposal")
async def get_proposal(site_id: str, page_id: str, user=Depends(require_user)):
    db = get_db()
    result = (db.table("meta_proposals")
        .select("*")
        .eq("page_id", page_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute())
    return result.data[0] if result.data else None

@router.post("/{site_id}/pages/{page_id}/proposal/apply")
async def apply_proposal(
    site_id: str, page_id: str,
    body: ApplyProposal,
    user=Depends(require_user)
):
    allowed = {"v1", "v2", "v3", "custom", "none"}
    if body.variant not in allowed:
        raise HTTPException(400, f"variant must be one of {allowed}")
    db = get_db()
    result = (db.table("meta_proposals")
        .select("*")
        .eq("page_id", page_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute())
    if not result.data:
        raise HTTPException(404, "No pending proposal found")
    proposal_id = result.data[0]["id"]
    update = {"status": "approved" if body.variant != "none" else "rejected", "chosen_variant": body.variant}
    if body.custom_title:       update["custom_title"] = body.custom_title
    if body.custom_description: update["custom_description"] = body.custom_description
    updated = db.table("meta_proposals").update(update).eq("id", proposal_id).execute()
    return updated.data[0]

@router.get("/{site_id}/pages/{page_id}/schema")
async def get_schema_proposal(site_id: str, page_id: str, user=Depends(require_user)):
    db = get_db()
    result = (db.table("schema_proposals")
        .select("*")
        .eq("page_id", page_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute())
    return result.data[0] if result.data else None

@router.post("/{site_id}/pages/{page_id}/schema/apply")
async def apply_schema(site_id: str, page_id: str, user=Depends(require_user)):
    """Apply a pending schema proposal to WordPress and mark it as applied."""
    db = get_db()

    # Fetch pending proposal
    prop_res = (db.table("schema_proposals")
        .select("*").eq("page_id", page_id).eq("status", "pending")
        .order("created_at", desc=True).limit(1).execute())
    if not prop_res.data:
        raise HTTPException(404, "No pending schema proposal found")
    proposal = prop_res.data[0]

    # Fetch page and site
    page_res = db.table("pages").select("*").eq("id", page_id).execute()
    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not page_res.data or not site_res.data:
        raise HTTPException(404, "Page or site not found")
    page = page_res.data[0]
    site = site_res.data[0]

    # Write to WordPress if applicable
    if site["type"] == "wordpress" and page.get("post_id"):
        if not site.get("wp_user") or not site.get("wp_app_password"):
            raise HTTPException(400, "WordPress credentials not configured — set them in /configuracoes")
        creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}
        r = _req.post(
            f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/schema",
            headers=headers,
            json={"schema_json": proposal["schema_json"]},
            timeout=10,
        )
        if not r.ok:
            raise HTTPException(502, f"WordPress write failed: {r.text}")

    now = datetime.now(timezone.utc).isoformat()

    # Update pages.schema_current
    db.table("pages").update({
        "schema_current": proposal["schema_json"],
        "audit_schema_ok": True,
        "needs_schema_opt": False,
    }).eq("id", page_id).execute()

    # Mark proposal applied
    db.table("schema_proposals").update({
        "status": "applied",
        "applied_at": now,
    }).eq("id", proposal["id"]).execute()

    # Mark related audit issue as fixed (if exists)
    db.table("audit_issues").update({
        "status": "fixed",
        "fixed_at": now,
    }).eq("page_id", page_id).eq("issue_type", "missing_schema").in_("status", ["open", "in_progress"]).execute()

    return {
        "applied": True,
        "schema_type": proposal["schema_type"],
        "page_id": page_id,
    }
