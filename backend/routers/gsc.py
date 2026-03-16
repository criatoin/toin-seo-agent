import os
import requests as req_lib
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from database import get_db
from auth import require_user

router = APIRouter()
SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
]


def _get_flow() -> Flow:
    api_url = os.environ.get("NEXT_PUBLIC_API_URL", "").rstrip("/")
    client_config = {
        "web": {
            "client_id":     os.environ["GSC_CLIENT_ID"],
            "client_secret": os.environ["GSC_CLIENT_SECRET"],
            "redirect_uris": [f"{api_url}/api/gsc/callback"],
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     "https://oauth2.googleapis.com/token",
        }
    }
    return Flow.from_client_config(
        client_config, scopes=SCOPES,
        redirect_uri=f"{api_url}/api/gsc/callback"
    )


@router.get("/auth-url")
async def gsc_auth_url(user=Depends(require_user)):
    if not os.environ.get("GSC_CLIENT_ID"):
        raise HTTPException(400, "GSC_CLIENT_ID not configured")
    flow = _get_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return {"url": auth_url}


@router.get("/callback")
async def gsc_callback(request: Request):
    code = request.query_params.get("code")
    panel_url = os.environ.get("PANEL_URL", "")
    if not code:
        return RedirectResponse(f"{panel_url}/configuracoes?gsc=denied")

    flow = _get_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Fetch the authenticated Google email
    google_email = None
    try:
        r = req_lib.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=10,
        )
        if r.ok:
            google_email = r.json().get("email")
    except Exception:
        pass

    # List GSC properties to auto-detect the site
    gsc_sites: list = []
    try:
        r = req_lib.get(
            "https://www.googleapis.com/webmasters/v3/sites",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=10,
        )
        if r.ok:
            gsc_sites = [s["siteUrl"] for s in r.json().get("siteEntry", [])]
    except Exception:
        pass

    db = get_db()
    data = {
        "access_token":  creds.token,
        "refresh_token": creds.refresh_token,
        "token_expiry":  creds.expiry.isoformat() if creds.expiry else None,
        "scopes":        list(creds.scopes or SCOPES),
        "google_email":  google_email,
        "gsc_sites":     gsc_sites,
    }
    existing = db.table("gsc_credentials").select("id").is_("site_id", "null").execute().data
    if existing:
        db.table("gsc_credentials").update(data).is_("site_id", "null").execute()
    else:
        db.table("gsc_credentials").insert(data).execute()

    return RedirectResponse(f"{panel_url}/configuracoes?gsc=connected")


@router.get("/status")
async def gsc_status(user=Depends(require_user)):
    db = get_db()
    result = db.table("gsc_credentials").select(
        "google_email,token_expiry,scopes,gsc_sites"
    ).is_("site_id", "null").execute()
    if not result.data:
        return {"connected": False}
    return {"connected": True, **result.data[0]}


@router.get("/sites")
async def gsc_list_sites(user=Depends(require_user)):
    """List GSC properties visible to the connected account."""
    db = get_db()
    result = db.table("gsc_credentials").select("gsc_sites").is_("site_id", "null").execute()
    if not result.data:
        raise HTTPException(400, "GSC not connected")
    return {"sites": result.data[0].get("gsc_sites") or []}


@router.delete("/disconnect")
async def gsc_disconnect(user=Depends(require_user)):
    db = get_db()
    db.table("gsc_credentials").delete().is_("site_id", "null").execute()
    return {"disconnected": True}
