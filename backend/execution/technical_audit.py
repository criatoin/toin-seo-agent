"""Technical audit — Phase 1."""
from datetime import datetime, timezone
from supabase_client import get_db, log
from site_crawler import crawl_sitemap, crawl_page
from pagespeed_client import analyze
import requests, base64

def _wp_get_pages(site: dict) -> list[dict]:
    creds   = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
    headers = {"Authorization": f"Basic {creds}"}
    r = requests.get(f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages", headers=headers, timeout=15)
    return r.json() if r.ok else []

def _add_issue(db, site_id, page_id, severity, category, issue_type, description, recommendation, auto_fixable=False):
    db.table("audit_issues").insert({
        "site_id": site_id, "page_id": page_id,
        "severity": severity, "category": category,
        "issue_type": issue_type, "description": description,
        "recommendation": recommendation, "auto_fixable": auto_fixable,
    }).execute()

def run(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data
    if not site:
        raise ValueError(f"Site {site_id} not found")

    log(site_id, "technical-audit", "start_audit", "started")

    # Clear stale pages and open issues — fresh crawl every time
    db.table("audit_issues").delete().eq("site_id", site_id).eq("status", "open").execute()
    db.table("pages").delete().eq("site_id", site_id).execute()

    urls = crawl_sitemap(site["url"])
    if not urls:
        _add_issue(db, site_id, None, "critical", "indexation", "sitemap_missing",
            "Sitemap XML não encontrado ou inválido", "Gere um sitemap.xml e configure no robots.txt")
        urls = [site["url"]]

    wp_pages = _wp_get_pages(site) if site["type"] == "wordpress" else []
    wp_map   = {p["url"]: p for p in wp_pages}

    seen_titles = {}
    seen_descs  = {}

    for url in urls[:100]:  # limit to 100 pages per audit
        crawl = crawl_page(url)
        if crawl.get("error") or crawl.get("status_code", 200) not in (200, 301, 302):
            continue

        # Get or create page record
        existing = db.table("pages").select("id").eq("site_id", site_id).eq("url", url).execute().data
        schema_current = crawl.get("schema")
        page_data = {
            "site_id":     site_id, "url": url,
            "title_current":     crawl["title"],
            "meta_desc_current": crawl["meta_desc"],
            "h1_current":        crawl["h1s"][0] if crawl["h1s"] else "",
            "canonical_current": crawl["canonical"],
            "audit_has_h1":      len(crawl["h1s"]) == 1,
            "audit_canonical_ok": bool(crawl["canonical"]),
            "schema_current":    schema_current,
            "needs_schema_opt":  schema_current is None,
        }
        if existing:
            db.table("pages").update(page_data).eq("id", existing[0]["id"]).execute()
            page_id = existing[0]["id"]
        else:
            result  = db.table("pages").insert(page_data).execute()
            page_id = result.data[0]["id"]

        # H1 issues
        if not crawl["h1s"]:
            _add_issue(db, site_id, page_id, "important", "onpage", "missing_h1",
                f"Página sem H1: {url}", "Adicione um H1 descritivo à página")
        elif len(crawl["h1s"]) > 1:
            _add_issue(db, site_id, page_id, "important", "onpage", "multiple_h1",
                f"Múltiplos H1 ({len(crawl['h1s'])}): {url}", "Mantenha apenas um H1 por página")

        # Title issues
        if not crawl["title"]:
            _add_issue(db, site_id, page_id, "critical", "onpage", "missing_title",
                f"Título ausente: {url}", "Adicione um título único e descritivo", auto_fixable=False)
        elif crawl["title"] in seen_titles:
            _add_issue(db, site_id, page_id, "important", "onpage", "duplicate_title",
                f"Título duplicado com {seen_titles[crawl['title']]}: {url}", "Use títulos únicos por página")
        seen_titles[crawl["title"]] = url

        # Meta description
        if not crawl["meta_desc"]:
            db.table("pages").update({"has_empty_meta": True}).eq("id", page_id).execute()
            _add_issue(db, site_id, page_id, "important", "onpage", "missing_meta_desc",
                f"Meta description ausente: {url}", "Adicione uma meta description única", auto_fixable=True)
        elif crawl["meta_desc"] in seen_descs:
            _add_issue(db, site_id, page_id, "important", "onpage", "duplicate_meta_desc",
                f"Meta description duplicada: {url}", "Use meta descriptions únicas por página")
        seen_descs[crawl["meta_desc"]] = url

        # Images without alt
        if crawl["images_no_alt"] > 0:
            _add_issue(db, site_id, page_id, "improvement", "onpage", "images_no_alt",
                f"{crawl['images_no_alt']} imagens sem alt text: {url}",
                "Adicione alt text descritivo a todas as imagens")

    # PageSpeed for homepage
    for strategy in ["mobile", "desktop"]:
        try:
            ps = analyze(site["url"], strategy)

            for metric, score_key in [("lcp", "lcp_score"), ("cls", "cls_score"), ("inp", "inp_score")]:
                if ps[score_key] == "poor":
                    _add_issue(db, site_id, None, "critical", "speed", f"{metric}_poor",
                        f"{metric.upper()} {strategy} está ruim: {ps[f'{metric}_ms']:.0f}ms",
                        f"Otimize {metric.upper()} para abaixo do limite recomendado")
                elif ps[score_key] == "needs_improvement":
                    _add_issue(db, site_id, None, "important", "speed", f"{metric}_needs_improvement",
                        f"{metric.upper()} {strategy} precisa de melhoria",
                        f"Otimize {metric.upper()}")
        except Exception as e:
            print(f"PageSpeed error ({strategy}): {e}")

    # Schema check (llms.txt)
    try:
        r = requests.get(f"{site['url'].rstrip('/')}/llms.txt", timeout=5)
        if r.status_code != 200:
            _add_issue(db, site_id, None, "improvement", "schema", "missing_llms_txt",
                "llms.txt ausente na raiz do domínio",
                "Crie um llms.txt para melhor visibilidade em AI Overviews", auto_fixable=True)
    except Exception:
        pass

    db.table("sites").update({"audit_completed_at": datetime.now(timezone.utc).isoformat()}).eq("id", site_id).execute()
    log(site_id, "technical-audit", "complete_audit", "success")
    print(f"✅ Auditoria concluída para {site['url']}")
