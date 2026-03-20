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
- Scripts de execução: `~/.claude/skills/toin-seo/scripts/`

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

### Scripts Python (reutilizados do projeto atual)
O projeto `toin-seo-agent` já possui scripts maduros que serão reutilizados:
- `site_crawler.py` — crawl de sitemap e páginas individuais
- `gsc_client.py` — integração Google Search Console
- `pagespeed_client.py` — Core Web Vitals via PageSpeed API
- `technical_audit.py` — lógica de auditoria técnica
- `apply_changes_wp.py` — escrita no WordPress via REST API

A skill orquestra esses scripts e apresenta os resultados no chat.

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
O agente executa em paralelo:
- Crawl do sitemap + páginas (via WP REST API + site_crawler.py)
- Dados GSC dos últimos 90 dias (gsc_client.py)
- Core Web Vitals (pagespeed_client.py)
- Para TOIN: análise do glossário (posts com post_type específico)

### 3. Diagnóstico em 4 Blocos
Apresentado sequencialmente no chat. Cada bloco termina com lista de ações propostas e pergunta de aprovação.

### 4. Execução
Para cada ação aprovada: executa via WP REST API, confirma no chat, salva em `history.json`.

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
- Imagens sem alt text (lista exportável)
- Links quebrados (amostra de até 200)
- Páginas órfãs (sem links internos)
- Redirect chains

**Ações propostas ao final do bloco:**
- Preencher metas vazias (executa automaticamente com aprovação)
- Corrigir canonicals ausentes (executa automaticamente com aprovação)
- Lista de ações manuais (velocidade, imagens, redirects)

### Bloco 2 — Oportunidades GSC
Verifica (mínimo 200 impressões no período):
- Páginas na posição 5-15 com CTR < 2% → candidatas a revisão de meta/title
- Queries sem página dedicada → gaps de conteúdo
- Páginas com queda de tráfego > 20% vs período anterior
- Páginas subindo para posição 11-15 → oportunidade de internal links

**Ações propostas:**
- Gerar 3 variações de meta/title para páginas candidatas (V1: conservadora, V2: benefício+CTA, V3: AI/featured snippet)
- Usuário escolhe variante ou rejeita
- Cooldown de 60 dias respeitado (verificado via `history.json`)

### Bloco 3 — Schema e GEO
Verifica:
- Páginas principais sem schema estruturado (Organization, Service, Article, FAQ, etc.)
- Ausência de `llms.txt` na raiz do domínio
- Estrutura de resposta direta (importante para AI Overviews)

**Ações propostas:**
- Schema JSON-LD gerado por tipo de página → aprovação individual
- Rascunho de `llms.txt` → aprovação antes de publicar

### Bloco 4 — Análise Específica do Site *(somente TOIN por enquanto)*
**Glossário (2.198 páginas):**
- Segmenta por cliques nos últimos 6 meses (GSC)
- Classifica: com tráfego real | com impressões mas 0 cliques | invisíveis
- Identifica termos estratégicos para o negócio da TOIN (agência digital, criação de sites, marketing, etc.)
- Propõe:
  - **Opção A:** Noindex em lote nos termos sem tráfego e não estratégicos
  - **Opção B:** Manter apenas termos estratégicos (lista curada para aprovação)
  - Exporta lista completa para revisão antes de qualquer ação

**Páginas novas/recentes:**
- Detecta páginas criadas/modificadas recentemente (layout novo)
- Verifica se estão bem configuradas: meta, canonical, schema, internal links

---

## Regras de Autonomia

### Executa sem confirmação adicional (após aprovação do bloco):
- Preencher meta description vazia
- Corrigir canonical ausente
- Injetar/atualizar schema JSON-LD aprovado
- Atualizar alt text de imagens (lista aprovada)

### Sempre pede confirmação explícita antes de executar:
- Alterar title de qualquer página
- Noindex em páginas (especialmente em lote no glossário)
- Qualquer alteração em money pages
- Qualquer ação irreversível

### Cooldown (verificado via history.json):
- Mínimo 60 dias entre alterações de meta na mesma página
- Se tentar antes: avisa e pula a página sem executar

---

## Configuração (Primeira Execução)

Setup guiado no chat quando `sites.json` não existe:

```
Bem-vindo ao TOIN SEO Agent! Vamos configurar o primeiro site.

1. URL do site (ex: https://criatoin.com.br):
2. Usuário WordPress:
3. Application Password (WP > Usuários > Senhas de aplicativo):
4. Plugin SEO instalado? [yoast / rankmath / aioseo / seopress / none]:
5. GSC Refresh Token (já configurado no projeto):
```

Salvo em `~/.toin-seo/sites.json` (fora do repositório, nunca commitado).

**Adicionar novo site:** `/toin-seo add-site`

**Seleção de site:**
- 1 site cadastrado → usa automaticamente
- 2+ sites → lista numerada, usuário escolhe

---

## Reutilização do Projeto Atual

O projeto `toin-seo-agent` **não será deletado** — fica pausado como referência. A skill reutiliza:

| Componente | Origem | Uso na Skill |
|-----------|--------|-------------|
| `site_crawler.py` | `execution/` | Crawl de sitemap e páginas |
| `gsc_client.py` | `execution/` | Dados GSC |
| `pagespeed_client.py` | `execution/` | Core Web Vitals |
| `technical_audit.py` | `execution/` | Lógica de auditoria |
| `apply_changes_wp.py` | `execution/` | Escrita no WP |
| Metodologia SEO (4 fases) | `CLAUDE.md` | Base do diagnóstico |
| Adapters WP (Yoast/RankMath/etc.) | Plugin PHP | Referência para escrita de meta |
| Plugin `toin-seo-agent` | `plugin/` | Continua instalado nos sites WP |

O plugin WordPress `toin-seo-agent` **continua instalado** nos sites — é o conector REST API que a skill usa para ler e escrever dados.

---

## Escopo Inicial (v1)

**Inclui:**
- Bloco 1: Auditoria técnica completa
- Bloco 2: Oportunidades GSC
- Bloco 3: Schema e GEO
- Bloco 4: Análise do glossário (TOIN) + páginas recentes
- Execução de correções aprovadas via WP REST API
- Estado persistente em `~/.toin-seo/`
- Multi-site (começa com criatoin.com.br)

**Não inclui (v1):**
- Monitoramento semanal automático (cron)
- Briefing mensal de conteúdo
- Relatórios históricos comparativos

---

## Critérios de Sucesso

- `/toin-seo` roda e apresenta diagnóstico completo de criatoin.com.br em uma sessão
- Usuário consegue aprovar e executar correções sem sair do Claude Code
- Cooldowns respeitados entre sessões
- Glossário analisado com proposta clara de ação A ou B
- Páginas novas verificadas e configuradas
