"""Technical audit — Phase 1."""
from datetime import datetime, timezone
from supabase_client import get_db, log
from site_crawler import crawl_sitemap, crawl_page
from pagespeed_client import analyze
import requests, base64
import urllib.robotparser
import asyncio
from urllib.parse import urljoin, urlparse

def _wp_get_pages(site: dict) -> list[dict]:
    creds   = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
    headers = {"Authorization": f"Basic {creds}"}
    r = requests.get(f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages", headers=headers, timeout=15)
    return r.json() if r.ok else []

def _norm_url(url: str) -> str:
    """Normalize URL for comparison: strip protocol, www, and trailing slash."""
    u = url.lower().strip()
    for prefix in ("https://www.", "http://www.", "https://", "http://"):
        if u.startswith(prefix):
            u = u[len(prefix):]
            break
    return u.rstrip("/")

def _add_issue(db, site_id, page_id, severity, category, issue_type, description, recommendation, auto_fixable=False):
    db.table("audit_issues").insert({
        "site_id": site_id, "page_id": page_id,
        "severity": severity, "category": category,
        "issue_type": issue_type, "description": description,
        "recommendation": recommendation, "auto_fixable": auto_fixable,
    }).execute()

def _check_redirect_chain(url: str) -> list[str]:
    """Follow redirects and return the chain of URLs. Empty list = no chain."""
    try:
        r = requests.get(url, timeout=5, headers={"User-Agent": "TOINSEOBot/1.0"},
                         allow_redirects=True)
        if len(r.history) >= 2:
            return [h.url for h in r.history] + [r.url]
        return []
    except Exception:
        return []


def run(site_id: str):
    db   = get_db()
    site = db.table("sites").select("*").eq("id", site_id).single().execute().data
    if not site:
        raise ValueError(f"Site {site_id} not found")

    site_url = site["url"]
    log(site_id, "technical-audit", "start_audit", "started")

    # Clear only open/in_progress issues — keep fixed/dismissed history
    # Do NOT delete pages: preserves post_id, gsc_* data, and issue history across audits
    db.table("audit_issues").delete().eq("site_id", site_id).in_("status", ["open", "in_progress"]).execute()

    urls = crawl_sitemap(site["url"])
    if not urls:
        _add_issue(db, site_id, None, "critical", "indexation", "sitemap_missing",
            "Sitemap XML não encontrado ou inválido", "Gere um sitemap.xml e configure no robots.txt")
        urls = [site["url"]]

    wp_pages   = _wp_get_pages(site) if site["type"] == "wordpress" else []
    wp_map     = {p["url"]: p for p in wp_pages}
    # Normalized fallback map (handles http/https, www, trailing slash mismatches)
    wp_map_norm = {_norm_url(p["url"]): p for p in wp_pages}

    # Auto-detect seo_plugin from WP if not yet set on site record
    if wp_pages and not site.get("seo_plugin"):
        detected = wp_pages[0].get("seo_plugin")
        if detected:
            db.table("sites").update({"seo_plugin": detected}).eq("id", site_id).execute()
            site["seo_plugin"] = detected

    # ── Phase A: Link ALL sitemap URLs to WP post_ids (even uncrawled ones) ──
    # This ensures every page in the DB gets a post_id if it exists in WP,
    # regardless of whether it gets fully crawled below.
    for url in urls:
        wp_entry = (wp_map.get(url)
                    or wp_map.get(url.rstrip("/") + "/")
                    or wp_map.get(url.rstrip("/"))
                    or wp_map_norm.get(_norm_url(url)))
        if not wp_entry:
            continue
        existing = db.table("pages").select("id,post_id").eq("site_id", site_id).eq("url", url).execute().data
        update_data = {
            "post_id":   wp_entry.get("id"),
            "post_type": wp_entry.get("post_type"),
        }
        if existing:
            # Only update if post_id is missing or changed
            if not existing[0].get("post_id") or existing[0]["post_id"] != wp_entry.get("id"):
                db.table("pages").update(update_data).eq("id", existing[0]["id"]).execute()
        else:
            # Create minimal page record with post_id
            db.table("pages").insert({
                "site_id": site_id, "url": url,
                **update_data,
                "has_empty_meta": True,
                "needs_schema_opt": True,
            }).execute()

    # Also link WP pages that aren't in the sitemap (e.g. draft→published, custom post types)
    for wp_url, wp_entry in wp_map.items():
        existing = db.table("pages").select("id,post_id").eq("site_id", site_id).eq("url", wp_url).execute().data
        if existing and not existing[0].get("post_id"):
            db.table("pages").update({
                "post_id":   wp_entry.get("id"),
                "post_type": wp_entry.get("post_type"),
            }).eq("id", existing[0]["id"]).execute()

    # ── Phase B: Crawl pages for SEO data (limited to avoid timeout) ──
    seen_titles = {}
    seen_descs  = {}

    crawl_results = []
    for url in urls[:500]:  # crawl up to 500 pages per audit
        crawl = crawl_page(url)
        crawl_results.append(crawl)
        if crawl.get("error") or crawl.get("status_code", 200) not in (200, 301, 302):
            continue

        # Get or create page record
        existing = db.table("pages").select("id").eq("site_id", site_id).eq("url", url).execute().data
        schema_current = crawl.get("schema")
        has_meta       = bool(crawl["meta_desc"])
        page_data = {
            "site_id":     site_id, "url": url,
            "title_current":     crawl["title"],
            "meta_desc_current": crawl["meta_desc"],
            "h1_current":        crawl["h1s"][0] if crawl["h1s"] else "",
            "canonical_current": crawl["canonical"],
            "audit_has_h1":      len(crawl["h1s"]) == 1,
            "audit_canonical_ok": bool(crawl["canonical"]),
            "has_empty_meta":    not has_meta,
            "schema_current":    schema_current,
            "needs_schema_opt":  schema_current is None,
        }
        # post_id already linked in Phase A above
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
        if not has_meta:
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
                "Adicione alt text descritivo a todas as imagens", auto_fixable=True)

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

    # ── CHECK 2.1: robots.txt ──────────────────────────────────────────────
    try:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(site_url.rstrip("/") + "/robots.txt")
        rp.read()
        blocked = [u for u in urls if not rp.can_fetch("*", u)]
        if blocked:
            existing = db.table("audit_issues").select("id").eq("site_id", site_id).eq("issue_type", "robots_blocking_pages").execute().data
            if not existing:
                preview = ", ".join(blocked[:5])
                db.table("audit_issues").insert({
                    "site_id": site_id,
                    "page_id": None,
                    "severity": "critical",
                    "category": "indexation",
                    "issue_type": "robots_blocking_pages",
                    "description": f"{len(blocked)} páginas bloqueadas pelo robots.txt: {preview}",
                    "recommendation": "Revise as regras Disallow no robots.txt e remova bloqueios em páginas que devem ser indexadas.",
                    "auto_fixable": False,
                }).execute()
    except Exception as e:
        log(site_id, "technical-audit", "robots_check", "error", error=str(e))

    # ── CHECK 2.2: Páginas Órfãs ───────────────────────────────────────────
    try:
        all_linked: set[str] = set()
        for crawl in crawl_results:
            for link in crawl.get("internal_links", []):
                all_linked.add(link)

        for url in urls:
            if url not in all_linked:
                page_res = db.table("pages").select("id").eq("site_id", site_id).eq("url", url).execute()
                pid = page_res.data[0]["id"] if page_res.data else None
                existing = db.table("audit_issues").select("id").eq("site_id", site_id).eq("issue_type", "orphan_page").eq("page_id", pid).execute().data if pid else []
                if not existing:
                    db.table("audit_issues").insert({
                        "site_id": site_id,
                        "page_id": pid,
                        "severity": "important",
                        "category": "links",
                        "issue_type": "orphan_page",
                        "description": f"Página órfã: {url}",
                        "recommendation": "Adicione pelo menos 1 link interno apontando para esta página a partir de uma página de maior tráfego.",
                        "auto_fixable": False,
                    }).execute()
    except Exception as e:
        log(site_id, "technical-audit", "orphan_pages_check", "error", error=str(e))

    # ── CHECK 2.3: Links Internos Quebrados ────────────────────────────────
    try:
        broken_found: set[str] = set()
        for crawl in crawl_results:
            source_url = crawl["url"]
            for link in crawl.get("internal_links", []):
                if link in broken_found:
                    continue
                try:
                    hr = requests.head(link, timeout=5, allow_redirects=True,
                                       headers={"User-Agent": "TOINSEOBot/1.0"})
                    if hr.status_code == 404:
                        broken_found.add(link)
                        src_page = db.table("pages").select("id").eq("site_id", site_id).eq("url", source_url).execute().data
                        pid = src_page[0]["id"] if src_page else None
                        db.table("audit_issues").insert({
                            "site_id": site_id,
                            "page_id": pid,
                            "severity": "important",
                            "category": "links",
                            "issue_type": "broken_internal_link",
                            "description": f"Link quebrado: {source_url} → {link} (404)",
                            "recommendation": f"Remova ou corrija o link para {link} na página {source_url}.",
                            "auto_fixable": False,
                        }).execute()
                except Exception:
                    pass
                if len(broken_found) >= 20:
                    break
            if len(broken_found) >= 20:
                break
    except Exception as e:
        log(site_id, "technical-audit", "broken_links_check", "error", error=str(e))

    # ── CHECK 2.4: Redirect Chains ─────────────────────────────────────────
    try:
        for url in urls[:50]:  # Limita para não exceder timeout
            chain = _check_redirect_chain(url)
            if chain:
                existing = db.table("audit_issues").select("id").eq("site_id", site_id).eq("issue_type", "redirect_chain").eq("description", f"Redirect chain: {' → '.join(chain)}").execute().data
                if not existing:
                    db.table("audit_issues").insert({
                        "site_id": site_id,
                        "page_id": None,
                        "severity": "important",
                        "category": "indexation",
                        "issue_type": "redirect_chain",
                        "description": f"Redirect chain: {' → '.join(chain)}",
                        "recommendation": f"Configure redirect direto de {chain[0]} para {chain[-1]}, eliminando os passos intermediários.",
                        "auto_fixable": False,
                    }).execute()
    except Exception as e:
        log(site_id, "technical-audit", "redirect_chain_check", "error", error=str(e))

    # ── CHECK 2.5: Profundidade de Cliques ─────────────────────────────────
    try:
        from collections import deque
        from site_crawler import normalize_url as _norm
        depth_map: dict[str, int] = {site_url.rstrip("/"): 0}
        queue = deque([(site_url.rstrip("/"), 0)])
        crawl_map = {c["url"]: c for c in crawl_results}
        visited: set[str] = set()

        while queue:
            current_url, depth = queue.popleft()
            if current_url in visited or depth > 6:
                continue
            visited.add(current_url)
            crawl = crawl_map.get(current_url, {})
            for link in crawl.get("internal_links", []):
                if link not in depth_map:
                    depth_map[link] = depth + 1
                    queue.append((link, depth + 1))

        for url, depth in depth_map.items():
            if depth > 3:
                page_res = db.table("pages").select("id").eq("site_id", site_id).eq("url", url).execute().data
                pid = page_res[0]["id"] if page_res else None
                existing = db.table("audit_issues").select("id").eq("site_id", site_id).eq("issue_type", "deep_page").eq("page_id", pid).execute().data if pid else []
                if not existing:
                    db.table("audit_issues").insert({
                        "site_id": site_id,
                        "page_id": pid,
                        "severity": "improvement",
                        "category": "structure",
                        "issue_type": "deep_page",
                        "description": f"Página a {depth} cliques da homepage: {url}",
                        "recommendation": "Adicione links internos a partir de páginas com maior tráfego para reduzir a profundidade para ≤3 cliques.",
                        "auto_fixable": False,
                    }).execute()
    except Exception as e:
        log(site_id, "technical-audit", "deep_page_check", "error", error=str(e))

    # ── CHECK 2.6: Imagens sem WebP ────────────────────────────────────────
    try:
        no_webp_count = 0
        for crawl in crawl_results:
            src_url = crawl["url"]
            html_res = requests.get(src_url, timeout=5, headers={"User-Agent": "TOINSEOBot/1.0"})
            if not html_res.ok:
                continue
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_res.text, "html.parser")
            for img in soup.find_all("img", src=True):
                src = img["src"]
                if any(src.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png"]):
                    webp_url = src.rsplit(".", 1)[0] + ".webp"
                    webp_url = urljoin(src_url, webp_url)
                    try:
                        wr = requests.head(webp_url, timeout=3, headers={"User-Agent": "TOINSEOBot/1.0"})
                        if wr.status_code == 404:
                            no_webp_count += 1
                    except Exception:
                        pass
            if no_webp_count >= 5:
                break

        if no_webp_count > 0:
            existing = db.table("audit_issues").select("id").eq("site_id", site_id).eq("issue_type", "images_no_webp").execute().data
            if not existing:
                db.table("audit_issues").insert({
                    "site_id": site_id,
                    "page_id": None,
                    "severity": "improvement",
                    "category": "speed",
                    "issue_type": "images_no_webp",
                    "description": f"Pelo menos {no_webp_count} imagens sem versão WebP detectadas",
                    "recommendation": "Configure LiteSpeed Cache → Image Optimization → WebP Replacement para converter automaticamente JPG/PNG para WebP.",
                    "auto_fixable": False,
                }).execute()
    except Exception as e:
        log(site_id, "technical-audit", "webp_check", "error", error=str(e))

    # ── Phase C: Fix flags for pages that were NOT crawled but exist in DB ──
    # Pages created by Phase A or previous audits may have stale flags.
    # Update has_empty_meta and needs_schema_opt based on actual current values.
    try:
        uncrawled = (db.table("pages")
            .select("id,meta_desc_current,schema_current,has_empty_meta,needs_schema_opt")
            .eq("site_id", site_id)
            .execute().data)
        for p in uncrawled:
            real_empty_meta  = not bool(p.get("meta_desc_current"))
            real_needs_schema = p.get("schema_current") is None
            if p.get("has_empty_meta") != real_empty_meta or p.get("needs_schema_opt") != real_needs_schema:
                db.table("pages").update({
                    "has_empty_meta":   real_empty_meta,
                    "needs_schema_opt": real_needs_schema,
                }).eq("id", p["id"]).execute()
    except Exception as e:
        log(site_id, "technical-audit", "fix_flags", "error", error=str(e))

    db.table("sites").update({"audit_completed_at": datetime.now(timezone.utc).isoformat()}).eq("id", site_id).execute()
    log(site_id, "technical-audit", "complete_audit", "success")
    print(f"✅ Auditoria concluída para {site['url']}")
