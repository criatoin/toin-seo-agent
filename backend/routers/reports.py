from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("")
async def list_reports(site_id: str = None, limit: int = 12, user=Depends(require_user)):
    db = get_db()
    q = db.table("reports").select("*")
    if site_id: q = q.eq("site_id", site_id)
    return q.order("created_at", desc=True).limit(limit).execute().data

@router.get("/{report_id}")
async def get_report(report_id: str, user=Depends(require_user)):
    db = get_db()
    result = db.table("reports").select("*").eq("id", report_id).execute()
    if not result.data:
        raise HTTPException(404, "Report not found")
    return result.data[0]
