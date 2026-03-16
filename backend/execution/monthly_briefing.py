"""Monthly content briefing generator — Phase 3."""
from datetime import datetime, date
from supabase_client import get_db, log
from deepseek_client import complete
from trends_client import get_trending_topics
import json

def run(site_id: str):
    db    = get_db()
    s_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not s_res.data:
        raise ValueError(f"Site {site_id} not found")
    site = s_res.data[0]

    log(site_id, "monthly-briefing", "start_briefing", "started")

    # Get weak pages (candidates for merge/delete)
    pages = db.table("pages").select("*").eq("site_id", site_id).execute().data
    weak_pages = [p for p in pages if p.get("gsc_clicks") is not None and p["gsc_clicks"] < 10]

    # Get content gaps (pages with impressions but no clicks)
    gaps = [p for p in pages if (p.get("gsc_impressions") or 0) > 50 and (p.get("gsc_clicks") or 0) == 0]

    # Get trending topics for this site's domain
    try:
        domain_keywords = [site["name"]] if site.get("name") else ["marketing digital", "SEO"]
        trends = get_trending_topics(domain_keywords[:5], geo="BR")
    except Exception as e:
        print(f"Trends error: {e}")
        trends = {}

    # Build prompt context
    weak_urls = [p["url"] for p in weak_pages[:10]]
    gap_urls  = [{"url": p["url"], "impressions": p.get("gsc_impressions")} for p in gaps[:10]]

    prompt = f"""You are an SEO content strategist for a Brazilian website.

Site: {site['url']}
Month: {datetime.now().strftime('%B %Y')}

Weak pages (< 10 clicks in last period): {json.dumps(weak_urls)}
Content gaps (impressions but no clicks): {json.dumps(gap_urls)}

Based on these content gaps and the current month, suggest 3-5 content pieces.

Return valid JSON:
{{
  "suggested_pautas": [
    {{
      "title": "...",
      "search_intent": "informational|transactional|navigational",
      "target_queries": ["query1", "query2"],
      "content_type": "post|landing|faq|video+text",
      "potential": "high|medium|low",
      "rationale": "..."
    }}
  ],
  "pages_to_merge": [
    {{"url": "...", "reason": "..."}}
  ]
}}

All text in Portuguese (pt-BR). Focus on data-driven suggestions."""

    data = {"suggested_pautas": [], "pages_to_merge": []}
    try:
        response = complete(prompt)
        # Strip markdown fences if present
        response = response.strip()
        if response.startswith("```"):
            response = response.split("```", 2)[1]
            if response.startswith("json"):
                response = response[4:]
        start = response.find("{")
        end   = response.rfind("}") + 1
        data  = json.loads(response[start:end])
    except Exception as e:
        log(site_id, "monthly-briefing", "generate_briefing", "error", error=str(e))
        # Continue and insert empty briefing so the record exists

    month_start = date.today().replace(day=1).isoformat()

    db.table("content_briefings").insert({
        "site_id":          site_id,
        "month":            month_start,
        "trends_data":      trends,
        "content_gaps":     gap_urls,
        "suggested_pautas": data.get("suggested_pautas", []),
        "pages_to_merge":   data.get("pages_to_merge", []),
    }).execute()

    log(site_id, "monthly-briefing", "complete_briefing", "success")
    print(f"✅ Monthly briefing generated for site {site_id}")
