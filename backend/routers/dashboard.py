from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from auth import require_user

router = APIRouter()


@router.get("/{site_id}")
async def get_dashboard(site_id: str, user=Depends(require_user)):
    db = get_db()

    # Verify site exists
    site = db.table("sites").select("id,name,url,audit_completed_at,last_crawled_at").eq("id", site_id).execute().data
    if not site:
        raise HTTPException(404, "Site not found")
    site = site[0]

    # GSC metrics from pages
    pages = (
        db.table("pages")
        .select("gsc_impressions,gsc_clicks,gsc_ctr,gsc_position")
        .eq("site_id", site_id)
        .execute()
        .data
    )
    total_impressions = sum((p.get("gsc_impressions") or 0) for p in pages)
    total_clicks      = sum((p.get("gsc_clicks") or 0) for p in pages)
    avg_ctr           = total_clicks / total_impressions if total_impressions > 0 else 0
    positioned        = [p["gsc_position"] for p in pages if p.get("gsc_position")]
    avg_position      = sum(positioned) / len(positioned) if positioned else 0

    # Audit summary
    issues = (
        db.table("audit_issues")
        .select("severity,status")
        .eq("site_id", site_id)
        .eq("status", "open")
        .execute()
        .data
    )
    audit_summary = {"critical": 0, "important": 0, "improvement": 0}
    for issue in issues:
        sev = issue.get("severity", "improvement")
        audit_summary[sev] = audit_summary.get(sev, 0) + 1

    # Unread alerts (most recent 5)
    alerts = (
        db.table("alerts")
        .select("id,severity,alert_type,title,description,created_at")
        .eq("site_id", site_id)
        .is_("read_at", "null")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data
    )

    # Pending proposals — join through pages to filter by site_id
    # Use embedded resource filtering to avoid large IN() URLs
    try:
        pending_meta = (
            db.table("meta_proposals")
            .select("id, pages!inner(site_id)")
            .eq("status", "pending")
            .eq("pages.site_id", site_id)
            .execute()
            .data
        )
    except Exception:
        pending_meta = []

    try:
        pending_schema = (
            db.table("schema_proposals")
            .select("id, pages!inner(site_id)")
            .eq("status", "pending")
            .eq("pages.site_id", site_id)
            .execute()
            .data
        )
    except Exception:
        pending_schema = []

    # Latest briefing
    briefing = (
        db.table("content_briefings")
        .select("id,month,status,suggested_pautas,created_at")
        .eq("site_id", site_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )

    return {
        "site": site,
        "gsc": {
            "impressions": total_impressions,
            "clicks":      total_clicks,
            "ctr":         round(avg_ctr, 4),
            "avg_position": round(avg_position, 1),
            "pages_count":  len(pages),
        },
        "audit": {
            "completed_at": site.get("audit_completed_at"),
            "open_issues":  audit_summary,
            "total_open":   sum(audit_summary.values()),
        },
        "alerts":          alerts,
        "pending_proposals": {
            "meta":   len(pending_meta),
            "schema": len(pending_schema),
            "total":  len(pending_meta) + len(pending_schema),
        },
        "latest_briefing": briefing[0] if briefing else None,
    }
