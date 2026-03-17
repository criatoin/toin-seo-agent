# Design: Completude do Agente SEO Sênior
**Data:** 2026-03-17
**Abordagem:** C — Camadas em paralelo
**Objetivo:** Expandir o sistema para cobertura de análise técnica completa + schema approval flow + monitor semanal real, entregando resultados visíveis o mais rápido possível.

---

## Contexto

O sistema atual cobre ~80% do spec do CLAUDE.md. As lacunas críticas para um Agente SEO/GEO Sênior são:

1. **Auditoria técnica** cobre apenas 55% do checklist (faltam orphan pages, redirect chains, links quebrados, profundidade, robots.txt)
2. **Schema proposals** são geradas mas não podem ser aplicadas — não há endpoint de aplicação funcional nem UI de aprovação
3. **Monitor semanal** não compara com semana anterior — os alertas são imprecisos

O modelo de uso é: **análise profunda → usuário aprova → sistema executa**. Não há autonomia sem aprovação.

---

## Bloco 1 — Schema Approval Flow (semana 1, maior ROI visível)

### Problema
`schema_optimizer.py` gera JSON-LD para o site inteiro mas o pipeline para aqui: o endpoint `POST /schema/apply` em `routers/proposals.py` (linha 64-78) existe como stub — só muda o status para `'approved'` na tabela, **não chama o WordPress e não atualiza `pages.schema_current`**. A UI de aprovação no painel não existe.

### Solução

#### Backend — arquivos a modificar

**`routers/proposals.py` — substituir o stub `/schema/apply` pela implementação completa:**
```
POST /api/sites/{site_id}/pages/{page_id}/schema/apply
  → busca schema_proposals pendente para a page
  → busca page (para post_id) e site (para WP credentials)
  → se site.type == 'wordpress' e page.post_id existe:
      POST /wp-json/toin-seo/v1/pages/{post_id}/schema  { schema_json: object }
      se WP retornar não-2xx: raise HTTPException(502)
  → UPDATE pages SET schema_current = schema_json WHERE id = page_id
  → UPDATE schema_proposals SET status = 'applied', applied_at = now()
  → UPDATE audit_issues SET status = 'fixed' WHERE page_id = page_id AND issue_type = 'missing_schema' AND status = 'open'
  → retorna { applied: true, schema_type, page_id }
```

**`routers/pages.py` — adicionar endpoint de geração por página:**
```
POST /api/sites/{site_id}/pages/{page_id}/schema/generate
  → chama schema_optimizer.generate_for_page(site_id, page_id)
  → retorna { proposal_id, schema_type, schema_json, rationale, is_fallback: bool }
```

**`execution/schema_optimizer.py` — adicionar função `generate_for_page`:**
```python
def generate_for_page(site_id: str, page_id: str) -> dict:
    # Busca page record do DB
    # Fetch conteúdo live da URL (mesmo padrão de audit.py _fetch_page_text)
    # Monta prompt para DeepSeek: detectar tipo de schema + gerar JSON-LD completo
    # Se DeepSeek falha: gera schema mínimo baseado no tipo inferido da URL
    #   (ex: URL contém /blog/ ou /post/ → Article; homepage → Organization; /servicos/ → Service)
    # Salva em schema_proposals com status='pending'
    # Retorna { proposal_id, schema_type, schema_json, rationale, is_fallback: bool }
    # is_fallback=True quando schema foi gerado por heurística de URL, sem IA
```

O `is_fallback` segue o mesmo padrão do `audit.py` `preview-fix` — frontend exibe aviso amarelo quando `is_fallback=True`.

#### Frontend — arquivos a modificar

**Novo componente `components/SchemaProposalCard.tsx`:**
- Props: `pageId: string, siteId: string, currentSchema: object|null, postId: number|null`
- Estados: `idle | generating | pending_approval | applying | applied | error`
- Estado `idle` com `currentSchema == null`: card cinza "Schema não configurado" + botão "Gerar com IA"
- Estado `idle` com `currentSchema != null`: exibe tipo atual (ex: "Article ✓") + data + botão "Regenerar"
- Estado `generating`: spinner
- Estado `pending_approval`: JSON-LD em bloco colapsável + texto do `rationale` + botão "Aplicar no WordPress"
  - Se `is_fallback=true`: banner amarelo "Schema gerado sem IA — verifique antes de aplicar"
  - Se `postId == null`: botão desabilitado com tooltip "Página não vinculada ao WordPress"
- Estado `applying`: spinner
- Estado `applied`: badge verde "Aplicado ✓"
- Estado `error`: mensagem de erro (502 → "WordPress indisponível"; outros → texto do erro)

**`frontend/app/paginas/[id]/page.tsx` — integrar SchemaProposalCard:**
- A página já busca `GET /pages/{page_id}` que retorna `schema_current` e `post_id`
- Adicionar `<SchemaProposalCard>` abaixo do `<MetaVariationCard>` existente

#### Fluxo de dados completo
```
/paginas/[id]
  → GET /pages/{id} → { schema_current, post_id, ... }
  → SchemaProposalCard(idle)
  → clique "Gerar" → POST .../schema/generate → { proposal_id, schema_json, is_fallback }
  → SchemaProposalCard(pending_approval) → usuário revisa JSON-LD
  → clique "Aplicar" → POST .../schema/apply → { applied: true }
  → SchemaProposalCard(applied)
```

---

## Bloco 2 — Auditoria Técnica Completa (semana 1, sem UI nova)

### Checks a adicionar em `technical_audit.py`

Todos os novos checks geram issues na tabela `audit_issues` com a estrutura existente. Nenhuma mudança de UI necessária — issues novos aparecem na `/auditoria` automaticamente.

O limite atual de URLs no `technical_audit.py` é `urls[:100]`. Este bloco **aumenta o limite para 200** (não 500 — 500 pode causar timeout na Coolify). Para sites com >200 páginas no sitemap, auditar as 200 mais recentes é suficiente para detectar padrões sistêmicos.

#### Nota de implementação — normalização de URLs (obrigatório para checks 2.2–2.5)

Todos os `href` coletados nos crawls devem ser normalizados antes de comparação:
```python
from urllib.parse import urljoin, urlparse

def normalize_url(base_url: str, href: str) -> str | None:
    """Resolve relativo para absoluto e normaliza."""
    if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
        return None
    absolute = urljoin(base_url, href)
    parsed = urlparse(absolute)
    # Remove fragment, normaliza trailing slash
    path = parsed.path.rstrip('/') or '/'
    return f"{parsed.scheme}://{parsed.netloc}{path}"
```

Esta função deve ser usada em **todos** os checks que coletam `<a href="">` do HTML.

**Atenção — `site_crawler.py` precisa de ajuste simultâneo:** O `crawl_page` atual filtra links internos com `urlparse(l).netloc in ("", urlparse(url).netloc)`. Após `normalize_url`, todos os hrefs se tornam absolutos (netloc nunca é vazio). A lógica de filtro deve ser atualizada para:
```python
site_netloc = urlparse(page_url).netloc
internal_links = [
    normalize_url(page_url, a.get("href"))
    for a in soup.find_all("a", href=True)
    if normalize_url(page_url, a.get("href")) and
       urlparse(normalize_url(page_url, a.get("href"))).netloc == site_netloc
]
```
Sem essa correção, após `normalize_url`, todos os links relativos passariam a ter netloc != "" e seriam classificados como externos — o check de páginas órfãs e o BFS de profundidade produziriam falsos positivos em todas as páginas.

#### 2.1 Robots.txt
- Fetch `{site_url}/robots.txt`
- Parse com `urllib.robotparser.RobotFileParser`
- Para cada URL do sitemap: checa `can_fetch('*', url)`
- Issue: `robots_blocking_pages` | severity: `critical` | auto_fixable: `false`
- `description`: "X páginas bloqueadas pelo robots.txt: [lista das primeiras 5 URLs]"
- `recommendation`: "Remova ou ajuste as regras Disallow em robots.txt"

#### 2.2 Páginas Órfãs
- Crawl de todas as páginas: coleta `internal_links` de cada uma (já existe em `site_crawler.crawl_page`)
- Normaliza todos os hrefs com `normalize_url(source_url, href)`
- Constrói set `all_linked_urls` = união de todos os internal_links normalizados
- Para cada página do sitemap: se sua URL normalizada não está em `all_linked_urls` → órfã
- Issue: `orphan_page` | page_id: ID da página órfã | severity: `important` | auto_fixable: `false`
- `recommendation`: "Adicione pelo menos 1 link interno apontando para esta página"

#### 2.3 Links Internos Quebrados
- Durante o crawl: para cada `href` interno normalizado, faz HEAD request
- Links que retornam 404 = quebrado (ignorar 301/302 — são redirect chains, check 2.4)
- Agrupa por página de origem para não criar issue duplicado
- Issue: `broken_internal_link` | page_id: ID da página de origem | severity: `important` | auto_fixable: `false`
- `description`: "Link quebrado: [URL_origem] → [URL_destino] (404)"
- Limite: máximo 10 broken links reportados por página para não poluir

#### 2.4 Redirect Chains
- Para cada URL do sitemap: `requests.get(url, allow_redirects=True)` e inspeciona `response.history`
- `len(response.history) >= 2` = chain (A→B→C ou mais)
- Issue: `redirect_chain` | severity: `important` | auto_fixable: `false`
- `description`: "Redirect chain: [A] → [B] → [C]"
- `recommendation`: "Configure redirect direto de [A] para [C]"

#### 2.5 Profundidade de Cliques
- BFS a partir da homepage (`site_url`) seguindo internal_links normalizados
- Registra profundidade de cada página alcançada
- Páginas a profundidade > 3 geram issue
- Issue: `deep_page` | severity: `improvement` | auto_fixable: `false`
- `description`: "Esta página está a {depth} cliques da homepage"
- `recommendation`: "Adicione links internos a partir de páginas de maior tráfego para reduzi-la para ≤3 cliques"

#### 2.6 Imagens sem WebP
- Durante crawl: coleta `<img src="">` onde `src` termina em `.jpg`, `.jpeg`, `.png`
- Para cada imagem: faz HEAD request na URL com extensão `.webp` — se retornar 404, imagem sem WebP
- Gera **um único issue por site** (não por imagem) para não poluir
- Issue: `images_no_webp` | page_id: `null` (issue de site inteiro) | severity: `improvement`
- `description`: "X imagens sem versão WebP detectadas"
- `recommendation`: "Configure LiteSpeed Cache → Image Optimization → WebP Replacement para converter automaticamente"

### Performance do crawl
- Checks 2.2–2.5 fazem crawl em paralelo (asyncio + `asyncio.Semaphore(5)` req concorrentes)
- O check 2.1 (robots.txt) é executado **primeiro** — o resultado é usado para excluir URLs bloqueadas dos outros checks
- Timeout por página: 5s
- Limita a **200 URLs** por auditoria (aumentado do atual 100, mas não 500 para evitar timeout de 10min no Coolify)

---

## Bloco 3 — Monitor Semanal Real (semana 2)

### Problema
O monitor atual não tem dados históricos — não consegue comparar "esta semana vs. semana passada". Adicionalmente, a ordem atual dos cron jobs no Coolify é incorreta: `weekly-monitor` (Segunda 08h) roda **antes** do `sync-gsc` (Segunda 09h), então o monitor salva dados da semana passada como "dados desta semana".

### Correção de ordem dos cron jobs (necessária antes de tudo)
O cron do `sync-gsc` deve ser movido para **antes** do `weekly-monitor`:
- `sync-gsc`: `0 11 * * 1` (Segunda 08h BRT)
- `weekly-monitor`: `0 12 * * 1` (Segunda 09h BRT)

Sem essa correção, os snapshots serão sempre stale e as comparações produzirão zero anomalias reais.

### Nova tabela `gsc_snapshots`
```sql
CREATE TABLE gsc_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id uuid REFERENCES pages(id) ON DELETE CASCADE,
  week_date date NOT NULL,   -- Domingo da semana (início do período)
  impressions integer,
  clicks integer,
  ctr numeric,
  position numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(page_id, week_date)  -- Cria índice implícito em (page_id, week_date) — suficiente para lookups do monitor
);
CREATE INDEX ON gsc_snapshots(site_id, week_date);  -- Para queries por site
```

A constraint `UNIQUE(page_id, week_date)` cria um índice implícito em Postgres que cobre os point lookups do loop de comparação. Nenhum índice adicional por `page_id` é necessário.

### Fluxo do job `weekly-monitor` (reescrita)
```
1. GSC sync já rodou (ordem de cron garantida)
2. Calcular week_date = domingo desta semana (date_trunc('week', now()) - interval '1 day')
3. Para cada página do site:
   a. Salvar snapshot atual:
      INSERT INTO gsc_snapshots (...) VALUES (...)
      ON CONFLICT (page_id, week_date) DO UPDATE SET ... (upsert)
4. Calcular last_week_date = week_date - 7 dias
5. Para cada página que tem snapshot em last_week_date:
   a. Comparar clicks atual vs. semana anterior:
      - queda > 20% E clicks_atual < clicks_anterior: alerta traffic_drop (critical)
   b. Impressões > 50 na semana anterior, agora = 0: alerta possible_deindex (critical)
   c. Posição piorou > 5 em página com clicks_atual > 10: alerta position_drop (warning)
   d. Posição entre 11.0–15.9 com impressões > 100: alerta opportunity (opportunity)
6. Comparar CWV: re-fetch PageSpeed para top 5 páginas por tráfego
   - Se audit_lcp_score era 'good' e agora é 'poor': alerta cwv_regression (critical)
7. Se nenhum alerta gerado: criar alerta all_stable
```

Os alertas incluem `data` jsonb com o delta: `{ "clicks_before": 187, "clicks_after": 123, "delta_pct": -34 }` para exibição no painel.

### Exibição no painel `/alertas`
- Badge de severidade já existe — nenhuma mudança de UI necessária
- O campo `description` do alerta já contém o delta formatado

---

## Ordem de execução

```
PR 1 (deploy imediato):
  ├── backend: routers/proposals.py → substituir stub /schema/apply pela implementação completa
  ├── backend: routers/pages.py → adicionar POST /schema/generate
  ├── backend: execution/schema_optimizer.py → adicionar generate_for_page(site_id, page_id)
  └── frontend: SchemaProposalCard.tsx + integração em /paginas/[id]/page.tsx

PR 2 (deploy imediato, independente do PR 1):
  ├── backend: execution/technical_audit.py → normalize_url + 6 novos checks + limite 200 URLs
  └── backend: execution/site_crawler.py → aplicar normalize_url nos internal_links existentes

PR 3 (após PR 1 e PR 2, requer migration):
  ├── migrations/012_create_gsc_snapshots.sql → DDL completo definido no Bloco 3
  ├── Coolify cron: sync-gsc → 0 11 * * 1 (08h BRT), weekly-monitor → 0 12 * * 1 (09h BRT)
  └── backend: execution/weekly_monitor.py → reescrita com snapshot + comparação histórica
```

---

## O que NÃO está no escopo deste design

- GEO / llms.txt (separado, menor impacto imediato)
- apply_safe_routines completo (dependente do plugin WP estar verificado)
- directives/ e skills/ (documentação, não bloqueia features)
- Retry logic e rate limiting no DeepSeek (melhoria de resiliência, separado)

---

## Critérios de sucesso

1. Usuário consegue gerar e aplicar schema JSON-LD em qualquer página WP com 2 cliques, com aviso quando IA gerou fallback
2. Auditoria técnica detecta robots.txt, orphan pages, broken links, redirect chains, deep pages e imagens sem WebP
3. Alertas de segunda-feira mostram delta real vs. semana anterior com % de variação e os dados brutos
