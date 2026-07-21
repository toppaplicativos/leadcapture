# Smoke checklist — Atendimento / Tarefas (afiliado)

Use após deploy ou mudança de cadência. Marque cada item.

## Pré-requisitos
- [ ] Login no app afiliado com marca ativa
- [ ] Pelo menos 1 contato em aberto **ou** pool com oportunidades
- [ ] WhatsApp conectado (ideal) ou número no contato

## 1. Fila de Tarefas (API-only)
- [ ] Aba **Oportunidades → Tarefas** carrega sem fallback de “oportunidades”
- [ ] Chips **Todas / Atrasadas / Hoje / Próximas** filtram a lista
- [ ] Badge numérico na tab **Tarefas** quando há due/atrasadas
- [ ] Empty state “Tudo em dia” se não houver pending

## 2. Execução de tarefa (modal diretor)
- [ ] Toque numa tarefa abre modal de **Tarefa** (não só ficha de contato)
- [ ] Chips de template: 1ª mensagem / Follow-up / Proposta
- [ ] **Abrir mensagem** abre WhatsAppSendModal com template certo
- [ ] Após **Enviado**, modal **permanece aberto** e pede resultado
- [ ] Resultado “Respondeu / Sem resposta / …” fecha e agenda próxima tarefa

## 3. Complete task no backend
- [ ] Após resultado, tarefa some da lista (status `done`)
- [ ] Nova tarefa (se cadência) aparece com `due_at` futuro
- [ ] Deep-link `?tab=tarefas&task=<uuid>` abre a tarefa certa

## 4. Contatos → Executar tarefa
- [ ] Em **Contatos**, abrir ficha com follow-up due
- [ ] Banner **Executar →** abre modal de tarefa
- [ ] Preferência: usa task real da API se existir

## 5. Confirmações destrutivas
- [ ] “Sem interesse” / “Canal morto” pedem confirmação antes de arquivar
- [ ] Cancelar na confirmação não altera o contato

## 6. Offline
- [ ] Com rede cortada, registrar resultado → toast “Salvo no aparelho”
- [ ] Banner de pendentes no hub; toque sincroniza ao voltar online
- [ ] `task_id` (se houver) vai na fila e no flush

## 7. Ficha vs Tarefa
- [ ] Claim em **Novas** abre ficha de contato
- [ ] Follow-up do dia abre modal de tarefa
- [ ] “Ver ficha do contato” no modal de tarefa troca para ficha

## API rápida (opcional)
```bash
# Lista tarefas
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/api/affiliate-app/attendance/tasks?horizon_days=14" | jq .summary

# Progress com task_id
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"no_answer","task_id":"<uuid>"}' \
  "$API/api/affiliate-app/opportunities/affiliate_lead/<refId>/progress"
```
