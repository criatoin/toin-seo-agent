"""Schema proposal generator."""
from supabase_client import get_db, log
from deepseek_client import complete
import json

SCHEMA_TYPES = {
    "page":       "WebPage",
    "post":       "Article",
    "product":    "Product",
    "service":    "Service",
}

def _detect_schema_type(page: dict) -> str:
    post_type = page.get("post_type", "page")
    return SCHEMA_TYPES.get(post_type, "WebPage")

def generate_schema_proposals(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data

    pages = db.table("pages").select("*").eq("site_id", site_id).eq("needs_schema_opt", True).execute().data

    for page in pages:
        existing = db.table("schema_proposals").select("id").eq("page_id", page["id"]).eq("status", "pending").execute().data
        if existing:
            continue

        schema_type = _detect_schema_type(page)
        prompt = f"""Generate a complete, valid JSON-LD schema markup for this page.

Schema type: {schema_type}
URL: {page['url']}
Title: {page.get('title_current', '')}
Description: {page.get('meta_desc_current', '')}
H1: {page.get('h1_current', '')}

Return only the JSON-LD object (the content of the <script type="application/ld+json"> tag).
Must be valid JSON. Include all relevant properties for {schema_type}."""

        try:
            response = complete(prompt)
            start = response.find("{")
            end   = response.rfind("}") + 1
            schema_json = json.loads(response[start:end])
        except Exception as e:
            log(site_id, "generate-proposals", "generate_schema", "error", error=str(e), page_id=page["id"])
            continue

        db.table("schema_proposals").insert({
            "page_id":     page["id"],
            "schema_type": schema_type,
            "schema_json": schema_json,
            "rationale":   f"Schema {schema_type} gerado automaticamente para {page['url']}",
        }).execute()
        log(site_id, "generate-proposals", "generate_schema", "success", page_id=page["id"])

    print(f"✅ Schema proposals generated for site {site_id}")

def run(site_id: str):
    generate_schema_proposals(site_id)
