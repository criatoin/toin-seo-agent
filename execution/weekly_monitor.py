"""Weekly monitor — Phase 4. Runs every Monday."""
from datetime import datetime
from supabase_client import get_db, log

def run(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data

    log(site_id, "weekly-monitor", "start_monitor", "started")

    pages = db.table("pages").select("*").eq("site_id", site_id).execute().data
    alerts_created = 0

    for page in pages:
        position = page.get("gsc_position") or 0

        # Opportunity: position 11-15
        if 11 <= position <= 15 and (page.get("gsc_impressions") or 0) > 100:
            db.table("alerts").insert({
                "site_id": site_id, "page_id": page["id"],
                "severity": "opportunity", "alert_type": "opportunity",
                "title": f"Página próxima da primeira página: {page['url']}",
                "description": f"Posição média {position:.1f} — candidata a impulso de internal links",
                "data": {"position": position, "impressions": page.get("gsc_impressions")}
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
