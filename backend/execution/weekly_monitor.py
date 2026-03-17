"""
Weekly Monitor — Fase 4 do Agente SEO Sênior.
Executa toda segunda-feira APÓS o sync-gsc.
Salva snapshot semanal e compara com semana anterior para detectar anomalias reais.
"""
import json
from datetime import date, timedelta
from supabase_client import get_db, log


def _get_week_date() -> date:
    """Returns the Sunday (start) of the current week."""
    today = date.today()
    # date.weekday(): Monday=0 ... Sunday=6
    # We want the Sunday before (or today if Sunday)
    days_since_sunday = (today.weekday() + 1) % 7
    return today - timedelta(days=days_since_sunday)


def _save_snapshots(db, site_id: str, week_date: date):
    """Save current GSC metrics as snapshot for this week (upsert)."""
    pages = (db.table("pages")
        .select("id,site_id,gsc_impressions,gsc_clicks,gsc_ctr,gsc_position")
        .eq("site_id", site_id)
        .execute().data)

    for page in pages:
        if page.get("gsc_impressions") is None and page.get("gsc_clicks") is None:
            continue  # Skip pages with no GSC data yet
        try:
            db.table("gsc_snapshots").upsert({
                "site_id":    site_id,
                "page_id":    page["id"],
                "week_date":  str(week_date),
                "impressions": page.get("gsc_impressions"),
                "clicks":      page.get("gsc_clicks"),
                "ctr":         page.get("gsc_ctr"),
                "position":    page.get("gsc_position"),
            }, on_conflict="page_id,week_date").execute()
        except Exception:
            pass  # Non-critical: skip individual failures


def _create_alert(db, site_id: str, page_id, severity: str, alert_type: str,
                  title: str, description: str, data: dict):
    db.table("alerts").insert({
        "site_id":     site_id,
        "page_id":     page_id,
        "severity":    severity,
        "alert_type":  alert_type,
        "title":       title,
        "description": description,
        "data":        json.dumps(data),
    }).execute()


def run(site_id: str):
    db = get_db()

    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not site_res.data:
        raise ValueError(f"Site {site_id} not found")

    week_date      = _get_week_date()
    last_week_date = week_date - timedelta(days=7)

    log(site_id, "weekly-monitor", "start", "info",
        week_date=str(week_date), last_week_date=str(last_week_date))

    # Step 1: Save current snapshot
    _save_snapshots(db, site_id, week_date)

    # Step 2: Fetch current and previous snapshots
    current_snaps = {
        s["page_id"]: s
        for s in db.table("gsc_snapshots")
            .select("*").eq("site_id", site_id).eq("week_date", str(week_date))
            .execute().data
    }
    previous_snaps = {
        s["page_id"]: s
        for s in db.table("gsc_snapshots")
            .select("*").eq("site_id", site_id).eq("week_date", str(last_week_date))
            .execute().data
    }

    # Step 3: Compare and generate alerts
    alert_count = 0

    for page_id, curr in current_snaps.items():
        prev = previous_snaps.get(page_id)
        if not prev:
            continue  # No history yet for this page

        curr_clicks = curr.get("clicks") or 0
        prev_clicks = prev.get("clicks") or 0
        curr_impr   = curr.get("impressions") or 0
        prev_impr   = prev.get("impressions") or 0
        curr_pos    = curr.get("position")
        prev_pos    = prev.get("position")

        # Fetch page URL for alert description
        page_res = db.table("pages").select("url").eq("id", page_id).execute()
        page_url = page_res.data[0]["url"] if page_res.data else page_id

        # 3a: Traffic drop > 20%
        if prev_clicks > 10 and curr_clicks < prev_clicks * 0.8:
            delta_pct = round((curr_clicks - prev_clicks) / prev_clicks * 100, 1)
            _create_alert(db, site_id, page_id,
                severity="critical",
                alert_type="traffic_drop",
                title=f"Queda de tráfego: {page_url}",
                description=f"Cliques caíram {abs(delta_pct)}% vs semana anterior ({prev_clicks} → {curr_clicks})",
                data={"clicks_before": prev_clicks, "clicks_after": curr_clicks, "delta_pct": delta_pct, "url": page_url})
            alert_count += 1

        # 3b: Possible deindex — had impressions, now zero
        if prev_impr > 50 and curr_impr == 0:
            _create_alert(db, site_id, page_id,
                severity="critical",
                alert_type="possible_deindex",
                title=f"Possível desindexação: {page_url}",
                description=f"Página tinha {prev_impr} impressões na semana passada e agora tem 0",
                data={"impressions_before": prev_impr, "impressions_after": 0, "url": page_url})
            alert_count += 1

        # 3c: Position drop > 5 in pages with real traffic
        if curr_clicks > 10 and prev_pos and curr_pos and curr_pos > prev_pos + 5:
            _create_alert(db, site_id, page_id,
                severity="warning",
                alert_type="position_drop",
                title=f"Queda de posição: {page_url}",
                description=f"Posição caiu de {prev_pos:.1f} para {curr_pos:.1f} (↓ {curr_pos - prev_pos:.1f} posições)",
                data={"position_before": float(prev_pos), "position_after": float(curr_pos), "url": page_url})
            alert_count += 1

        # 3d: Opportunity — position 11-15 with good impressions
        if curr_impr > 100 and curr_pos and 11.0 <= curr_pos <= 15.9:
            _create_alert(db, site_id, page_id,
                severity="opportunity",
                alert_type="opportunity",
                title=f"Oportunidade de crescimento: {page_url}",
                description=f"Posição {curr_pos:.1f} com {curr_impr} impressões — candidata a impulso de links internos",
                data={"position": float(curr_pos), "impressions": curr_impr, "url": page_url})
            alert_count += 1

    # Step 4: CWV regression check — re-fetch PageSpeed for top 5 pages
    try:
        from pagespeed_client import analyze
        top_pages = (db.table("pages").select("id,url,audit_lcp_score")
            .eq("site_id", site_id)
            .order("gsc_clicks", desc=True)
            .limit(5).execute().data)

        for page in top_pages:
            if not page.get("audit_lcp_score"):
                continue
            try:
                ps = analyze(page["url"], "mobile")
                new_lcp = ps.get("lcp_score", "")
                if page["audit_lcp_score"] == "good" and new_lcp == "poor":
                    _create_alert(db, site_id, page["id"],
                        severity="critical",
                        alert_type="cwv_regression",
                        title=f"CWV regrediu: {page['url']}",
                        description="LCP passou de 'bom' para 'ruim' — possível impacto de deploy recente",
                        data={"lcp_before": "good", "lcp_after": "poor", "url": page["url"]})
                    alert_count += 1
                    # Update DB
                    db.table("pages").update({"audit_lcp_score": new_lcp}).eq("id", page["id"]).execute()
            except Exception:
                pass
    except Exception as e:
        log(site_id, "weekly-monitor", "cwv_check", "warning", error=str(e))

    # Step 5: All stable if no anomalies
    if alert_count == 0:
        _create_alert(db, site_id, None,
            severity="opportunity",
            alert_type="all_stable",
            title="Tudo estável esta semana",
            description="Nenhuma anomalia detectada. Continue monitorando.",
            data={"week_date": str(week_date)})

    log(site_id, "weekly-monitor", "complete", "info",
        alerts_generated=alert_count, week_date=str(week_date))

    return {"alerts_generated": alert_count, "week_date": str(week_date)}
