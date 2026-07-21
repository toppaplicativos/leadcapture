# Captação → Filtro → Relação → Resultado (aprendizado)

## Problema corrigido (filtros)

Antes o chip de “nicho” vinha do **tipo Google Places** (`barbecue` → “Barbecue”), não da **busca da campanha** (“Restaurantes”).  
Clicar no chip não batia com a família de estabelecimentos.

### Modelo atual

| Campo | Origem | Exemplo |
|-------|--------|---------|
| `search_query` | keyword/query da campanha de captação | Restaurantes |
| `place_type` | tipo Places humanizado | Churrascaria |
| `vertical` | família normalizada | Restaurante |
| `niche` | vertical \|\| search \|\| place_type | Restaurante |

**Facets do pool (chips principais):** `searches` + `verticals` (não lista BARBECUE cru).  
**Match:** “Restaurantes” inclui pizzaria, churrascaria, bar, etc.

## Loop de aprendizado (fase 1 implementada)

Tabela `capture_feedback_events` grava a cada:

| Evento | Polaridade | Quando |
|--------|------------|--------|
| `pool_skip` | negative | Recusa no pool |
| `not_matching` | negative | Não correspondente |
| `channel_unavailable` | negative | Canal morto |
| `lost` | negative | Sem interesse |
| `replied` / `negotiating` | positive | Resultado bom |
| `sent` | neutral | Envio |
| `convert` | positive | Cliente |

Payload inclui: `search_query`, `place_type`, `vertical`, `prospect_name`, `reason`.

### Próximas fases (não nesta entrega)

1. **Agregação** → `GET /capture-feedback/summary` (top positivos/negativos).
2. **Sugestão de busca** no admin de captação: “evitar Churrascaria se skip rate alto; preferir Restaurantes”.
3. **Pré-filtro na fila** opcional: rebaixar place_types com alta taxa de `not_matching`.
4. **Treino de termo** a partir de notas de recusa (NLP leve).

## Fluxo ponta a ponta

```
Campanha (query) → Places/import → queue (metadata)
       ↓
Pool facets (busca/vertical) + filtros funcionais
       ↓
Claim / Skip → feedback event
       ↓
Atendimento (sent / replied / lost / …) → feedback event
       ↓
(fase 2) re-ranking de captação e sugestão de queries
```
