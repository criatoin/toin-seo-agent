from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("/{site_id}")
async def get_settings(site_id: str, user=Depends(require_user)):
    db = get_db()
    result = db.table("settings").select("*").eq("site_id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Settings not found")
    return result.data[0]

@router.patch("/{site_id}")
async def update_settings(site_id: str, body: dict, user=Depends(require_user)):
    db = get_db()
    # Add updated_at
    body["updated_at"] = "now()"
    result = db.table("settings").update(body).eq("site_id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Settings not found")
    return result.data[0]
