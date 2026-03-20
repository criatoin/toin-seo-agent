# TOIN SEO Agent — Claude Code Skill Design

**Data:** 2026-03-20

---

## Visão Geral

Transformar a metodologia SEO do projeto `toin-seo-agent` em uma **skill do Claude Code** (`/toin-seo`) que roda inteiramente no terminal, sem infraestrutura de servidor. O agente analisa sites completamente, apresenta diagnóstico em blocos no chat, e executa as correções aprovadas diretamente no WordPress via REST API.

**Filosofia central:**
- **Analisar tudo primeiro** → apresentar diagnóstico completo → usuário decide → agente executa
- Nunca agir sem diagnóstico completo
- Nunca agir sem aprovação explícita do usuário

---

## Arquitetura

### Skill principal
- Arquivo: `~/.claude/skills/toin-seo/SKILL.md`
- Trigger: `/toin-seo` no Claude Code
- Scripts novos (standalone): `~/.claude/skills/toin-seo/scripts/`

### Estado persistente
```
~/.toin-seo/
  sites.json              # Sites cadastrados com credenciais (nunca commitado)
  {site-slug}/
    last_audit.json       # Resultado da última auditoria completa
    history.json          # Ações aplicadas + timestamps (cooldowns)
    proposals/
      {page-slug}.json    # Proposals pendentes por página
```

### Schema de `history.json`
```json
{
  "pages": {
    "https://criatoin.com.br/servicos": {
      "last_meta_changed_at": "2026-03-20T10:00:00Z",
      "last_title_changed_at": "2026-01-10T08:00:00Z",
      "actions": [
        {"type": "meta_description", "applied_at": "2026-03-20T10:00:00Z", "value": "..."}
      ]
    }
  }
}
```

### Scripts — reescritos standalone (sem Supabase)

Os scripts do projeto original dependem de Supabase. **A skill usará scripts novos**, standalone, que leem/escrevem em `~/.toin-seo/`. O projeto original fica como **referência de lógica** (não é executado).

Scripts a criar em `~/.claude/skills/toin-seo/scripts/`:

| Script | Baseado em | Diferença |
|--------|-----------|-----------|
| `crawler.py` | `site_crawler.py` | Sem Supabase — retorna dict em memória |
| `gsc.py` | `gsc_client.py` | Lê credenciais de `sites.json`, sem Supabase |
| `pagespeed.py` | `pagespeed_client.py` | Lê API key de `sites.json`, retorna dict |
| `auditor.py` | `technical_audit.py` (lógica) | Salva resultado em `last_audit.json` |
| `wp_writer.py` | `apply_changes_wp.py` | Sem Supabase, sem DeepSeek — só escrita REST |
| `glossary.py` | *(novo)* | Cruza WP pages com dados GSC para análise de glossário |

**Dependências Python necessárias:**
- `requests`, `beautifulsoup4`, `google-auth`, `google-auth-httplib2`, `google-api-python-client`
- **Não usa:** supabase, deepseek, openrouter, fastapi

**Variáveis de ambiente da skill** (lidas de `~/.toin-seo/sites.json`, não de `.env`):
- `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` (globais, compartilhados entre sites)
- `PAGESPEED_API_KEY` (global)
- Por site: `wp_url`, `wp_user`, `wp_app_password`, `seo_plugin`

**Credenciais sensíveis:** `sites.json` deve ter permissões `600` (só o dono lê). Sem criptografia adicional em v1, mas a skill instrui o usuário a configurar as permissões no setup.

---

## Fluxo de uma Sessão

### 1. Inicialização
```
/toin-seo
```
- Se `~/.toin-seo/sites.json` não existe → setup guiado (ver Seção: Configuração)
- Se há um site → usa automaticamente
- Se há múltiplos → lista e pergunta qual analisar

### 2. Análise Completa
O agente executa sequencialmente (scripts síncronos):
1. Crawl do sitemap + páginas via WP REST API (`crawler.py`) — limite de 500 páginas para performance
2. Dados GSC dos últimos 90 dias (`gsc.py`)
3. Core Web Vitals via PageSpeed API (`pagespeed.py`) — homepage + até 5 páginas principais
4. Para TOIN: análise do glossário (`glossary.py`) — cruza lista de páginas WP com dados GSC

**Timeout por etapa:** 10 minutos máximo. Se exceder, reporta o que coletou até ali e continua.

### 3. Diagnóstico em 4 Blocos
Apresentado sequencialmente no chat. Cada bloco termina com lista de ações propostas e pergunta de aprovação.

### 4. Execução
Para cada ação aprovada: executa via WP REST API (`wp_writer.py`), confirma no chat, salva em `history.json`.

---

## Blocos de Diagnóstico

### Bloco 1 — Saúde Técnica (críticos primeiro)
**Severidade:** 🔴 Crítico | 🟡 Importante | 🟢 Melhoria

Verifica:
- Indexação: sitemap válido, robots.txt, páginas excluídas do índice
- Canonicals ausentes ou conflitantes
- Core Web Vitals: LCP (< 2.5s), INP (< 200ms), CLS (< 0.1) — mobile e desktop
- H1 ausente ou múltiplos H1 por página
- Meta description vazia ou duplicada
- Title ausente, duplicado ou > 65 caracteres
- Imagens sem alt text — lista exportável em `~/.toin-seo/{slug}/images_no_alt.csv`
- Links quebrados (amostra de até 200)
- Páginas órfãs (sem links internos)
- Redirect chains

**Ações automáticas (executa com aprovação do bloco):**
- Preencher meta description vazia via WP REST API
- Corrigir canonical ausente via WP REST API

**Ações manuais (lista para o gestor, não executa):**
- Velocidade de página (depende de servidor/tema)
- Imagens sem alt text (exporta CSV para correção em lote)
- Redirect chains (depende de acesso ao servidor)

### Bloco 2 — Oportunidades GSC
Verifica (mínimo 200 impressões no período, fixo em v1):
- Páginas na posição 5-15 com CTR < 2% → candidatas a revisão de meta/title
- Queries sem página dedicada → gaps de conteúdo
- Páginas com queda de tráfego > 20% vs período anterior
- Páginas subindo para posição 11-15 → oportunidade de internal links

**Ações propostas:**
- Gerar 3 variações de meta/title para páginas candidatas:
  - V1: conservadora (refinamento mínimo)
  - V2: foco em benefício + CTA
  - V3: otimizada para AI/featured snippet (resposta direta)
- Usuário escolhe variante ou rejeita — escolha registrada em `proposals/{page-slug}.json`
- Cooldown de 60 dias verificado via `history.json` (pula página se dentro do cooldown)

### Bloco 3 — Schema e GEO
Verifica:
- Páginas principais sem schema estruturado (Organization, Service, Article, FAQ, etc.)
- Ausência de `llms.txt` na raiz do domínio
- Estrutura de resposta direta (importante para AI Overviews)

**Ações propostas:**
- Schema JSON-LD gerado por tipo de página → aprovação individual antes de aplicar
- Rascunho de `llms.txt` salvo em `~/.toin-seo/{slug}/llms_draft.txt` → aprovação antes de publicar

### Bloco 4 — Análise Específica do Site *(somente TOIN em v1)*

**Glossário (2.198 páginas):**

`glossary.py` — script novo — executa:
1. Chama `GET /wp-json/wp/v2/types` para descobrir o slug real do post_type do glossário (valida que tem `show_in_rest: true`). Se não encontrar, reporta erro claro e pula o bloco.
2. Puxa lista de posts desse post_type via WP REST API
3. Cruza com dados GSC: cliques e impressões dos últimos 6 meses por URL
3. Classifica cada termo em:
   - `trafego_real` — cliques > 0
   - `impressoes_sem_clique` — impressões > 0, cliques = 0
   - `invisivel` — 0 impressões no período

4. Identifica termos estratégicos (lista manual de palavras-chave do negócio: "agência", "criação de sites", "marketing digital", etc.)
5. Exporta relatório completo em `~/.toin-seo/criatoin/glossary_report.csv`

**Proposta apresentada no chat:**
- Resumo: X termos com tráfego | Y com impressões | Z invisíveis
- **Opção A:** Noindex em lote nos termos invisíveis e não estratégicos (lista para revisão)
- **Opção B:** Manter apenas termos estratégicos + com tráfego real (lista curada)
- Nenhuma ação executada sem aprovação explícita + revisão da lista

**Fluxo de confirmação para noindex em lote:**
1. Agente exporta CSV com todos os termos candidatos ao noindex
2. Exibe resumo no chat: "X páginas serão marcadas como noindex. Lista salva em `glossary_noindex_candidates.csv`. Revise o arquivo antes de confirmar."
3. Aguarda o usuário confirmar com `sim` após revisar o CSV
4. Executa em lotes de 50 páginas, reportando progresso após cada lote
5. Se qualquer erro ocorrer, pausa e reporta antes de continuar

**Páginas novas/recentes:**

WP REST API retorna `post_modified` para cada página. O script filtra páginas modificadas nos últimos 30 dias e verifica:
- Meta description presente
- Canonical correto
- Schema estruturado
- Ao menos 1 link interno apontando para a página

Páginas novas sem configuração básica → listadas como ações pendentes no Bloco 1.

---

## Regras de Autonomia

### Executa sem confirmação adicional (após aprovação explícita do bloco):
- Preencher meta description vazia
- Corrigir canonical ausente
- Injetar/atualizar schema JSON-LD (aprovado individualmente)

### Sempre pede confirmação explícita antes de executar (mesmo dentro de bloco aprovado):
- Alterar title de qualquer página
- Alterar alt text de imagens (apresenta lista, aguarda confirmação)
- Noindex em páginas — especialmente em lote no glossário
- Qualquer alteração em money pages
- Qualquer ação irreversível

### Cooldown (verificado via `history.json`):
- Mínimo 60 dias entre alterações de meta na mesma página
- Se dentro do cooldown: informa quando o cooldown expira e pula a página

---

## Configuração (Primeira Execução)

Setup guiado no chat quando `sites.json` não existe:

```
Bem-vindo ao TOIN SEO Agent! Vamos configurar o primeiro site.

1. URL do site (ex: https://criatoin.com.br):
2. Usuário WordPress:
3. Application Password (WP > Usuários > Senhas de aplicativo):
4. Plugin SEO instalado? [yoast / rankmath / aioseo / seopress / none]:
5. GSC Client ID:
6. GSC Client Secret:
7. GSC Refresh Token:
8. PageSpeed API Key (opcional — deixe em branco para pular CWV):
```

Após salvar `~/.toin-seo/sites.json`, a skill restringe as permissões do arquivo via Python (`os.chmod(path, 0o600)`). No Windows, onde `chmod` não existe, a skill usa `icacls` para restringir acesso ao usuário atual e informa o usuário sobre a limitação.

**Adicionar novo site:** `/toin-seo add-site`

**Seleção de site:**
- 1 site cadastrado → usa automaticamente
- 2+ sites → lista numerada, usuário escolhe

---

## Relação com o Projeto Original

O projeto `toin-seo-agent` **não será deletado** — fica pausado como referência de lógica e metodologia.

| O que é reutilizado | Como |
|--------------------|------|
| Lógica de auditoria (`technical_audit.py`) | Referência para reescrever `auditor.py` sem Supabase |
| Lógica de crawl (`site_crawler.py`) | Referência para `crawler.py` — praticamente idêntico |
| Adapters WP (plugin PHP) | Plugin continua instalado nos sites — é o endpoint REST |
| Metodologia SEO (CLAUDE.md) | Base do diagnóstico — a skill incorpora as 4 fases como conhecimento |
| `gsc_client.py` (lógica OAuth) | Referência para `gsc.py` — mesma autenticação, sem Supabase |

| O que NÃO é reutilizado diretamente | Motivo |
|------------------------------------|--------|
| Scripts com `from supabase_client import` | Dependência Supabase — scripts novos escritos do zero |
| `apply_changes_wp.py` | Importa DeepSeek — `wp_writer.py` novo, só REST API |
| FastAPI backend | Eliminado |
| Next.js frontend | Eliminado |
| Supabase | Eliminado — substituído por arquivos locais |

---

## Escopo Inicial (v1)

**Inclui:**
- Scripts standalone sem Supabase: `crawler.py`, `gsc.py`, `pagespeed.py`, `auditor.py`, `wp_writer.py`, `glossary.py`
- Bloco 1: Auditoria técnica completa
- Bloco 2: Oportunidades GSC (limiar fixo de 200 impressões)
- Bloco 3: Schema e GEO
- Bloco 4: Análise do glossário (TOIN) + páginas recentes
- Execução de correções aprovadas via WP REST API
- Estado persistente em `~/.toin-seo/`
- Multi-site (começa com criatoin.com.br)

**Não inclui (v1):**
- Monitoramento semanal automático (cron)
- Briefing mensal de conteúdo
- Relatórios históricos comparativos
- Criptografia de credenciais (mitigado por `chmod 600`)
- Configuração do limiar de impressões (fixo em 200)

---

## Critérios de Sucesso

- `/toin-seo` roda e apresenta diagnóstico completo de criatoin.com.br em uma sessão
- Usuário consegue aprovar e executar correções sem sair do Claude Code
- Cooldowns de 60 dias respeitados entre sessões via `history.json`
- Glossário analisado com proposta clara de Opção A ou B + relatório CSV exportado
- Páginas modificadas nos últimos 30 dias verificadas automaticamente
- Nenhuma dependência de servidor externo (Supabase, FastAPI, Next.js)
