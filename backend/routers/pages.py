from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("/{site_id}/pages")
async def list_pages(site_id: str, user=Depends(require_user)):
    db = get_db()
    return (db.table("pages")
        .select("*")
        .eq("site_id", site_id)
        .order("gsc_clicks", desc=True)
        .execute().data)

@router.get("/{site_id}/pages/{page_id}")
async def get_page(site_id: str, page_id: str, user=Depends(require_user)):
    db = get_db()
    result = db.table("pages").select("*").eq("id", page_id).eq("site_id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Page not found")
    return result.data[0]
