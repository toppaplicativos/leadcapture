---
target: modo conversacional / ConversationalShell
total_score: 18
p0_count: 2
p1_count: 3
timestamp: 2026-07-09T03-54-42Z
slug: frontend-src-components-admin-conversationalshell-tsx
---
# Critique: Modo conversacional (ConversationalShell / WorkspaceChat)

**Method:** dual-agent (A: design review · B: technical audit)  
**Target:** frontend/src/components/admin/ConversationalShell.tsx + components/agent/**  
**Register:** product · LeadCapture ops console

## Design Health Score (Nielsen)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Loading ok; modo canvas/módulo pouco sinalizado |
| 2 | Match System / Real World | 3 | pt-BR operacional; meta "Memória/skill" vaza |
| 3 | User Control and Freedom | 2 | Fecha módulo; troca de skill fecha UI anterior |
| 4 | Consistency and Standards | 1 | 3 superfícies de chat; dual CSS |
| 5 | Error Prevention | 2 | Send desabilitado; delete frágil |
| 6 | Recognition Rather Than Recall | 2 | Chips ajudam; mapa de produto incompleto |
| 7 | Flexibility and Efficiency | 3 | Triggers, sessões, busca semântica |
| 8 | Aesthetic and Minimalist Design | 1 | 25+ opções iguais; IA plana |
| 9 | Error Recovery | 1 | Erro em texto fino; sem retry |
| 10 | Help and Documentation | 1 | Sem modelo mental chat vs canvas |
| **Total** | | **18/40** | **Poor — overhaul de IA necessário** |

## Technical Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Labels bons no session; dialogs/menus incompletos |
| 2 | Performance | 1 | 14 providers; context sem memo; effects N×skill |
| 3 | Responsive Design | 3 | Rail/canvas 1024px sólido; touch <44px |
| 4 | Theming | 2 | CSS shell com tokens; TSX gray hardcode |
| 5 | Anti-Patterns | 2 | Feature dump; nested cards; violet AI |
| **Total** | | **10/20** | **Acceptable — significant work** |

## Anti-Patterns Verdict

**LLM:** Mild–moderate product-AI slop. Shell operacional real, mas welcome/grid com 25 chips iguais + modules dentro de bubbles + páginas legadas no canvas = "admin embrulhado em chat", não command center Linear-grade.

**Detector CLI:** 1 hit `gray-on-color` em InstagramAutomationsTab.tsx:227 (`text-gray-700 on bg-purple-500`). Brand channel hex (#25d366 etc.) = FP intencional.

## Overall Impression

Base forte (shell, bridges, sessões). Confusão vem da **IA plana** (tudo opção igual) e **modelo espacial opaco** (rail · módulo · canvas · rota), não de chrome feio.

## What's Working

1. Shell PWA-native: rail + canvas, tokens, safe-area, brand chrome, channels
2. Skill→UI real: bridges + ModuleBlocks + AgentUIRenderer + canvas embeds
3. Sessões/histórico/memória/pin/rename — infraestrutura de power user

## Priority Issues

### [P0] Uma superfície de chat
WorkspaceChat canônico; AdminAgentChat / AgentHomePage / AgentChatRail órfãos geram modelo mental dual. /assistente → /admin mas código ainda especial-case.

### [P0] Colapsar paredes de opções
OBJECTIVE_TRIGGERS ~25 no welcome + grid + chips iniciais. Agrupar em ≤4–7 (Atender / Captar / Vender / Configurar) com progressive disclosure.

### [P1] Modelo espacial explícito
Rotular rail vs módulo vs canvas; transitions 180–220ms; status "Leads · canvas aberto"; desktop não só hint.

### [P1] Paridade gerencial conversacional
NAV_ITEMS ~30; welcome/nav cobrem subset. Cupons, frete, loja, emails, estoque, notificações sem first-class IA. Deep edit = embed legado, não config conversacional.

### [P1] Arquitetura de módulos
14 flags + effects copy-paste + 14 providers. `activeModuleId` + registry table-driven + context memoizado.

### [P2] A11y / motion / touch
Dialogs sem trap; textarea sem aria-label; canvas close 36px; nav chips 26px; motion só no welcome.

## Persona Red Flags

- **Alex:** sem command palette; módulos auto-fecham; spatial state não confiável
- **Jordan:** chip wall; sem mapa chat/canvas; "parece AI aleatório"
- **Casey/Marina:** overlay full-screen; dock+composer; path lento para inbox

## Cognitive Load

4+ checklist fails (primary action, working memory, mode clarity, choices). Decision points >4: welcome 25, grid ~25, chips 25, where-to-act (chat/module/canvas/route/modal).

## Minor Observations

- filterInlineComponents dedup invisível
- registerOpenModal race WorkspaceChat vs AgentCanvas
- squad·skill mono em surfaces legado
- prefers-reduced-motion só no welcome

## Questions

1. Default Marina 12s: Inbox ou chip museum?
2. Canvas é second primary ou overflow?
3. Por que 3 chat UIs se shell já é o produto?
4. NL sobre mesmas telas ou UIs de tarefa novas?
5. Uma frase de modelo mental no empty state?
