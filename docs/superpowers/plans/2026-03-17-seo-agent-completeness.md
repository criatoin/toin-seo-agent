# SEO Agent Completeness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o Agente SEO Sênior com schema approval flow completo, auditoria técnica de 100% do checklist, e monitor semanal com comparação histórica real.

**Architecture:** Três PRs independentes: (1) Schema flow — novo endpoint generate + reescrita do apply stub + componente SchemaProposalCard; (2) Auditoria completa — normalize_url no crawler + 6 novos checks no technical_audit; (3) Monitor real — tabela gsc_snapshots + reescrita do weekly_monitor + fix de cron order no Coolify.

**Tech Stack:** FastAPI (Python 3.11), Next.js 14 App Router, Supabase (PostgREST), BeautifulSoup4, requests, WordPress REST API via plugin toin-seo-agent

**Spec:** `docs/superpowers/specs/2026-03-17-seo-agent-completeness-design.md`

---

## Chunk 1: Schema Approval Flow (PR 1)

### File Map
- Modify: `backend/execution/schema_optimizer.py` — adicionar `generate_for_page()`
- Modify: `backend/routers/pages.py` — adicionar `POST /{site_id}/pages/{page_id}/schema/generate`
- Modify: `backend/routers/proposals.py` — substituir stub `apply_schema` pela implementação completa com WP call
- Create: `frontend/components/SchemaProposalCard.tsx` — componente com máquina de estados
- Modify: `frontend/app/paginas/[id]/page.tsx` — integrar SchemaProposalCard

---

### Task 1.1: Adicionar `generate_for_page` em `schema_optimizer.py`

**File:** `backend/execution/schema_optimizer.py`

- [ ] **Abrir o arquivo e localizar o final** (após a função `run()`)

- [ ] **Adicionar a função `generate_for_page` no final do arquivo:**

```python
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
```

- [ ] **Verificar manualmente que o arquivo está correto** (sem erros de indentação)

- [ ] **Commit:**
```bash
git add backend/execution/schema_optimizer.py
git commit -m "feat: add generate_for_page to schema_optimizer with AI + fallback"
```

---

### Task 1.2: Adicionar endpoint `POST /schema/generate` em `pages.py`

**File:** `backend/routers/pages.py`

- [ ] **Abrir `backend/routers/pages.py` e localizar o final do arquivo**

- [ ] **Adicionar os imports necessários** no topo do arquivo (após os imports existentes):

```python
import os, sys
_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)
```

- [ ] **Adicionar o endpoint no final do arquivo:**

```python
@router.post("/{site_id}/pages/{page_id}/schema/generate")
async def generate_schema_for_page(site_id: str, page_id: str, user=Depends(require_user)):
    """Generate a schema JSON-LD proposal for a single page using AI."""
    import asyncio, functools
    from schema_optimizer import generate_for_page
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, functools.partial(generate_for_page, site_id, page_id)
        )
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Schema generation failed: {e}")
```

- [ ] **Commit:**
```bash
git add backend/routers/pages.py
git commit -m "feat: add POST /schema/generate endpoint"
```

---

### Task 1.3: Substituir stub `apply_schema` em `proposals.py`

**File:** `backend/routers/proposals.py`

- [ ] **Adicionar imports no topo do arquivo** (após os existentes):

```python
import base64, requests as _req
from datetime import datetime, timezone
import os, sys
_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)
```

- [ ] **Substituir completamente a função `apply_schema` (linhas 64–78)** pelo código abaixo:

```python
@router.post("/{site_id}/pages/{page_id}/schema/apply")
async def apply_schema(site_id: str, page_id: str, user=Depends(require_user)):
    """Apply a pending schema proposal to WordPress and mark it as applied."""
    db = get_db()

    # Fetch pending proposal
    prop_res = (db.table("schema_proposals")
        .select("*").eq("page_id", page_id).eq("status", "pending")
        .order("created_at", desc=True).limit(1).execute())
    if not prop_res.data:
        raise HTTPException(404, "No pending schema proposal found")
    proposal = prop_res.data[0]

    # Fetch page and site
    page_res = db.table("pages").select("*").eq("id", page_id).execute()
    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not page_res.data or not site_res.data:
        raise HTTPException(404, "Page or site not found")
    page = page_res.data[0]
    site = site_res.data[0]

    # Write to WordPress if applicable
    if site["type"] == "wordpress" and page.get("post_id"):
        if not site.get("wp_user") or not site.get("wp_app_password"):
            raise HTTPException(400, "WordPress credentials not configured — set them in /configuracoes")
        creds = base64.b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}
        r = _req.post(
            f"{site['url'].rstrip('/')}/wp-json/toin-seo/v1/pages/{page['post_id']}/schema",
            headers=headers,
            json={"schema_json": proposal["schema_json"]},
            timeout=10,
        )
        if not r.ok:
            raise HTTPException(502, f"WordPress write failed: {r.text}")

    now = datetime.now(timezone.utc).isoformat()

    # Update pages.schema_current
    db.table("pages").update({
        "schema_current": proposal["schema_json"],
        "audit_schema_ok": True,
        "needs_schema_opt": False,
    }).eq("id", page_id).execute()

    # Mark proposal applied
    db.table("schema_proposals").update({
        "status": "applied",
        "applied_at": now,
    }).eq("id", proposal["id"]).execute()

    # Mark related audit issue as fixed (if exists)
    db.table("audit_issues").update({
        "status": "fixed",
        "fixed_at": now,
    }).eq("page_id", page_id).eq("issue_type", "missing_schema").in_("status", ["open", "in_progress"]).execute()

    return {
        "applied": True,
        "schema_type": proposal["schema_type"],
        "page_id": page_id,
    }
```

- [ ] **Commit:**
```bash
git add backend/routers/proposals.py
git commit -m "feat: implement schema/apply - write to WP, update DB, mark issue fixed"
```

---

### Task 1.4: Criar `SchemaProposalCard.tsx`

**File:** `frontend/components/SchemaProposalCard.tsx` (criar novo)

- [ ] **Criar o arquivo com o seguinte conteúdo:**

```tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

type SchemaState = 'idle' | 'generating' | 'pending_approval' | 'applying' | 'applied' | 'error'

interface SchemaProposalCardProps {
  pageId: string
  siteId: string
  currentSchema: object | null
  postId: number | null
}

export function SchemaProposalCard({ pageId, siteId, currentSchema, postId }: SchemaProposalCardProps) {
  const [state, setState]           = useState<SchemaState>('idle')
  const [proposal, setProposal]     = useState<any>(null)
  const [errorMsg, setErrorMsg]     = useState('')
  const [collapsed, setCollapsed]   = useState(true)

  const hasWp = !!postId

  async function handleGenerate() {
    setState('generating')
    setErrorMsg('')
    try {
      const res: any = await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/generate`, {})
      setProposal(res)
      setState('pending_approval')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Erro ao gerar schema')
      setState('error')
    }
  }

  async function handleApply() {
    if (!hasWp) return
    setState('applying')
    try {
      await api.post(`/api/sites/${siteId}/pages/${pageId}/schema/apply`, {})
      setState('applied')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Erro ao aplicar schema')
      setState('error')
    }
  }

  const schemaLabel = currentSchema
    ? `${(currentSchema as any)['@type'] || 'Schema'} ✓`
    : 'Não configurado'

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white">Schema Estruturado (JSON-LD)</h3>
        {currentSchema && state === 'idle' && (
          <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-2 py-0.5 rounded">
            {schemaLabel}
          </span>
        )}
        {!currentSchema && state === 'idle' && (
          <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
            {schemaLabel}
          </span>
        )}
      </div>

      {/* States */}
      {state === 'idle' && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {currentSchema
              ? 'Schema ativo. Você pode regenerar com a IA a qualquer momento.'
              : 'Nenhum schema configurado. A IA vai analisar o conteúdo da página e gerar o JSON-LD adequado.'}
          </p>
          <button
            onClick={handleGenerate}
            className="ml-4 shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors">
            {currentSchema ? 'Regenerar Schema' : 'Gerar com IA'}
          </button>
        </div>
      )}

      {state === 'generating' && (
        <p className="text-sm text-gray-400">Analisando página e gerando schema...</p>
      )}

      {state === 'pending_approval' && proposal && (
        <div className="space-y-3">
          {proposal.is_fallback && (
            <p className="text-xs text-yellow-400">
              ⚠️ IA indisponível — schema gerado por heurística de URL. Verifique antes de aplicar.
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-800 px-2 py-0.5 rounded">
              {proposal.schema_type}
            </span>
            <p className="text-xs text-gray-400 italic">{proposal.rationale}</p>
          </div>

          <div className="border border-gray-700 rounded">
            <button
              onClick={() => setCollapsed(v => !v)}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-between">
              <span>JSON-LD gerado</span>
              <span>{collapsed ? '▼ Expandir' : '▲ Recolher'}</span>
            </button>
            {!collapsed && (
              <pre className="bg-gray-950 rounded-b p-3 text-xs text-green-300 overflow-auto max-h-64 border-t border-gray-700">
                {JSON.stringify(proposal.schema_json, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setState('idle')}
              className="px-3 py-1.5 border border-gray-700 text-gray-400 text-sm rounded hover:border-gray-500 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              className="px-3 py-1.5 border border-gray-600 text-gray-300 text-sm rounded hover:border-gray-400 transition-colors">
              ↺ Regenerar
            </button>
            <button
              onClick={handleApply}
              disabled={!hasWp}
              title={!hasWp ? 'Página não vinculada ao WordPress' : ''}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Aplicar no WordPress
            </button>
          </div>

          {!hasWp && (
            <p className="text-xs text-gray-600">
              Esta página não tem post_id vinculado ao WordPress — não é possível aplicar automaticamente.
            </p>
          )}
        </div>
      )}

      {state === 'applying' && (
        <p className="text-sm text-gray-400">Aplicando schema no WordPress...</p>
      )}

      {state === 'applied' && (
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm">✓ Schema aplicado com sucesso</span>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            (regenerar)
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Tentar novamente
          </button>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Commit:**
```bash
git add frontend/components/SchemaProposalCard.tsx
git commit -m "feat: add SchemaProposalCard component with full state machine"
```

---

### Task 1.5: Integrar `SchemaProposalCard` em `/paginas/[id]`

**File:** `frontend/app/paginas/[id]/page.tsx`

- [ ] **Adicionar import no topo do arquivo** (após os imports existentes):

```tsx
import { SchemaProposalCard } from '@/components/SchemaProposalCard'
```

- [ ] **Adicionar fetch do schema proposal** na requisição paralela (após `api.get(...proposal)`):

Substituir:
```tsx
  Promise.all([
    api.get(`/api/sites/${siteId}/pages/${id}`),
    api.get(`/api/sites/${siteId}/pages/${id}/proposal`).catch(() => null),
  ]).then(([p, pr]) => { setPage(p); setProposal(pr) })
```

Por:
```tsx
  Promise.all([
    api.get(`/api/sites/${siteId}/pages/${id}`),
    api.get(`/api/sites/${siteId}/pages/${id}/proposal`).catch(() => null),
  ]).then(([p, pr]) => {
    setPage(p)
    setProposal(pr)
  })
```
*(sem mudança nessa parte — o SchemaProposalCard usa os dados de `page` diretamente)*

- [ ] **Adicionar `<SchemaProposalCard>` após o bloco `{proposal && (...)}` existente** (antes do `</div>` de fechamento):

```tsx
      <SchemaProposalCard
        pageId={id as string}
        siteId={siteId}
        currentSchema={page.schema_current ?? null}
        postId={page.post_id ?? null}
      />
```

- [ ] **Commit:**
```bash
git add frontend/app/paginas/[id]/page.tsx
git commit -m "feat: integrate SchemaProposalCard into page detail view"
```

---

### Task 1.6: Deploy PR 1

- [ ] **Push para GitHub:**
```bash
git push origin main
```

- [ ] **Deploy backend (aguardar finalizar antes do frontend):**
```bash
curl -s -X GET "https://serv2.criatoin.com.br/api/v1/deploy?uuid=joogkws88c0cw0ck08g0oc44&force=false" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2"
# Aguardar status: finished antes de continuar
```

- [ ] **Deploy frontend (após backend):**
```bash
curl -s -X GET "https://serv2.criatoin.com.br/api/v1/deploy?uuid=m8sc84okgogo4s4w4g0wckwc&force=false" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2"
```

- [ ] **Verificar em https://seo.criatoin.com.br → qualquer página → seção Schema Estruturado**

---

## Chunk 2: Auditoria Técnica Completa (PR 2)

### File Map
- Modify: `backend/execution/site_crawler.py` — adicionar `normalize_url()` + corrigir filtro de `internal_links`
- Modify: `backend/execution/technical_audit.py` — aumentar limite para 200 URLs + adicionar 6 novos checks

---

### Task 2.1: Adicionar `normalize_url` e corrigir `crawl_page` em `site_crawler.py`

**File:** `backend/execution/site_crawler.py`

- [ ] **Adicionar a função `normalize_url` após os imports (linha ~5):**

```python
def normalize_url(base_url: str, href: str) -> str | None:
    """Resolve relative href to absolute URL and normalizes (removes fragment, trailing slash)."""
    if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
        return None
    absolute = urljoin(base_url, href)
    parsed = urlparse(absolute)
    if not parsed.scheme.startswith('http'):
        return None
    path = parsed.path.rstrip('/') or '/'
    return f"{parsed.scheme}://{parsed.netloc}{path}"
```

- [ ] **Substituir a linha 72 em `crawl_page`** que filtra `internal_links`:

Substituir:
```python
        "internal_links": [l for l in links if urlparse(l).netloc in ("", urlparse(url).netloc)],
        "external_links": [l for l in links if urlparse(l).netloc not in ("", urlparse(url).netloc)],
```

Por:
```python
        "internal_links": list(filter(None, [
            normalize_url(url, a.get("href"))
            for a in soup.find_all("a", href=True)
            if normalize_url(url, a.get("href")) and
               urlparse(normalize_url(url, a.get("href"))).netloc == urlparse(url).netloc
        ])),
        "external_links": list(filter(None, [
            normalize_url(url, a.get("href"))
            for a in soup.find_all("a", href=True)
            if normalize_url(url, a.get("href")) and
               urlparse(normalize_url(url, a.get("href"))).netloc != urlparse(url).netloc
        ])),
```

Obs: também remover a linha `links = [a.get("href") for a in soup.find_all("a", href=True)]` que fica obsoleta.

- [ ] **Commit:**
```bash
git add backend/execution/site_crawler.py
git commit -m "fix: add normalize_url and fix internal_links filter in crawl_page"
```

---

### Task 2.2: Adicionar 6 novos checks em `technical_audit.py`

**File:** `backend/execution/technical_audit.py`

Este task adiciona os 6 checks na função principal `run()`. Todos seguem o mesmo padrão: detectar problema → inserir issue em `audit_issues`.

- [ ] **Abrir o arquivo e localizar o início da função `run()`**

- [ ] **Modificar o loop principal da função `run()` para acumular `crawl_results` e aumentar o limite para 200 URLs:**

Encontrar (pode estar como `for url in urls[:100]:` ou com `urls = urls[:100]` antes do loop):
```python
for url in urls[:100]:
    crawl = crawl_page(url)
```

Substituir por (adicionar lista `crawl_results` antes do loop e `.append` dentro):
```python
crawl_results = []
for url in urls[:200]:
    crawl = crawl_page(url)
    crawl_results.append(crawl)
```

Se o arquivo usar `urls = urls[:100]` separado do loop, substituir essa linha por `urls = urls[:200]` **e** adicionar `crawl_results = []` antes do loop + `crawl_results.append(crawl)` dentro.

**Importante:** Os 6 novos checks dependem de `crawl_results`. Sem essa variável, todos falharão com `NameError`.

- [ ] **Adicionar import no topo do arquivo** (se não existir):

```python
import urllib.robotparser
import asyncio
from urllib.parse import urljoin, urlparse
```

- [ ] **Adicionar helper `_check_redirect_chain` no arquivo** (antes da função `run()`):

```python
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
```

- [ ] **Adicionar os 6 checks no final da função `run()`, antes do `return`:**

```python
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
        # After Task 2.1, all internal_links are already absolute URLs (normalize_url applied in crawl_page)
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
```

**Nota:** A variável `crawl_results` foi criada no passo anterior (loop modificado). Todos os 6 checks dependem dela — se o passo do loop não foi executado, os checks falharão com `NameError`.

- [ ] **Commit:**
```bash
git add backend/execution/technical_audit.py
git commit -m "feat: add 6 new audit checks (robots, orphans, broken links, redirects, depth, webp)"
```

---

### Task 2.3: Deploy PR 2

- [ ] **Push para GitHub:**
```bash
git push origin main
```

- [ ] **Deploy backend:**
```bash
curl -s -X GET "https://serv2.criatoin.com.br/api/v1/deploy?uuid=joogkws88c0cw0ck08g0oc44&force=false" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2"
# Aguardar status: finished
```

- [ ] **Disparar uma nova auditoria técnica no painel** para verificar se os novos issues aparecem

---

## Chunk 3: Monitor Semanal Real (PR 3)

### File Map
- Create: `migrations/012_create_gsc_snapshots.sql`
- Modify: `backend/execution/weekly_monitor.py` — reescrita completa
- Action: Coolify — corrigir ordem dos cron jobs

---

### Task 3.1: Criar migration `012_create_gsc_snapshots.sql`

**File:** `migrations/012_create_gsc_snapshots.sql` (criar novo)

- [ ] **Criar o arquivo:**

```sql
-- Migration: create gsc_snapshots table for weekly historical comparison
-- Run via: Supabase SQL Editor or psql

CREATE TABLE IF NOT EXISTS gsc_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id     uuid REFERENCES pages(id) ON DELETE CASCADE,
  week_date   date NOT NULL,
  impressions integer,
  clicks      integer,
  ctr         numeric,
  position    numeric,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(page_id, week_date)
);

-- Index for site-level queries (UNIQUE already covers page_id + week_date lookups)
CREATE INDEX IF NOT EXISTS gsc_snapshots_site_week_idx ON gsc_snapshots(site_id, week_date);
```

- [ ] **Executar a migration no Supabase:**
  - Acessar o painel do Supabase → SQL Editor
  - Colar e executar o conteúdo do arquivo
  - Verificar que a tabela `gsc_snapshots` aparece no Table Editor

- [ ] **Verificar se existe `migrations/run_all.sql`** e, se sim, adicionar a linha ao final:
```sql
\i 012_create_gsc_snapshots.sql
```

- [ ] **Commit:**
```bash
git add migrations/012_create_gsc_snapshots.sql
git commit -m "feat: add gsc_snapshots migration for weekly historical comparison"
```

---

### Task 3.2: Reescrever `weekly_monitor.py`

**File:** `backend/execution/weekly_monitor.py`

- [ ] **Ler o arquivo atual para entender a estrutura existente antes de substituir**

- [ ] **Substituir o conteúdo completo por:**

```python
"""
Weekly Monitor — Fase 4 do Agente SEO Sênior.
Executa toda segunda-feira APÓS o sync-gsc.
Salva snapshot semanal e compara com semana anterior para detectar anomalias reais.
"""
import json
from datetime import date, timedelta
from supabase_client import get_db, log


def _get_week_date() -> date:
    """Returns the Sunday (start) of the current week."""
    today = date.today()
    # date.weekday(): Monday=0 ... Sunday=6
    # We want the Sunday before (or today if Sunday)
    days_since_sunday = (today.weekday() + 1) % 7
    return today - timedelta(days=days_since_sunday)


def _save_snapshots(db, site_id: str, week_date: date):
    """Save current GSC metrics as snapshot for this week (upsert)."""
    pages = (db.table("pages")
        .select("id,site_id,gsc_impressions,gsc_clicks,gsc_ctr,gsc_position")
        .eq("site_id", site_id)
        .execute().data)

    for page in pages:
        if page.get("gsc_impressions") is None and page.get("gsc_clicks") is None:
            continue  # Skip pages with no GSC data yet
        try:
            db.table("gsc_snapshots").upsert({
                "site_id":    site_id,
                "page_id":    page["id"],
                "week_date":  str(week_date),
                "impressions": page.get("gsc_impressions"),
                "clicks":      page.get("gsc_clicks"),
                "ctr":         page.get("gsc_ctr"),
                "position":    page.get("gsc_position"),
            }, on_conflict="page_id,week_date").execute()
        except Exception:
            pass  # Non-critical: skip individual failures


def _create_alert(db, site_id: str, page_id, severity: str, alert_type: str,
                  title: str, description: str, data: dict):
    db.table("alerts").insert({
        "site_id":     site_id,
        "page_id":     page_id,
        "severity":    severity,
        "alert_type":  alert_type,
        "title":       title,
        "description": description,
        "data":        json.dumps(data),
    }).execute()


def run(site_id: str):
    db = get_db()

    site_res = db.table("sites").select("*").eq("id", site_id).execute()
    if not site_res.data:
        raise ValueError(f"Site {site_id} not found")

    week_date      = _get_week_date()
    last_week_date = week_date - timedelta(days=7)

    log(site_id, "weekly-monitor", "start", "info",
        week_date=str(week_date), last_week_date=str(last_week_date))

    # Step 1: Save current snapshot
    _save_snapshots(db, site_id, week_date)

    # Step 2: Fetch current and previous snapshots
    current_snaps = {
        s["page_id"]: s
        for s in db.table("gsc_snapshots")
            .select("*").eq("site_id", site_id).eq("week_date", str(week_date))
            .execute().data
    }
    previous_snaps = {
        s["page_id"]: s
        for s in db.table("gsc_snapshots")
            .select("*").eq("site_id", site_id).eq("week_date", str(last_week_date))
            .execute().data
    }

    # Step 3: Compare and generate alerts
    alert_count = 0

    for page_id, curr in current_snaps.items():
        prev = previous_snaps.get(page_id)
        if not prev:
            continue  # No history yet for this page

        curr_clicks = curr.get("clicks") or 0
        prev_clicks = prev.get("clicks") or 0
        curr_impr   = curr.get("impressions") or 0
        prev_impr   = prev.get("impressions") or 0
        curr_pos    = curr.get("position")
        prev_pos    = prev.get("position")

        # Fetch page URL for alert description
        page_res = db.table("pages").select("url").eq("id", page_id).execute()
        page_url = page_res.data[0]["url"] if page_res.data else page_id

        # 3a: Traffic drop > 20%
        if prev_clicks > 10 and curr_clicks < prev_clicks * 0.8:
            delta_pct = round((curr_clicks - prev_clicks) / prev_clicks * 100, 1)
            _create_alert(db, site_id, page_id,
                severity="critical",
                alert_type="traffic_drop",
                title=f"Queda de tráfego: {page_url}",
                description=f"Cliques caíram {abs(delta_pct)}% vs semana anterior ({prev_clicks} → {curr_clicks})",
                data={"clicks_before": prev_clicks, "clicks_after": curr_clicks, "delta_pct": delta_pct, "url": page_url})
            alert_count += 1

        # 3b: Possible deindex — had impressions, now zero
        if prev_impr > 50 and curr_impr == 0:
            _create_alert(db, site_id, page_id,
                severity="critical",
                alert_type="possible_deindex",
                title=f"Possível desindexação: {page_url}",
                description=f"Página tinha {prev_impr} impressões na semana passada e agora tem 0",
                data={"impressions_before": prev_impr, "impressions_after": 0, "url": page_url})
            alert_count += 1

        # 3c: Position drop > 5 in pages with real traffic
        if curr_clicks > 10 and prev_pos and curr_pos and curr_pos > prev_pos + 5:
            _create_alert(db, site_id, page_id,
                severity="warning",
                alert_type="position_drop",
                title=f"Queda de posição: {page_url}",
                description=f"Posição caiu de {prev_pos:.1f} para {curr_pos:.1f} (↓ {curr_pos - prev_pos:.1f} posições)",
                data={"position_before": float(prev_pos), "position_after": float(curr_pos), "url": page_url})
            alert_count += 1

        # 3d: Opportunity — position 11-15 with good impressions
        if curr_impr > 100 and curr_pos and 11.0 <= curr_pos <= 15.9:
            _create_alert(db, site_id, page_id,
                severity="opportunity",
                alert_type="opportunity",
                title=f"Oportunidade de crescimento: {page_url}",
                description=f"Posição {curr_pos:.1f} com {curr_impr} impressões — candidata a impulso de links internos",
                data={"position": float(curr_pos), "impressions": curr_impr, "url": page_url})
            alert_count += 1

    # Step 4: CWV regression check — re-fetch PageSpeed for top 5 pages
    try:
        from pagespeed_client import analyze
        top_pages = (db.table("pages").select("id,url,audit_lcp_score")
            .eq("site_id", site_id)
            .order("gsc_clicks", desc=True)
            .limit(5).execute().data)

        for page in top_pages:
            if not page.get("audit_lcp_score"):
                continue
            try:
                ps = analyze(page["url"], "mobile")
                new_lcp = ps.get("lcp_score", "")
                if page["audit_lcp_score"] == "good" and new_lcp == "poor":
                    _create_alert(db, site_id, page["id"],
                        severity="critical",
                        alert_type="cwv_regression",
                        title=f"CWV regrediu: {page['url']}",
                        description="LCP passou de 'bom' para 'ruim' — possível impacto de deploy recente",
                        data={"lcp_before": "good", "lcp_after": "poor", "url": page["url"]})
                    alert_count += 1
                    # Update DB
                    db.table("pages").update({"audit_lcp_score": new_lcp}).eq("id", page["id"]).execute()
            except Exception:
                pass
    except Exception as e:
        log(site_id, "weekly-monitor", "cwv_check", "warning", error=str(e))

    # Step 5: All stable if no anomalies
    if alert_count == 0:
        _create_alert(db, site_id, None,
            severity="opportunity",
            alert_type="all_stable",
            title="Tudo estável esta semana",
            description="Nenhuma anomalia detectada. Continue monitorando.",
            data={"week_date": str(week_date)})

    log(site_id, "weekly-monitor", "complete", "info",
        alerts_generated=alert_count, week_date=str(week_date))

    return {"alerts_generated": alert_count, "week_date": str(week_date)}
```

- [ ] **Commit:**
```bash
git add backend/execution/weekly_monitor.py
git commit -m "feat: rewrite weekly_monitor with historical snapshot comparison"
```

---

### Task 3.3: Corrigir ordem dos cron jobs no Coolify

Os cron jobs precisam ser reordenados: `sync-gsc` **antes** de `weekly-monitor`.

- [ ] **Verificar UUIDs dos scheduled tasks:**
```bash
curl -s "https://serv2.criatoin.com.br/api/v1/scheduled-tasks" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2" \
  | python3 -c "import sys,json; [print(t['uuid'], t['name'], t.get('frequency','')) for t in json.load(sys.stdin)]"
```

- [ ] **Atualizar frequência do sync-gsc para `0 11 * * 1` (Segunda 08h BRT):**
```bash
# Substituir <uuid-sync-gsc> pelo UUID correto do comando acima
curl -s -X PATCH "https://serv2.criatoin.com.br/api/v1/scheduled-tasks/<uuid-sync-gsc>" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2" \
  -H "Content-Type: application/json" \
  -d '{"frequency": "0 11 * * 1"}'
```

- [ ] **Atualizar frequência do weekly-monitor para `0 12 * * 1` (Segunda 09h BRT):**
```bash
# Substituir <uuid-weekly-monitor> pelo UUID correto
curl -s -X PATCH "https://serv2.criatoin.com.br/api/v1/scheduled-tasks/<uuid-weekly-monitor>" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2" \
  -H "Content-Type: application/json" \
  -d '{"frequency": "0 12 * * 1"}'
```

---

### Task 3.4: Deploy PR 3

- [ ] **Push para GitHub:**
```bash
git push origin main
```

- [ ] **Deploy backend:**
```bash
curl -s -X GET "https://serv2.criatoin.com.br/api/v1/deploy?uuid=joogkws88c0cw0ck08g0oc44&force=false" \
  -H "Authorization: Bearer 4|KhjNZW4NJw39fm8eBKAeK21WMFGTnx4w92JsTunde8590ac2"
# Aguardar status: finished
```

- [ ] **Testar o monitor manualmente via job trigger:**
```bash
# Usando o botão "Disparar" na página /alertas do painel, ou via API:
curl -s -X POST "https://api-seo.criatoin.com.br/api/jobs/weekly-monitor" \
  -H "X-Cron-Secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"site_id": "<seu-site-id>"}'
```

- [ ] **Verificar em `/alertas` que os alertas da semana aparecem com dados comparativos**

---

## Checklist Final de Qualidade

Após os 3 PRs deployados:

- [ ] `/paginas/[id]` → seção Schema mostra botão "Gerar com IA" e aplica corretamente
- [ ] `/auditoria` → novos issue types (`orphan_page`, `broken_internal_link`, `redirect_chain`, `deep_page`, `robots_blocking_pages`, `images_no_webp`) aparecem após re-auditoria
- [ ] `/alertas` → alertas de segunda-feira mostram `delta_pct` e dados comparativos
- [ ] Monitor não gera alertas quando não há anomalias (apenas `all_stable`)
