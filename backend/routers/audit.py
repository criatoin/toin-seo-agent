import os, sys, base64, requests, json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import require_user

router = APIRouter()

_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)

@router.get("/{site_id}/audit")
async def get_audit(site_id: str, user=Depends(require_user)):
    db = get_db()
    issues = (db.table("audit_issues")
        .select("*")
        .eq("site_id", site_id)
        .order("severity")
        .execute().data)
    grouped = {"critical": [], "important": [], "improvement": []}
    for issue in issues:
        grouped.setdefault(issue["severity"], []).append(issue)
    return {"site_id": site_id, "issues": grouped, "total": len(issues)}

@router.get("/{site_id}/audit/issues")
async def list_audit_issues(
    site_id: str,
    severity: str = None,
    category: str = None,
    status: str = None,
    user=Depends(require_user)
):
    db = get_db()
    q = db.table("audit_issues").select("*").eq("site_id", site_id)
    if severity: q = q.eq("severity", severity)
    if category: q = q.eq("category", category)
    if status:   q = q.eq("status", status)
    # Fetch all issues in pages of 1000 (PostgREST default limit)
    all_data = []
    offset = 0
    while True:
        batch = q.order("created_at", desc=True).range(offset, offset + 999).execute().data
        if not batch:
            break
        all_data.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return all_data

class IssueStatusUpdate(BaseModel):
    status: str

@router.patch("/{site_id}/audit/issues/{issue_id}")
async def update_issue_status(
    site_id: str, issue_id: str,
    body: IssueStatusUpdate,
    user=Depends(require_user)
):
    allowed = {"fixed", "dismissed", "open", "in_progress"}
    if body.status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    db = get_db()
    result = db.table("audit_issues").update({
        "status": body.status,
        "fixed_at": "now()" if body.status == "fixed" else None
    }).eq("id", issue_id).eq("site_id", site_id).execute()
    if not result.data:
        raise HTTPException(404, "Issue not found")
    return result.data[0]


@router.post("/{site_id}/audit/issues/{issue_id}/preview-fix")
async def preview_fix(site_id: str, issue_id: str, user=Depends(require_user)):
    """Generate fix preview for missing-meta or images-no-alt issues (does not apply)."""
    db = get_db()
    issue_res = db.table("audit_issues").select("*").eq("id", issue_id).eq("site_id", site_id).execute()
    if not issue_res.data:
        raise HTTPException(404, "Issue not found")
    issue = issue_res.data[0]

    if not issue.get("page_id"):
        raise HTTPException(400, "Issue has no associated page")

    # Route to correct handler based on issue type
    if issue.get("issue_type") == "images_no_alt":
        return await _preview_images_alt(issue, db)


    page_res = db.table("pages").select("*").eq("id", issue["page_id"]).execute()
    site_res = db.table("sites").select("name,url").eq("id", site_id).execute()
    if not page_res.data:
        raise HTTPException(404, "Page not found")
    page = page_res.data[0]
    site = site_res.data[0] if site_res.data else {}

    import asyncio, functools
    from deepseek_client import complete
    from bs4 import BeautifulSoup

    def _fetch_page_text(url: str) -> str:
        """Fetch page and extract readable text (headings + first paragraphs)."""
        try:
            r = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0 (SEO-Agent/1.0)"})
            if not r.ok:
                return ""
            soup = BeautifulSoup(r.text, "html.parser")
            # Remove structural noise and third-party widgets
            for tag in soup(["script", "style", "nav", "header", "footer",
                              "aside", "form", "noscript", "iframe", "svg"]):
                tag.decompose()
            # Remove hidden elements (display:none / visibility:hidden)
            for tag in soup.find_all(style=True):
                s = tag.get("style", "")
                if "display:none" in s.replace(" ", "") or "visibility:hidden" in s.replace(" ", ""):
                    tag.decompose()
            # Remove known accessibility plugin containers (AccessiWay, EqualWeb, etc.)
            for tag in soup.find_all(class_=True):
                classes = " ".join(tag.get("class", []))
                if any(cls in classes for cls in ("ap-", "accessib", "wcag-", "equalweb",
                                                   "userway", "audioeye", "reciteme")):
                    tag.decompose()
            # Remove aria-hidden elements (screen-reader-only or decorative)
            for tag in soup.find_all(attrs={"aria-hidden": "true"}):
                tag.decompose()
            # Collect headings and paragraphs with meaningful text
            chunks = []
            for tag in soup.find_all(["h1", "h2", "h3", "p"]):
                text = tag.get_text(" ", strip=True)
                if len(text) > 20:
                    chunks.append(text)
                if sum(len(c) for c in chunks) > 800:
                    break
            return " | ".join(chunks)[:900]
        except Exception:
            return ""

    from urllib.parse import urlparse

    site_name   = site.get("name", "")
    site_url    = site.get("url", "")
    top_queries = page.get("gsc_top_queries") or []
    queries_str = ""
    if top_queries and isinstance(top_queries, list):
        qs = [q.get("query", q) if isinstance(q, dict) else str(q) for q in top_queries[:5]]
        queries_str = f"\nPalavras-chave reais que trazem usuários para esta página: {', '.join(qs)}"

    # Detect page type from URL path to give AI better context
    page_url    = page["url"]
    parsed_path = urlparse(page_url).path.strip("/")
    path_parts  = [p for p in parsed_path.split("/") if p]
    portfolio_slugs = {"projeto", "projetos", "portfolio", "case", "cases",
                       "trabalho", "trabalhos", "clientes", "cliente"}
    is_portfolio = bool(path_parts and path_parts[0].lower() in portfolio_slugs)

    if is_portfolio and path_parts:
        import re as _re
        raw_slug = path_parts[1] if len(path_parts) > 1 else path_parts[0]
        client_slug = _re.sub(r"-?\d+$", "", raw_slug).replace("-", " ").title().strip()
        page_type_context = (
            f"\nTIPO DE PÁGINA: Página de portfólio/case. "
            f"Esta é uma página do site de {site_name} apresentando o trabalho realizado "
            f"para o cliente '{client_slug}'. "
            f"A descrição deve mencionar que é um projeto/trabalho desenvolvido por esta empresa."
        )
    else:
        page_type_context = ""

    # Fetch live content in executor so we don't block the event loop
    loop = asyncio.get_event_loop()
    page_text = await loop.run_in_executor(None, _fetch_page_text, page_url)

    if page_text:
        content_block = f"\nConteúdo real extraído da página:\n{page_text}"
        no_content_warning = ""
    else:
        content_block = ""
        no_content_warning = (
            "\nAVISO: O conteúdo da página não pôde ser extraído (provavelmente site gerado por JavaScript). "
            "Baseie-se EXCLUSIVAMENTE no título, H1, URL e tipo de página fornecidos. "
            "NÃO invente características, funcionalidades, serviços ou qualidades que não estejam explícitos nos dados."
        )

    prompt = (
        f"Você é um especialista sênior em SEO com 10 anos de experiência otimizando "
        f"meta descriptions para máximo CTR orgânico.\n\n"
        f"Sua tarefa: escrever a meta description ideal para esta página, com 140-160 caracteres.\n\n"
        f"Diretrizes:\n"
        f"1. Descreva o que o usuário vai encontrar com base NOS DADOS FORNECIDOS — jamais invente\n"
        f"2. Use a palavra-chave principal no início quando possível\n"
        f"3. Tom: direto e informativo\n"
        f"4. PROIBIDO: 'Conheça', 'Descubra', 'Acesse', 'Veja mais', 'Clique aqui'\n"
        f"5. Escreva em português (pt-BR)\n"
        f"6. Se os dados forem insuficientes para uma descrição específica, escreva algo genérico "
        f"e honesto baseado no título — NÃO fabrique detalhes\n\n"
        f"Dados da página:\n"
        f"Site: {site_name} ({site_url})\n"
        f"URL: {page_url}\n"
        f"Título: {page.get('title_current', '')}\n"
        f"H1: {page.get('h1_current', '')}"
        f"{page_type_context}"
        f"{queries_str}"
        f"{content_block}"
        f"{no_content_warning}\n\n"
        f"Retorne APENAS o texto da meta description. Sem aspas, sem explicações, sem prefixos."
    )

    # Run AI call in thread
    try:
        raw = await loop.run_in_executor(
            None, functools.partial(complete, prompt, max_tokens=200)
        )
        suggestion = raw.strip().strip('"').strip("'")[:160]
    except Exception as e:
        title = page.get('title_current', '') or page.get('h1_current', '') or page.get('url', '')
        fallback = f"{title} — veja detalhes, informações e conteúdo completo nesta página."
        return {
            "suggestion": fallback[:160],
            "page_id": page["id"],
            "url": page["url"],
            "ai_error": str(e),
            "is_fallback": True,
        }

    return {"type": "meta_desc", "suggestion": suggestion, "page_id": page["id"], "url": page["url"], "is_fallback": False}


async def _preview_images_alt(issue: dict, db) -> dict:
    """Find images without alt on the page and generate AI alt text suggestions."""
    import asyncio, functools, re as _re
    from deepseek_client import complete
    from bs4 import BeautifulSoup

    page_res = db.table("pages").select("url,title_current,h1_current").eq("id", issue["page_id"]).execute()
    if not page_res.data:
        raise HTTPException(404, "Page not found")
    page = page_res.data[0]
    page_url = page["url"]

    def _fetch_images(url: str) -> list[dict]:
        try:
            r = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0 (SEO-Agent/1.0)"})
            if not r.ok:
                return []
            soup = BeautifulSoup(r.text, "html.parser")
            images = []
            for img in soup.find_all("img"):
                alt = img.get("alt", "").strip()
                if alt:
                    continue  # already has alt
                src = img.get("src", "").strip()
                if not src or src.startswith("data:"):
                    continue
                # Only WP-hosted images (in uploads path)
                if "wp-content/uploads" not in src and "wp-content" not in src:
                    continue
                filename = src.split("/")[-1].split("?")[0]
                # Strip size suffix from filename for cleaner name
                name = _re.sub(r"-\d+x\d+$", "", filename.rsplit(".", 1)[0]).replace("-", " ").replace("_", " ")
                images.append({"src": src, "filename": filename, "name": name})
            return images[:12]  # limit to 12 images max
        except Exception:
            return []

    loop = asyncio.get_event_loop()
    images = await loop.run_in_executor(None, _fetch_images, page_url)

    if not images:
        return {"type": "images_alt", "images": [], "message": "Nenhuma imagem sem alt encontrada ou página não acessível."}

    # Build single AI prompt for all images at once
    page_ctx = f"Página: {page.get('title_current') or page.get('h1_current') or page_url}"
    img_list = "\n".join(f"{i+1}. {img['name']} (arquivo: {img['filename']})" for i, img in enumerate(images))
    prompt = (
        f"Você é especialista em SEO e acessibilidade. Gere alt text descritivo para imagens.\n\n"
        f"{page_ctx}\n\n"
        f"Imagens sem alt text:\n{img_list}\n\n"
        f"Retorne JSON válido no formato:\n"
        f'{{"1": "alt para imagem 1", "2": "alt para imagem 2", ...}}\n\n'
        f"Regras: máximo 100 caracteres por alt, em português (pt-BR), descritivo e específico. "
        f"Sem prefixos como 'Imagem de' ou 'Foto de'."
    )

    try:
        raw = await loop.run_in_executor(None, functools.partial(complete, prompt, max_tokens=600))
        raw = raw.strip()
        start = raw.find("{"); end = raw.rfind("}") + 1
        alts = json.loads(raw[start:end])
    except Exception:
        # Fallback: use name as alt text
        alts = {str(i+1): img["name"].title() for i, img in enumerate(images)}

    result = []
    for i, img in enumerate(images):
        suggested = alts.get(str(i+1), img["name"].title())[:100]
        result.append({"src": img["src"], "filename": img["filename"], "suggested_alt": suggested})

    return {"type": "images_alt", "images": result, "page_id": issue["page_id"], "url": page_url}


class ApplyImagesAltBody(BaseModel):
    images: list[dict]   # [{src: str, alt: str}]

@router.post("/{site_id}/audit/issues/{issue_id}/apply-images-alt")
async def apply_images_alt(site_id: str, issue_id: str, body: ApplyImagesAltBody, _user=Depends(require_user)):
    """Apply AI-generated alt text to images via the WordPress plugin."""
    db = get_db()
    issue_res = db.table("audit_issues").select("*").eq("id", issue_id).eq("site_id", site_id).execute()
    if not issue_res.data:
        raise HTTPException(404, "Issue not found")
    issue = issue_res.data[0]

    page_res = db.table("pages").select("post_id").eq("id", issue["page_id"]).execute()
    site_res = db.table("sites").select("url,wp_user,wp_app_password,type").eq("id", site_id).execute()
    if not page_res.data or not site_res.data:
        raise HTTPException(404, "Page or site not found")

    page = page_res.data[0]
    site = site_res.data[0]

    if site["type"] != "wordpress" or not page.get("post_id"):
        raise HTTPException(400, "Alt text fix only available for WordPress sites")

    creds   = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
    headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}

    r = requests.post(
        f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/images/alt",
        headers=headers,
        json={"images": [{"src": img["src"], "alt": img["alt"]} for img in body.images]},
        timeout=15,
    )
    if not r.ok:
        raise HTTPException(502, f"WordPress write failed: {r.text[:200]}")

    wp_result = r.json()
    now = datetime.now(timezone.utc).isoformat()
    db.table("audit_issues").update({"status": "fixed", "fixed_at": now}).eq("id", issue_id).execute()

    return {"fixed": True, "updated": wp_result.get("updated", 0), "not_found": wp_result.get("not_found", [])}


class ApplyFixBody(BaseModel):
    description: str

@router.post("/{site_id}/audit/issues/{issue_id}/apply-fix")
async def apply_fix(site_id: str, issue_id: str, body: ApplyFixBody, user=Depends(require_user)):
    """Apply a confirmed meta description fix to WordPress and mark the issue as fixed."""
    db = get_db()
    issue_res = db.table("audit_issues").select("*").eq("id", issue_id).eq("site_id", site_id).execute()
    if not issue_res.data:
        raise HTTPException(404, "Issue not found")
    issue = issue_res.data[0]

    if not issue.get("page_id"):
        raise HTTPException(400, "Issue has no associated page")

    page_res = db.table("pages").select("*").eq("id", issue["page_id"]).execute()
    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not page_res.data or not site_res.data:
        raise HTTPException(404, "Page or site not found")
    page = page_res.data[0]
    site = site_res.data[0]

    now = datetime.now(timezone.utc).isoformat()

    # For WordPress sites: write via plugin
    if site["type"] == "wordpress" and page.get("post_id"):
        creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}
        # Send None when seo_plugin is "none" so the WP plugin auto-detects the active SEO plugin
        seo_plugin = site.get("seo_plugin")
        if not seo_plugin or seo_plugin == "none":
            seo_plugin = None
        r = requests.post(
            f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/meta",
            headers=headers,
            json={"description": body.description, "seo_plugin": seo_plugin},
            timeout=10,
        )
        if not r.ok:
            raise HTTPException(502, f"WordPress write failed: {r.text}")

    # Update DB
    db.table("pages").update({
        "meta_desc_current": body.description,
        "has_empty_meta": False,
        "last_meta_changed_at": now,
    }).eq("id", page["id"]).execute()

    db.table("audit_issues").update({
        "status": "fixed",
        "fixed_at": now,
    }).eq("id", issue_id).execute()

    return {"fixed": True, "description": body.description}


@router.get("/{site_id}/audit/diagnose")
async def diagnose(site_id: str, user=Depends(require_user)):
    """Check WP connectivity, post_id coverage, and last job logs."""
    import base64 as _b64
    import requests as _req
    db = get_db()

    site = db.table("sites").select("url,type,wp_user,wp_app_password").eq("id", site_id).single().execute().data
    has_credentials = bool(site and site.get("wp_user") and site.get("wp_app_password"))

    # Count pages with/without post_id
    total_res    = db.table("pages").select("id", count="exact").eq("site_id", site_id).execute()
    with_res     = db.table("pages").select("id", count="exact").eq("site_id", site_id).not_.is_("post_id", "null").execute()
    schema_res   = db.table("pages").select("id", count="exact").eq("site_id", site_id).eq("needs_schema_opt", True).execute()
    total        = total_res.count or 0
    with_post_id = with_res.count or 0
    needs_schema = schema_res.count or 0

    # Test WP connectivity
    wp_ok    = False
    wp_error = None
    if has_credentials and site:
        try:
            creds = _b64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
            r = _req.get(
                f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/status",
                headers={"Authorization": f"Basic {creds}"},
                timeout=8
            )
            wp_ok    = r.ok
            wp_error = None if r.ok else f"HTTP {r.status_code}: {r.text[:100]}"
        except Exception as e:
            wp_error = str(e)

    # Last 20 execution logs
    logs_res = db.table("execution_logs").select("job_name,action,status,error_message,created_at").eq("site_id", site_id).order("created_at", desc=True).limit(20).execute()

    # Last sync-gsc result
    gsc_log_res = (db.table("execution_logs")
        .select("status,error_message,created_at,payload")
        .eq("site_id", site_id)
        .eq("job_name", "sync-gsc")
        .neq("status", "started")
        .order("created_at", desc=True)
        .limit(1)
        .execute())
    gsc_last = gsc_log_res.data[0] if gsc_log_res.data else None

    return {
        "has_credentials": has_credentials,
        "wp_ok":           wp_ok,
        "wp_error":        wp_error,
        "pages_total":     total,
        "with_post_id":    with_post_id,
        "without_post_id": total - with_post_id,
        "needs_schema":    needs_schema,
        "needs_audit":     (total > 0 and with_post_id == 0 and has_credentials),
        "last_logs":       logs_res.data or [],
        "gsc_last_sync":   gsc_last,
    }


@router.post("/{site_id}/audit/fix-all-auto")
async def fix_all_auto(site_id: str, user=Depends(require_user)):
    """Mark all open auto-fixable issues as in_progress (bulk trigger)."""
    db = get_db()
    result = db.table("audit_issues").update({"status": "in_progress"}).eq("site_id", site_id).eq("auto_fixable", True).eq("status", "open").execute()
    return {"queued": len(result.data) if result.data else 0}


class BulkStatusUpdate(BaseModel):
    ids: list[str]
    status: str

@router.patch("/{site_id}/audit/issues/bulk")
async def bulk_update_issues(site_id: str, body: BulkStatusUpdate, _user=Depends(require_user)):
    """Update status of multiple issues at once (avoids N parallel requests from frontend)."""
    allowed = {"fixed", "dismissed", "open", "in_progress"}
    if body.status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    if not body.ids:
        return {"updated": 0}
    db = get_db()
    from datetime import datetime, timezone
    update_data: dict = {"status": body.status}
    if body.status == "fixed":
        update_data["fixed_at"] = datetime.now(timezone.utc).isoformat()
    # Update in batches of 200 (PostgREST IN() limit)
    updated = 0
    for i in range(0, len(body.ids), 200):
        batch = body.ids[i:i+200]
        res = (db.table("audit_issues")
            .update(update_data)
            .eq("site_id", site_id)
            .in_("id", batch)
            .execute())
        updated += len(res.data) if res.data else 0
    return {"updated": updated}
