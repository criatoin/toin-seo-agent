# TOIN SEO Agent — Design Spec
**Data:** 2026-03-13
**Status:** Aprovado

---

## 1. Visão Geral

Sistema de SEO técnico e estratégico para sites da TOIN e clientes. Combina dados reais do Google Search Console + análise por DeepSeek V3.2 (OpenRouter) para executar uma metodologia SEO profissional em 4 fases. O painel é proativo — entrega briefings automáticos, não é um chat.

---

## 2. Arquitetura

```
serv2.criatoin.com.br (Coolify — projeto: toin-seo-agent)
  ├── Frontend Next.js 14 (App Router + Tailwind + Supabase Auth)
  └── Backend FastAPI Python 3.11

Supabase (projeto: toin-seo-agent, org: tdvhkxuyjupkkeyyeuse)
  ├── Postgres — 10 tabelas (inclui execution_logs)
  └── Auth — email/senha para acesso ao painel

OpenRouter → DeepSeek V3.2 — análises e geração de propostas

Google APIs
  ├── Search Console API v3 — impressões, cliques, CTR, posição
  └── PageSpeed Insights API — Core Web Vitals (LCP, INP, CLS)

Sites WordPress
  └── Plugin toin-seo-agent — conector REST API invisível
      └── Adapters: Yoast | Rank Math | AIOSEO | SEOPress | nenhum
```

**Fluxo de dados:**
1. Coolify dispara jobs agendados → FastAPI `/api/jobs/*`
2. Jobs executam scripts Python (crawl, GSC, PageSpeed, DeepSeek)
3. Resultados salvos no Supabase
4. Frontend lê via FastAPI e exibe no painel
5. Gestor aprova ações → FastAPI aplica via plugin WP

---

## 3. Autenticação

| Camada | Direção | Método |
|--------|---------|--------|
| Painel (gestor) | Browser → FastAPI | Supabase Auth email/senha → Bearer JWT |
| FastAPI (rotas protegidas) | — | Bearer JWT validado via Supabase |
| Jobs/cron | Coolify → FastAPI | Header `X-Cron-Secret` |
| Backend → Plugin WP | FastAPI → WP REST API | `Authorization: Basic base64(user:app_password)` (WP Application Password) |

**Importante:** toda comunicação entre backend e plugin WP é **backend → plugin** (o plugin nunca inicia chamadas ao backend). O Application Password obtido no fluxo OAuth é a única credencial necessária para essa direção.

---

## 4. Conexão com Sites WordPress (Fluxo OAuth Nativo WP 5.6+)

**Pré-requisito:** plugin `toin-seo-agent` instalado e ativo no WP antes de iniciar.

**Fluxo:**
1. Gestor clica **"+ Adicionar Site"** na tela `/sites`
2. Digita a URL do site WordPress e clica "Conectar"
3. Frontend chama `POST /api/sites/connect/init` (Bearer JWT) → backend gera URL:
   ```
   https://{site_url}/wp-admin/authorize-application.php
     ?app_name=TOIN+SEO+Agent
     &success_url=https://{PANEL_URL}/sites/connect/callback
   ```
4. Frontend redireciona o gestor para essa URL
5. Gestor aprova no WP admin → WP redireciona para:
   ```
   https://{PANEL_URL}/sites/connect/callback
     ?site_url={url}&user_login={user}&password={app_password}
   ```
6. Frontend captura os parâmetros e envia `POST /api/sites/connect/finalize` (Bearer JWT):
   ```json
   { "site_url": "...", "wp_user": "...", "wp_app_password": "..." }
   ```
7. Backend chama `GET /wp-json/toin-seo/v1/status` com Basic Auth para verificar conexão e detectar plugin SEO
8. Backend salva site na tabela `sites` com credenciais criptografadas
9. Site aparece na lista `/sites` como ativo

**Tratamento de erro:** se gestor negar a autorização no WP, WP redireciona para o `success_url` sem os parâmetros de senha. Frontend detecta ausência e exibe mensagem "Autorização negada — tente novamente."

**Novos endpoints FastAPI (autenticados por Bearer JWT):**
```
POST /api/sites/connect/init      Body: {site_url}
POST /api/sites/connect/finalize  Body: {site_url, wp_user, wp_app_password}
```

---

## 5. As 4 Fases do Agente

### Fase 1 — Auditoria Técnica
Roda no setup inicial e após deploys. Classifica issues em:
- 🔴 Crítico — bloqueia indexação
- 🟡 Importante — limita crescimento
- 🟢 Melhoria — otimização incremental

Cobre: indexação/crawl, Core Web Vitals, estrutura/links, on-page, schema/GEO.

**Automático (safe):** preencher meta vazia, corrigir canonical ausente.
**Aprovação obrigatória:** title, H1, schema, internal links.
**Lista manual:** velocidade, imagens sem alt, redirect chains.

### Fase 2 — Meta e Title (Cirúrgico)
Propõe revisão apenas quando:
1. Meta description vazia → preenche automaticamente (uma vez)
2. Title duplicado → propõe correção
3. Posição 5-15 + CTR < 2% + 200+ impressões → propõe revisão
4. Google reescrevendo o title → sinal de problema

Sempre 3 variações (conservadora / benefício+CTA / AI-snippet).
Cooldown mínimo de 60 dias entre alterações na mesma página.

### Fase 3 — Estratégia de Conteúdo (Mensal)
Todo dia 1 do mês: briefing com tendências, content gaps, 3-5 pautas priorizadas, páginas fracas para consolidar. Nunca publica sozinho.

### Fase 4 — Monitoramento Semanal
Toda segunda às 08h BRT. Gera alertas apenas para anomalias reais. Se tudo estável: "Sem ações necessárias esta semana."

---

## 6. Regras de Autonomia

**Nunca sem aprovação:**
- Alterar title, H1 ou conteúdo
- Alterar meta de money pages (`is_money_page = true`)
- Publicar qualquer conteúdo
- Alterar slugs/URLs
- Propor revisão de meta em página alterada há < 60 dias

**Pode sem aprovação (safe routines):**
- Preencher meta vazia (`auto_fill_empty_meta = true`)
- Corrigir canonical ausente (`auto_fix_canonical = true`)
- Gerar alertas e briefings
- Sincronizar métricas GSC (leitura)
- Crawl de auditoria (leitura)

**Validações obrigatórias antes de qualquer escrita WP:**
1. `site.url` está em `GSC_ALLOWED_SITES` (whitelist de domínios autorizados)
2. Site existe e está ativo na tabela `sites` (`active = true`)
3. `site.type == "wordpress"`
4. Ação não está na lista "nunca sem aprovação"
5. Cooldown de meta respeitado (`last_meta_changed_at + cooldown_days`)
6. Gravar em `execution_logs` antes e depois da operação

**Separação de responsabilidades:**
- `GSC_ALLOWED_SITES` = whitelist de segurança para domínios que o agente pode gerenciar (tanto chamadas GSC quanto escritas WP). Novos sites clientes devem ser adicionados a esta variável além de serem cadastrados na tabela `sites`.
- `active = true` na tabela `sites` = gate operacional (site conectado e não desativado manualmente).

---

## 7. Plugin WordPress — Endpoints

O plugin é chamado **pelo backend** (nunca inicia chamadas). Autenticação: `Authorization: Basic base64(user:app_password)`.

```
GET  /wp-json/toin-seo/v1/status
     Retorna: {site_url, site_name, wp_version, seo_plugin_detected, plugin_active: true}

GET  /wp-json/toin-seo/v1/pages
     Retorna: lista de páginas/posts com campos SEO atuais

GET  /wp-json/toin-seo/v1/pages/{id}
     Retorna: {url, title, meta_desc, h1, schema, canonical, headings, content_excerpt}

POST /wp-json/toin-seo/v1/pages/{id}/meta
     Body: { title?, description?, seo_plugin }
     Retorna: {success, updated_fields}

POST /wp-json/toin-seo/v1/pages/{id}/schema
     Body: { schema_json }
     Retorna: {success}

POST /wp-json/toin-seo/v1/pages/{id}/canonical
     Body: { canonical_url }
     Retorna: {success}
```

Adapters por plugin SEO: Yoast, Rank Math, AIOSEO, SEOPress, nenhum (fallback wp_head).

---

## 8. Banco de Dados (Supabase — 10 tabelas)

Tabelas: `sites`, `pages`, `audit_issues`, `meta_proposals`, `schema_proposals`, `content_briefings`, `alerts`, `reports`, `settings`, `execution_logs`.

Schemas de `pages` a `settings`: conforme AGENTS.md Seção 9.

### `sites` (atualizado — coluna `active` adicionada)
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
name                  text NOT NULL
url                   text NOT NULL UNIQUE
type                  text NOT NULL               -- "wordpress" | "generic"
active                boolean DEFAULT true        -- false = site desconectado ou desativado manualmente
gsc_site_url          text
wp_user               text
wp_app_password       text                        -- Criptografada
seo_plugin            text                        -- yoast|rankmath|aioseo|seopress|none
audit_completed_at    timestamptz
last_crawled_at       timestamptz
created_at            timestamptz DEFAULT now()
```

### `execution_logs` (adicional)
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id       uuid REFERENCES sites(id)
page_id       uuid REFERENCES pages(id) NULL
job_name      text NOT NULL          -- ex: "apply-approved", "apply-safe-routines"
action        text NOT NULL          -- ex: "write_meta", "write_schema", "write_canonical"
status        text NOT NULL          -- "started" | "success" | "error"
payload       jsonb                  -- dados enviados ao plugin
response      jsonb                  -- resposta recebida
error_message text
created_at    timestamptz DEFAULT now()
```

---

## 9. Jobs e Cron (Coolify Scheduled Tasks — 7 jobs)

| Job | Cron (UTC) | BRT | Descrição |
|-----|-----------|-----|-----------|
| weekly-monitor | `0 11 * * 1` | Seg 08h | Monitor semanal + alertas |
| sync-gsc | `0 12 * * 1` | Seg 09h | Sync dados GSC |
| apply-safe-routines | `0 14 * * 1` | Seg 11h | Executa ações safe (meta vazia, canonical) |
| generate-proposals | `0 13 1 */3 *` | Dia 1 trim. 10h | Gera meta/schema proposals |
| monthly-briefing | `0 11 1 * *` | Dia 1 08h | Briefing mensal de conteúdo |
| apply-approved | `0 */2 * * *` | A cada 2h | Executa ações aprovadas pelo gestor |
| generate-report | `0 13 1 * *` | Dia 1 10h | Relatório mensal (após briefing) |

**Nota sobre `generate-report`:** agendado 2h após `monthly-briefing` para garantir que o briefing do mês esteja gerado antes do relatório consolidar os dados.

---

## 10. API FastAPI — Endpoints Adicionais (além do AGENTS.md)

```
# Conexão WP (autenticados por Bearer JWT)
POST /api/sites/connect/init       Body: {site_url}
POST /api/sites/connect/finalize   Body: {site_url, wp_user, wp_app_password}

# Jobs — aceitam Bearer JWT (disparado pelo painel) OU X-Cron-Secret (disparado pelo Coolify)
POST /api/jobs/technical-audit     Body: {site_id}
```

O endpoint `/api/jobs/technical-audit` aceita os dois métodos de autenticação para suportar o botão "Rodar nova auditoria" no painel (Bearer JWT) e futuras automações via cron (X-Cron-Secret).

---

## 11. Frontend — Telas e Ações

### `/` Dashboard
- KPIs GSC (7 dias): impressões, cliques, CTR, posição média com variação vs semana anterior
- Alertas ativos com link direto para ação
- Fila de aprovações pendentes (schema, title, links)
- Status do briefing mensal

### `/auditoria`
- Checklist por severidade (🔴🟡🟢)
- Marcar issue como resolvido ou ignorar
- Ver recomendação de correção por issue
- Botão "Rodar nova auditoria" → chama `POST /api/jobs/technical-audit` (Bearer JWT)

### `/paginas`
- Tabela de todas as páginas com posição, CTR, impressões, status SEO
- Filtros por status, tipo, oportunidade
- Acesso rápido à ação disponível por página

### `/paginas/[id]`
- Métricas GSC da página (90 dias)
- Meta atual (title + description)
- 3 variações propostas lado a lado com rationale (quando disponível)
- Schema: status atual + proposta JSON-LD para aprovação
- Histórico de alterações com datas

### `/conteudo`
- Pauta mensal com análise de tendências e gaps que originaram cada sugestão
- Aprovar/rejeitar por item
- Marcar páginas fracas para consolidar ou deletar

### `/sites`
- Lista de sites conectados: URL, plugin SEO detectado, status da conexão
- Botão "+ Adicionar Site" → inicia fluxo OAuth WP (Seção 4)
- Ações por site: desconectar, re-autenticar, ver última sincronização

### `/alertas`
- Histórico completo com filtros por severidade, tipo, data
- Marcar como lido individualmente ou em lote

### `/relatorios`
- Relatório mensal renderizado em markdown
- KPIs históricos em gráfico de linha (impressões, cliques, posição média)

### `/configuracoes`
- Cooldown de meta por site (padrão: 60 dias)
- Toggles de ações automáticas: `auto_fill_empty_meta`, `auto_fix_canonical`
- Limites: `min_impressions_for_meta_opt`, `min_ctr_threshold`

---

## 12. Conexão Google Search Console (OAuth via Painel)

Ao invés de configurar tokens manualmente no `.env`, o gestor conecta o GSC diretamente pelo painel com um botão.

**Setup único (manual, ~10 min no Google Cloud Console — feito uma vez):**
1. Criar projeto no Google Cloud Console
2. Ativar Search Console API
3. Criar credenciais OAuth 2.0 → copiar `GSC_CLIENT_ID` e `GSC_CLIENT_SECRET` para o `.env`
4. Adicionar `https://{PANEL_URL}/api/gsc/callback` como redirect URI autorizado

**Fluxo do botão (tela `/configuracoes`):**
1. Gestor clica **"Conectar com Google"**
2. Backend gera URL de autorização Google com escopos `webmasters.readonly`
3. Gestor aprova no Google (seleciona conta e sites GSC)
4. Google redireciona para `POST /api/gsc/callback` com código de autorização
5. Backend troca código por `access_token` + `refresh_token`
6. Tokens salvos na tabela `gsc_credentials` (criptografados) — sem editar `.env`
7. Renovação automática do `access_token` via `refresh_token` (invisível)

**Novos endpoints FastAPI:**
```
GET  /api/gsc/connect    (Bearer JWT) → redireciona para Google OAuth
GET  /api/gsc/callback   (público)    → recebe code, salva tokens
GET  /api/gsc/status     (Bearer JWT) → {connected: bool, account: email, sites: [...]}
DELETE /api/gsc/disconnect (Bearer JWT) → remove tokens
```

**Nova tabela `gsc_credentials`:**
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
site_id        uuid REFERENCES sites(id) NULL  -- NULL = credencial global da conta
google_email   text
access_token   text   -- criptografado
refresh_token  text   -- criptografado
token_expiry   timestamptz
scopes         text[]
created_at     timestamptz DEFAULT now()
updated_at     timestamptz DEFAULT now()
```

**Variáveis de ambiente necessárias (apenas 2 — configuradas uma vez):**
```env
GSC_CLIENT_ID=      # Google Cloud Console
GSC_CLIENT_SECRET=  # Google Cloud Console
```

`GSC_REFRESH_TOKEN` deixa de existir no `.env` — passa a ser gerenciado pelo banco.

---

## 13. Credenciais — Status Inicial

| Variável | Status |
|----------|--------|
| OPENROUTER_API_KEY | ✅ disponível |
| COOLIFY_BASE_URL + API_KEY | ✅ disponível |
| SUPABASE_ACCESS_TOKEN | ✅ disponível |
| SUPABASE_ORG_ID | ✅ `tdvhkxuyjupkkeyyeuse` |
| GSC_CLIENT_ID + GSC_CLIENT_SECRET | ❌ pendente (Google Cloud Console) |
| GSC_REFRESH_TOKEN | removido — gerenciado pelo banco via OAuth |
| PAGESPEED_API_KEY | ❌ pendente (funciona sem, rate limit 25k/dia) |
| GITHUB_TOKEN + USERNAME | ❌ pendente |
| WP credentials | via fluxo OAuth por site |

**Funciona sem GSC:** auditoria técnica (crawl + PageSpeed), plugin WP, backend completo, frontend completo, schema proposals, safe routines.

**Bloqueado sem GSC:** sync-gsc, meta proposals por CTR/posição, weekly-monitor, monthly-briefing, relatórios com KPIs reais.

---

## 14. Estrutura de Diretórios

Conforme AGENTS.md Seção 15. Adições deste design:

```
backend/routers/sites.py
  └── inclui /connect/init e /connect/finalize

frontend/app/sites/
  └── page.tsx  (lista de sites + botão adicionar)
frontend/app/sites/connect/
  └── callback/page.tsx  (captura redirect WP OAuth)

plugin/toin-seo-agent/includes/
  └── class-register.php  ← removido (plugin não inicia chamadas ao backend)

migrations/
  ├── 001_create_sites.sql           ← inclui coluna active boolean DEFAULT true
  ├── 010_create_execution_logs.sql
  └── 011_create_gsc_credentials.sql

backend/routers/gsc.py             ← connect, callback, status, disconnect
```

---

## 15. Self-Annealing

Em caso de falha em script:
1. Ler stack trace completo
2. Corrigir o script
3. Testar
4. Atualizar diretiva correspondente em `directives/`
5. Registrar em `execution_logs`

Nunca re-executar scripts com escrita em sites ou custos pagos sem perguntar ao usuário.
