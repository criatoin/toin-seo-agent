"""GEO optimizer — AI search visibility (Phase 4 supplement)."""
from supabase_client import get_db, log
from deepseek_client import complete
import requests, json

def _check_llms_txt(site_url: str) -> bool:
    try:
        r = requests.get(f"{site_url.rstrip('/')}/llms.txt", timeout=5)
        return r.status_code == 200
    except Exception:
        return False

def generate_llms_txt(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data

    if _check_llms_txt(site["url"]):
        print(f"✅ llms.txt already exists for {site['url']}")
        return

    pages = db.table("pages").select("url, title_current, h1_current").eq("site_id", site_id).limit(50).execute().data

    page_list = "\n".join([f"- {p['url']}: {p.get('title_current', '')}" for p in pages[:30]])

    prompt = f"""Generate an llms.txt file for this website.

Site: {site['url']}
Site name: {site.get('name', site['url'])}

Key pages:
{page_list}

The llms.txt format should:
1. Start with a # heading with the site name
2. Include a brief description
3. List key sections/pages with descriptions
4. Follow the llms.txt specification

Return only the file content, no explanation."""

    try:
        content = complete(prompt)
    except Exception as e:
        log(site_id, "geo-optimizer", "generate_llms_txt", "error", error=str(e))
        return

    # Store as a schema proposal for approval
    try:
        db.table("schema_proposals").insert({
            "page_id":     None,
            "schema_type": "llms_txt",
            "schema_json": {"content": content, "filename": "llms.txt"},
            "rationale":   "llms.txt gerado para melhorar visibilidade em AI Overviews (requer aprovação para publicar)",
        }).execute()
        log(site_id, "geo-optimizer", "generate_llms_txt", "success")
        print(f"✅ llms.txt proposal created for {site['url']} — awaiting approval")
    except Exception as e:
        log(site_id, "geo-optimizer", "generate_llms_txt", "error", error=str(e))

def run(site_id: str):
    generate_llms_txt(site_id)
