# Afiliados — Acompanhamento multi-canal (WhatsApp + Telefone)

## Problema

O fluxo de atendimento do afiliado era **WhatsApp-first**: enviar mensagem → registrar resultado → cadência.
Isso não modelava bem **ligações telefônicas** nem tentativas separadas por canal no mesmo prospect.

## Modelo

Cada **contato** (opportunity: `affiliate_lead` | `assignment`) tem:

1. **Fase operacional global** (fila / contatado / conversa / fechado) — inalterada na essência
2. **Tentativas por canal** — eventos append-only em `affiliate_manual_actions` com `channel`
3. **Cadência unificada** — `attendanceCadence` agenda a próxima tarefa do contato (não por canal isolado)

```
Contato
├── Canal WhatsApp
│   ├── tentativas: sent, followup, replied, …
│   └── resumo: última ação + contagem
├── Canal Telefone
│   ├── tentativas: called, voicemail, busy, callback_requested, …
│   └── resumo: última ação + contagem
└── Timeline unificada (ordenada por created_at) com badge de canal
```

## Canais

| channel   | Uso |
|-----------|-----|
| `whatsapp`| Mensagens (padrão legado) |
| `phone`   | Ligações (`tel:`) + registro de resultado |
| `note`    | Anotações sem canal de contato |
| `system`  | claim / meta / IA |

## Ações novas (cadência)

| action | Canal típico | Efeito |
|--------|--------------|--------|
| `called` | phone | = `sent`: fase contacted, follow-up D+2 |
| `voicemail` | phone | = no_answer suave, D+2 |
| `busy` | phone | D+1 |
| `callback_requested` | phone | = waiting D+1 |

Outcomes compartilhados (`replied`, `no_answer`, `negotiating`, `lost`…) aceitam `channel` no payload para rotular a tentativa.

## API

`PATCH /api/affiliate-app/opportunities/:refType/:refId/progress`

```json
{
  "action": "called",
  "channel": "phone",
  "note": "tocou 2x",
  "duration_sec": 45,
  "task_id": "optional"
}
```

Histórico e activity devolvem `channel`, `duration_sec` e labels com prefixo de canal.

## UI

- Ficha do contato: seletor **WhatsApp | Telefone**
- Telefone: `tel:` + painel “Registrar ligação”
- Histórico agrupável por canal + timeline mista
- Tarefas do dia: executar por mensagem ou ligação

## Offline

Fila `affiliate-crm-local` inclui `channel` e `duration_sec` no payload.
