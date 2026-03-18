from fastapi import APIRouter, Depends, Query
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("/{site_id}/logs")
async def get_logs(
    site_id: str,
    limit: int = Query(50, ge=1, le=200),
    job: str = None,
    _user=Depends(require_user),
):
    """Return recent execution logs for a site."""
    db = get_db()
    q = db.table("execution_logs").select("*").eq("site_id", site_id)
    if job:
        q = q.eq("job_name", job)
    result = q.order("created_at", desc=True).limit(limit).execute()
    return result.data or []
