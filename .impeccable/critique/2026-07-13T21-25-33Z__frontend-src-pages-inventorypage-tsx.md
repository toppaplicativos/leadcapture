---
target: app estoque / InventoryPage
total_score: 16
p0_count: 2
p1_count: 4
timestamp: 2026-07-13T21-25-33Z
slug: frontend-src-pages-inventorypage-tsx
---
# Critique: App Estoque (InventoryPage + StockLogin)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Toasts ok; sem pulse operacional nem last-sync |
| 2 | Match System / Real World | 2 | Expedição por order ID cru; ABC sem glossário |
| 3 | User Control and Freedom | 2 | Sheet escapável; sem undo; chain modal jarring |
| 4 | Consistency and Standards | 1 | Auth admin vs stock; DS local vs platform |
| 5 | Error Prevention | 2 | Saída ok; expedição free-text; sem confirm saída |
| 6 | Recognition Rather Than Recall | 2 | Lista ok; overview sem hierarquia de ação |
| 7 | Flexibility and Efficiency | 1 | Sem bulk, shortcuts, filtro categoria |
| 8 | Aesthetic and Minimalist Design | 1 | 8 KPIs iguais; login glass; push always-on |
| 9 | Error Recovery | 2 | Toast; empty sem CTA |
| 10 | Help and Documentation | 1 | Zero help contextual |
| **Total** | | **16/40** | **Poor** |

## Anti-Patterns
- Hero-metric KPI local (uppercase 10px + 26px)
- Side-stripe alerts border-l-[3px]
- Login glass/radial/gradient CTA
- Dual DIY components vs admin/primitives + ui/*

## Priority Issues
P0 Auth scope integrity (token admin no shell)
P0 Product CRUD / notifications headers wrong scope
P1 Overview KPI overload + banned template
P1 Expedition hidden mobile bottom nav
P1 Clients API orphaned (no UI)
P1 Stock login register mismatch
P2 Side-stripe, empty CTAs, reload after repor, DS drift
