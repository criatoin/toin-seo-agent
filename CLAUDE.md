# PRD — Agente SEO + GEO da TOIN
### Versão 2.0 | Para Claude Code | Março 2026

---

## ⚠️ RESTRIÇÕES ABSOLUTAS — NUNCA VIOLAR

### Regra de ouro sobre recursos existentes
**Você só tem permissão para criar ou modificar recursos cujo nome seja exatamente `toin-seo-agent`.**
Qualquer recurso com nome diferente é intocável, sem exceção — Coolify, Supabase, GitHub, WordPress (exceto plugin próprio nos sites autorizados), ou qualquer outro serviço.
Antes de qualquer operação de escrita, criação ou deleção: verifique o nome do recurso alvo.
Se o nome for diferente de `toin-seo-agent`: PARE imediatamente e pergunte ao usuário.

### Regras específicas por serviço
**Coolify:** Criar novo projeto `toin-seo-agent`. Se já existir, perguntar ao usuário.
**Supabase:** Criar novo projeto `toin-seo-agent`. Só criar/alterar tabelas deste sistema.
**GitHub:** Criar novo repositório `toin-seo-agent`.
**WordPress:** Apenas instalar o plugin `toin-seo-agent` nos sites autorizados (tabela `sites`). Nunca tocar em plugins, temas ou configurações existentes.
**Google Search Console:** Acessar APENAS os domínios listados em `GSC_ALLOWED_SITES`. Rejeitar qualquer outro com erro imediato.

---

## 1. Visão Geral

Sistema de SEO técnico e estratégico para sites da TOIN e de clientes.
Combina dados reais do **Google Search Console** + análise por **DeepSeek V3.2 (OpenRouter)** para executar uma metodologia SEO profissional em 4 fases.

### Filosofia central
- **Técnico primeiro.** Problemas técnicos bloqueiam tudo. Resolver antes de qualquer conteúdo.
- **Meta e title são cirúrgicos, não rotineiros.** Só mexe com critério e espaçamento de 60-90 dias mínimos entre ajustes na mesma página.
- **Conteúdo orientado a dados.** O agente sugere pauta mensal baseada em tendências e gaps reais — nunca publica sozinho.
- **Proatividade, não chat.** O agente entrega briefings e alertas. Você não precisa perguntar nada.

### Quem usa o quê
- **Painel web (Next.js):** interface do gestor para o dia a dia — briefings, aprovações, relatórios
- **Claude Code:** exclusivamente DEV e manutenção do sistema
- **Plugin WordPress (`toin-seo-agent`):** instalado nos sites WP, funciona invisível como conector REST API

---

## 2. Ponto de entrada — leitura de tokens

Antes de qualquer coisa, leia o arquivo `tokens.txt` na raiz do projeto.
Extraia todas as variáveis e crie o `.env` automaticamente.
O `tokens.txt` pode estar em formato livre — interprete cada linha e mapeie para as variáveis da Seção 3.
Valide que todas as variáveis obrigatórias estão presentes antes de prosseguir.

---

## 3. Variáveis de Ambiente

```env
# OpenRouter / DeepSeek
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-chat-v3-2

# Google Search Console (OAuth 2.0)
GSC_CLIENT_ID=
GSC_CLIENT_SECRET=
GSC_REFRESH_TOKEN=
GSC_ALLOWED_SITES=https://toin.com.br   # Whitelist de domínios — separados por vírgula

# Google PageSpeed Insights (gratuito, sem OAuth)
PAGESPEED_API_KEY=

# Supabase (novo projeto: toin-seo-agent)
SUPABASE_ACCESS_TOKEN=
SUPABASE_ORG_ID=
SUPABASE_URL=                           # Preenchido automaticamente pelo setup
SUPABASE_SERVICE_ROLE_KEY=              # Preenchido automaticamente pelo setup
SUPABASE_ANON_KEY=                      # Preenchido automaticamente pelo setup
SUPABASE_PROJECT_ID=                    # Preenchido automaticamente pelo setup

# Coolify
COOLIFY_BASE_URL=
COOLIFY_API_KEY=

# GitHub
GITHUB_TOKEN=
GITHUB_USERNAME=

# Backend
API_SECRET_KEY=                         # Gerado automaticamente pelo setup
CRON_SECRET=                            # Gerado automaticamente pelo setup

# Frontend
NEXT_PUBLIC_API_URL=                    # Preenchido automaticamente pelo setup
```

---

## 4. O que Claude Code deve criar

### 4.1 Infraestrutura — via `execution/setup_bootstrap.py`
- Repositório GitHub `toin-seo-agent`
- Projeto Supabase `toin-seo-agent` com todas as tabelas
- Projeto Coolify `toin-seo-agent` com backend e frontend
- 5 Scheduled Tasks no Coolify
- `.env` final gerado automaticamente

### 4.2 Código completo
- Plugin WordPress PHP (`plugin/toin-seo-agent/`)
- Backend FastAPI (`backend/`)
- Frontend Next.js (`frontend/`) — painel com briefing proativo
- Scripts de execução Python (`execution/`)
- Diretivas (`directives/`)
- Skills (`skills/`)
- Dockerfiles, migrations SQL

---

## 5. Stack Técnica

| Camada | Tecnologia |
|--------|------------|
| Backend API | FastAPI (Python 3.11+) |
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Banco de dados | Supabase (novo projeto: `toin-seo-agent`) |
| Modelo de análise | DeepSeek V3.2 via OpenRouter |
| Integração SEO WP | Plugin PHP próprio (`toin-seo-agent`) |
| Crawl técnico | Python requests + BeautifulSoup + sitemap parser |
| Core Web Vitals | Google PageSpeed Insights API (gratuito) |
| Dados de busca | Google Search Console API v3 |
| Tendências | Google Trends via pytrends (gratuito) |
| Cron | Coolify Scheduled Tasks |

---

## 6. As 4 Fases do Agente (Metodologia SEO Real)

### FASE 1 — Auditoria Técnica Completa
**Quando:** uma vez no setup inicial + após deploys significativos
**Filosofia:** problemas técnicos bloqueiam qualquer ganho de conteúdo ou meta. Resolver primeiro.

O agente audita e classifica cada issue em 3 níveis:
- 🔴 **Crítico** (resolver esta semana): bloqueia indexação ou penaliza ranking
- 🟡 **Importante** (resolver este mês): limita crescimento
- 🟢 **Melhoria** (próximo trimestre): otimização incremental

**Checklist técnico completo que o agente verifica:**

*Indexação e Crawl*
- Sitemap XML válido e atualizado
- robots.txt correto (sem bloquear páginas importantes)
- Páginas no índice vs páginas excluídas (GSC Coverage)
- Soft 404s e páginas "Discovered, not indexed"
- Canonicals ausentes ou conflitantes
- Páginas duplicadas sem canonical

*Core Web Vitals (via PageSpeed API)*
- LCP (Largest Contentful Paint) — alvo: < 2.5s
- INP (Interaction to Next Paint) — alvo: < 200ms
- CLS (Cumulative Layout Shift) — alvo: < 0.1
- TTFB (Time to First Byte) — alvo: < 800ms
- Mobile vs Desktop separados

*Estrutura e Links*
- Páginas órfãs (sem nenhum link interno apontando para elas)
- Links quebrados (404 internos e externos)
- Profundidade de cliques (páginas a mais de 3 cliques da homepage)
- Redirect chains (A→B→C — deve ser A→C direto)
- Links internos para páginas importantes (distribuição de autoridade)

*On-page básico*
- H1 ausente ou múltiplos H1 por página
- Title ausente, duplicado ou > 65 caracteres
- Meta description ausente ou duplicada
- Imagens sem alt text
- Imagens não otimizadas (sem WebP, sem compressão)

*Schema e GEO*
- Schema estruturado ausente nas páginas principais
- `llms.txt` ausente na raiz do domínio
- Páginas sem estrutura de resposta direta (importantes para AI Overviews)

**O que o agente faz automaticamente (WordPress):**
- Preencher meta description vazia (uma vez, com sugestão baseada no conteúdo)
- Corrigir canonical ausente em páginas com duplicação óbvia
- Gerar e propor `llms.txt` para aprovação

**O que vai para aprovação:**
- Qualquer alteração de title, H1 ou conteúdo
- Estrutura de links internos (lista de sugestões com âncoras)
- Schema JSON-LD (proposta completa por página)

**O que vai para a lista de ações manuais do gestor:**
- Problemas de velocidade (dependem de servidor/tema)
- Imagens sem alt text (lista exportável para corrigir em lote)
- Redirect chains (depende de acesso ao servidor)

---

### FASE 2 — Meta e Title (Cirúrgico, Trimestral)
**Quando:** somente nas condições abaixo — nunca por rotina semanal

**Condições para o agente propor revisão de meta/title:**
1. Página com meta description **vazia** → preenche automaticamente (única vez)
2. Página com title **duplicado** → propõe correção
3. Página com posição média 5-15 no GSC + CTR < 2% + mínimo 200 impressões no período → propõe revisão
4. Página onde o Google está **reescrevendo o title** (detectado por discrepância GSC vs HTML) → sinal que o title atual não serve

**Regra de espaçamento:**
- Após qualquer mudança de title/meta em uma página: **mínimo 60 dias sem nova alteração**
- O sistema bloqueia proposta de revisão se a última alteração foi há menos de 60 dias
- Esse cooldown fica registrado em `pages.last_meta_changed_at`

**Formato da proposta — sempre 3 variações:**
- V1: Conservadora (refinamento mínimo do atual)
- V2: Foco em benefício + CTA
- V3: Otimizada para AI/featured snippet (linguagem de resposta direta)
- O gestor escolhe, edita ou rejeita tudo
- Se rejeitar tudo: registra "nenhuma aprovada" e não propõe nova revisão por 30 dias

---

### FASE 3 — Estratégia de Conteúdo (Mensal, Proativa)
**Quando:** todo primeiro dia útil do mês, gerado automaticamente

O agente entrega um **Briefing de Conteúdo Mensal** com:

**1. Tendências do setor (via Google Trends + GSC)**
- Queries que cresceram > 30% em volume no último mês nas categorias do site
- Tópicos emergentes no setor que o site ainda não cobre
- Sazonalidades previstas para o mês seguinte

**2. Content gaps identificados**
- Queries que trazem impressões mas nenhuma página do site responde diretamente
- Tópicos que geram cliques em concorrentes (quando dados disponíveis)
- Páginas com bounce alto + tempo de sessão baixo (conteúdo não satisfaz a intenção)

**3. Pauta sugerida do mês**
- Lista de 3-5 conteúdos prioritários com:
  - Título sugerido
  - Intenção de busca (informacional / transacional / navegacional)
  - Queries-alvo (baseadas em dados reais)
  - Tipo de conteúdo recomendado (post, landing page, FAQ, vídeo + texto)
  - Estimativa de potencial (baseada em volume de queries)

**4. Conteúdos existentes para consolidar ou remover**
- Páginas com < 10 cliques em 6 meses e conteúdo fraco → candidatas a merge ou delete
- "Canibalização de keywords" detectada (duas páginas competindo pela mesma query)

**O agente nunca publica, escreve ou altera conteúdo sozinho.**
Tudo é sugestão no painel. O gestor aprova a pauta, produz o conteúdo, e após publicação o agente cuida do técnico (schema, meta inicial, internal links).

---

### FASE 4 — Monitoramento Contínuo (Semanal, Só Alertas)
**Quando:** toda segunda-feira às 08h

O agente não age toda semana — ele **monitora e alerta** apenas quando detecta anomalias reais.

**Alertas automáticos:**
- 🔴 Página importante saiu do índice (GSC Coverage)
- 🔴 Queda de tráfego > 20% em página-chave vs semana anterior
- 🔴 Core Web Vitals regrediu para "Ruim" (após deploy)
- 🟡 Query nova aparecendo com volume crescente → oportunidade
- 🟡 Página subiu para posição 11-15 → candidata a impulso de internal links
- 🟢 Página melhorou posição significativamente → destacar no briefing como vitória

**Se não houver anomalias:** o briefing semanal diz apenas "Tudo estável — sem ações necessárias esta semana."

**O agente nunca age automaticamente no monitoramento semanal.**
Anomalias geram alertas no painel. O gestor decide se quer agir.

---

## 7. Briefing Executivo (Painel — Interface Principal)

O painel não é um chat. É um **briefing executivo proativo** entregue automaticamente.

### Dashboard — o que você vê ao abrir o painel

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRIEFING SEMANAL — TOIN | Semana 12/03
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 PERFORMANCE GSC (últimos 7 dias)
   Impressões: 4.820 (+12% vs semana anterior)
   Cliques:    187 (+3%)
   CTR médio:  3.9%
   Posição média: 18.4 (-0.8)

⚠️  ALERTAS (2)
   🔴 Página /servicos/criacao-de-sites perdeu 31% de tráfego
      Causa provável: Google atualizou title automaticamente
      → Ver detalhes | Propor correção de title

   🟡 Query "agência digital americana sp" cresceu 45% esse mês
      Site aparece em posição 23 — oportunidade de conteúdo
      → Ver sugestão de pauta

✅  AÇÕES AGUARDANDO SUA APROVAÇÃO (3)
   • Schema FAQ para /servicos — 2 dias na fila
   • Title de /portfolio — 3 variações geradas
   • Internal links para /landing-pages — lista de 5 sugestões

📋  BRIEFING DE CONTEÚDO (gerado 01/03)
   3 pautas sugeridas para março aguardando aprovação
   → Ver briefing completo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Páginas do painel

- `/` — Dashboard com briefing acima
- `/auditoria` — Resultado da auditoria técnica com checklist por severidade
- `/paginas` — Lista de todas as páginas do site com status SEO e métricas GSC
- `/paginas/[id]` — Detalhe: métricas, meta atual, 3 variações (se houver), schema, histórico
- `/conteudo` — Briefing mensal de conteúdo e pauta aprovada/pendente
- `/alertas` — Histórico de alertas e anomalias detectadas
- `/relatorios` — Relatórios mensais com evolução histórica
- `/configuracoes` — Sites gerenciados, cooldowns, limites de autonomia

---

## 8. Plugin WordPress — TOIN SEO Agent

Plugin PHP leve, sem interface de usuário. Funciona como **conector REST API invisível**.
Não substitui Yoast/Rank Math/AIOSEO/SEOPress — escreve nos campos deles via adapters.

### Endpoints expostos

```
GET  /wp-json/toin-seo/v1/status
     Health check + plugins SEO detectados

GET  /wp-json/toin-seo/v1/pages
     Lista páginas/posts com campos SEO atuais + tipo de post

GET  /wp-json/toin-seo/v1/pages/{id}
     Detalhe: conteúdo, meta, schema, canonical, headings

POST /wp-json/toin-seo/v1/pages/{id}/meta
     Atualiza title e/ou meta description
     Body: { title?, description?, seo_plugin }

POST /wp-json/toin-seo/v1/pages/{id}/schema
     Injeta ou atualiza bloco JSON-LD
     Body: { schema_json }

POST /wp-json/toin-seo/v1/pages/{id}/canonical
     Define canonical URL
     Body: { canonical_url }
```

### Adapters por plugin SEO

| Plugin | Meta Key Title | Meta Key Description |
|--------|---------------|---------------------|
| Yoast SEO | `_yoast_wpseo_title` | `_yoast_wpseo_metadesc` |
| Rank Math | `rank_math_title` | `rank_math_description` |
| AIOSEO | `_aioseo_title` | `_aioseo_description` |
| SEOPress | `_seopress_titles_title` | `_seopress_titles_desc` |
| Nenhum | `<title>` via wp_title filter | `<meta name="description">` via wp_head hook |

### Autenticação
WordPress Application Passwords (nativo WP 5.6+).
`Authorization: Basic base64(user:app_password)`

---

## 9. Schema do Banco de Dados

### `sites`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
name                  text NOT NULL
url                   text NOT NULL UNIQUE
type                  text NOT NULL               -- "wordpress" | "generic"
gsc_site_url          text
wp_user               text
wp_app_password       text                        -- Criptografada
seo_plugin            text                        -- yoast|rankmath|aioseo|seopress|none
audit_completed_at    timestamptz                 -- Data da última auditoria técnica
last_crawled_at       timestamptz
created_at            timestamptz DEFAULT now()
```

### `pages`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id               uuid REFERENCES sites(id)
url                   text NOT NULL
post_id               integer
post_type             text
title_current         text
meta_desc_current     text
h1_current            text
schema_current        jsonb
canonical_current     text
is_money_page         boolean DEFAULT false        -- Nunca autopublicado
last_meta_changed_at  timestamptz                  -- Cooldown de 60 dias
-- Métricas GSC
gsc_impressions       integer
gsc_clicks            integer
gsc_ctr               numeric
gsc_position          numeric
gsc_top_queries       jsonb
-- Flags de auditoria técnica
audit_has_h1          boolean
audit_canonical_ok    boolean
audit_schema_ok       boolean
audit_lcp_score       text                         -- good|needs_improvement|poor
audit_cls_score       text
audit_inp_score       text
-- Status
needs_meta_opt        boolean DEFAULT false
needs_schema_opt      boolean DEFAULT false
has_empty_meta        boolean DEFAULT false
last_synced_at        timestamptz
created_at            timestamptz DEFAULT now()
```

### `audit_issues`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id         uuid REFERENCES sites(id)
page_id         uuid REFERENCES pages(id) NULL  -- NULL = issue de site inteiro
severity        text NOT NULL   -- "critical" | "important" | "improvement"
category        text NOT NULL   -- "indexation"|"speed"|"structure"|"links"|"schema"|"onpage"
issue_type      text NOT NULL   -- ex: "missing_h1" | "lcp_poor" | "orphan_page"
description     text NOT NULL
recommendation  text
auto_fixable    boolean DEFAULT false
status          text DEFAULT 'open'   -- open | fixed | dismissed | in_progress
fixed_at        timestamptz
created_at      timestamptz DEFAULT now()
```

### `meta_proposals`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
page_id             uuid REFERENCES pages(id)
trigger_reason      text     -- "empty_meta"|"low_ctr"|"duplicate_title"|"google_rewriting"
-- Variação 1: conservadora
v1_title            text
v1_description      text
v1_rationale        text
-- Variação 2: benefício + CTA
v2_title            text
v2_description      text
v2_rationale        text
-- Variação 3: AI/featured snippet
v3_title            text
v3_description      text
v3_rationale        text
-- Decisão
chosen_variant      text        -- "v1"|"v2"|"v3"|"custom"|"none"
custom_title        text
custom_description  text
status              text DEFAULT 'pending'
applied_at          timestamptz
cooldown_until      timestamptz  -- last_meta_changed_at + 60 dias
created_at          timestamptz DEFAULT now()
```

### `schema_proposals`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
page_id       uuid REFERENCES pages(id)
schema_type   text
schema_json   jsonb
rationale     text
status        text DEFAULT 'pending'
applied_at    timestamptz
created_at    timestamptz DEFAULT now()
```

### `content_briefings`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id           uuid REFERENCES sites(id)
month             date NOT NULL               -- Primeiro dia do mês
trends_data       jsonb                       -- Tendências identificadas
content_gaps      jsonb                       -- Gaps identificados
suggested_pautas  jsonb                       -- Array de sugestões de conteúdo
pages_to_merge    jsonb                       -- Páginas fracas para consolidar
status            text DEFAULT 'pending'      -- pending | approved | dismissed
approved_at       timestamptz
created_at        timestamptz DEFAULT now()
```

### `alerts`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id         uuid REFERENCES sites(id)
page_id         uuid REFERENCES pages(id) NULL
severity        text NOT NULL   -- "critical"|"warning"|"opportunity"
alert_type      text NOT NULL   -- "traffic_drop"|"deindexed"|"cwv_regression"|"opportunity"
title           text NOT NULL
description     text
data            jsonb
read_at         timestamptz
created_at      timestamptz DEFAULT now()
```

### `reports`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id               uuid REFERENCES sites(id)
period_start          date NOT NULL
period_end            date NOT NULL
markdown              text
kpi_impressions       integer
kpi_clicks            integer
kpi_ctr               numeric
kpi_avg_position      numeric
kpi_issues_fixed      integer
kpi_schema_coverage   numeric
kpi_pages_optimized   integer
created_at            timestamptz DEFAULT now()
```

### `settings`
```sql
id                              uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id                         uuid REFERENCES sites(id) UNIQUE
meta_cooldown_days              integer DEFAULT 60
auto_fill_empty_meta            boolean DEFAULT true
auto_fix_canonical              boolean DEFAULT true
auto_apply_schema               boolean DEFAULT false
min_impressions_for_meta_opt    integer DEFAULT 200
min_ctr_threshold               numeric DEFAULT 0.02  -- 2%
updated_at                      timestamptz DEFAULT now()
```

---

## 10. API Endpoints (FastAPI)

### Sites
```
GET    /api/sites
POST   /api/sites
GET    /api/sites/{id}
PATCH  /api/sites/{id}
DELETE /api/sites/{id}
```

### Auditoria
```
GET    /api/sites/{id}/audit                  Resultado da auditoria com issues por severidade
GET    /api/sites/{id}/audit/issues           Lista filtrada de issues
PATCH  /api/sites/{id}/audit/issues/{issue_id} Body: {status: "fixed"|"dismissed"}
```

### Pages e Proposals
```
GET    /api/sites/{id}/pages
GET    /api/sites/{id}/pages/{page_id}
GET    /api/sites/{id}/pages/{page_id}/proposal
POST   /api/sites/{id}/pages/{page_id}/proposal/apply  Body: {variant, custom_title?, custom_description?}
GET    /api/sites/{id}/pages/{page_id}/schema
POST   /api/sites/{id}/pages/{page_id}/schema/apply
```

### Dashboard
```
GET    /api/dashboard/{site_id}               Briefing semanal completo
GET    /api/alerts?site_id=&read=false
PATCH  /api/alerts/{id}/read
```

### Conteúdo
```
GET    /api/briefings?site_id=
GET    /api/briefings/{id}
PATCH  /api/briefings/{id}                   Body: {status: "approved"|"dismissed"}
```

### Jobs (autenticados por X-Cron-Secret)
```
POST   /api/jobs/technical-audit             Body: {site_id}  — Auditoria técnica completa
POST   /api/jobs/sync-gsc                    Body: {site_id}  — Sync dados GSC
POST   /api/jobs/generate-proposals          Body: {site_id}  — Gera meta/schema proposals
POST   /api/jobs/weekly-monitor              Body: {site_id}  — Monitor semanal + alertas
POST   /api/jobs/monthly-briefing            Body: {site_id}  — Briefing mensal de conteúdo
POST   /api/jobs/apply-safe-routines         Body: {site_id}  — Executa ações safe
POST   /api/jobs/apply-approved              Body: {site_id}  — Executa ações aprovadas
POST   /api/jobs/generate-report             Body: {site_id}  — Relatório mensal
```

### Settings & Reports
```
GET    /api/settings/{site_id}
PATCH  /api/settings/{site_id}
GET    /api/reports?site_id=&limit=12
GET    /api/reports/{id}
```

---

## 11. Regras de Autonomia (Resumo Completo)

### NUNCA sem aprovação (hardcoded):
- Alterar **title** de qualquer página
- Alterar **H1** ou qualquer texto do corpo da página
- Alterar **meta description** de money pages (`is_money_page = true`)
- **Publicar** qualquer conteúdo novo
- Alterar **slugs/URLs**
- Modificar configurações globais de plugins SEO
- Propor revisão de meta em página alterada há < 60 dias
- Qualquer ação em sites genéricos (apenas diffs e patches)

### Pode fazer sem aprovação (safe_routine):
- Preencher meta description **vazia** em páginas com `auto_fill_empty_meta = true`
- Corrigir canonical **ausente** em páginas com duplicação óbvia (`auto_fix_canonical = true`)
- Gerar alertas e briefings (sem aplicar nada)
- Sincronizar métricas de GSC (leitura)
- Crawl de auditoria técnica (leitura)

### Validações obrigatórias antes de qualquer escrita via plugin WP:
1. `site.url` está em `GSC_ALLOWED_SITES`
2. `site.type == "wordpress"`
3. Ação não está em "nunca sem aprovação"
4. Cooldown de meta respeitado (`last_meta_changed_at + cooldown_days`)
5. Gravar em `execution_logs` antes e depois

---

## 12. Coolify Scheduled Tasks

| Task | Cron (UTC) | BRT | Job chamado |
|------|-----------|-----|------------|
| Monitor semanal + alertas | `0 11 * * 1` | Segunda 08h | `weekly-monitor` |
| Sync GSC | `0 12 * * 1` | Segunda 09h | `sync-gsc` |
| Gerar proposals (trimestral) | `0 13 1 */3 *` | 10h no dia 1 a cada 3 meses | `generate-proposals` |
| Briefing mensal de conteúdo | `0 11 1 * *` | 08h todo dia 1 | `monthly-briefing` |
| Aplicar aprovados | `0 */2 * * *` | A cada 2h | `apply-approved` |
| Relatório mensal | `0 11 1 * *` | 08h todo dia 1 | `generate-report` |

---

## 13. MCPs para Claude Code (apenas desenvolvimento)

Configurados em `.mcp.json` na raiz do projeto.

### Obrigatórios

**MCP GSC (`mcp-gsc`):**
```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "@aminforou/mcp-gsc"],
      "env": {
        "GSC_CLIENT_ID": "${GSC_CLIENT_ID}",
        "GSC_CLIENT_SECRET": "${GSC_CLIENT_SECRET}",
        "GSC_REFRESH_TOKEN": "${GSC_REFRESH_TOKEN}"
      }
    }
  }
}
```
Instalação: `npm install -g @aminforou/mcp-gsc`

**MCP Supabase (oficial):**
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest",
               "--access-token", "${SUPABASE_ACCESS_TOKEN}",
               "--project-id", "${SUPABASE_PROJECT_ID}"]
    }
  }
}
```
⚠️ `--project-id` obrigatório.

### Opcionais (adicionar quando tiver budget)
- **SE Ranking MCP** — keywords + AI search insights
- **Ahrefs MCP** — autoridade tópica, backlinks
- **Semrush MCP** — clusters de conteúdo, concorrentes

---

## 14. Skills

### `toin.seo.technical-audit`
Executa auditoria técnica completa do site.
Entradas: `site_id`, tipo (wordpress/generic), credenciais GSC.
Saída: lista de issues classificados por severidade (critical/important/improvement), com `auto_fixable = true/false` para cada um.

### `toin.seo.gsc-analyzer`
Analisa dados do Search Console e prioriza oportunidades.
Produz: top páginas por potencial de CTR, queries sem página dedicada, páginas com tráfego em queda, oportunidades de content gap.

### `toin.seo.meta-optimizer`
Acionado apenas quando as condições da Fase 2 são atendidas.
Gera 3 variações com estilos distintos. NUNCA gera apenas 1 variação.
Regra inviolável: verifica `last_meta_changed_at + cooldown_days` antes de qualquer proposta.

### `toin.seo.schema-optimizer`
Detecta tipo de schema adequado por tipo de página e gera JSON-LD válido e completo.
Tipos: Organization, LocalBusiness, Article, FAQPage, HowTo, Service, Product, CreativeWork.

### `toin.seo.weekly-monitor`
Roda toda segunda. Compara métricas atuais vs semana anterior.
Gera alertas somente para anomalias reais (queda > 20%, deindexação, CWV regrediu).
Se tudo estiver estável: gera alerta "Tudo estável — sem ações necessárias".

### `toin.seo.content-advisor`
Roda no dia 1 de cada mês.
Usa pytrends para tendências + GSC para gaps + análise de páginas fracas.
Gera briefing de conteúdo com 3-5 pautas priorizadas. NUNCA escreve ou publica conteúdo.

### `toin.seo.geo-optimizer`
Avalia e otimiza para AI search (AI Overviews, Perplexity, ChatGPT Search).
Checklist: schema completo, `llms.txt`, estrutura de resposta direta, cobertura de entidades.
Propõe `llms.txt` para aprovação do gestor.

---

## 15. Estrutura de Diretórios

```
toin-seo-agent/
├── AGENTS.md
├── CLAUDE.md               # Cópia idêntica de AGENTS.md
├── GEMINI.md               # Cópia idêntica de AGENTS.md
├── tokens.txt              # Fornecido pelo usuário (no .gitignore)
├── .env                    # Gerado pelo setup (no .gitignore)
├── .env.example
├── .mcp.json               # MCPs para Claude Code
├── .gitignore
│
├── plugin/
│   └── toin-seo-agent/
│       ├── toin-seo-agent.php
│       ├── includes/
│       │   ├── class-rest-api.php
│       │   ├── class-seo-plugins.php   # Adapters Yoast/RankMath/AIOSEO/SEOPress
│       │   ├── class-schema.php
│       │   └── class-auth.php
│       └── readme.txt
│
├── directives/
│   ├── setup_bootstrap.md
│   ├── technical_audit.md
│   ├── gsc_analyzer.md
│   ├── meta_optimizer.md
│   ├── schema_optimizer.md
│   ├── weekly_monitor.md
│   ├── monthly_briefing.md
│   ├── geo_optimizer.md
│   └── apply_changes_wp.md
│
├── execution/
│   ├── setup_bootstrap.py
│   ├── technical_audit.py
│   ├── site_crawler.py
│   ├── gsc_client.py
│   ├── pagespeed_client.py
│   ├── meta_optimizer.py
│   ├── schema_optimizer.py
│   ├── weekly_monitor.py
│   ├── monthly_briefing.py
│   ├── geo_optimizer.py
│   ├── apply_changes_wp.py
│   ├── generate_report.py
│   ├── trends_client.py          # Google Trends via pytrends
│   ├── deepseek_client.py
│   └── supabase_client.py
│
├── skills/
│   ├── toin.seo.technical-audit.md
│   ├── toin.seo.gsc-analyzer.md
│   ├── toin.seo.meta-optimizer.md
│   ├── toin.seo.schema-optimizer.md
│   ├── toin.seo.weekly-monitor.md
│   ├── toin.seo.content-advisor.md
│   └── toin.seo.geo-optimizer.md
│
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── sites.py
│   │   ├── audit.py
│   │   ├── pages.py
│   │   ├── proposals.py
│   │   ├── alerts.py
│   │   ├── briefings.py
│   │   ├── jobs.py
│   │   ├── reports.py
│   │   └── settings.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                         # Dashboard / Briefing executivo
│   │   ├── auditoria/page.tsx               # Checklist técnico por severidade
│   │   ├── paginas/page.tsx                 # Lista de páginas + status
│   │   ├── paginas/[id]/page.tsx            # Detalhe: meta, 3 variações, schema
│   │   ├── conteudo/page.tsx                # Briefing mensal + pauta
│   │   ├── alertas/page.tsx                 # Histórico de alertas
│   │   ├── relatorios/page.tsx              # Relatórios mensais
│   │   └── configuracoes/page.tsx
│   ├── components/
│   │   ├── WeeklyBriefing.tsx               # Briefing executivo do dashboard
│   │   ├── AuditChecklist.tsx               # Issues por severidade
│   │   ├── MetaVariationCard.tsx            # 3 variações lado a lado
│   │   ├── SchemaProposalCard.tsx
│   │   ├── AlertBadge.tsx
│   │   ├── GscMetrics.tsx
│   │   └── ContentBriefingCard.tsx
│   ├── package.json
│   ├── tailwind.config.ts
│   └── Dockerfile
│
├── migrations/
│   ├── 001_create_sites.sql
│   ├── 002_create_pages.sql
│   ├── 003_create_audit_issues.sql
│   ├── 004_create_meta_proposals.sql
│   ├── 005_create_schema_proposals.sql
│   ├── 006_create_content_briefings.sql
│   ├── 007_create_alerts.sql
│   ├── 008_create_reports.sql
│   └── 009_create_settings.sql
│
├── docker-compose.yml
└── .tmp/
```

---

## 16. Self-Annealing

Quando um script falhar:
1. Ler stack trace completo
2. Corrigir o script
3. Testar
4. Atualizar a diretiva em `directives/`
5. Registrar em `execution_logs`

Nunca re-executar scripts com escrita em sites ou custos pagos sem perguntar ao usuário.

---

## 17. Mensagem inicial para o Claude Code

```
Leia o AGENTS.md e o arquivo tokens.txt.
Crie o .env a partir do tokens.txt.
Em seguida, construa o projeto completo conforme as instruções do AGENTS.md.
Comece pelo setup_bootstrap.py e execute-o para criar toda a infraestrutura.
Após o setup, instale o plugin toin-seo-agent no primeiro site WordPress configurado
e execute a auditoria técnica inicial (technical-audit).
```
