# Product

## Register

product

## Users

Pequenos e médios negócios brasileiros — lojistas, prestadores de serviço, agências e operadores de vendas — que precisam captar leads, atender via WhatsApp, gerenciar catálogo e rodar campanhas sem trocar de ferramenta a cada tarefa. Usam o produto no dia a dia, muitas vezes no celular entre atendimentos, em ambientes com luz variável e pouco tempo para aprender interfaces novas.

## Product Purpose

LeadCapture unifica captura de leads (Google Places, mapa, importação inteligente), CRM, WhatsApp, automações, catálogo/loja, criativos IA e campanhas num único painel operacional. Sucesso = o operador conclui a tarefa (responder lead, disparar campanha, publicar produto) sem fricção, com confiança nos dados e sem parecer que está usando "mais um SaaS genérico de IA".

## Brand Personality

**Direto · Operacional · Confiável**

Tom de ferramenta premium que some na tarefa — como Linear ou Stripe Dashboard, não como landing page de startup. Confiança vem de clareza, densidade útil e feedback imediato. A landing pública pode ser mais expressiva (mapa, radar, motion), mas o app autenticado prioriza consistência e velocidade.

Referências de sensação: **Linear** (hierarquia densa, tipografia precisa), **Stripe Dashboard** (neutros verdadeiros, estados semânticos claros), **Notion** (sidebar + conteúdo, affordances familiares).

## Anti-references

- SaaS landing-page clichês: hero metric gigante, card grid idêntico com ícone + título + texto, eyebrows em caps em toda seção
- Paleta "AI slop": gradientes violeta→roxo→ciano, botões roxo em todo lugar, glassmorphism decorativo
- Inter + azul `#3b82f6` como identidade inteira (genérico demais)
- Dark mode com neon/roxo sem propósito
- Modais como primeira solução para tudo
- Texto cinza lavado em fundos coloridos
- Gradient text (`background-clip: text`) como ênfase padrão
- KPI cards com número gigante + label minúsculo em uppercase (template SaaS)

## Design Principles

1. **A ferramenta desaparece na tarefa** — cada tela serve um fluxo operacional claro; decoração nunca compete com dados e ações.
2. **Consistência entre telas** — mesmo botão, mesmo input, mesmo card em Leads, Clientes, Campanhas e Configurações.
3. **Marca do cliente, não do sistema** — cores primárias são injetadas por brand (`--brand-primary`, `--brand-secondary`); o shell do app permanece neutro e confiável.
4. **Dois registros, uma família** — landing (brand) pode ser cinematográfica; painel admin (product) é denso, neutro e familiar.
5. **Estado explícito** — hover, focus, loading, erro, vazio e sucesso são obrigatórios em todo componente interativo.

## Accessibility & Inclusion

- Alvo: **WCAG 2.1 AA** em superfícies autenticadas (contraste ≥4.5:1 em texto de corpo, ≥3:1 em texto grande)
- Suporte a `prefers-reduced-motion` em animações de landing e transições de página (hoje ausente — gap conhecido)
- Touch targets ≥44px em navegação mobile (bottom nav, sidebar mobile)
- Labels e `aria-*` em formulários críticos (parcialmente implementado via `Input` e `Button` em `components/ui`)