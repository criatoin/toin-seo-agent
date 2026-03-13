from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import require_user

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
    db = get_db()
    result = (db.table("schema_proposals")
        .select("*")
        .eq("page_id", page_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute())
    if not result.data:
        raise HTTPException(404, "No pending schema proposal found")
    proposal_id = result.data[0]["id"]
    db.table("schema_proposals").update({"status": "approved"}).eq("id", proposal_id).execute()
    return {"approved": True, "proposal_id": proposal_id}
