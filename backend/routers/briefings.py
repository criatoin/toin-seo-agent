from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("")
async def list_briefings(site_id: str = None, user=Depends(require_user)):
    db = get_db()
    q = db.table("content_briefings").select("*")
    if site_id: q = q.eq("site_id", site_id)
    return q.order("created_at", desc=True).execute().data

@router.get("/{briefing_id}")
async def get_briefing(briefing_id: str, user=Depends(require_user)):
    db = get_db()
    result = db.table("content_briefings").select("*").eq("id", briefing_id).execute()
    if not result.data:
        raise HTTPException(404, "Briefing not found")
    return result.data[0]

class BriefingUpdate(BaseModel):
    status: str

@router.patch("/{briefing_id}")
async def update_briefing(briefing_id: str, body: BriefingUpdate, user=Depends(require_user)):
    allowed = {"approved", "dismissed"}
    if body.status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    db = get_db()
    update = {"status": body.status}
    if body.status == "approved":
        update["approved_at"] = "now()"
    result = db.table("content_briefings").update(update).eq("id", briefing_id).execute()
    if not result.data:
        raise HTTPException(404, "Briefing not found")
    return result.data[0]
