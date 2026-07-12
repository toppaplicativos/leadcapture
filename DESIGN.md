---
name: LeadCapture
description: Plataforma operacional de captura de leads, CRM e vendas — neutros verdadeiros, marca dinâmica por cliente
colors:
  ink: "#171717"
  ink-muted: "#6b6b6b"
  ink-subtle: "#9a9a9a"
  surface: "#ffffff"
  surface-alt: "#f3f3f3"
  canvas: "#f5f5f5"
  border: "#e5e5e5"
  border-light: "#ededed"
  accent-system: "#3b82f6"
  accent-brand: "#111827"
  success: "#10b981"
  danger: "#ef4444"
  warning: "#f59e0b"
  landing-dark: "#0a0a0a"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "72px"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.022em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.011em"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  2xl: "20px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#262626"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "#404040"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "44px"
  button-brand:
    backgroundColor: "{colors.accent-brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "44px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "0 14px"
    height: "44px"
  card-default:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "20px"
---

# Design System: LeadCapture

## Overview

**Creative North Star: "The Operations Console"**

LeadCapture é uma ferramenta de trabalho, não um showroom. O painel admin usa neutros verdadeiros (cinza sem tint azul), tipografia Inter densa e affordances familiares de SaaS premium — sidebar, tabelas, KPIs, modais — para que o operador confie e execute rápido. A landing pública (`/inicio`) opera num registro irmão mais cinematográfico: fundo `#0a0a0a`, mapa/radar animado, shimmer em palavras-chave — mas compartilha a mesma família tipográfica e a mesma disciplina de espaçamento.

O sistema rejeita explicitamente a estética "AI slop": gradientes violeta→roxo em CTAs, glassmorphism decorativo, hero metrics clichê e eyebrows em caps em toda seção. A cor de marca do cliente é injetada em runtime via `--brand-primary` / `--brand-secondary`; o shell do app permanece neutro.

**Key Characteristics:**
- Neutros verdadeiros (`#f5f5f5` canvas, `#e5e5e5` bordas) — sem tint azulado
- Inter como única família no produto; escala fixa em rem, não fluida
- Cantos generosos (`rounded-xl` / `rounded-2xl` = 18–20px)
- Elevação sutil: sombras quase invisíveis em repouso, lift no hover
- Dois vocabulários de botão: `components/ui/Button` (neutro) vs gradientes inline (legado — em migração)
- Marca white-label via CSS vars dinâmicas

## Colors

Paleta **Restrained** no produto: neutros carregam 90% da superfície; acento do sistema (`#3b82f6`) e acento de marca (dinâmico) aparecem só em ações primárias, seleção e estados.

### Primary
- **True Ink** (`#171717` / gray-900): Texto principal, botão primário do design system (`Button variant="primary"`), headings no painel.
- **Brand Dynamic** (`--brand-secondary`, default `#0f172a`): CTAs de catálogo, sidebar ativo quando brand aplicada, utilitários `.bg-brand` / `.text-brand`.

### Secondary
- **System Blue** (`#3b82f6`): Focus ring de inputs legado, sidebar `.active`, links de sistema. Uso deve convergir para brand ou ink — hoje coexistem (inconsistência documentada).

### Neutral
- **Canvas** (`#f5f5f5`): Fundo do `body` e shell admin.
- **Surface** (`#ffffff`): Cards, inputs, modais.
- **Surface Alt** (`#f3f3f3`): Fundos secundários, botão secondary.
- **Muted** (`#6b6b6b`): Labels, hints, metadados.
- **Border** (`#e5e5e5`): Bordas de card, inputs, divisores.

### Semantic
- **Success** (`#10b981`): Confirmações, badges positivos, toggles on.
- **Danger** (`#ef4444`): Exclusão, erros, badges críticos.
- **Warning** (`#f59e0b`): Alertas, estados pendentes.

### Landing (Brand register)
- **Obsidian** (`#0a0a0a`): Fundo de seções dark na landing.
- **Shimmer White**: Gradiente animado em `.text-shimmer` — permitido só na landing, proibido no painel.

### Named Rules
**The Brand Injection Rule.** Cores primárias do cliente vivem em `--brand-*` setadas por JS (`DesignPage`). O shell admin nunca pinta a tela inteira com a cor da marca — só CTAs, seleção e elementos de storefront.

**The No-Purple-Gradient Rule.** Gradientes `from-violet-* to-purple-*` e `from-blue-* to-indigo-*` em botões do painel são legado AI slop. Novos componentes usam `Button` sólido (`gray-900` ou `brand`).

## Typography

**Display Font:** Inter (Google Fonts + system stack)
**Body Font:** Inter (mesma família — product register)
**Label Font:** Inter semibold 12px

**Character:** Densa, precisa, levemente condensada (`letter-spacing: -0.011em` no body, até `-0.035em` em display). Tabular nums em KPIs (`.tabular-nums`).

### Hierarchy
- **Display** (700, 40–72px fixo na landing, line-height 1.02): Hero da landing apenas. Nunca no painel admin.
- **Headline** (700, 24px, line-height 1.2): Títulos de página no admin (`h2`).
- **Title** (600, 15px): Títulos de card, seções (`CardTitle`, `SectionHeader`).
- **Body** (400, 14px, line-height 1.5): Texto corrido, células de tabela, descrições.
- **Label** (600, 12px): Labels de formulário, metadados, badges. KPI labels usam 10px uppercase — legado, evitar em código novo.

### Named Rules
**The Fixed Scale Rule.** No painel admin, tamanhos são fixos em px/rem — sem `clamp()` em headings. Densidade e previsibilidade vencem drama tipográfico.

## Elevation

Sistema **híbrido**: camadas tonais (canvas → surface → border) + sombras mínimas em repouso.

### Shadow Vocabulary
- **Card** (`0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)`): Cards em repouso (`.card`, `Card` component).
- **Elevated** (`0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)`): Hover em cards interativos.
- **Modal** (`0 12px 40px rgba(0,0,0,0.12)`): Modais e drawers.

### Named Rules
**The Flat-By-Default Rule.** Superfícies em repouso são planas com borda `1px`. Sombra aparece como resposta a hover, modal ou drag — nunca como decoração estática.

## Components

### Buttons
- **Shape:** Cantos generosos (`rounded-xl`, 18px)
- **Primary (canônico):** `bg-gray-900 text-white h-11` — `components/ui/Button`
- **Brand:** `bg-brand text-white` — usa `--brand-secondary`
- **Secondary:** `bg-gray-100 text-gray-800`
- **Danger:** `bg-red-600 text-white`
- **Hover / Focus:** `focus-visible:ring-2 ring-offset-2`; hover escurece 1 step; `active:scale-[0.98]`
- **Legado (migrar):** Gradientes `from-violet-500 to-purple-600` espalhados em `AdminDashboard`, modais IA — não usar em código novo

### Inputs / Fields
- **Canonical components:** `components/ui/Input`, `Select`, `Textarea` (mesmo vocabulario visual)
- **Style:** `h-11 rounded-xl border-border bg-white text-sm text-gray-900`
- **Focus:** `ring-4 ring-gray-900/5 border-gray-900` (ink, não azul)
- **Error:** `border-red-300 ring-red-500/10` + mensagem `text-xs text-red-600`
- **Label:** `text-[12px] font-semibold text-gray-700 mb-1.5`
- **Classes CSS:** `.ds-control`, `.ds-select`, `.ds-textarea` — para markup fora do React

### Selects / Dropdowns
- **Native select:** fundo `#ffffff`, texto `#171717`, chevron SVG muted, `appearance: none`, padding-right 2.5rem
- **`<option>` / `<optgroup>`:** sempre `color: #171717` + `background: #ffffff` (hex absolutos) — evita lista branca-no-branco no Windows
- **Custom menus:** classe `.ds-menu` + `.ds-menu__item` (nunca herdar `text-white` de pais escuros)
- **Z-index:** `--ds-z-dropdown: 50` (escala semântica dropdown → sticky → overlay → modal → toast)

### Chips / Badges
- **Component:** `components/ui/Badge` (`neutral` | `success` | `warning` | `danger` | `info` | `brand`)
- **Style:** `rounded-full`, 11px semibold, fundos pastel
- **Classes legado:** `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`

### Cards / Containers
- **Corner Style:** `rounded-2xl` (20px) no componente `Card`; `rounded-xl` (18px) no CSS legado `.card`
- **Background:** `white` com `border-border`
- **Shadow Strategy:** Sombra card em repouso; elevated no hover se `interactive`
- **Padding:** `px-5 py-4` no `CardBody`

### Navigation
- **Admin sidebar:** Ícone + label, grupos (`main`, `loja`, `config`), item ativo com brand/ink (evitar azul hardcoded em código novo)
- **Mobile:** Header fixo + sidebar overlay + bottom nav (5 itens: dashboard, leads, busca, mensagens, campanhas)
- **Safe areas:** `--safe-area-top/bottom` para notch mobile

### KPI Cards (legado)
- **Primitive:** `KpiCard` em `admin/primitives` — label 11px semibold (não uppercase tracking excessivo), valor `tabular-nums`
- **CSS legado:** `.kpi-card` — manter onde já existe; não replicar o template hero-metric em telas novas

### Multi-app surface map
Uma família visual, três canais de entrega:

| Superfície | Tokens | Controles |
|---|---|---|
| React app (admin, agent, affiliate, partners, store) | `frontend/src/index.css` `@theme` + `--ds-*` | `components/ui/*` |
| Master console (dark) | `.master-console` + ink options absolutas | mesmos raios/focus; superfície `#0a0a0a` |
| HTML legado (catálogo, estoque, inventário) | `public/shared/design-tokens.css` | `public/shared/components/*.css` via `loader.js` |
| Marca runtime | `--brand-primary` / `--brand-secondary` (JS) | CTAs e seleção only |

**The Shared Family Rule.** Neutros, raios, sombras e focus ink são idênticos entre React e shared CSS. Apps white-label mudam só `--brand-*`, nunca a base do shell.

**The Master Dark Rule.** Shell master usa vidro escuro (`bg-white/[0.03]`); listas nativas de `<option>` continuam ink `#171717` em fundo `#ffffff` para legibilidade no Windows.

### Landing Signature
- **Section:** Alternância `bg-white` / `bg-[#0a0a0a]`, max-width `6xl`, padding vertical 64–80px
- **Eyebrow:** Pill `rounded-full` 11px uppercase — usar com moderação (máx. 1 por seção)
- **Radar/Map heroes:** Animações CSS dedicadas (`radar-sweep`, `pin-ping`)

## Do's and Don'ts

### Do:
- **Do** usar `components/ui/Button`, `Input`, `Select`, `Textarea`, `Card`, `Badge` como primitives canônicos em telas novas.
- **Do** usar cores absolutas (`#171717` / `#ffffff`) em `<option>` e menus flutuantes — não confiar só em utilitários Tailwind para listas nativas.
- **Do** aplicar cores de marca via `--brand-*` e classes `.bg-brand`, `.text-brand`.
- **Do** manter touch targets ≥44px (`h-11` em botões e inputs).
- **Do** usar `tabular-nums` em KPIs, tabelas e valores monetários.
- **Do** respeitar safe areas no mobile admin (`safe-area-top`, `admin-shell-mobile-*`).
- **Do** limitar animações de landing a seções públicas; no painel, motion só para feedback de estado (150–250ms).

### Don't:
- **Don't** usar gradientes violeta→roxo ou azul→indigo em botões do painel — é AI slop.
- **Don't** usar `background-clip: text` / `.text-shimmer` fora da landing.
- **Don't** usar `.glass` / glassmorphism como padrão de card.
- **Don't** usar texto `text-gray-400/500` em fundos coloridos (`bg-violet-50`, `bg-red-50`) — lavado.
- **Don't** criar nested cards (card dentro de card com mesma elevação).
- **Don't** usar Inter como "identidade" sem compensar — considerar troca futura para fonte menos saturada em AI UIs.
- **Don't** espalhar eyebrows uppercase em toda seção da landing.
- **Don't** hardcodar `#3b82f6` em novos componentes quando `--brand-secondary` está disponível.