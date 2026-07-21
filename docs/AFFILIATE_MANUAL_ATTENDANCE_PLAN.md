# Plano — Motor de Atendimento Manual do Afiliado (v2)

**Registro:** product (Operations Console)  
**Superfície:** Central do Afiliado · Oportunidades / Contatos · `AffiliateAttendanceWorkspace`  
**Data:** 2026-07-20  
**Impeccable:** shape → craft (aguardando confirmação)

---

## 1. Problema

Hoje o fluxo **Lead → Mensagem → Resultado** cobre bem o **1º contato**. Depois de qualquer ação em **Resultado**:

1. O status muda (ou some da fila), **sem efeito operacional real** (tarefa, data, orientação).
2. **Sem resposta / Lembrar depois** só setam `next_followup_at` em **assignments** — `affiliate_leads` quase não cadenciam.
3. **Canal indisponível / Não correspondente / Ocultar / Sem interesse** viram `lost` — **não há remoção real** nem trilha LGPD clara.
4. Reabrir o contato em qualquer fase mostra o **mesmo modal genérico** — sem estado atual, sem “o que fazer hoje”, sem script da fase.
5. **Registrar como cliente** existe (`convert`), mas não se conecta bem à cadência pós-venda.

**Sucesso:** cada ação gera **efeito explícito** (fase + tarefa + data + orientação UI); a fila de **Tarefas** vira o calendário de follow-up; saídas definitivas **somem de verdade** onde for remoção; o modal **adapta por fase**.

---

## 2. Cena de uso (Impeccable · product)

Afiliado no celular, entre WhatsApps, luz variável, 30–90s por contato.  
**Estratégia de cor:** Restrained + acento de marca só em CTA.  
**Âncoras:** Linear (densidade/estados), WhatsApp Business (pipeline de conversa), Stripe Dashboard (confiança).  
**Anti:** modal genérico sem contexto, badges “AI”, gradientes.

---

## 3. Modelo de fases (pipeline)

| Fase | Código | Significado | Foco do modal |
|------|--------|-------------|----------------|
| Fila | `to_contact` / `new` | Ainda não enviou (ou reentrou) | 1º contato / opt-in |
| Enviado | `contacted` | Mensagem enviada, aguarda humano | Follow-up / resultado |
| Conversa | `engaged` | Respondeu / engajou | Qualificar / propor |
| Negociação | `negotiating` | Interesse ativo / proposta | Fechar / objeção |
| Tarefa agendada | (qualquer + `next_followup_at`) | Há ação no dia | Cumprir tarefa do dia |
| Cliente | `converted` | Virou cliente | Pós-venda (fora do motor de prospecção) |
| Removido | `removed` / hard delete | Canal morto, pediu remoção, não corresponde | Não reaparece |
| Arquivo | `lost` / `dismissed` | Sem interesse / oculto | Soft-exit (regras abaixo) |

---

## 4. Matriz de ações → efeitos (Resultado)

### Avançar

| Ação UI | Efeito no CRM | Tarefa / cadência | Remoção | UX feedback |
|---------|---------------|------------------|---------|-------------|
| **Respondeu** | → `engaged` | Agenda **qualificar** em **0–1 dia** (hoje/amanhã) | Não | “Conversa aberta · próxima: qualificar” |
| **Em negociação** | → `negotiating` | Agenda **enviar proposta / follow-up fechamento** em **1–2 dias** | Não | Script de proposta + link produto |
| **Resposta automática (bot)** | permanece `contacted` | Follow-up humano em **2 dias** | Não | “Entregue · bot · retomar em D+2” |

### Aguardar

| Ação UI | Efeito | Cadência | Remoção | UX |
|---------|--------|----------|---------|-----|
| **Sem resposta** | `contacted` + follow-up | **D+3** tarefa “2º contato” | Não | Contador “volta em 3 dias” |
| **Lembrar depois** | `contacted` + follow-up | **D+1** (ou data escolhida) | Não | Date picker simples (default amanhã) |

### Sair da fila (crítico)

| Ação UI | Efeito real | Cadência | Remoção | UX |
|---------|-------------|----------|---------|-----|
| **Não correspondente** | Soft-delete da fila do afiliado **+** hard-flag `not_matching` no assignment/lead; **não redistribui** para o mesmo afiliado; pool: skip permanente | — | **Remoção da fila + block re-claim** | Confirmar; some na hora |
| **Canal indisponível** | Igual + marca canal inválido; se for o único canal, **remoção real** do contato na fila do afiliado (delete assignment ativo / lead lost + `removed_reason`) | — | **Sim — sumir da lista** | Confirmar “número morto” |
| **Sem interesse** | `lost` arquivado (soft) | Opcional reativação D+30 (fase 2) | Soft (arquiva) | “Arquivado” |
| **Ocultar para mim** | `dismiss` / skip só deste afiliado | — | **Só para este afiliado** (não apaga da marca) | Some da lista |

### Conversão

| Ação UI | Efeito | Cadência | Remoção | UX |
|---------|--------|----------|---------|-----|
| **Registrar como cliente** | `converted` + cria/atualiza **cliente** (já existe path) | Tarefa **pós-venda D+2** (obrigado / upsell) | Sai da prospecção | “Cliente · pós-venda em 2 dias” |
| **Anotação** | Append note + histórico | Não mexe fase | Não | Toast ok |

### Mensagem (já existe, reforçar)

| Ação | Efeito | Cadência |
|------|--------|----------|
| **Marcar enviado** | `contacted` / `awaiting_response` | Follow-up **D+2** se não responder |
| **Enviar (wa.me)** | Igual + registra message | Idem |

---

## 5. Cadência padrão (motor de tarefas)

Cada transição grava:

```ts
{
  task_type: 'first_contact' | 'followup_1' | 'followup_2' | 'qualify' | 'proposal' | 'close' | 'post_sale' | 'reactivate',
  due_at: ISO,
  phase: OperationalPhase,
  instruction: string,   // “o que fazer hoje”
  template_id?: string,  // optin | followup | proposta…
  status: 'pending' | 'done' | 'cancelled',
}
```

**Regras:**
1. Nova tarefa **cancela** pendentes anteriores do mesmo contato (exceto `post_sale`).
2. Fila **Tarefas** = `due_at <= fim_do_dia` ordenada por prioridade (atrasadas primeiro).
3. Clicar tarefa abre o **mesmo workspace**, com **contexto da fase** (não o genérico de 1º contato).

| Gatilho | task_type | due |
|---------|-----------|-----|
| Recebeu / claim | `first_contact` | hoje |
| Enviou | `followup_1` | +2d |
| Sem resposta | `followup_2` | +3d |
| Lembrar depois | `followup_1` | +1d (ou data) |
| Respondeu | `qualify` | hoje/amanhã |
| Negociação | `proposal` | +1d |
| Bot | `followup_1` | +2d |
| Convertido | `post_sale` | +2d |

---

## 6. Remoção real (LGPD / qualidade)

| Situação | Política |
|----------|----------|
| Canal indisponível | Remove da fila do afiliado; marca telefone `invalid` no registro; **não** reaparece em claim; histórico de auditoria |
| Pediu remoção (futuro action `opt_out`) | Soft-delete + flag LGPD; **hard delete PII** se política da marca exigir (fase 2: hard scrub) |
| Não correspondente | Remove da fila + `block_reassign` para este afiliado; opcional devolver ao pool da marca com tag |
| Ocultar para mim | Skip local (já parcialmente existe em pool) — **não** apaga dado da marca |
| Sem interesse | Arquiva (`lost`) — recuperável em “Arquivo” |

**Implementação mínima de “remoção real” nesta v2:**
- `DELETE` lógico: `assignment_status = 'removed'` + `removed_at` + `removed_reason`
- `affiliate_leads`: `affiliate_status = 'removed'` + reason
- Listagens **excluem** `removed` (e opcionalmente `lost` fica só em Arquivo)
- Endpoint `DELETE` ou progress com `purge: true` para canal morto / não correspondente

---

## 7. Modal por fase (orientação)

Header sempre mostra:
- Nome · fase · “Próximo passo: …”
- Chip de tarefa: “Hoje · Follow-up 2º contato” / “Atrasado 1d”

Corpo adapta:

| Fase | Passo 1 | Passo 2 | Passo 3 |
|------|---------|---------|---------|
| Fila | Lead + canais | Mensagem (opt-in/apresentação) | Resultado 1º contato |
| Enviado | Resumo do envio | Follow-up script | Resultado (respondeu / sem resp. / …) |
| Conversa | Histórico + objetivo | Mensagem (qualificar) | Resultado |
| Negociação | Resumo interesse | Proposta + **links produto** | Resultado / converter |
| Tarefa do dia | Instrução da tarefa | Ação + template | Concluir tarefa |

---

## 8. Plano de implementação (24 itens)

### Fundação de dados & motor (1–8)

1. **Schema `affiliate_attendance_tasks`** — id, brand, affiliate, ref_type, ref_id, task_type, due_at, instruction, template_id, status, created_from_action, timestamps.  
2. **Colunas `removed_at`, `removed_reason`** em `prospect_assignments` e `affiliate_leads` (ou metadata padronizado).  
3. **Serviço `attendanceCadence.ts`** — mapa action → { phase, task, dueDays, removeMode }.  
4. **Unificar progress** para `assignment` **e** `affiliate_lead` (hoje follow-up só no assignment).  
5. **`scheduleTask` / `completeTask` / `cancelOpenTasks`** no CRM.  
6. **Remoção real** em `channel_unavailable` e `not_matching` (purge da fila + block).  
7. **Auditoria** `recordAffiliateManualAction` com payload da tarefa gerada.  
8. **Digest** de tarefas (hoje / atrasadas) no endpoint de oportunidades + alertas.

### API (9–12)

9. `GET /opportunities?segment=tasks` com filtro `due_at`.  
10. `PATCH .../progress` retorna `{ next_task, phase, instruction }`.  
11. `POST .../convert` gera `post_sale` task.  
12. `POST .../purge` (ou action) com confirmação de remoção LGPD/canal.

### UI Workspace (13–19)

13. **Context banner** no modal: fase + instrução + due.  
14. **Steps dinâmicos** por fase (não só “1º contato”).  
15. **Templates filtrados** por fase (já existe lista — amarrar de verdade).  
16. **Resultado contextual**: ações habilitadas dependem da fase.  
17. **Confirmação destrutiva** para canal morto / não correspondente / ocultar.  
18. **Date picker** em “Lembrar depois”.  
19. **Deep-link** da tarefa → abre workspace com `initialStep` e `taskId`.

### Fila de Tarefas (20–22)

20. Aba **Tarefas** com seções: Atrasadas · Hoje · Próximos 7 dias.  
21. Empty state orientativo (“Nenhuma tarefa — pegue da fila”).  
22. Badge no bottom/nav ou hub com contagem de due today.

### Pós-venda & cliente (23–24)

23. Convert → aparece em Clientes + tarefa pós-venda.  
24. Ação **Registrar como cliente** no Resultado de `engaged`/`negotiating` (destaque).

### Extra (backlog imediato se couber)

25. Opt-out / “Pediu remoção” como ação dedicada.  
26. Integração leve com copiloto Atendimento (sugerir script da fase).  
27. Offline queue: reaplicar cadência no sync.

---

## 9. Prioridade de entrega (PRs)

| PR | Escopo | Valor |
|----|--------|-------|
| **PR1** | Cadência + tasks schema + progress unificado + remoção real | Coração do motor |
| **PR2** | Modal contextual por fase + confirmações + date picker | UX do dia a dia |
| **PR3** | Fila Tarefas + digest + deep-link | “O que fazer hoje” |
| **PR4** | Convert/pós-venda + polish | Fechamento do funil |

---

## 10. Defaults assertivos (confirmar ou override)

1. **Remoção real** em canal indisponível e não correspondente = some da fila do afiliado + block re-claim (não apaga da base da marca).  
2. **Ocultar para mim** = só soft skip do afiliado.  
3. **Sem interesse** = arquiva (recuperável), não hard delete.  
4. **Cadências:** sem resposta D+3 · lembrar D+1 · pós-envio D+2 · pós-venda D+2.  
5. **Visual:** Restrained, modal bottom-sheet mobile, sem redesign do shell.

---

## 11. Fora de escopo (esta v2)

- Atendimento automático IA substituindo o manual  
- Hard scrub LGPD multi-marca  
- Multi-canal paralelo (e-mail/IG) como motor principal  
- CRM completo de pipeline kanban desktop  

---

## 12. Critérios de aceite

- [ ] Toda ação de Resultado altera fase **e** agenda/cancela tarefa (ou remove)  
- [ ] `affiliate_lead` e `assignment` se comportam igual na cadência  
- [ ] Canal indisponível / não correspondente **não reaparecem** na fila do afiliado  
- [ ] Modal de follow-up mostra **instrução da fase**, não o copy de 1º contato  
- [ ] Aba Tarefas lista due de hoje com deep-link funcional  
- [ ] Converter gera cliente + tarefa pós-venda  
