import os, httpx, base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import require_user

router = APIRouter()

class SiteCreate(BaseModel):
    name: str
    url: str
    type: str = "wordpress"

class ConnectInit(BaseModel):
    site_url: str

class ConnectFinalize(BaseModel):
    site_url: str
    wp_user: str
    wp_app_password: str

@router.get("")
async def list_sites(user=Depends(require_user)):
    db = get_db()
    return db.table("sites").select("*").order("created_at", desc=True).execute().data

@router.post("")
async def create_site(body: SiteCreate, user=Depends(require_user)):
    db = get_db()
    result = db.table("sites").insert(body.model_dump()).execute()
    return result.data[0]

@router.get("/{site_id}")
async def get_site(site_id: str, user=Depends(require_user)):
    db = get_db()
    result = db.table("sites").select("*").eq("id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Site not found")
    return result.data[0]

@router.patch("/{site_id}")
async def update_site(site_id: str, body: dict, user=Depends(require_user)):
    db = get_db()
    result = db.table("sites").update(body).eq("id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Site not found")
    return result.data[0]

@router.delete("/{site_id}")
async def delete_site(site_id: str, user=Depends(require_user)):
    db = get_db()
    db.table("sites").delete().eq("id", site_id).execute()
    return {"deleted": True}

@router.post("/connect/init")
async def connect_init(body: ConnectInit, user=Depends(require_user)):
    panel_url = os.environ.get("PANEL_URL", "").rstrip("/")
    callback  = f"{panel_url}/sites/connect/callback"
    auth_url  = (
        f"{body.site_url.rstrip('/')}/wp-admin/authorize-application.php"
        f"?app_name=TOIN+SEO+Agent&success_url={callback}"
    )
    return {"auth_url": auth_url}

@router.post("/connect/finalize")
async def connect_finalize(body: ConnectFinalize, user=Depends(require_user)):
    creds   = base64.b64encode(f"{body.wp_user}:{body.wp_app_password}".encode()).decode()
    headers = {"Authorization": f"Basic {creds}"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{body.site_url.rstrip('/')}/wp-json/toin-seo/v1/status",
            headers=headers
        )
    if r.status_code != 200:
        raise HTTPException(400, f"Cannot connect to WordPress plugin: HTTP {r.status_code}")
    status = r.json()

    db = get_db()
    existing = db.table("sites").select("id").eq("url", body.site_url).execute().data
    site_data = {
        "name":            status.get("site_name", body.site_url),
        "url":             body.site_url,
        "type":            "wordpress",
        "active":          True,
        "wp_user":         body.wp_user,
        "wp_app_password": body.wp_app_password,
        "seo_plugin":      status.get("seo_plugin_detected", "none"),
        "gsc_site_url":    body.site_url,
    }
    if existing:
        result = db.table("sites").update(site_data).eq("url", body.site_url).execute()
    else:
        result = db.table("sites").insert(site_data).execute()
        db.table("settings").insert({"site_id": result.data[0]["id"]}).execute()

    return result.data[0]
