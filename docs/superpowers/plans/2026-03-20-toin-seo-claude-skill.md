# TOIN SEO Claude Code Skill — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a skill `/toin-seo` no Claude Code que analisa sites WordPress e executa correções de SEO aprovadas pelo usuário, sem nenhuma dependência de servidor externo.

**Architecture:** Scripts Python standalone (sem Supabase/FastAPI) salvam estado em `~/.toin-seo/`. A skill SKILL.md orquestra os scripts e apresenta diagnóstico em 4 blocos no chat, executando apenas o que o usuário aprovar via WP REST API. Os dados WP vêm de duas fontes distintas: (a) plugin REST API `/toin-seo/v1/pages` dá post_id + metadados SEO; (b) crawl HTML dá h1s, canonical, schema, imagens. O `auditor.py` faz o join por URL.

**Tech Stack:** Python 3.11+, requests, beautifulsoup4, google-auth, google-api-python-client, WordPress REST API

**Endpoints WP (plugin toin-seo-agent):**
- `GET  /wp-json/toin-seo/v1/pages` → lista com post_id, url, title, description, seo_plugin
- `POST /wp-json/toin-seo/v1/pages/{id}/meta` → body: {title?, description?, seo_plugin}
- `POST /wp-json/toin-seo/v1/pages/{id}/canonical` → body: {canonical_url}
- `POST /wp-json/toin-seo/v1/pages/{id}/schema` → body: {schema_json}
- `POST /wp-json/toin-seo/v1/pages/{id}/images/alt` → body: {images: [{src, alt}]}

---

## Chunk 1: Estrutura base + state management

### Task 1: Criar state manager com cooldown

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/state.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_state.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/__init__.py` (vazio)

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_state.py
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from state import State

@pytest.fixture
def s(tmp_path, monkeypatch):
    monkeypatch.setenv("TOIN_SEO_ROOT", str(tmp_path))
    return State("criatoin")

def test_dirs_criados(s):
    assert s.root.exists()
    assert s.site_dir.exists()
    assert s.proposals_dir.exists()

def test_sites_json_salvo_e_lido(s):
    data = {"sites": [{"slug": "criatoin", "wp_url": "https://criatoin.com.br"}]}
    s.save_sites(data)
    loaded = s.load_sites()
    assert loaded["sites"][0]["wp_url"] == "https://criatoin.com.br"

def test_cooldown_ativo(s):
    recent = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    s.save_history({"pages": {"https://criatoin.com.br/": {"last_meta_changed_at": recent, "actions": []}}})
    assert s.is_in_cooldown("https://criatoin.com.br/", "meta") is True

def test_cooldown_inativo(s):
    old = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    s.save_history({"pages": {"https://criatoin.com.br/": {"last_meta_changed_at": old, "actions": []}}})
    assert s.is_in_cooldown("https://criatoin.com.br/", "meta") is False

def test_cooldown_sem_historico(s):
    # Página sem histórico → não está em cooldown
    assert s.is_in_cooldown("https://criatoin.com.br/nova", "meta") is False

def test_record_action_grava_cooldown(s):
    s.record_action("https://criatoin.com.br/", "meta_description", "Nova desc")
    h = s.load_history()
    page = h["pages"]["https://criatoin.com.br/"]
    assert page["actions"][0]["type"] == "meta_description"
    assert page["last_meta_changed_at"] is not None
    # Verificar que agora está em cooldown
    assert s.is_in_cooldown("https://criatoin.com.br/", "meta") is True

def test_save_e_load_audit(s):
    audit = {"pages_count": 10, "issues": []}
    s.save_audit(audit)
    loaded = s.load_audit()
    assert loaded["pages_count"] == 10

def test_cooldown_expires_at(s):
    recent = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    s.save_history({"pages": {"https://criatoin.com.br/": {"last_meta_changed_at": recent, "actions": []}}})
    expires = s.cooldown_expires_at("https://criatoin.com.br/")
    assert expires is not None  # deve retornar data formatada
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
cd ~/.claude/skills/toin-seo/scripts && python -m pytest tests/test_state.py -v
```
Esperado: `ModuleNotFoundError: No module named 'state'`

- [ ] **Step 3: Implementar `state.py`**

```python
# ~/.claude/skills/toin-seo/scripts/state.py
import json, os
from datetime import datetime, timezone, timedelta
from pathlib import Path


def _root() -> Path:
    custom = os.environ.get("TOIN_SEO_ROOT")
    return Path(custom) if custom else Path.home() / ".toin-seo"


class State:
    def __init__(self, site_slug: str):
        self.slug = site_slug
        self.root = _root()
        self.site_dir = self.root / site_slug
        self.proposals_dir = self.site_dir / "proposals"
        for d in [self.root, self.site_dir, self.proposals_dir]:
            d.mkdir(exist_ok=True)

    def _atomic_write(path: Path, data: dict) -> None:
        """Escrita atômica via arquivo temporário + rename. Previne corrupção se o processo morrer."""
        import tempfile
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)  # rename atômico no mesmo filesystem

    def save_sites(self, data: dict) -> None:
        path = self.root / "sites.json"
        self._atomic_write(path, data)
        _secure_file(path)

    def load_sites(self) -> dict:
        path = self.root / "sites.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"sites": []}

    def save_audit(self, data: dict) -> None:
        self._atomic_write(self.site_dir / "last_audit.json", data)

    def load_audit(self) -> dict | None:
        path = self.site_dir / "last_audit.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def save_history(self, data: dict) -> None:
        self._atomic_write(self.site_dir / "history.json", data)

    def load_history(self) -> dict:
        path = self.site_dir / "history.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"pages": {}}

    def is_in_cooldown(self, url: str, action_type: str, cooldown_days: int = 60) -> bool:
        h = self.load_history()
        page = h.get("pages", {}).get(url, {})
        field = "last_meta_changed_at" if action_type == "meta" else f"last_{action_type}_changed_at"
        last = page.get(field)
        if not last:
            return False
        last_dt = datetime.fromisoformat(last)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - last_dt) < timedelta(days=cooldown_days)

    def cooldown_expires_at(self, url: str, cooldown_days: int = 60) -> str | None:
        h = self.load_history()
        last = h.get("pages", {}).get(url, {}).get("last_meta_changed_at")
        if not last:
            return None
        last_dt = datetime.fromisoformat(last)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        return (last_dt + timedelta(days=cooldown_days)).strftime("%d/%m/%Y")

    def record_action(self, url: str, action_type: str, value: str) -> None:
        h = self.load_history()
        h.setdefault("pages", {}).setdefault(url, {"actions": []})
        now = datetime.now(timezone.utc).isoformat()
        h["pages"][url]["actions"].append({"type": action_type, "applied_at": now, "value": value})
        if action_type in ("meta_description", "meta"):
            h["pages"][url]["last_meta_changed_at"] = now
        elif action_type == "title":
            h["pages"][url]["last_title_changed_at"] = now
        self.save_history(h)


def _secure_file(path: Path) -> None:
    try:
        os.chmod(path, 0o600)
    except (AttributeError, NotImplementedError):
        try:
            import subprocess
            user = os.environ.get("USERNAME", os.environ.get("USER", ""))
            if user:
                subprocess.run(
                    ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:F"],
                    capture_output=True, check=False
                )
        except Exception:
            pass
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_state.py -v
```
Esperado: 8 testes PASS

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DANILLO/Desktop/LP's IA/Agente SEO TOIN"
git add -A && git commit -m "feat: add state.py — file persistence and cooldown management"
```

---

### Task 2: Script `crawler.py` — WP REST API + crawl HTML

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/crawler.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_crawler.py`

**Contrato de retorno (dois shapes distintos):**
- `crawl_wp_pages()` → `[{post_id, url, post_type, seo_plugin, title, meta_desc_wp, has_meta, post_modified}]` — dados do plugin REST API
- `crawl_page()` → `{url, status_code, title_html, meta_desc_html, h1s, canonical, schema, images_total, images_no_alt, images_no_alt_srcs, internal_links}` — dados do HTML
- O `auditor.py` faz join por URL usando `merge_page_data()`

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_crawler.py
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from crawler import normalize_url, crawl_sitemap, crawl_page, crawl_wp_pages, merge_page_data

def test_normalize_url_relativo():
    assert normalize_url("https://criatoin.com.br/", "/servicos") == "https://criatoin.com.br/servicos"

def test_normalize_url_ancora():
    assert normalize_url("https://criatoin.com.br/", "#topo") is None

def test_normalize_url_mailto():
    assert normalize_url("https://criatoin.com.br/", "mailto:a@b.com") is None

def test_crawl_sitemap_mock():
    xml = b"""<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://criatoin.com.br/servicos</loc></url>
        <url><loc>https://criatoin.com.br/sobre</loc></url>
        <url><loc>https://criatoin.com.br/servicos</loc></url>
    </urlset>"""
    mock_resp = MagicMock(content=xml)
    mock_resp.raise_for_status = MagicMock()
    with patch("crawler.requests.get", return_value=mock_resp):
        urls = crawl_sitemap("https://criatoin.com.br")
    assert len(urls) == 2  # sem duplicatas
    assert "https://criatoin.com.br/servicos" in urls

def test_crawl_wp_pages_retorna_shape_correto():
    wp_data = [
        {"id": 1, "url": "https://criatoin.com.br/servicos", "post_type": "page",
         "title": "Serviços", "description": "", "seo_plugin": "aioseo"},
        {"id": 2, "url": "https://criatoin.com.br/sobre", "post_type": "page",
         "title": "Sobre", "description": "Desc sobre", "seo_plugin": "aioseo"},
    ]
    mock_resp = MagicMock()
    mock_resp.json.return_value = wp_data
    mock_resp.raise_for_status = MagicMock()
    with patch("crawler.requests.get", return_value=mock_resp):
        result = crawl_wp_pages("https://criatoin.com.br", "admin", "pass")
    assert len(result) == 2
    assert result[0]["post_id"] == 1
    assert result[0]["has_meta"] is False   # description vazia
    assert result[1]["has_meta"] is True    # description preenchida
    assert "h1s" not in result[0]          # shape WP não tem h1s

def test_crawl_page_retorna_shape_correto():
    html = """<html><head>
        <title>Servicos - TOIN</title>
        <meta name="description" content="Desc serv">
        <link rel="canonical" href="https://criatoin.com.br/servicos">
    </head><body><h1>Serviços</h1><img src="a.jpg" alt="ok"><img src="b.jpg"></body></html>"""
    mock_resp = MagicMock(text=html, status_code=200)
    with patch("crawler.requests.get", return_value=mock_resp):
        result = crawl_page("https://criatoin.com.br/servicos")
    assert result["title_html"] == "Servicos - TOIN"
    assert result["meta_desc_html"] == "Desc serv"
    assert result["h1s"] == ["Serviços"]
    assert result["images_total"] == 2
    assert result["images_no_alt"] == 1
    assert "post_id" not in result  # shape HTML não tem post_id

def test_merge_page_data():
    wp_pages = [{"post_id": 1, "url": "https://criatoin.com.br/servicos", "post_type": "page",
                 "seo_plugin": "aioseo", "title": "Serv", "meta_desc_wp": "", "has_meta": False,
                 "post_modified": "2026-03-01"}]
    crawled = {"https://criatoin.com.br/servicos": {
        "url": "https://criatoin.com.br/servicos", "title_html": "Servicos - TOIN",
        "meta_desc_html": "", "h1s": ["Serviços"], "canonical": "https://criatoin.com.br/servicos",
        "schema": None, "images_total": 2, "images_no_alt": 1, "images_no_alt_srcs": ["b.jpg"],
        "internal_links": [], "status_code": 200,
    }}
    merged = merge_page_data(wp_pages, crawled)
    assert merged[0]["post_id"] == 1
    assert merged[0]["h1s"] == ["Serviços"]
    assert merged[0]["has_meta"] is False
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python -m pytest tests/test_crawler.py -v
```

- [ ] **Step 3: Implementar `crawler.py`**

```python
# ~/.claude/skills/toin-seo/scripts/crawler.py
import json
import requests
from base64 import b64encode
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

HEADERS = {"User-Agent": "TOINSEOBot/1.0"}


def normalize_url(base_url: str, href: str) -> str | None:
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    absolute = urljoin(base_url, href)
    parsed = urlparse(absolute)
    if not parsed.scheme.startswith("http"):
        return None
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _fetch_sitemap_urls(sitemap_url: str, depth: int = 0) -> list[str]:
    if depth > 3:
        return []
    try:
        r = requests.get(sitemap_url, timeout=10, headers=HEADERS)
        r.raise_for_status()
        root = ElementTree.fromstring(r.content)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        child_sitemaps = root.findall("sm:sitemap/sm:loc", ns)
        if child_sitemaps:
            urls = []
            for loc in child_sitemaps:
                url = loc.text.strip() if loc.text else ""
                if url:
                    urls.extend(_fetch_sitemap_urls(url, depth + 1))
            return urls
        return [
            loc.text.strip()
            for loc in root.findall("sm:url/sm:loc", ns)
            if loc.text and not loc.text.strip().endswith(".xml")
        ]
    except Exception as e:
        print(f"Sitemap error ({sitemap_url}): {e}")
        return []


def crawl_sitemap(site_url: str) -> list[str]:
    """Retorna lista deduplicada de URLs do sitemap.xml."""
    urls = _fetch_sitemap_urls(site_url.rstrip("/") + "/sitemap.xml")
    seen = set()
    result = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            result.append(u)
    return result


def crawl_wp_pages(wp_url: str, wp_user: str, wp_password: str) -> list[dict]:
    """
    Chama /wp-json/toin-seo/v1/pages (plugin toin-seo-agent) com paginação.
    O plugin já retorna todos os posts de uma vez (paginação interna no PHP),
    mas se a resposta exceder o limite do servidor, usa _page como fallback.
    Retorna: [{post_id, url, post_type, seo_plugin, title, meta_desc_wp, has_meta, post_modified}]
    NÃO inclui h1s, canonical, schema — esses vêm do crawl_page().
    """
    token = b64encode(f"{wp_user}:{wp_password}".encode()).decode()
    headers = {**HEADERS, "Authorization": f"Basic {token}"}
    base_url = wp_url.rstrip("/") + "/wp-json/toin-seo/v1/pages"

    all_pages = []
    page_num = 1
    per_page = 500

    while True:
        r = requests.get(base_url, params={"_page": page_num, "_per_page": per_page},
                         headers=headers, timeout=60)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        all_pages.extend(batch)
        if len(batch) < per_page:
            break
        page_num += 1

    return [{
        "post_id":       p.get("id"),
        "url":           p.get("url", "").rstrip("/"),
        "post_type":     p.get("post_type", ""),
        "seo_plugin":    p.get("seo_plugin", "none"),
        "title":         p.get("title", ""),
        "meta_desc_wp":  p.get("description", ""),
        "has_meta":      bool(p.get("description", "").strip()),
        "post_modified": p.get("post_modified", ""),
    } for p in all_pages]


def crawl_page(url: str) -> dict:
    """
    Crawl HTML de uma página.
    Retorna: {url, status_code, title_html, meta_desc_html, h1s, canonical, schema,
              images_total, images_no_alt, images_no_alt_srcs, internal_links}
    NÃO inclui post_id, post_type — esses vêm do crawl_wp_pages().
    """
    try:
        r = requests.get(url, timeout=10, headers=HEADERS)
        soup = BeautifulSoup(r.text, "html.parser")
        title    = soup.find("title")
        desc_tag = soup.find("meta", attrs={"name": "description"})
        h1s      = soup.find_all("h1")
        canon    = soup.find("link", attrs={"rel": "canonical"})
        images   = soup.find_all("img")
        schema   = None
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                text = script.string
                if text:
                    schema = json.loads(text.strip())
                    break
            except Exception:
                pass
        netloc = urlparse(url).netloc
        return {
            "url":               url.rstrip("/"),
            "status_code":       r.status_code,
            "title_html":        title.get_text(strip=True) if title else "",
            "meta_desc_html":    desc_tag.get("content", "") if desc_tag else "",
            "h1s":               [h.get_text(strip=True) for h in h1s],
            "canonical":         canon.get("href", "") if canon else "",
            "schema":            schema,
            "images_total":      len(images),
            "images_no_alt":     sum(1 for img in images if not img.get("alt")),
            "images_no_alt_srcs": [img.get("src", "") for img in images if not img.get("alt")],
            "internal_links":    list(filter(None, [
                normalize_url(url, a.get("href"))
                for a in soup.find_all("a", href=True)
                if normalize_url(url, a.get("href")) and
                   urlparse(normalize_url(url, a.get("href"))).netloc == netloc
            ])),
        }
    except Exception as e:
        return {"url": url.rstrip("/"), "error": str(e)}


def merge_page_data(wp_pages: list[dict], crawled: dict[str, dict]) -> list[dict]:
    """
    Faz join de crawl_wp_pages() com crawl_page() pelo URL.
    crawled: {url -> resultado do crawl_page()}
    Retorna lista unificada com todos os campos necessários para o auditor.
    """
    result = []
    for wp in wp_pages:
        url = wp["url"]
        html = crawled.get(url) or crawled.get(url + "/") or {}
        merged = {**wp, **html}
        # Campos ausentes se a página não foi crawlada (site grande demais)
        merged.setdefault("h1s", [])
        merged.setdefault("canonical", "")
        merged.setdefault("schema", None)
        merged.setdefault("images_total", 0)
        merged.setdefault("images_no_alt", 0)
        merged.setdefault("images_no_alt_srcs", [])
        merged.setdefault("internal_links", [])
        merged.setdefault("status_code", None)
        result.append(merged)
    return result
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_crawler.py -v
```
Esperado: 6 testes PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add crawler.py with separate WP REST API and HTML crawl shapes"
```

---

### Task 3: Script `gsc.py` — Google Search Console

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/gsc.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_gsc.py`

**Contrato:** `fetch_site_data(site_url, client_id, client_secret, refresh_token, days=90)` recebe credenciais como args (não lê sites.json). Indexa por URL normalizada para evitar mismatches.

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_gsc.py
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from gsc import fetch_site_data, build_page_index, normalize_gsc_url

def _mock_creds():
    creds = MagicMock()
    creds.expired = False
    return creds

def test_normalize_gsc_url():
    # URLs do GSC podem diferir das URLs do WP em protocolo, www, barra final
    assert normalize_gsc_url("https://www.criatoin.com.br/servicos/") == "criatoin.com.br/servicos"
    assert normalize_gsc_url("http://criatoin.com.br/servicos") == "criatoin.com.br/servicos"
    assert normalize_gsc_url("https://criatoin.com.br/servicos") == "criatoin.com.br/servicos"

def test_fetch_site_data_retorna_rows():
    mock_rows = [
        {"keys": ["https://criatoin.com.br/servicos"], "impressions": 500, "clicks": 20, "ctr": 0.04, "position": 8.5},
    ]
    with patch("gsc._get_credentials", return_value=_mock_creds()), \
         patch("gsc.build") as mock_build:
        mock_service = MagicMock()
        mock_service.searchanalytics().query().execute.return_value = {"rows": mock_rows}
        mock_build.return_value = mock_service
        rows = fetch_site_data("https://criatoin.com.br", "id", "secret", "token", days=90)
    assert rows[0]["url"] == "https://criatoin.com.br/servicos"
    assert rows[0]["clicks"] == 20

def test_build_page_index_normaliza_urls():
    rows = [
        {"url": "https://www.criatoin.com.br/servicos/", "clicks": 20, "impressions": 500, "ctr": 0.04, "position": 8.5},
    ]
    index = build_page_index(rows)
    # Lookup por URL normalizada deve funcionar
    assert index.get("criatoin.com.br/servicos") is not None
    assert index["criatoin.com.br/servicos"]["clicks"] == 20

def test_fetch_sem_credenciais_falha():
    import pytest
    with pytest.raises(Exception):
        fetch_site_data("https://criatoin.com.br", "", "", "", days=90)
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python -m pytest tests/test_gsc.py -v
```

- [ ] **Step 3: Implementar `gsc.py`**

```python
# ~/.claude/skills/toin-seo/scripts/gsc.py
from datetime import datetime, timedelta
from urllib.parse import urlparse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build


def normalize_gsc_url(url: str) -> str:
    """Normaliza URL para comparação: remove protocolo, www, barra final."""
    parsed = urlparse(url)
    netloc = parsed.netloc.lower().lstrip("www.")
    path = parsed.path.rstrip("/")
    return f"{netloc}{path}"


def _get_credentials(client_id: str, client_secret: str, refresh_token: str) -> Credentials:
    """Obtém credenciais OAuth com novo access_token a cada sessão."""
    if not all([client_id, client_secret, refresh_token]):
        raise ValueError("GSC credentials incompletas: client_id, client_secret, refresh_token são obrigatórios")
    creds = Credentials(
        token=None, refresh_token=refresh_token,
        client_id=client_id, client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
    )
    creds.refresh(GoogleRequest())
    return creds


def fetch_site_data(site_url: str, client_id: str, client_secret: str, refresh_token: str,
                    days: int = 90) -> list[dict]:
    """
    Busca dados do Search Console.
    Retorna: [{url, clicks, impressions, ctr, position}]
    """
    creds   = _get_credentials(client_id, client_secret, refresh_token)
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)

    end_date   = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    body = {
        "startDate": start_date.isoformat(), "endDate": end_date.isoformat(),
        "dimensions": ["page"], "rowLimit": 25000,
    }

    candidates = [site_url]
    if not site_url.endswith("/") and not site_url.startswith("sc-domain:"):
        candidates.append(site_url + "/")

    last_error = None
    for candidate in candidates:
        try:
            rows = service.searchanalytics().query(siteUrl=candidate, body=body).execute().get("rows", [])
            return [{
                "url":         r["keys"][0],
                "clicks":      int(r.get("clicks", 0)),
                "impressions": int(r.get("impressions", 0)),
                "ctr":         round(float(r.get("ctr", 0)), 4),
                "position":    round(float(r.get("position", 0)), 2),
            } for r in rows]
        except Exception as e:
            last_error = e
    raise last_error


def build_page_index(rows: list[dict]) -> dict[str, dict]:
    """
    Cria índice {normalized_url -> dados} para lookup tolerante a diferenças de protocolo/www/slash.
    Uso: index.get(normalize_gsc_url(page_url))
    """
    return {normalize_gsc_url(r["url"]): r for r in rows}
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_gsc.py -v
```
Esperado: 4 testes PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add gsc.py — standalone GSC client with URL normalization"
```

---

## Chunk 2: Scripts de análise e escrita WP

### Task 4: Script `pagespeed.py` — Core Web Vitals

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/pagespeed.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_pagespeed.py`

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_pagespeed.py
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from pagespeed import analyze, analyze_site

def _resp(lcp=2000, cls=0.05, inp=150):
    return {"lighthouseResult": {
        "categories": {"performance": {"score": 0.85}},
        "audits": {
            "largest-contentful-paint": {"numericValue": lcp},
            "cumulative-layout-shift":  {"numericValue": cls},
            "interaction-to-next-paint": {"numericValue": inp},
        }
    }}

def test_scores_bom():
    mock_r = MagicMock()
    mock_r.json.return_value = _resp(lcp=1800, cls=0.05, inp=150)
    mock_r.raise_for_status = MagicMock()
    with patch("pagespeed.requests.get", return_value=mock_r):
        r = analyze("https://criatoin.com.br", api_key=None)
    assert r["lcp_score"] == "good"
    assert r["cls_score"] == "good"
    assert r["inp_score"] == "good"

def test_scores_ruim():
    mock_r = MagicMock()
    mock_r.json.return_value = _resp(lcp=5000, cls=0.4, inp=700)
    mock_r.raise_for_status = MagicMock()
    with patch("pagespeed.requests.get", return_value=mock_r):
        r = analyze("https://criatoin.com.br", api_key=None)
    assert r["lcp_score"] == "poor"
    assert r["cls_score"] == "poor"
    assert r["inp_score"] == "poor"

def test_analyze_site_inclui_homepage():
    mock_r = MagicMock()
    mock_r.json.return_value = _resp()
    mock_r.raise_for_status = MagicMock()
    with patch("pagespeed.requests.get", return_value=mock_r):
        results = analyze_site("https://criatoin.com.br", top_pages=[], api_key=None)
    assert any(r["url"] == "https://criatoin.com.br" for r in results)

def test_analyze_site_analisa_top_pages():
    mock_r = MagicMock()
    mock_r.json.return_value = _resp()
    mock_r.raise_for_status = MagicMock()
    top = [{"url": "https://criatoin.com.br/servicos", "clicks": 100}]
    with patch("pagespeed.requests.get", return_value=mock_r):
        results = analyze_site("https://criatoin.com.br", top_pages=top, api_key=None)
    assert any(r["url"] == "https://criatoin.com.br/servicos" for r in results)
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python -m pytest tests/test_pagespeed.py -v
```

- [ ] **Step 3: Implementar `pagespeed.py`**

```python
# ~/.claude/skills/toin-seo/scripts/pagespeed.py
import requests

BASE_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def _label(v: float | None) -> str:
    if v is None: return "unknown"
    return "good" if v >= 0.9 else ("needs_improvement" if v >= 0.5 else "poor")


def analyze(url: str, api_key: str | None, strategy: str = "mobile") -> dict:
    params: dict = {"url": url, "strategy": strategy, "category": ["performance"]}
    if api_key:
        params["key"] = api_key
    r = requests.get(BASE_URL, params=params, timeout=30)
    r.raise_for_status()
    data  = r.json()
    audits = data.get("lighthouseResult", {}).get("audits", {})
    lcp = audits.get("largest-contentful-paint", {}).get("numericValue", 0)
    cls = audits.get("cumulative-layout-shift",  {}).get("numericValue", 0)
    inp = audits.get("interaction-to-next-paint",{}).get("numericValue", 0)
    perf = data.get("lighthouseResult", {}).get("categories", {}).get("performance", {}).get("score", 0)
    return {
        "url": url, "strategy": strategy,
        "lcp_ms": lcp, "lcp_score": _label(1.0 if lcp<2500 else (0.6 if lcp<4000 else 0.0)),
        "cls":    cls, "cls_score": _label(1.0 if cls<0.1  else (0.6 if cls<0.25  else 0.0)),
        "inp_ms": inp, "inp_score": _label(1.0 if inp<200  else (0.6 if inp<500   else 0.0)),
        "perf_score": perf,
    }


def analyze_site(site_url: str, top_pages: list[dict], api_key: str | None) -> list[dict]:
    """Analisa homepage + até 5 top pages por cliques (mobile)."""
    urls = [site_url] + [p["url"] for p in top_pages[:5]]
    results = []
    for url in urls:
        try:
            results.append(analyze(url, api_key, strategy="mobile"))
        except Exception as e:
            results.append({"url": url, "error": str(e), "strategy": "mobile"})
    return results
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_pagespeed.py -v
```
Esperado: 4 testes PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add pagespeed.py — Core Web Vitals analyzer"
```

---

### Task 5: Script `wp_writer.py` — escrita no WordPress com verificação de cooldown

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/wp_writer.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_wp_writer.py`

**Regra:** `update_meta()` DEVE verificar cooldown via `state.is_in_cooldown()` antes de executar. Se em cooldown, lança `CooldownError`.

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_wp_writer.py
import sys, os
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from wp_writer import WPWriter, CooldownError
from state import State

def _site():
    return {"wp_url": "https://criatoin.com.br", "wp_user": "admin",
            "wp_app_password": "xxxx xxxx", "seo_plugin": "aioseo"}

def _ok():
    m = MagicMock()
    m.json.return_value = {"success": True}
    m.raise_for_status = MagicMock()
    return m

@pytest.fixture
def writer_with_state(tmp_path, monkeypatch):
    monkeypatch.setenv("TOIN_SEO_ROOT", str(tmp_path))
    state = State("criatoin")
    return WPWriter(_site(), state=state), state

def test_update_meta_ok(writer_with_state):
    writer, _ = writer_with_state
    with patch("wp_writer.requests.post", return_value=_ok()):
        ok = writer.update_meta(post_id=42, url="https://criatoin.com.br/servicos", description="Nova desc")
    assert ok is True

def test_update_meta_sem_post_id_falha(writer_with_state):
    writer, _ = writer_with_state
    with pytest.raises(ValueError, match="post_id"):
        writer.update_meta(post_id=None, url="https://criatoin.com.br/servicos", description="Desc")

def test_update_meta_em_cooldown_falha(writer_with_state):
    writer, state = writer_with_state
    # Simular alteração recente
    recent = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    state.save_history({"pages": {
        "https://criatoin.com.br/servicos": {"last_meta_changed_at": recent, "actions": []}
    }})
    with pytest.raises(CooldownError):
        writer.update_meta(post_id=42, url="https://criatoin.com.br/servicos", description="Nova desc")

def test_update_meta_registra_acao(writer_with_state):
    writer, state = writer_with_state
    with patch("wp_writer.requests.post", return_value=_ok()):
        writer.update_meta(post_id=42, url="https://criatoin.com.br/servicos", description="Nova desc")
    h = state.load_history()
    assert len(h["pages"]["https://criatoin.com.br/servicos"]["actions"]) == 1

def test_update_canonical(writer_with_state):
    writer, _ = writer_with_state
    with patch("wp_writer.requests.post", return_value=_ok()) as mock_post:
        ok = writer.update_canonical(post_id=42, canonical_url="https://criatoin.com.br/servicos")
    assert ok is True
    assert "/pages/42/canonical" in mock_post.call_args[0][0]

def test_update_schema(writer_with_state):
    writer, _ = writer_with_state
    with patch("wp_writer.requests.post", return_value=_ok()) as mock_post:
        ok = writer.update_schema(post_id=42, schema_json={"@type": "Organization"})
    assert ok is True
    assert "/pages/42/schema" in mock_post.call_args[0][0]

def test_erro_http_retorna_false(writer_with_state):
    writer, _ = writer_with_state
    m = MagicMock()
    m.raise_for_status.side_effect = Exception("HTTP 403")
    with patch("wp_writer.requests.post", return_value=m):
        ok = writer.update_canonical(post_id=42, canonical_url="https://criatoin.com.br/servicos")
    assert ok is False
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python -m pytest tests/test_wp_writer.py -v
```

- [ ] **Step 3: Implementar `wp_writer.py`**

```python
# ~/.claude/skills/toin-seo/scripts/wp_writer.py
import requests
from base64 import b64encode
from state import State


class CooldownError(Exception):
    """Levantada quando uma alteração de meta está dentro do cooldown de 60 dias."""
    pass


class WPWriter:
    """
    Escreve dados SEO no WordPress via plugin toin-seo-agent REST API.
    Endpoints:
      POST /wp-json/toin-seo/v1/pages/{id}/meta
      POST /wp-json/toin-seo/v1/pages/{id}/canonical
      POST /wp-json/toin-seo/v1/pages/{id}/schema
      POST /wp-json/toin-seo/v1/pages/{id}/images/alt
    """

    def __init__(self, site: dict, state: State):
        self.base = site["wp_url"].rstrip("/") + "/wp-json/toin-seo/v1"
        self.seo_plugin = site.get("seo_plugin", "none")
        self.state = state
        token = b64encode(f"{site['wp_user']}:{site['wp_app_password']}".encode()).decode()
        self.headers = {
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
            "User-Agent": "TOINSEOBot/1.0",
        }

    def _post(self, path: str, payload: dict) -> bool:
        try:
            r = requests.post(f"{self.base}{path}", json=payload, headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json().get("success", False)
        except Exception as e:
            print(f"  ⚠️  WP write error ({path}): {e}")
            return False

    def update_meta(self, post_id: int | None, url: str, description: str = None, title: str = None,
                    cooldown_days: int = 60) -> bool:
        """Atualiza meta/title. Verifica cooldown antes de executar. Registra ação no histórico."""
        if not post_id:
            raise ValueError("post_id é obrigatório para escrever no WordPress")
        if self.state.is_in_cooldown(url, "meta", cooldown_days):
            expires = self.state.cooldown_expires_at(url, cooldown_days)
            raise CooldownError(f"Cooldown ativo até {expires} para {url}")
        payload = {"seo_plugin": self.seo_plugin}
        if description is not None:
            payload["description"] = description
        if title is not None:
            payload["title"] = title
        ok = self._post(f"/pages/{post_id}/meta", payload)
        if ok:
            if description is not None:
                self.state.record_action(url, "meta_description", description)
            if title is not None:
                self.state.record_action(url, "title", title)
        return ok

    def update_canonical(self, post_id: int, canonical_url: str) -> bool:
        return self._post(f"/pages/{post_id}/canonical", {"canonical_url": canonical_url})

    def update_schema(self, post_id: int, schema_json: dict) -> bool:
        return self._post(f"/pages/{post_id}/schema", {"schema_json": schema_json})

    def update_images_alt(self, post_id: int, images: list[dict]) -> dict:
        """images: [{"src": "url", "alt": "texto"}]"""
        try:
            r = requests.post(
                f"{self.base}/pages/{post_id}/images/alt",
                json={"images": images}, headers=self.headers, timeout=30,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"success": False, "error": str(e)}
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_wp_writer.py -v
```
Esperado: 7 testes PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add wp_writer.py — WP REST API writer with cooldown enforcement"
```

---

## Chunk 3: Auditor e Glossário

### Task 6: Script `auditor.py` — classificador de issues

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/auditor.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_auditor.py`

**Nota:** Páginas com `post_type` contendo "glossar" ou "term" são excluídas do check `orphan_page` — na prática todos os termos apareceriam como órfãos pois os sitemaps têm 2.198 entradas e o crawl cobre apenas 500.

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_auditor.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from auditor import audit_pages, audit_cwv, AuditIssue

def _page(url="https://criatoin.com.br/servicos", post_type="page", **kwargs):
    defaults = {
        "url": url, "post_id": 1, "post_type": post_type,
        "title": "Serviços", "meta_desc_wp": "Desc", "has_meta": True,
        "h1s": ["Serviços"], "canonical": url, "schema": None,
        "images_total": 2, "images_no_alt": 0, "images_no_alt_srcs": [],
        "internal_links": ["https://criatoin.com.br/"],
        "status_code": 200,
    }
    defaults.update(kwargs)
    return defaults

def test_meta_vazia_gera_issue_critico():
    pages = [_page(meta_desc_wp="", has_meta=False)]
    issues = audit_pages(pages)
    assert any(i.issue_type == "empty_meta_description" and i.severity == "critical" for i in issues)

def test_h1_ausente():
    pages = [_page(h1s=[])]
    issues = audit_pages(pages)
    assert any(i.issue_type == "missing_h1" for i in issues)

def test_title_longo():
    pages = [_page(title="T" * 70)]
    issues = audit_pages(pages)
    assert any(i.issue_type == "title_too_long" for i in issues)

def test_sem_canonical():
    pages = [_page(canonical="")]
    issues = audit_pages(pages)
    assert any(i.issue_type == "missing_canonical" for i in issues)

def test_pagina_orfa_excluida_para_glossario():
    # Páginas do tipo glossário NÃO devem gerar orphan_page
    pages = [_page(url="https://criatoin.com.br/glossario/marketing", post_type="glossary",
                   internal_links=[])]
    issues = audit_pages(pages)
    assert not any(i.issue_type == "orphan_page" for i in issues)

def test_pagina_orfa_detectada_para_page():
    pages = [
        _page(url="https://criatoin.com.br/sobre", post_type="page", internal_links=[]),
        # ninguém aponta para /sobre
    ]
    issues = audit_pages(pages)
    assert any(i.issue_type == "orphan_page" and "sobre" in i.url for i in issues)

def test_imagens_sem_alt():
    pages = [_page(images_total=5, images_no_alt=3)]
    issues = audit_pages(pages)
    assert any(i.issue_type == "images_missing_alt" for i in issues)

def test_cwv_poor_gera_critico():
    cwv = [{"url": "https://criatoin.com.br", "lcp_score": "poor",
            "cls_score": "good", "inp_score": "good", "strategy": "mobile"}]
    issues = audit_cwv(cwv)
    assert any(i.issue_type == "lcp_poor" and i.severity == "critical" for i in issues)

def test_cwv_needs_improvement_gera_importante():
    cwv = [{"url": "https://criatoin.com.br", "lcp_score": "needs_improvement",
            "cls_score": "good", "inp_score": "good", "strategy": "mobile"}]
    issues = audit_cwv(cwv)
    assert any(i.severity == "important" for i in issues)
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python -m pytest tests/test_auditor.py -v
```

- [ ] **Step 3: Implementar `auditor.py`**

```python
# ~/.claude/skills/toin-seo/scripts/auditor.py
from dataclasses import dataclass, field

GLOSSARY_POST_TYPES = {"glossary", "glossario", "term", "terms", "glossary-item"}


@dataclass
class AuditIssue:
    severity: str       # critical | important | improvement
    category: str       # indexation | speed | onpage | links | schema
    issue_type: str
    description: str
    url: str | None = None
    auto_fixable: bool = False
    recommendation: str = ""


def _is_glossary(post_type: str) -> bool:
    pt = post_type.lower()
    return pt in GLOSSARY_POST_TYPES or "glossar" in pt or "term" in pt


def audit_pages(pages: list[dict]) -> list[AuditIssue]:
    """Analisa páginas mergeadas (crawler.merge_page_data) e retorna issues."""
    issues: list[AuditIssue] = []

    # Índice de links internos para detectar páginas órfãs
    all_linked_to: set[str] = set()
    for p in pages:
        for link in p.get("internal_links", []):
            all_linked_to.add(link.rstrip("/"))

    seen_titles: dict[str, str] = {}

    for p in pages:
        url = p["url"]

        # Meta description vazia
        if not p.get("has_meta") and not p.get("meta_desc_wp", "").strip():
            issues.append(AuditIssue(
                severity="critical", category="onpage", issue_type="empty_meta_description",
                description=f"Meta description vazia: {url}",
                url=url, auto_fixable=True,
                recommendation="Preencher com resumo claro da página (150-160 caracteres)."
            ))

        # H1 ausente
        if not p.get("h1s"):
            issues.append(AuditIssue(
                severity="important", category="onpage", issue_type="missing_h1",
                description=f"H1 ausente: {url}", url=url,
                recommendation="Adicionar um único H1 descritivo."
            ))

        # Múltiplos H1
        if len(p.get("h1s", [])) > 1:
            issues.append(AuditIssue(
                severity="important", category="onpage", issue_type="multiple_h1",
                description=f"Múltiplos H1 ({len(p['h1s'])}): {url}", url=url,
                recommendation="Manter apenas um H1 por página."
            ))

        # Title longo
        title = p.get("title", "")
        if len(title) > 65:
            issues.append(AuditIssue(
                severity="improvement", category="onpage", issue_type="title_too_long",
                description=f"Title com {len(title)} chars (máx 65): {url}", url=url,
                recommendation="Encurtar para ≤ 65 caracteres."
            ))

        # Title duplicado
        if title:
            if title in seen_titles and seen_titles[title] != url:
                issues.append(AuditIssue(
                    severity="important", category="onpage", issue_type="duplicate_title",
                    description=f"Title duplicado: '{title}' em {url} e {seen_titles[title]}",
                    url=url, recommendation="Cada página deve ter título único."
                ))
            seen_titles[title] = url

        # Canonical ausente
        if not p.get("canonical", "").strip():
            issues.append(AuditIssue(
                severity="important", category="indexation", issue_type="missing_canonical",
                description=f"Canonical ausente: {url}",
                url=url, auto_fixable=True, recommendation=f"Adicionar canonical → {url}"
            ))

        # Imagens sem alt
        no_alt = p.get("images_no_alt", 0)
        if no_alt > 0:
            issues.append(AuditIssue(
                severity="improvement", category="onpage", issue_type="images_missing_alt",
                description=f"{no_alt}/{p.get('images_total',0)} imagens sem alt em {url}",
                url=url, recommendation="Adicionar alt text descritivo."
            ))

        # Schema ausente
        if not p.get("schema"):
            issues.append(AuditIssue(
                severity="improvement", category="schema", issue_type="missing_schema",
                description=f"Schema JSON-LD ausente: {url}", url=url,
                recommendation="Adicionar schema adequado ao tipo de página."
            ))

        # Página órfã — EXCLUIR post_types de glossário (2k+ páginas causariam flood)
        post_type = p.get("post_type", "")
        if not _is_glossary(post_type):
            url_norm = url.rstrip("/")
            is_homepage = url_norm.count("/") <= 2
            if not is_homepage and url_norm not in all_linked_to:
                issues.append(AuditIssue(
                    severity="important", category="links", issue_type="orphan_page",
                    description=f"Página órfã (sem links internos): {url}",
                    url=url, recommendation="Adicionar ao menos 1 link interno."
                ))

    return issues


def audit_cwv(cwv_results: list[dict]) -> list[AuditIssue]:
    issues: list[AuditIssue] = []
    metrics = [
        ("lcp_score", "lcp_poor", "lcp_needs_improvement", "LCP",
         "Otimizar imagem hero, usar CDN, melhorar TTFB."),
        ("cls_score", "cls_poor", "cls_needs_improvement", "CLS",
         "Definir dimensões para imagens/iframes, evitar conteúdo dinâmico acima do fold."),
        ("inp_score", "inp_poor", "inp_needs_improvement", "INP",
         "Reduzir JS bloqueante, dividir tarefas longas."),
    ]
    for result in cwv_results:
        url = result.get("url", "homepage")
        for score_key, poor_type, ni_type, name, rec in metrics:
            score = result.get(score_key)
            if score == "poor":
                issues.append(AuditIssue(
                    severity="critical", category="speed", issue_type=poor_type,
                    description=f"{name} ruim em {url} ({result.get('strategy','mobile')})",
                    url=url, recommendation=rec
                ))
            elif score == "needs_improvement":
                issues.append(AuditIssue(
                    severity="important", category="speed", issue_type=ni_type,
                    description=f"{name} precisa melhorar em {url} ({result.get('strategy','mobile')})",
                    url=url, recommendation=rec
                ))
    return issues
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_auditor.py -v
```
Esperado: 9 testes PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add auditor.py — SEO issue classifier with glossary exclusion"
```

---

### Task 7: Script `glossary.py` — análise do glossário TOIN

**Files:**
- Create: `~/.claude/skills/toin-seo/scripts/glossary.py`
- Create: `~/.claude/skills/toin-seo/scripts/tests/test_glossary.py`

**Nota:** `fetch_site_data` é chamado com `days=180` (6 meses conforme spec). `discover_glossary_post_type` oferece seleção manual se não detectar automaticamente.

- [ ] **Step 1: Escrever o teste**

```python
# ~/.claude/skills/toin-seo/scripts/tests/test_glossary.py
import sys, csv
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from glossary import discover_glossary_post_type, classify_terms, export_csv, get_noindex_candidates
from gsc import normalize_gsc_url

def test_discover_encontra_glossario():
    mock_r = MagicMock()
    mock_r.json.return_value = {
        "post": {"name": "Posts"}, "page": {"name": "Páginas"},
        "glossary": {"name": "Glossário"},
    }
    mock_r.raise_for_status = MagicMock()
    with patch("glossary.requests.get", return_value=mock_r):
        result = discover_glossary_post_type("https://criatoin.com.br", "u", "p")
    assert result == "glossary"

def test_discover_nao_encontra_retorna_none():
    mock_r = MagicMock()
    mock_r.json.return_value = {"post": {"name": "Posts"}, "page": {"name": "Páginas"}}
    mock_r.raise_for_status = MagicMock()
    with patch("glossary.requests.get", return_value=mock_r):
        result = discover_glossary_post_type("https://criatoin.com.br", "u", "p")
    assert result is None

def test_classify_trafego_real():
    pages = [{"url": "https://criatoin.com.br/glossario/marketing", "title": "Marketing", "post_id": 1}]
    # index usa URL normalizada
    gsc_index = {normalize_gsc_url("https://criatoin.com.br/glossario/marketing"): {"clicks": 15, "impressions": 200}}
    result = classify_terms(pages, gsc_index, ["marketing"])
    assert result[0]["category"] == "trafego_real"
    assert result[0]["is_strategic"] is True

def test_classify_impressoes_sem_clique():
    pages = [{"url": "https://criatoin.com.br/glossario/seo", "title": "SEO", "post_id": 2}]
    gsc_index = {normalize_gsc_url("https://criatoin.com.br/glossario/seo"): {"clicks": 0, "impressions": 50}}
    result = classify_terms(pages, gsc_index, ["seo"])
    assert result[0]["category"] == "impressoes_sem_clique"

def test_classify_invisivel():
    pages = [{"url": "https://criatoin.com.br/glossario/css", "title": "CSS", "post_id": 3}]
    gsc_index = {}  # não aparece no GSC
    result = classify_terms(pages, gsc_index, ["marketing"])
    assert result[0]["category"] == "invisivel"
    assert result[0]["is_strategic"] is False

def test_noindex_candidates_so_invisiveis_nao_estrategicos():
    terms = [
        {"url": "a", "category": "trafego_real", "is_strategic": False},
        {"url": "b", "category": "invisivel", "is_strategic": True},   # estratégico → não candidato
        {"url": "c", "category": "invisivel", "is_strategic": False},  # candidato ao noindex
    ]
    candidates = get_noindex_candidates(terms)
    assert len(candidates) == 1
    assert candidates[0]["url"] == "c"

def test_export_csv(tmp_path):
    terms = [{"url": "https://criatoin.com.br/glossario/seo", "title": "SEO",
              "category": "invisivel", "clicks": 0, "impressions": 0,
              "is_strategic": False, "post_id": 99}]
    output = tmp_path / "test.csv"
    export_csv(terms, output)
    rows = list(csv.DictReader(open(output, encoding="utf-8")))
    assert rows[0]["category"] == "invisivel"
    assert rows[0]["is_strategic"] == "False"
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python -m pytest tests/test_glossary.py -v
```

- [ ] **Step 3: Implementar `glossary.py`**

```python
# ~/.claude/skills/toin-seo/scripts/glossary.py
import csv, requests
from base64 import b64encode
from pathlib import Path
from gsc import normalize_gsc_url

HEADERS = {"User-Agent": "TOINSEOBot/1.0"}

DEFAULT_STRATEGIC_KEYWORDS = [
    "marketing", "digital", "seo", "criação", "criacao", "sites", "agência", "agencia",
    "branding", "tráfego", "trafego", "google", "ads", "social", "mídia", "midia",
    "conversão", "conversao", "leads", "inbound", "conteúdo", "conteudo",
    "landing", "wordpress", "e-commerce", "ecommerce",
]


def _auth(wp_user: str, wp_password: str) -> dict:
    token = b64encode(f"{wp_user}:{wp_password}".encode()).decode()
    return {**HEADERS, "Authorization": f"Basic {token}"}


def discover_glossary_post_type(wp_url: str, wp_user: str, wp_password: str) -> str | None:
    """
    Descobre o slug do post_type do glossário via /wp-json/wp/v2/types.
    Retorna slug ou None se não encontrar.
    Se None: o caller deve pedir ao usuário para escolher manualmente.
    """
    r = requests.get(wp_url.rstrip("/") + "/wp-json/wp/v2/types",
                     headers=_auth(wp_user, wp_password), timeout=15)
    r.raise_for_status()
    for slug, info in r.json().items():
        name = info.get("name", "").lower()
        if "glossar" in slug.lower() or "glossar" in name or "term" in slug.lower():
            return slug
    return None


def fetch_glossary_pages(wp_url: str, wp_user: str, wp_password: str, post_type_slug: str) -> list[dict]:
    """Busca todas as páginas do glossário com paginação."""
    headers = _auth(wp_user, wp_password)
    base = wp_url.rstrip("/") + f"/wp-json/wp/v2/{post_type_slug}"
    pages, page_num = [], 1
    while True:
        r = requests.get(base, params={"per_page": 100, "page": page_num, "status": "publish",
                                        "_fields": "id,link,title,modified"},
                         headers=headers, timeout=30)
        if r.status_code == 400:
            break
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        pages.extend([{
            "post_id": p["id"],
            "url":     p["link"].rstrip("/"),
            "title":   p["title"]["rendered"] if isinstance(p.get("title"), dict) else str(p.get("title", "")),
        } for p in batch])
        if len(batch) < 100:
            break
        page_num += 1
    return pages


def classify_terms(pages: list[dict], gsc_index: dict,
                   strategic_keywords: list[str] = None) -> list[dict]:
    """
    Classifica termos. gsc_index deve usar normalize_gsc_url() como chave.
    strategic_keywords: lista de palavras que identificam termos estratégicos para o negócio.
    """
    if strategic_keywords is None:
        strategic_keywords = DEFAULT_STRATEGIC_KEYWORDS
    result = []
    for p in pages:
        url = p["url"]
        gsc = gsc_index.get(normalize_gsc_url(url)) or gsc_index.get(normalize_gsc_url(url + "/")) or {}
        clicks, impressions = gsc.get("clicks", 0), gsc.get("impressions", 0)
        category = "trafego_real" if clicks > 0 else ("impressoes_sem_clique" if impressions > 0 else "invisivel")
        title_lower, url_lower = p.get("title", "").lower(), url.lower()
        is_strategic = any(kw in title_lower or kw in url_lower for kw in strategic_keywords)
        result.append({
            "url": url, "title": p.get("title", ""), "category": category,
            "clicks": clicks, "impressions": impressions, "is_strategic": is_strategic,
            "post_id": p.get("post_id"),
        })
    return result


def export_csv(terms: list[dict], output_path: Path) -> None:
    fields = ["url", "title", "category", "clicks", "impressions", "is_strategic", "post_id"]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(terms)


def get_noindex_candidates(terms: list[dict]) -> list[dict]:
    """Termos invisíveis E não estratégicos — candidatos ao noindex."""
    return [t for t in terms if t["category"] == "invisivel" and not t["is_strategic"]]
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python -m pytest tests/test_glossary.py -v
```
Esperado: 7 testes PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add glossary.py — TOIN glossary analysis and classification"
```

---

## Chunk 4: SKILL.md e setup

### Task 8: Criar SKILL.md da skill `/toin-seo`

**Files:**
- Create: `~/.claude/skills/toin-seo/SKILL.md`
- Create: `~/.claude/skills/toin-seo/requirements.txt`

- [ ] **Step 1: Criar `requirements.txt`**

```
requests>=2.31.0
beautifulsoup4>=4.12.0
google-auth>=2.29.0
google-auth-httplib2>=0.2.0
google-api-python-client>=2.127.0
lxml>=5.2.0
pytest>=8.0.0
```

- [ ] **Step 2: Instalar dependências**

```bash
pip install -r ~/.claude/skills/toin-seo/requirements.txt
```
Esperado: sem erros

- [ ] **Step 3: Criar `SKILL.md`**

Criar o arquivo `~/.claude/skills/toin-seo/SKILL.md` com o seguinte conteúdo:

```markdown
---
name: toin-seo
description: Use when the user invokes /toin-seo to run a complete SEO and GEO audit on a WordPress site and execute approved corrections
---

# TOIN SEO Agent

Você é um especialista em SEO técnico e GEO (AI search optimization). Quando invocado via `/toin-seo`:

**Regras absolutas:**
1. Analise tudo ANTES de apresentar qualquer diagnóstico.
2. Execute APENAS o que for aprovado explicitamente.
3. Sempre fale em português com o usuário.
4. NUNCA altere title, noindex páginas, ou faça ações em lote sem confirmação explícita separada da aprovação do bloco.

## Diretórios
- Scripts: `~/.claude/skills/toin-seo/scripts/`
- Estado: `~/.toin-seo/`

---

## Fluxo de Execução

### 1. Verificar configuração

Verificar se `~/.toin-seo/sites.json` existe.
- Se não existe → executar Setup Guiado (ver abaixo).
- Se há múltiplos sites → listar e perguntar qual analisar.
- Carregar site config: `site = sites["sites"][0]` (ou o escolhido).

### 2. Coletar dados

Executar TODOS os passos abaixo antes de apresentar qualquer diagnóstico:

```python
# 2a: Páginas WP (post_ids + metadados SEO do plugin)
from crawler import crawl_wp_pages
wp_pages = crawl_wp_pages(site["wp_url"], site["wp_user"], site["wp_app_password"])

# 2b: Sitemap + crawl HTML (primeiras 500 páginas)
from crawler import crawl_sitemap, crawl_page, merge_page_data
sitemap_urls = crawl_sitemap(site["wp_url"])
crawled = {}
for url in sitemap_urls[:500]:
    crawled[url.rstrip("/")] = crawl_page(url)
pages = merge_page_data(wp_pages, crawled)

# 2c: GSC (90 dias geral + 180 dias para glossário)
from gsc import fetch_site_data, build_page_index
gsc_rows = fetch_site_data(site["wp_url"], site["gsc_client_id"],
                           site["gsc_client_secret"], site["gsc_refresh_token"], days=90)
gsc_index = build_page_index(gsc_rows)

# 2d: Core Web Vitals
from pagespeed import analyze_site
top_pages = sorted(gsc_rows, key=lambda r: r["clicks"], reverse=True)[:5]
cwv = analyze_site(site["wp_url"], top_pages, api_key=site.get("pagespeed_api_key"))

# 2e: Glossário (somente se site tem glossário configurado)
gsc_rows_180 = fetch_site_data(site["wp_url"], site["gsc_client_id"],
                               site["gsc_client_secret"], site["gsc_refresh_token"], days=180)
gsc_index_180 = build_page_index(gsc_rows_180)
```

Salvar resultado em `~/.toin-seo/{site_slug}/last_audit.json`.

### 3. Bloco 1 — Saúde Técnica

```python
from auditor import audit_pages, audit_cwv
issues = audit_pages(pages) + audit_cwv(cwv)
```

Apresentar ordenado: 🔴 Crítico → 🟡 Importante → 🟢 Melhoria.
Numerar cada ação proposta.

**Ao final perguntar:** "Quais ações do Bloco 1 você aprova? (números, 'todos' ou 'nenhum')"

**Executar aprovadas:**
```python
from state import State
from wp_writer import WPWriter, CooldownError
state = State(site_slug)
writer = WPWriter(site, state=state)

for p in approved_pages:
    # Meta vazia:
    if p.get("action") == "fill_meta":
        try:
            ok = writer.update_meta(post_id=p["post_id"], url=p["url"], description=p["new_desc"])
            print(f"  ✅ Meta atualizada: {p['url']}" if ok else f"  ❌ Falha: {p['url']}")
        except CooldownError as e:
            print(f"  ⏳ Cooldown ativo: {e} — pulando")
    # Canonical ausente:
    elif p.get("action") == "fix_canonical":
        ok = writer.update_canonical(post_id=p["post_id"], canonical_url=p["url"])
        print(f"  ✅ Canonical corrigido: {p['url']}" if ok else f"  ❌ Falha: {p['url']}")
```

### 4. Bloco 2 — Oportunidades GSC

Filtrar: posição 5-15 E ctr < 0.02 E impressões >= 200.
Verificar cooldown antes de propor cada página.

Para páginas candidatas, gerar 3 variações de meta/title:
- V1: refinamento conservador do atual
- V2: foco em benefício + CTA
- V3: linguagem de resposta direta para AI Overviews

Após escolha → `writer.update_meta(post_id, url, description=<escolhida>)`.

### 5. Bloco 3 — Schema e GEO

Para páginas sem schema → gerar JSON-LD por tipo:
- `page` → Organization ou WebPage
- `post` → Article ou BlogPosting
- `service` → Service
- Páginas FAQ → FAQPage

Verificar llms.txt: `requests.get(site_url + "/llms.txt")` → se 404, propor rascunho.
Salvar em `~/.toin-seo/{slug}/llms_draft.txt` e mostrar ao usuário para aprovação.

**Cada schema requer aprovação individual:**
`writer.update_schema(post_id, schema_json=<gerado>)`

### 6. Bloco 4 — Glossário TOIN

```python
from glossary import discover_glossary_post_type, fetch_glossary_pages, classify_terms
from glossary import export_csv, get_noindex_candidates
from pathlib import Path

# Descobrir post_type
post_type = discover_glossary_post_type(site["wp_url"], site["wp_user"], site["wp_app_password"])
if post_type is None:
    # Mostrar lista de post_types disponíveis e pedir ao usuário para escolher
    print("Não encontrei o post_type do glossário automaticamente.")
    print("Tipos disponíveis: [listar do /wp-json/wp/v2/types]")
    # Aguardar input do usuário

glossary_pages = fetch_glossary_pages(site["wp_url"], site["wp_user"], site["wp_app_password"], post_type)
terms = classify_terms(glossary_pages, gsc_index_180)

# Exportar relatório completo ANTES de propor ações
report_path = Path.home() / ".toin-seo" / site_slug / "glossary_report.csv"
export_csv(terms, report_path)

# Apresentar resumo
trafego = sum(1 for t in terms if t["category"] == "trafego_real")
impressoes = sum(1 for t in terms if t["category"] == "impressoes_sem_clique")
invisiveis = sum(1 for t in terms if t["category"] == "invisivel")
print(f"Glossário: {trafego} com tráfego | {impressoes} com impressões | {invisiveis} invisíveis")
print(f"Relatório completo: {report_path}")

candidates = get_noindex_candidates(terms)
noindex_path = Path.home() / ".toin-seo" / site_slug / "glossary_noindex_candidates.csv"
export_csv(candidates, noindex_path)
print(f"\n{len(candidates)} candidatos ao noindex: {noindex_path}")
print("Revise o arquivo CSV antes de confirmar.")
print("Digite 'sim' para prosseguir com o noindex em lote, ou 'não' para pular.")
```

Após confirmação 'sim': executar em lotes de 50, reportar progresso após cada lote.

---

## Setup Guiado

Coletar um a um:
1. URL do site (ex: https://criatoin.com.br)
2. Usuário WordPress
3. WordPress Application Password (WP Admin → Usuários → Senhas de aplicativo)
4. Plugin SEO instalado: yoast / rankmath / aioseo / seopress / none
5. GSC Client ID
6. GSC Client Secret
7. GSC Refresh Token
8. PageSpeed API Key (opcional — Enter para pular)
9. Slug do site para estado local (ex: criatoin)

Salvar em `~/.toin-seo/sites.json` via `state.save_sites()`.

---

## Tabela de Autonomia

| Ação | Confirmação necessária |
|------|----------------------|
| Preencher meta description vazia | Aprovação do bloco |
| Corrigir canonical ausente | Aprovação do bloco |
| Injetar schema JSON-LD | Aprovação individual por página |
| Alterar title | Confirmação explícita separada |
| Alterar alt text de imagem | Confirmação explícita separada + lista |
| Noindex em página | Confirmação explícita separada |
| Noindex em lote (glossário) | 'sim' após revisão do CSV |

**Cooldown:** Meta description/title: mínimo 60 dias entre alterações por página.
Em cooldown → informar "Cooldown ativo até DD/MM/AAAA" e pular.
```

- [ ] **Step 4: Rodar todos os testes**

```bash
cd ~/.claude/skills/toin-seo/scripts
python -m pytest tests/ -v --tb=short
```
Esperado: todos os testes PASS (28+ testes)

- [ ] **Step 5: Testar invocação da skill**

No Claude Code, digitar `/toin-seo` e verificar que o Claude carrega a skill.
Se `~/.toin-seo/sites.json` não existe, deve iniciar o Setup Guiado.

- [ ] **Step 6: Commit final**

```bash
cd "c:/Users/DANILLO/Desktop/LP's IA/Agente SEO TOIN"
git add -A
git commit -m "feat: add SKILL.md, requirements.txt — /toin-seo skill complete"
```

---

## Resumo dos arquivos

```
~/.claude/skills/toin-seo/
  SKILL.md           # Orquestra o agente quando /toin-seo é invocado
  requirements.txt   # pip install -r requirements.txt
  scripts/
    state.py         # State management: sites.json, history.json, cooldowns
    crawler.py       # WP REST API pages + HTML crawl (shapes distintos, merge_page_data)
    gsc.py           # GSC data: fetch_site_data(url, id, secret, token, days) + URL normalization
    pagespeed.py     # Core Web Vitals: analyze(url, api_key) + analyze_site()
    auditor.py       # Issue classifier: audit_pages() + audit_cwv() (exclui glossário de orphan)
    wp_writer.py     # WPWriter com cooldown enforcement + CooldownError
    glossary.py      # TOIN glossary: discover + fetch + classify (180 dias GSC) + export CSV
    tests/
      __init__.py
      test_state.py
      test_crawler.py
      test_gsc.py
      test_pagespeed.py
      test_auditor.py
      test_glossary.py
```
