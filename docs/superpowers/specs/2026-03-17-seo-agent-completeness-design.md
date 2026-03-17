# Design: Completude do Agente SEO Sênior
**Data:** 2026-03-17
**Abordagem:** C — Camadas em paralelo
**Objetivo:** Expandir o sistema para cobertura de análise técnica completa + schema approval flow + monitor semanal real, entregando resultados visíveis o mais rápido possível.

---

## Contexto

O sistema atual cobre ~80% do spec do CLAUDE.md. As lacunas críticas para um Agente SEO/GEO Sênior são:

1. **Auditoria técnica** cobre apenas 55% do checklist (faltam orphan pages, redirect chains, links quebrados, profundidade, robots.txt)
2. **Schema proposals** são geradas mas não podem ser aplicadas — não há endpoint nem UI de aprovação
3. **Monitor semanal** não compara com semana anterior — os alertas são imprecisos

O modelo de uso é: **análise profunda → usuário aprova → sistema executa**. Não há autonomia sem aprovação.

---

## Bloco 1 — Schema Approval Flow (semana 1, maior ROI visível)

### Problema
`schema_optimizer.py` gera JSON-LD mas o pipeline para: não há endpoint de aplicação nem card de aprovação no painel.

### Solução

**Backend — novo endpoint em `routers/pages.py`:**
```
POST /api/sites/{site_id}/pages/{page_id}/schema/generate
  → chama schema_optimizer.generate_for_page(page_id)
  → salva em schema_proposals com status='pending'
  → retorna { proposal_id, schema_type, schema_json, rationale }

POST /api/sites/{site_id}/pages/{page_id}/schema/apply
  → valida que proposal existe com status='pending'
  → POST /wp-json/toin-seo/v1/pages/{post_id}/schema via plugin WP
  → atualiza pages.schema_current + schema_proposals.status='applied'
  → marca audit_issue 'missing_schema' como fixed (se existir)
```

**Frontend — seção na página `/paginas/[id]`:**
- Se página sem schema: card "Schema Estruturado — não configurado" + botão "Gerar com IA"
- Loading state → IA retorna tipo detectado (ex: "Article") + JSON-LD completo em syntax highlight
- Botão "Aplicar no WordPress" → chama apply endpoint → status muda para "Aplicado ✓"
- Se schema já existe: exibe tipo atual + data de aplicação + botão "Regenerar"

**Componente novo:** `SchemaProposalCard.tsx`
- Props: `pageId, siteId, currentSchema, postId`
- Estados: `idle | generating | pending_approval | applying | applied | error`
- Exibe JSON formatado em bloco de código colapsável
- Mostra `rationale` da IA ("Por que Article: esta página tem autor, data e corpo de texto")

### Fluxo de dados
```
/paginas/[id] → GET /pages/{id} (inclui schema_current, post_id)
             → SchemaProposalCard recebe props
             → POST .../schema/generate → pending proposal
             → usuário aprova → POST .../schema/apply → applied
```

### Tratamento de erros
- Plugin WP offline: retorna 502, exibe "WordPress indisponível — tente novamente"
- Página sem post_id: desativa botão "Aplicar" com tooltip "Página não vinculada ao WordPress"
- DeepSeek falha: fallback para schema mínimo baseado em tipo de URL inferido

---

## Bloco 2 — Auditoria Técnica Completa (semana 1, sem UI nova)

### Checks a adicionar em `technical_audit.py`

Todos os novos checks geram issues na tabela `audit_issues` com a estrutura existente. Nenhuma mudança de UI necessária — issues novos aparecem na `/auditoria` automaticamente.

#### 2.1 Robots.txt
- Fetch `/robots.txt` do site
- Detecta `Disallow: /` ou disallow em páginas que aparecem no sitemap
- Issue: `robots_blocking_pages` | severity: `critical` | auto_fixable: `false`
- Recomendação: lista exata das URLs bloqueadas

#### 2.2 Páginas Órfãs
- Crawl completo das páginas do sitemap
- Para cada página: verifica se alguma outra página do site tem `<a href="">` apontando para ela
- Pages sem nenhum link interno = órfã
- Issue: `orphan_page` | severity: `important` | auto_fixable: `false`
- Recomendação: "Adicione links internos para esta página a partir de [URL sugerida]"

#### 2.3 Links Internos Quebrados
- Durante o crawl: para cada `<a href="">` interno, verifica status HTTP
- Links que retornam 404 = quebrado
- Issue: `broken_internal_link` | severity: `important` | auto_fixable: `false`
- Recomendação: "Link quebrado em [página_origem] → [URL_destino] (404)"

#### 2.4 Redirect Chains
- Para cada URL do sitemap: segue redirects até destino final
- Chain com 2+ hops (A→B→C) é detectada
- Issue: `redirect_chain` | severity: `important` | auto_fixable: `false`
- Recomendação: "Atualize links de [A] direto para [C], eliminando [B]"

#### 2.5 Profundidade de Cliques
- BFS a partir da homepage seguindo links internos
- Páginas a >3 cliques da homepage
- Issue: `deep_page` | severity: `improvement` | auto_fixable: `false`
- Recomendação: "Esta página está a N cliques da home — adicione links internos para reduzi-la para ≤3"

#### 2.6 Imagens sem WebP
- Durante crawl: detecta `<img>` com src `.jpg/.png` sem versão WebP disponível
- Issue: `images_no_webp` | severity: `improvement` | auto_fixable: `false`
- Recomendação: "Configure LiteSpeed Cache → Image Optimization → WebP Replacement"

### Performance do crawl
- Checks 2.2–2.5 fazem crawl em paralelo (asyncio + semáforo de 5 req concorrentes)
- Respeita `robots.txt` detectado no check 2.1
- Timeout por página: 5s
- Limita a 500 URLs por auditoria para evitar timeout

---

## Bloco 3 — Monitor Semanal Real (semana 2)

### Problema
O monitor atual não tem dados históricos — não consegue comparar "esta semana vs. semana passada".

### Nova tabela `gsc_snapshots`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id     uuid REFERENCES sites(id)
page_id     uuid REFERENCES pages(id)
week_date   date NOT NULL        -- Domingo da semana (início)
impressions integer
clicks      integer
ctr         numeric
position    numeric
created_at  timestamptz DEFAULT now()
UNIQUE(page_id, week_date)
```

### Fluxo do job `weekly-monitor`
1. Antes de comparar: salva snapshot atual de cada página (`week_date = domingo desta semana`)
2. Busca snapshot da semana anterior (`week_date = domingo passado`)
3. Compara par a par:
   - Queda de cliques >20% → alerta `traffic_drop` severity: `critical`
   - Página tinha impressões > 50, agora tem 0 → alerta `possible_deindex` severity: `critical`
   - Posição caiu >5 posições em página com cliques > 10 → alerta `position_drop` severity: `warning`
   - Posição entre 11-15 com impressões > 100 → alerta `opportunity` severity: `opportunity`
4. Compara CWV atual vs. última auditoria (campos `audit_lcp_score` em `pages`):
   - Se mudou de `good` para `poor` → alerta `cwv_regression` severity: `critical`
5. Se nenhuma anomalia: alerta único `all_stable`

### Exibição no painel `/alertas`
- Alertas novos mostram delta: "↓ 34% vs semana anterior (187 → 123 cliques)"
- Badge de severidade já existe — nenhuma mudança de UI necessária

### Migration SQL necessária
```sql
CREATE TABLE gsc_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  page_id uuid REFERENCES pages(id) ON DELETE CASCADE,
  week_date date NOT NULL,
  impressions integer,
  clicks integer,
  ctr numeric,
  position numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(page_id, week_date)
);
CREATE INDEX ON gsc_snapshots(site_id, week_date);
```

---

## Ordem de execução

```
PR 1 (deploy imediato):
  ├── backend: routers/pages.py → /schema/generate + /schema/apply
  ├── backend: execution/schema_optimizer.py → generate_for_page(page_id)
  └── frontend: SchemaProposalCard.tsx + integração em /paginas/[id]

PR 2 (deploy imediato, independente):
  ├── backend: execution/technical_audit.py → 6 novos checks
  └── migrations: nenhuma necessária (usa tabela audit_issues existente)

PR 3 (após PR 1 e 2):
  ├── migrations: criar gsc_snapshots
  └── backend: execution/weekly_monitor.py → comparação histórica + novos alertas
```

---

## O que NÃO está no escopo deste design

- GEO / llms.txt (separado, menor impacto imediato)
- apply_safe_routines completo (dependente do plugin WP estar verificado)
- directives/ e skills/ (documentação, não bloqueia features)
- Retry logic e rate limiting no DeepSeek (melhoria de resiliência, separado)

---

## Critérios de sucesso

1. Usuário consegue gerar e aplicar schema JSON-LD em qualquer página WP com 2 cliques
2. Auditoria técnica detecta 100% dos checks listados no CLAUDE.md para indexação, estrutura e links
3. Alertas de segunda-feira mostram delta real vs. semana anterior com % de variação
