"""Monthly report generator."""
from datetime import datetime, date, timedelta
from supabase_client import get_db, log
from deepseek_client import complete

def run(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data

    log(site_id, "generate-report", "start_report", "started")

    today      = date.today()
    period_end = today.replace(day=1) - timedelta(days=1)
    period_start = period_end.replace(day=1)

    pages   = db.table("pages").select("*").eq("site_id", site_id).execute().data
    issues  = db.table("audit_issues").select("*").eq("site_id", site_id).eq("status", "fixed").execute().data
    alerts  = db.table("alerts").select("*").eq("site_id", site_id).gte("created_at", period_start.isoformat()).execute().data

    total_impressions = sum(p.get("gsc_impressions") or 0 for p in pages)
    total_clicks      = sum(p.get("gsc_clicks") or 0 for p in pages)
    avg_ctr           = (total_clicks / total_impressions) if total_impressions > 0 else 0
    avg_position      = sum(p.get("gsc_position") or 0 for p in pages if p.get("gsc_position")) / max(len([p for p in pages if p.get("gsc_position")]), 1)
    pages_with_schema = sum(1 for p in pages if p.get("schema_current"))
    schema_coverage   = pages_with_schema / max(len(pages), 1)

    prompt = f"""Generate a concise monthly SEO report in Markdown for:

Site: {site['url']}
Period: {period_start.strftime('%d/%m/%Y')} to {period_end.strftime('%d/%m/%Y')}

KPIs:
- Total impressions: {total_impressions}
- Total clicks: {total_clicks}
- Average CTR: {avg_ctr:.1%}
- Average position: {avg_position:.1f}
- Issues fixed: {len(issues)}
- Schema coverage: {schema_coverage:.0%}
- Alerts generated: {len(alerts)}

Write a professional 2-3 paragraph summary with highlights and recommendations in Portuguese (pt-BR).
Use markdown formatting."""

    try:
        markdown = complete(prompt)
    except Exception as e:
        markdown = f"Relatório automático — {period_start.strftime('%m/%Y')}"
        log(site_id, "generate-report", "generate_markdown", "error", error=str(e))

    try:
        db.table("reports").insert({
            "site_id":              site_id,
            "period_start":         period_start.isoformat(),
            "period_end":           period_end.isoformat(),
            "markdown":             markdown,
            "kpi_impressions":      total_impressions,
            "kpi_clicks":           total_clicks,
            "kpi_ctr":              round(avg_ctr, 4),
            "kpi_avg_position":     round(avg_position, 2),
            "kpi_issues_fixed":     len(issues),
            "kpi_schema_coverage":  round(schema_coverage, 4),
            "kpi_pages_optimized":  len([p for p in pages if p.get("last_meta_changed_at")]),
        }).execute()
        log(site_id, "generate-report", "complete_report", "success")
    except Exception as e:
        log(site_id, "generate-report", "complete_report", "error", error=str(e))

    print(f"✅ Report generated for {site['url']} — {period_start.strftime('%m/%Y')}")
