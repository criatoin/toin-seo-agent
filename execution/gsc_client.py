import os
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from supabase_client import get_db, log
from dotenv import load_dotenv

load_dotenv()


def _get_credentials() -> Credentials:
    """Load GSC credentials from Supabase and refresh if needed."""
    db = get_db()
    result = db.table("gsc_credentials").select("*").is_("site_id", "null").execute()
    if not result.data:
        raise RuntimeError("GSC not connected. Go to /configuracoes and click 'Conectar com Google'.")
    row = result.data[0]

    creds = Credentials(
        token=row["access_token"],
        refresh_token=row["refresh_token"],
        client_id=os.environ["GSC_CLIENT_ID"],
        client_secret=os.environ["GSC_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=row.get("scopes") or ["https://www.googleapis.com/auth/webmasters.readonly"],
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        db.table("gsc_credentials").update({
            "access_token": creds.token,
            "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
            "updated_at":   datetime.now().isoformat(),
        }).is_("site_id", "null").execute()

    return creds


def _validate_site_url(site_url: str) -> None:
    allowed = [s.strip() for s in os.environ.get("GSC_ALLOWED_SITES", "").split(",") if s.strip()]
    if site_url not in allowed:
        raise PermissionError(
            f"Site '{site_url}' is not in GSC_ALLOWED_SITES. "
            f"Allowed: {allowed}"
        )


def fetch_site_data(site_url: str, days: int = 90) -> list[dict]:
    """Fetch Search Analytics data for a site from GSC."""
    _validate_site_url(site_url)

    creds   = _get_credentials()
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)

    end_date   = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    body = {
        "startDate":  start_date.isoformat(),
        "endDate":    end_date.isoformat(),
        "dimensions": ["page"],
        "rowLimit":   1000,
    }
    response = service.searchanalytics().query(siteUrl=site_url, body=body).execute()
    return response.get("rows", [])


def run(site_id: str) -> None:
    """Sync GSC data for a site into the pages table. Called by the sync-gsc job."""
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).execute()
    if not site.data:
        raise ValueError(f"Site {site_id} not found")
    site = site.data[0]

    log(site_id, "sync-gsc", "fetch_gsc_data", "started")
    try:
        rows = fetch_site_data(site.get("gsc_site_url") or site["url"])
    except Exception as e:
        log(site_id, "sync-gsc", "fetch_gsc_data", "error", error=str(e))
        raise

    updated = 0
    for row in rows:
        url         = row["keys"][0]
        impressions = int(row.get("impressions", 0))
        clicks      = int(row.get("clicks", 0))
        ctr         = round(float(row.get("ctr", 0)), 4)
        position    = round(float(row.get("position", 0)), 2)

        page_data = {
            "gsc_impressions": impressions,
            "gsc_clicks":      clicks,
            "gsc_ctr":         ctr,
            "gsc_position":    position,
            "last_synced_at":  datetime.now().isoformat(),
        }
        existing = db.table("pages").select("id").eq("site_id", site_id).eq("url", url).execute().data
        if existing:
            db.table("pages").update(page_data).eq("id", existing[0]["id"]).execute()
        else:
            db.table("pages").insert({"site_id": site_id, "url": url, **page_data}).execute()
        updated += 1

    log(site_id, "sync-gsc", "fetch_gsc_data", "success", response={"rows_synced": updated})
    print(f"✅ GSC sync: {updated} pages updated for site {site_id}")
