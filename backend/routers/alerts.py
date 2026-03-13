from fastapi import APIRouter, Depends
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("")
async def list_alerts(
    site_id: str = None,
    read: str = None,
    severity: str = None,
    user=Depends(require_user)
):
    db = get_db()
    q = db.table("alerts").select("*")
    if site_id:           q = q.eq("site_id", site_id)
    if read == "false":   q = q.is_("read_at", "null")
    if read == "true":    q = q.not_.is_("read_at", "null")
    if severity:          q = q.eq("severity", severity)
    return q.order("created_at", desc=True).execute().data

@router.patch("/{alert_id}/read")
async def mark_read(alert_id: str, user=Depends(require_user)):
    db = get_db()
    db.table("alerts").update({"read_at": "now()"}).eq("id", alert_id).execute()
    return {"read": True}
