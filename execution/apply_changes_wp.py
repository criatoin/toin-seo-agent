"""Applies approved meta/schema proposals to WordPress sites."""
import os, requests, base64
from supabase_client import get_db, log
from dotenv import load_dotenv
load_dotenv()

ALLOWED_SITES = [s.strip() for s in os.environ.get("GSC_ALLOWED_SITES", "").split(",")]

def _validate_site(site: dict):
    if site["url"] not in ALLOWED_SITES:
        raise PermissionError(f"Site {site['url']} not in GSC_ALLOWED_SITES")
    if not site.get("active"):
        raise PermissionError(f"Site {site['url']} is not active")
    if site["type"] != "wordpress":
        raise PermissionError("Only WordPress sites supported for writes")

def _wp_headers(site: dict) -> dict:
    creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
    return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}

def apply_approved_meta(site_id: str):
    db    = get_db()
    site  = db.table("sites").select("*").eq("id", site_id).single().execute().data
    _validate_site(site)

    proposals = (db.table("meta_proposals")
        .select("*, pages(id, post_id, url, site_id)")
        .eq("status", "approved")
        .execute().data)

    for p in proposals:
        page = p["pages"]
        if page["site_id"] != site_id:
            continue
        post_id = page["post_id"]
        if not post_id:
            continue

        variant = p["chosen_variant"]
        if variant in ("v1", "v2", "v3"):
            title = p.get(f"{variant}_title")
            desc  = p.get(f"{variant}_description")
        else:
            title = p.get("custom_title")
            desc  = p.get("custom_description")

        log(site_id, "apply-approved", "write_meta", "started",
            payload={"post_id": post_id, "title": title, "desc": desc}, page_id=page["id"])

        r = requests.post(
            f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{post_id}/meta",
            headers=_wp_headers(site),
            json={"title": title, "description": desc, "seo_plugin": site["seo_plugin"]},
            timeout=10
        )

        if r.ok:
            db.table("meta_proposals").update({
                "status": "applied", "applied_at": "now()"
            }).eq("id", p["id"]).execute()
            db.table("pages").update({
                "title_current": title, "meta_desc_current": desc,
                "last_meta_changed_at": "now()"
            }).eq("url", page["url"]).execute()
            log(site_id, "apply-approved", "write_meta", "success", response=r.json())
        else:
            log(site_id, "apply-approved", "write_meta", "error", error=r.text)

def apply_safe_routines(site_id: str):
    """Auto-fills empty meta descriptions and fixes missing canonicals."""
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data
    _validate_site(site)

    cfg = db.table("settings").select("*").eq("site_id", site_id).single().execute().data or {}

    if cfg.get("auto_fill_empty_meta", True):
        pages = db.table("pages").select("*").eq("site_id", site_id).eq("has_empty_meta", True).execute().data
        for page in pages:
            if not page.get("post_id"):
                continue
            from deepseek_client import complete
            prompt = f"Write a compelling 150-160 character meta description for this page:\nURL: {page['url']}\nTitle: {page.get('title_current','')}\nH1: {page.get('h1_current','')}\n\nReturn only the meta description text, nothing else."
            meta_desc = complete(prompt)[:160]

            log(site_id, "apply-safe-routines", "write_meta", "started", payload={"post_id": page["post_id"]})
            r = requests.post(
                f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/meta",
                headers=_wp_headers(site),
                json={"description": meta_desc, "seo_plugin": site["seo_plugin"]},
                timeout=10
            )
            if r.ok:
                db.table("pages").update({"meta_desc_current": meta_desc, "has_empty_meta": False}).eq("id", page["id"]).execute()
                log(site_id, "apply-safe-routines", "write_meta", "success")

def run(site_id: str):
    apply_safe_routines(site_id)
    apply_approved_meta(site_id)
