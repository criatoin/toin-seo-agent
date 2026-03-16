"""Meta proposal generator — Phase 2."""
from datetime import datetime, timedelta
from supabase_client import get_db, log
from deepseek_client import complete
import json

def _cooldown_ok(page: dict, cooldown_days: int) -> bool:
    last = page.get("last_meta_changed_at")
    if not last:
        return True
    last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
    return datetime.now(last_dt.tzinfo) - last_dt > timedelta(days=cooldown_days)

def generate_proposals(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data
    cfg  = db.table("settings").select("*").eq("site_id", site_id).single().execute().data or {}

    cooldown = cfg.get("meta_cooldown_days", 60)
    min_imp  = cfg.get("min_impressions_for_meta_opt", 200)
    min_ctr  = float(cfg.get("min_ctr_threshold", 0.02))

    pages = db.table("pages").select("*").eq("site_id", site_id).execute().data

    for page in pages:
        if not _cooldown_ok(page, cooldown):
            continue

        reason = None
        if page.get("has_empty_meta"):
            reason = "empty_meta"
        elif (page.get("gsc_impressions") or 0) >= min_imp and \
             5 <= (page.get("gsc_position") or 99) <= 15 and \
             (page.get("gsc_ctr") or 1) < min_ctr:
            reason = "low_ctr"

        if not reason:
            continue

        existing = db.table("meta_proposals").select("id").eq("page_id", page["id"]).eq("status", "pending").execute().data
        if existing:
            continue

        prompt = f"""You are an SEO expert. Generate 3 title+description variations for this page.

URL: {page['url']}
Current title: {page.get('title_current', '')}
Current description: {page.get('meta_desc_current', '')}
H1: {page.get('h1_current', '')}
GSC position: {page.get('gsc_position', 'unknown')}
GSC CTR: {page.get('gsc_ctr', 'unknown')}
Trigger: {reason}

Return valid JSON with this structure:
{{
  "v1": {{"title": "...", "description": "...", "rationale": "..."}},
  "v2": {{"title": "...", "description": "...", "rationale": "..."}},
  "v3": {{"title": "...", "description": "...", "rationale": "..."}}
}}

V1: Conservative refinement. V2: Benefit + CTA. V3: AI/featured snippet (direct answer format).
Title max 65 chars. Description 150-160 chars. In Portuguese (pt-BR)."""

        try:
            response = complete(prompt)
            start = response.find("{")
            end   = response.rfind("}") + 1
            data  = json.loads(response[start:end])
        except Exception as e:
            log(site_id, "generate-proposals", "generate_meta", "error", error=str(e), page_id=page["id"])
            continue

        cooldown_until = (datetime.now() + timedelta(days=cooldown)).isoformat()
        db.table("meta_proposals").insert({
            "page_id": page["id"], "trigger_reason": reason,
            "v1_title": data["v1"]["title"], "v1_description": data["v1"]["description"], "v1_rationale": data["v1"]["rationale"],
            "v2_title": data["v2"]["title"], "v2_description": data["v2"]["description"], "v2_rationale": data["v2"]["rationale"],
            "v3_title": data["v3"]["title"], "v3_description": data["v3"]["description"], "v3_rationale": data["v3"]["rationale"],
            "cooldown_until": cooldown_until,
        }).execute()
        log(site_id, "generate-proposals", "generate_meta", "success", page_id=page["id"])

    print(f"✅ Meta proposals generated for site {site_id}")

def run(site_id: str):
    generate_proposals(site_id)
