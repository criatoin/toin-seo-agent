"""Weekly monitor — Phase 4. Runs every Monday."""
from datetime import datetime
from supabase_client import get_db, log

def run(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data

    log(site_id, "weekly-monitor", "start_monitor", "started")

    pages = db.table("pages").select("*").eq("site_id", site_id).execute().data
    alerts_created = 0

    # Check for unread duplicate alerts to avoid spamming
    def _alert_exists(page_id, alert_type):
        result = db.table("alerts").select("id").eq("site_id", site_id).is_("read_at", "null")
        if page_id:
            result = result.eq("page_id", page_id)
        result = result.eq("alert_type", alert_type).execute().data
        return len(result) > 0

    for page in pages:
        position    = page.get("gsc_position") or 0
        impressions = page.get("gsc_impressions") or 0
        clicks      = page.get("gsc_clicks") or 0
        ctr         = page.get("gsc_ctr") or 0

        # Critical: page with good impressions but very low clicks (possible ranking drop)
        if impressions > 500 and clicks < 5 and position > 20:
            if not _alert_exists(page["id"], "traffic_drop"):
                db.table("alerts").insert({
                    "site_id": site_id, "page_id": page["id"],
                    "severity": "critical", "alert_type": "traffic_drop",
                    "title": f"Queda de tráfego detectada: {page['url']}",
                    "description": f"Página com {impressions} impressões mas apenas {clicks} cliques (posição {position:.1f}). Possível perda de ranking.",
                    "data": {"position": position, "impressions": impressions, "clicks": clicks, "ctr": ctr}
                }).execute()
                alerts_created += 1

        # Warning: position regressed to 20+ for high-impression page
        if impressions > 200 and position > 20:
            if not _alert_exists(page["id"], "opportunity"):
                pass  # Don't double-alert if already flagged as traffic_drop

        # Opportunity: position 11-15 — candidate for internal link boost
        if 11 <= position <= 15 and impressions > 100:
            if not _alert_exists(page["id"], "opportunity"):
                db.table("alerts").insert({
                    "site_id": site_id, "page_id": page["id"],
                    "severity": "opportunity", "alert_type": "opportunity",
                    "title": f"Página próxima da primeira página: {page['url']}",
                    "description": f"Posição média {position:.1f} — candidata a impulso de internal links",
                    "data": {"position": position, "impressions": impressions}
                }).execute()
                alerts_created += 1

    if alerts_created == 0:
        db.table("alerts").insert({
            "site_id": site_id, "severity": "opportunity", "alert_type": "stable",
            "title": "Tudo estável — sem ações necessárias esta semana",
            "description": f"Monitor semanal de {datetime.now().strftime('%d/%m/%Y')} sem anomalias detectadas.",
        }).execute()

    log(site_id, "weekly-monitor", "complete_monitor", "success", response={"alerts": alerts_created})
    print(f"✅ Monitor semanal: {alerts_created} alertas gerados")
