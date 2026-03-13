from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import require_user

router = APIRouter()

@router.get("/{site_id}/audit")
async def get_audit(site_id: str, user=Depends(require_user)):
    db = get_db()
    issues = (db.table("audit_issues")
        .select("*")
        .eq("site_id", site_id)
        .order("severity")
        .execute().data)
    grouped = {"critical": [], "important": [], "improvement": []}
    for issue in issues:
        grouped.setdefault(issue["severity"], []).append(issue)
    return {"site_id": site_id, "issues": grouped, "total": len(issues)}

@router.get("/{site_id}/audit/issues")
async def list_audit_issues(
    site_id: str,
    severity: str = None,
    category: str = None,
    status: str = None,
    user=Depends(require_user)
):
    db = get_db()
    q = db.table("audit_issues").select("*").eq("site_id", site_id)
    if severity: q = q.eq("severity", severity)
    if category: q = q.eq("category", category)
    if status:   q = q.eq("status", status)
    return q.order("created_at", desc=True).execute().data

class IssueStatusUpdate(BaseModel):
    status: str

@router.patch("/{site_id}/audit/issues/{issue_id}")
async def update_issue_status(
    site_id: str, issue_id: str,
    body: IssueStatusUpdate,
    user=Depends(require_user)
):
    allowed = {"fixed", "dismissed", "open", "in_progress"}
    if body.status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    db = get_db()
    result = db.table("audit_issues").update({
        "status": body.status,
        "fixed_at": "now()" if body.status == "fixed" else None
    }).eq("id", issue_id).eq("site_id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Issue not found")
    return result.data[0]
