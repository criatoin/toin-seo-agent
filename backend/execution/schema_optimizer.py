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
            # Strip markdown fences if present
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```", 2)[1]
                if response.startswith("json"):
                    response = response[4:]
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

def generate_and_apply_all(site_id: str) -> dict:
    """Generate schema via AI and apply immediately to WordPress for all pages without schema."""
    import requests as _req, base64
    db = get_db()

    site = db.table("sites").select("*").eq("id", site_id).single().execute().data
    if not site:
        raise ValueError(f"Site {site_id} not found")
    if site.get("type") != "wordpress":
        raise PermissionError("Only WordPress sites supported for schema writes")

    creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
    wp_headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}

    # Fetch ALL pages needing schema (no post_id filter — pages without post_id get proposals saved)
    pages = (db.table("pages")
        .select("*")
        .eq("site_id", site_id)
        .eq("needs_schema_opt", True)
        .execute().data)

    applied        = 0
    saved_proposal = 0
    failed         = 0

    for page in pages:
        try:
            result = generate_for_page(site_id, page["id"])
            schema_json = result["schema_json"]

            if page.get("post_id"):
                # Apply directly to WordPress
                r = _req.post(
                    f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/schema",
                    headers=wp_headers,
                    json={"schema_json": schema_json},
                    timeout=10
                )
                if r.ok:
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc).isoformat()
                    db.table("schema_proposals").update({"status": "applied", "applied_at": now}).eq("page_id", page["id"]).eq("status", "pending").execute()
                    db.table("pages").update({"schema_current": schema_json, "needs_schema_opt": False}).eq("id", page["id"]).execute()
                    applied += 1
                else:
                    log(site_id, "generate-schemas", "apply_schema", "error", error=r.text, page_id=page["id"])
                    failed += 1
            else:
                # No post_id — proposal saved by generate_for_page above.
                # Clear flag so counter decreases and user sees progress.
                db.table("pages").update({"needs_schema_opt": False}).eq("id", page["id"]).execute()
                saved_proposal += 1
        except Exception as e:
            log(site_id, "generate-schemas", "generate_and_apply", "error", error=str(e), page_id=page["id"])
            failed += 1

    log(site_id, "generate-schemas", "complete", "success",
        payload={"applied": applied, "saved_proposal": saved_proposal, "failed": failed})
    print(f"✅ Schema: {applied} aplicados, {saved_proposal} salvos como proposta, {failed} falhas")
    return {"applied": applied, "saved_proposal": saved_proposal, "failed": failed, "total": len(pages)}


def run(site_id: str):
    generate_schema_proposals(site_id)


import requests as _requests
from bs4 import BeautifulSoup as _BS

def _fetch_page_text_for_schema(url: str) -> str:
    """Fetch page HTML and extract readable text for schema generation."""
    try:
        r = _requests.get(url, timeout=8, headers={"User-Agent": "TOINSEOBot/1.0"})
        if not r.ok:
            return ""
        soup = _BS(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
            tag.decompose()
        chunks = []
        for tag in soup.find_all(["h1", "h2", "h3", "p"]):
            text = tag.get_text(" ", strip=True)
            if len(text) > 20:
                chunks.append(text)
            if sum(len(c) for c in chunks) > 1000:
                break
        return " | ".join(chunks)[:1000]
    except Exception:
        return ""


def _infer_schema_type_from_url(url: str) -> str:
    """Fallback: infer schema type from URL pattern when AI is unavailable."""
    from urllib.parse import urlparse
    path = urlparse(url).path.lower()
    if path in ("/", ""):
        return "Organization"
    if any(kw in path for kw in ["/blog/", "/post/", "/artigo/", "/news/"]):
        return "Article"
    if any(kw in path for kw in ["/servico", "/service", "/solucao"]):
        return "Service"
    if any(kw in path for kw in ["/produto", "/product", "/loja"]):
        return "Product"
    if any(kw in path for kw in ["/faq", "/perguntas"]):
        return "FAQPage"
    return "WebPage"


def generate_for_page(site_id: str, page_id: str) -> dict:
    """
    Generate a schema proposal for a single page.
    Returns { proposal_id, schema_type, schema_json, rationale, is_fallback }.
    Saves result to schema_proposals table with status='pending'.
    """
    db = get_db()

    page_res = db.table("pages").select("*").eq("id", page_id).execute()
    if not page_res.data:
        raise ValueError(f"Page {page_id} not found")
    page = page_res.data[0]

    site_res = db.table("sites").select("name,url").eq("id", site_id).execute()
    site = site_res.data[0] if site_res.data else {}

    page_text = _fetch_page_text_for_schema(page["url"])
    content_block = f"\nConteúdo da página:\n{page_text}" if page_text else ""

    prompt = (
        f"Você é especialista em SEO técnico. Gere um schema JSON-LD completo e válido para esta página.\n\n"
        f"Site: {site.get('name', '')} ({site.get('url', '')})\n"
        f"URL: {page['url']}\n"
        f"Título: {page.get('title_current', '')}\n"
        f"H1: {page.get('h1_current', '')}\n"
        f"Meta description: {page.get('meta_desc_current', '')}"
        f"{content_block}\n\n"
        f"Instruções:\n"
        f"1. Detecte o tipo de schema mais adequado (Organization, Article, Service, Product, FAQPage, LocalBusiness, WebPage)\n"
        f"2. Gere o JSON-LD completo com todas as propriedades relevantes preenchidas\n"
        f"3. Use dados reais da página — não invente informações\n"
        f"4. Retorne um objeto JSON com duas chaves:\n"
        f'   - "schema_type": string com o tipo detectado\n'
        f'   - "schema_json": objeto JSON-LD completo (conteúdo do <script type="application/ld+json">)\n'
        f'   - "rationale": string de 1 frase explicando por que escolheu este tipo\n'
        f"Retorne apenas o JSON, sem markdown, sem explicações extras."
    )

    is_fallback = False
    schema_type = _infer_schema_type_from_url(page["url"])
    schema_json = {
        "@context": "https://schema.org",
        "@type": schema_type,
        "url": page["url"],
        "name": page.get("title_current", ""),
        "description": page.get("meta_desc_current", ""),
    }
    rationale = f"Schema {schema_type} inferido pela estrutura da URL (IA indisponível)"

    try:
        raw = complete(prompt, max_tokens=800)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        parsed = json.loads(raw[start:end])
        schema_type = parsed.get("schema_type", schema_type)
        schema_json = parsed.get("schema_json", schema_json)
        rationale   = parsed.get("rationale", rationale)
    except Exception as e:
        log(site_id, "generate-schema", "generate_for_page", "warning",
            error=str(e), page_id=page_id)
        is_fallback = True

    # Delete previous pending proposal for this page (replace with fresh one)
    db.table("schema_proposals").delete().eq("page_id", page_id).eq("status", "pending").execute()

    res = db.table("schema_proposals").insert({
        "page_id":     page_id,
        "schema_type": schema_type,
        "schema_json": schema_json,
        "rationale":   rationale,
        "status":      "pending",
    }).execute()

    proposal_id = res.data[0]["id"]
    return {
        "proposal_id": proposal_id,
        "schema_type": schema_type,
        "schema_json": schema_json,
        "rationale":   rationale,
        "is_fallback": is_fallback,
    }
