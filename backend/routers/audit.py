import os, sys, base64, requests
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import require_user

router = APIRouter()

_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)

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


@router.post("/{site_id}/audit/issues/{issue_id}/preview-fix")
async def preview_fix(site_id: str, issue_id: str, user=Depends(require_user)):
    """Generate a meta description suggestion for a missing-meta issue (does not apply it)."""
    db = get_db()
    issue_res = db.table("audit_issues").select("*").eq("id", issue_id).eq("site_id", site_id).execute()
    if not issue_res.data:
        raise HTTPException(404, "Issue not found")
    issue = issue_res.data[0]

    if not issue.get("page_id"):
        raise HTTPException(400, "Issue has no associated page")

    page_res = db.table("pages").select("*").eq("id", issue["page_id"]).execute()
    if not page_res.data:
        raise HTTPException(404, "Page not found")
    page = page_res.data[0]

    from deepseek_client import complete
    prompt = (
        f"Escreva uma meta description atraente de 150-160 caracteres em português (pt-BR) para esta página:\n"
        f"URL: {page['url']}\n"
        f"Título: {page.get('title_current', '')}\n"
        f"H1: {page.get('h1_current', '')}\n\n"
        f"Retorne apenas o texto da meta description, sem aspas, sem explicações."
    )
    suggestion = complete(prompt, max_tokens=200).strip().strip('"').strip("'")[:160]
    return {"suggestion": suggestion, "page_id": page["id"], "url": page["url"]}


class ApplyFixBody(BaseModel):
    description: str

@router.post("/{site_id}/audit/issues/{issue_id}/apply-fix")
async def apply_fix(site_id: str, issue_id: str, body: ApplyFixBody, user=Depends(require_user)):
    """Apply a confirmed meta description fix to WordPress and mark the issue as fixed."""
    db = get_db()
    issue_res = db.table("audit_issues").select("*").eq("id", issue_id).eq("site_id", site_id).execute()
    if not issue_res.data:
        raise HTTPException(404, "Issue not found")
    issue = issue_res.data[0]

    if not issue.get("page_id"):
        raise HTTPException(400, "Issue has no associated page")

    page_res = db.table("pages").select("*").eq("id", issue["page_id"]).execute()
    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not page_res.data or not site_res.data:
        raise HTTPException(404, "Page or site not found")
    page = page_res.data[0]
    site = site_res.data[0]

    now = datetime.now(timezone.utc).isoformat()

    # For WordPress sites: write via plugin
    if site["type"] == "wordpress" and page.get("post_id"):
        creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}
        r = requests.post(
            f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/meta",
            headers=headers,
            json={"description": body.description, "seo_plugin": site.get("seo_plugin", "none")},
            timeout=10,
        )
        if not r.ok:
            raise HTTPException(502, f"WordPress write failed: {r.text}")

    # Update DB
    db.table("pages").update({
        "meta_desc_current": body.description,
        "has_empty_meta": False,
        "last_meta_changed_at": now,
    }).eq("id", page["id"]).execute()

    db.table("audit_issues").update({
        "status": "fixed",
        "fixed_at": now,
    }).eq("id", issue_id).execute()

    return {"fixed": True, "description": body.description}


@router.post("/{site_id}/audit/fix-all-auto")
async def fix_all_auto(site_id: str, user=Depends(require_user)):
    """Mark all open auto-fixable issues as in_progress (bulk trigger)."""
    db = get_db()
    result = db.table("audit_issues").update({"status": "in_progress"}).eq("site_id", site_id).eq("auto_fixable", True).eq("status", "open").execute()
    return {"queued": len(result.data) if result.data else 0}
