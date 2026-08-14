# Auditoria sistemática do LeadCapture e checklist de prontidão comercial

**Data:** 2026-08-09  
**Escopo:** backend, frontend, rotas, persistência, autenticação, distribuição e atendimento de afiliados, design system, responsividade, legado, integrações e prontidão para venda.  
**Conclusão executiva:** o produto compila, mas **não deve ser declarado funcional/completo nem liberado para venda em escala neste momento**. O principal bloqueio está no domínio de afiliados: há mais de uma fonte de verdade, dois executores de atendimento e efeitos diferentes para a mesma ação. Isso permite que a interface mostre um estado diferente do que a fila, a cadência, a comissão ou o pós-venda realmente registraram.

## 1. Como a auditoria foi feita

### Evidências verificadas

- Inventário das superfícies, rotas, módulos frontend e rotas/serviços backend.
- Leitura do contrato de identidade, protocolo de programa de afiliados, plano de atendimento manual e smoke checklist.
- Inspeção de código dos fluxos de programa, candidatura, onboarding, distribuição, claim, contato, tarefas, cadência, conversão, comissões e fila offline.
- Inspeção visual read-only em produção da área administrativa de afiliados e da entrada pública da Central do Afiliado.
- Verificação visual da entrada mobile da Central do Afiliado em 390×844.
- `npm run typecheck`, `npm run typecheck:fe`, `npm run build` no backend e `npm run build` no frontend: **passaram**.

### Limites da evidência

- Não foram enviados WhatsApp, Instagram, e-mail, push, cobrança ou saque real.
- Não foram executadas rotinas de smoke que criam e removem contatos/sessões em produção.
- Não houve prova autenticada completa de afiliado executando toda a jornada em dispositivo real.
- Portanto, build verde não equivale a aceite funcional, financeiro, LGPD ou operacional.

## 2. Veredito por superfície

| Superfície | Situação atual | Bloqueio para venda |
|---|---|---|
| App administrativo / org | **Amarelo** | Muitos módulos, estados e integrações; precisa certificação por permissão, marca e operação real. |
| Central do Afiliado | **Vermelho** | Divergência entre ficha, tarefa, fila offline, conversão e cadência. É o bloqueio prioritário. |
| Parceiros / marketplace | **Amarelo-vermelho** | Jornada candidato → aprovação → onboarding → programa não tem aceite E2E comprovado em todos os estados. |
| Distribuição de contatos | **Vermelho** | Autoatribuição, pool aberto, claim, reciclagem e supressão convivem sem transação/contrato único comprovado. |
| Atendimento / tarefas | **Vermelho** | Dois workspaces e efeitos otimistas diferentes para as mesmas ações. |
| Financeiro de afiliados | **Amarelo-vermelho** | Conversão por assignment e por `affiliate_lead` não produz o mesmo vínculo de venda, comissão e pós-venda. |
| Catálogo / loja / checkout | **Amarelo** | Compila, mas exige regressão de preço, moeda, estoque, pedido, afiliado e marca. |
| Estoque / Mob / entregas | **Amarelo** | Contratos de identidade e pedidos existem, mas faltam provas E2E completas e mobile autenticadas. |
| IA, campanhas, automações e fluxos | **Amarelo-vermelho** | Há múltiplos motores e legado; risco de duplicação de mensagens e efeito concorrente. |
| Master / governança | **Amarelo** | RBAC e entitlements existem, mas precisam matriz de isolamento e smoke por tenant. |
| Design system | **Amarelo-vermelho** | Tokens existem, porém há deriva de cor, gradientes, linguagem, densidade e navegação entre apps. |
| Operação/deploy | **Amarelo** | Há servidor legado paralelo, compatibilidade de dialetos e artefatos de desenvolvimento no workspace. |

## 3. Bloqueadores críticos encontrados

### AFD-001 — Duas implementações para o mesmo trabalho operacional — P0

**Evidência:** `AffiliateAttendanceWorkspace` é usado para ficha/contato e `AffiliateTaskWorkspace` para tarefas, ambos acionados a partir de `AffiliateContactsPage` e `AffiliateOpportunitiesHub`.

**Risco:** uma ação feita pela ficha pode fechar e trocar a aba de forma diferente da ação feita pela tarefa; cada caminho mantém estado local, mensagens, patches e regras próprias. O afiliado não tem uma máquina operacional única.

**Critério de aceite:** existir um executor canônico de contato/tarefa, com modo explícito (`first_contact`, `follow_up`, `proposal`, `post_sale`), contrato de entrada e resposta único; ficha e tarefa apenas abrem o mesmo executor.

### AFD-002 — Conversão não é semanticamente igual nos dois tipos de contato — P0

**Evidência:** `AffiliateAttendanceWorkspace.tsx` chama `convertDistributionAssignment` para `assignment`, mas chama `updateLead` para `affiliate_lead`. O método `updateAffiliateLead` atualiza apenas `affiliate_status` e `affiliate_notes`. Já a conversão de assignment passa por `convertAssignment`, registra venda quando recebe dados do pedido e tenta criar tarefa de pós-venda.

**Risco:** a interface confirma “Cliente registrado · pós-venda em 2 dias”, mas um `affiliate_lead` pode não criar cliente, venda, comissão, ação de auditoria nem tarefa `post_sale`.

**Critério de aceite:** qualquer origem de oportunidade precisa chamar o mesmo serviço transacional de conversão, que registre: contato/cliente, vínculo de venda ou pedido, comissão pendente, mudança de status, ação de atendimento, tarefa pós-venda, auditoria e resposta idempotente.

### AFD-003 — Conversão otimista fecha a ficha antes da confirmação — P0

**Evidência:** `AffiliateAttendanceWorkspace.convert()` emite o patch otimista e chama `onClose()` antes de aguardar a API.

**Risco:** se a API falhar, a ficha desaparece e o cache local pode representar conversão inexistente; o afiliado recebe erro depois que perdeu o contexto para corrigir.

**Critério de aceite:** ação comercial irreversível somente sai da lista após confirmação do servidor; falha deve manter a ficha aberta, mostrar o estado de retry e permitir reconciliação.

### AFD-004 — `channel_unavailable` contraditório entre backend e executor de tarefa — P0

**Evidência:** o backend devolve `removed_from_queue`, `channel_exhausted` e `remaining_channels`, preservando o contato quando outro canal existe. O patch local considera todo `channel_unavailable` uma saída; o `AffiliateTaskWorkspace` usa mensagem de “contato excluído” e não decide com base em `remaining_channels`.

**Risco:** o contato pode ser removido visualmente quando ainda deveria seguir para telefone ou WhatsApp; o algoritmo de distribuição perde a sequência de canais.

**Critério de aceite:** o estado visual deve ser derivado exclusivamente da resposta canônica do servidor. “Canal indisponível” só arquiva quando `channel_exhausted=true`; caso contrário cria a próxima tentativa no canal restante.

### AFD-005 — Fila offline sem reconciliação de versão/idempotência — P0

**Evidência:** `flushProgressQueue()` reenvia cada ação armazenada até oito tentativas; a fila carrega `ref_type`, `ref_id`, payload e tentativas, mas não carrega versão do estado, `event_id` idempotente, hash da transição ou resposta já conciliada. O cache local tem patch otimista separado.

**Risco:** a mesma ação pode ser realizada online e depois reaplicada offline; ações fora de ordem podem alterar cadência, contador C1–C8 ou arquivamento. O usuário pode ver “salvo no aparelho” sem resolver conflito.

**Critério de aceite:** cada comando tenha `client_event_id`, `expected_state_version`, ordem por contato e resultado idempotente no backend. Conflito deve virar item de reconciliação visível, nunca descarte silencioso.

### AFD-006 — Distribuição e claim sem transação de ponta a ponta — P0

**Evidência:** `processQueue()` e `claimQueueItemForAffiliate()` atualizam fila, inserem `prospect_assignments`, atualizam contadores, alteram cliente, disparam mensagem e criam alerta em chamadas separadas. Há uma trava por `UPDATE ... queue_status`, mas não foi encontrada transação envolvendo todos os efeitos.

**Risco:** uma falha entre insert, atualização de fila, mensagem ou alerta pode gerar assignment órfão, fila presa em `processing`, contador incorreto, mensagem sem atendimento ou atendimento sem mensagem.

**Critério de aceite:** claim e auto-distribuição devem ter unidade transacional para a posse da oportunidade; envio externo deve usar outbox idempotente, com estados `pending/sent/failed`, retry e compensação. Deve existir job de recuperação de itens `processing` expirados.

### AFD-007 — Duas entidades de oportunidade sem contrato de convergência — P0

**Evidência:** o sistema usa `affiliate_leads` e `prospect_assignments`; o resolvedor de oportunidade trata os dois caminhos; cadência e persistência alternam nomes/status/campos; o protocolo documenta a configuração legada e o programa moderno simultaneamente.

**Risco:** filtros, métricas, conversão, follow-up e financeiro podem contar o mesmo contato de formas diferentes.

**Critério de aceite:** definir uma entidade canônica de oportunidade/atendimento ou uma view de domínio única com adaptadores temporários. Toda API deve devolver o mesmo envelope e os mesmos códigos de estado, independentemente da origem legada.

### AFD-008 — Programa legado e programa moderno coexistem — P1

**Evidência:** `affiliate_program_config` continua sendo lido/escrito ao lado de `affiliate_programs`; existem `sync-legacy`, `syncLegacyDefaultProgram` e reabertura de onboarding legado.

**Risco:** admin pode editar uma tela e o afiliado consumir outra configuração; comissão, termos, visibilidade e status podem divergir.

**Critério de aceite:** `affiliate_programs` ser a fonte única; compatibilidade legada somente em adaptador versionado, com telemetria de uso, plano de migração e data de remoção. Uma marca/programa deve ter um único status publicável.

### AFD-009 — Estado “programa pronto” não impede publicação em contexto incompleto — P1

**Evidência live:** a área administrativa de afiliados exibiu “Prontidão do programa: 2/10 críticos, 2/16 itens, 13% completo”, sem marca selecionada e com comissão, PIX, termos, políticas e orientação pendentes.

**Risco:** link de candidatura, distribuição ou divulgação pode ser liberado sem condições comerciais, legais e financeiras mínimas.

**Critério de aceite:** um gate de publicação bloquear candidatura, pool e divulgação quando faltar qualquer requisito crítico; o bloqueio deve explicar o item, responsável e ação necessária.

### AFD-010 — Entrada mobile da Central do Afiliado tem clipping — P1

**Evidência live:** em viewport 390×844, o segundo tab “Criar conta” ficou cortado dentro do seletor Entrar/Criar conta.

**Risco:** candidato mobile não consegue compreender ou selecionar o cadastro; perda direta no funil comercial.

**Critério de aceite:** entrada renderizada em 320, 360, 390, 412 e 768 px, sem clipping horizontal, com tabs acessíveis por teclado/leitor e alvo mínimo de 44 px.

### AFD-011 — Servidor legado paralelo — P1

**Evidência:** `src/index.ts` é o servidor moderno iniciado pelo `package.json`; `src/server.ts` ainda inicia outro Express na porta 3001 com subconjunto antigo de rotas e static public.

**Risco:** deploy, diagnóstico, documentação ou processo operacional pode iniciar a aplicação errada; endpoints antigos podem divergir em autenticação, CORS, dados e comportamento.

**Critério de aceite:** um único entrypoint de produção; servidor legado removido, isolado como ferramenta histórica ou explicitamente marcado como não executável. Health/version devem identificar commit, processo, build e conjunto de rotas.

### AFD-012 — Compatibilidade MySQL/Postgres e bootstrap de schema em runtime — P1

**Evidência:** o acesso principal usa `pg`, mas existe normalização de SQL MySQL/Postgres e dependência `mysql2`; vários serviços fazem `CREATE TABLE`/`ALTER TABLE` em caminhos de execução.

**Risco:** diferenças de dialeto, índices, defaults e concorrência podem aparecer somente em produção; startup e primeira chamada podem ter efeitos de schema inesperados.

**Critério de aceite:** migrations versionadas e aplicadas no deploy; queries em um dialeto; nenhum `CREATE/ALTER` em request path crítico; teste contra o mesmo Postgres de produção.

### AFD-013 — Deriva visual e de tokens — P1

**Evidência:** o DS define neutros, azul de sistema, acento de marca, escala fixa e regra sem gradiente roxo no admin; o scan encontrou uso amplo de violet/indigo, gradients e `#3b82f6` em áreas administrativas e de afiliado. O login do afiliado usa composição visual própria com roxo/dourado e gradientes.

**Risco:** o sistema parece um conjunto de apps sem hierarquia; cores passam a carregar significado diferente em cada tela e reduzem confiança operacional.

**Critério de aceite:** inventário de tokens e lint/CI para cores fora do DS; cor semântica definida por estado, marca somente em superfície de marca; no máximo uma ação primária por tela; foco, contraste, loading, empty, error e success padronizados.

### AFD-014 — Automação fragmentada — P1

**Evidência:** `docs/FLOWS_MODULE.md` registra quatro sistemas de automação além de campanhas, inbox e atendimento cognitivo; o próprio documento registra risco de double-reply e matriz E2E ainda incompleta.

**Risco:** o mesmo evento pode disparar fluxo, automação, sequência legada, catálogo ou IA; difícil explicar, pausar, auditar e reprocessar.

**Critério de aceite:** catálogo de gatilhos e prioridades único, chave de idempotência por evento, owner de cada runtime, suppressor global e timeline que mostre qual motor decidiu e por quê.

## 4. Fluxo canônico que precisa existir

```text
Programa em rascunho
  → validação comercial/legal/financeira
  → publicação de uma versão imutável
  → candidato cria conta
  → candidatura
  → aprovação ou rejeição auditada
  → onboarding versionado
  → termos/políticas/orientação/treino concluídos
  → PIX e elegibilidade validados
  → afiliado ativo
  → contato entra na fila
  → claim/autoatribuição atômico
  → primeira tentativa por canal
  → resultado canônico
  → próxima tarefa e prazo
  → conversão transacional
  → pedido/venda/comissão
  → pós-venda
  → aprovação financeira
  → saque, estorno e auditoria
```

### Fonte única de verdade recomendada

| Domínio | Fonte canônica exigida | Não deve ser fonte de decisão |
|---|---|---|
| Programa | `affiliate_programs` + versão publicada | configuração legada sem versão |
| Candidato | aplicação + enrollment | estado inferido da tela |
| Afiliado | perfil + credencial + status por marca/programa | apenas `users.role` |
| Oportunidade | entidade/view canônica com `ref_type` adaptado | leitura separada sem envelope comum |
| Posse | assignment/claim com evento idempotente | cache local |
| Atendimento | ação append-only + estado materializado | patch otimista |
| Cadência | tarefa persistida e versão da régua | cálculo de datas no frontend |
| Conversão | serviço transacional único | update simples de status |
| Comissão | evento de venda + ledger | valor calculado só na UI |
| Comunicação | outbox por canal | envio dentro de request sem retry |
| Auditoria | timeline append-only | toast |

## 5. Checklist detalhado de aceitação

Marcar um item somente com evidência anexada: ambiente, usuário/tenant, timestamp, rota, request/response, screenshot ou log. “Compilou” não marca item E2E.

### 5.1 Produto, tenancy e identidade

- [ ] Cada app tem público, objetivo, entrada, saída e owner definidos.
- [ ] Existe matriz de papéis: master, dono da organização, operador, estoque, afiliado, parceiro e consumidor.
- [ ] Usuário de uma marca não acessa dados de outra por URL, query, header ou token adulterado.
- [ ] `brand_id`, `owner_user_id`, `program_id` e `affiliate_id` são validados no backend em toda mutação.
- [ ] Convites, candidatura, aprovação, suspensão e reativação são auditados.
- [ ] Logout revoga/descarta sessão, caches e filas sensíveis do tenant anterior.
- [ ] Links públicos não revelam IDs internos ou dados de outros clientes.
- [ ] Dados pessoais e opt-out têm retenção, exportação e exclusão verificáveis.

### 5.2 Programa de afiliados: criação e publicação

- [ ] Criar programa em rascunho sem publicar parcialmente.
- [ ] Definir slug único, marca, produtos/ofertas e versão.
- [ ] Definir comissão por modelo, produto, unidade, moeda e regra de arredondamento.
- [ ] Definir cookie/atribuição e regra de conflito entre afiliados.
- [ ] Definir prazo, mínimo e método de pagamento.
- [ ] Definir termos, políticas, LGPD, orientação e treinamento obrigatório.
- [ ] Definir elegibilidade: status, PIX, WhatsApp, treinamento, regiões e limites.
- [ ] Definir materiais, links, cupons e mídia oficial.
- [ ] Validar todos os campos críticos antes de publicar.
- [ ] Publicar snapshot imutável com número de versão.
- [ ] Impedir alteração retroativa de termos/comissão consumidos por inscrições existentes.
- [ ] Despublicar pausa novas candidaturas/distribuição sem apagar histórico.
- [ ] Mostrar readiness por item, responsável, prazo e bloqueio.

### 5.3 Candidato, aprovação e onboarding

- [ ] Cadastro público funciona em desktop e mobile.
- [ ] E-mail duplicado, marca inválida, programa inativo e convite expirado têm mensagens acionáveis.
- [ ] Candidatura tem status pending/approved/rejected/withdrawn.
- [ ] Aprovação gera enrollment no programa correto, sem duplicação.
- [ ] Rejeição registra motivo e não libera links, materiais ou pool.
- [ ] Onboarding é sequencial quando há etapas obrigatórias.
- [ ] Aceite de termos registra timestamp, versão, IP/metadata permitida e vínculo de usuário.
- [ ] Conclusão de treinamento libera somente o que a regra permite.
- [ ] PIX pode ser cadastrado, validado, alterado e bloqueado para saque quando incompleto.
- [ ] Suspensão/revogação remove elegibilidade da distribuição e preserva histórico.
- [ ] Reativação não duplica enrollment, link, cupom ou comissão.

### 5.4 Fila, distribuição e claim

- [ ] Entrada de contato tem origem, consentimento/base legal, telefone normalizado e tenant.
- [ ] Duplicação por telefone/e-mail/prospect é detectada antes da fila.
- [ ] Contato sem canal acionável fica filtrado com motivo, não desaparece.
- [ ] Regras de região/nicho/campanha são visíveis e testáveis.
- [ ] Pool aberto e autoatribuição têm prioridade e janela documentadas.
- [ ] Dois afiliados clicando simultaneamente resultam em um vencedor e uma resposta clara ao outro.
- [ ] Claim valida elegibilidade no momento da posse.
- [ ] Claim cria uma única posse exclusiva e incrementa contador uma vez.
- [ ] Falha após claim não deixa fila em `processing` indefinidamente.
- [ ] TTL expira posse sem atividade e recicla com motivo.
- [ ] `release_phone_pool` registra exclusão da posse anterior, nova fila, motivo e perda de pontuação.
- [ ] Supressão de rede impede reentrada por outro afiliado quando aplicável.
- [ ] Admin consegue localizar cada contato por queue, assignment, afiliado e timeline.
- [ ] Métrica de fila distingue zero real, erro de banco e fallback.

### 5.5 Atendimento, canais e cadência

- [ ] Ficha e tarefa abrem o mesmo executor canônico.
- [ ] Primeiro contato, follow-up, proposta, fechamento e pós-venda têm instrução específica.
- [ ] WhatsApp mostra o destinatário, marca, template, canal e estado da conexão.
- [ ] Telefone abre discagem, mas exige registro manual explícito do resultado.
- [ ] Enviado/ligação não encerra o modal antes do resultado.
- [ ] Sem resposta, ocupado, voicemail, retorno solicitado e aguardando geram prazos previsíveis.
- [ ] `channel_unavailable` preserva o contato se houver canal remanescente.
- [ ] Canal esgotado pede confirmação e arquiva com motivo correto.
- [ ] “Não correspondente”, opt-out e sem interesse têm confirmação, trilha e regra de reentrada.
- [ ] Ação não altera status antes da confirmação da API.
- [ ] Resultado repetido é idempotente e não cria duas tarefas.
- [ ] Tarefa concluída some da fila e próxima tarefa aparece com `due_at` correto.
- [ ] Deep-link abre exatamente a tarefa pedida e valida posse.
- [ ] Tarefas atrasadas, hoje e próximas têm contagens coerentes entre dashboard e lista.
- [ ] Histórico mostra antes/depois, canal, usuário, nota e timestamp.

### 5.6 Offline e sincronização

- [ ] Offline é detectado sem confundir erro de API com ausência de rede.
- [ ] Cada evento tem ID idempotente, versão esperada e ordem por contato.
- [ ] Fila offline exibe quantidade, idade, erro e estado de sincronização.
- [ ] Reenvio não duplica ação, tarefa, comissão ou mensagem.
- [ ] Conflito de versão pede decisão/reconciliação.
- [ ] Logout/alteração de tenant limpa ou isola fila por usuário e marca.
- [ ] Limite de fila não descarta ação comercial sem aviso e exportação/recuperação.
- [ ] Falha permanente não é removida silenciosamente após tentativas.
- [ ] Teste de rede restaurada prova ordem e consistência do servidor.

### 5.7 Conversão, venda, comissão e pós-venda

- [ ] Assignment e `affiliate_lead` usam o mesmo contrato de conversão.
- [ ] Conversão cria/atualiza cliente sem duplicar pessoa.
- [ ] Pedido ou venda vincula programa, afiliado, contato e origem.
- [ ] Comissão fica `pending` até o evento definido pelo negócio.
- [ ] Cancelamento, refund, chargeback e pedido não pago revertem ou bloqueiam comissão.
- [ ] Conversão sem order ID tem regra explícita: lead qualificado ou venda real.
- [ ] Pós-venda cria tarefa com prazo e owner corretos.
- [ ] Duplo clique, retry e webhook repetido são idempotentes.
- [ ] Ledger financeiro permite explicar cada valor.
- [ ] Saque valida PIX, mínimo, saldo, status e aprovação.
- [ ] Falha de pagamento não marca saque como pago.
- [ ] Relatório admin e carteira do afiliado batem por período e programa.

### 5.8 Catálogo, divulgação e atribuição

- [ ] Link de afiliado abre marca/programa/produto correto.
- [ ] Cookie, query e sessão preservam atribuição sem sobrescrever indevidamente outra origem.
- [ ] Cupom é único, limitado ao programa e auditável.
- [ ] Produtos inativos não aparecem em materiais, links ou marketplace.
- [ ] Moeda e preço são explícitos; nenhum câmbio silencioso.
- [ ] Checkout mantém atribuição em desktop, mobile, refresh e retorno de pagamento.
- [ ] Pedido pago, cancelado e reembolsado atualiza atribuição e comissão.
- [ ] Materiais publicados carregam imagem, copy, link e permissões corretos.

### 5.9 Design system e UX

- [ ] Cada superfície usa tokens, componentes e estados do DS.
- [ ] Sem cores hardcoded fora de tokens sem justificativa documentada.
- [ ] Cor de marca não substitui cor semântica de erro, sucesso, alerta e ação.
- [ ] Admin não usa gradiente decorativo para comunicar ação ou estado.
- [ ] Há título, contexto, ação primária e caminho de retorno claros.
- [ ] Não existem duas telas com nomes diferentes para a mesma operação sem motivo.
- [ ] Alvos de toque têm pelo menos 44×44 px.
- [ ] Contraste, foco visível, labels e aria estão presentes.
- [ ] `prefers-reduced-motion` é respeitado.
- [ ] Loading, empty, error, partial/fallback, success e retry são estados desenhados.
- [ ] Layout testado em 320/360/390/412/768/1024/1280/1440 px.
- [ ] Nenhuma tab, botão, tabela, modal ou CTA sofre clipping ou overflow oculto.
- [ ] Teste real autenticado cobre desktop e mobile; snapshot isolado não basta.

### 5.10 APIs, dados, segurança e observabilidade

- [ ] OpenAPI/contratos de payload e códigos de erro publicados.
- [ ] Mutação retorna estado canônico completo, não apenas toast.
- [ ] Todas as mutações têm autorização por tenant/brand/program/affiliate.
- [ ] RLS ou equivalente de acesso é testado com usuário legítimo e usuário malicioso.
- [ ] Logs não expõem token, senha, PIX completo ou dados pessoais desnecessários.
- [ ] Request ID correlaciona frontend, API, worker e integração externa.
- [ ] Métricas de fila, erros, retries, double-send, conversão e comissão existem.
- [ ] Alertas distinguem indisponibilidade, dados incompletos, bloqueio comercial e bug.
- [ ] Jobs são duráveis, reentrantes e recuperáveis após restart.
- [ ] Outbox/webhook tem assinatura, idempotência e replay controlado.
- [ ] Backup e restore foram testados com dados anonimizados ou ambiente seguro.
- [ ] Migrações têm checksum, ordem, rollback/forward fix e relatório.

### 5.11 Comercial, suporte e operação

- [ ] Plano comercial define módulos, limites, preço, trial, suspensão e upgrade.
- [ ] Tenant novo consegue configurar marca, programa e primeiro fluxo sem intervenção manual.
- [ ] Dados de demonstração não vazam para tenant real.
- [ ] Existe documentação de onboarding para admin e afiliado.
- [ ] Existe FAQ de comissões, prazos, cancelamento, LGPD e suporte.
- [ ] Owner de produto, engenharia, financeiro e suporte está definido.
- [ ] Runbook de incidente cobre fila presa, mensagens duplicadas, comissão errada e vazamento.
- [ ] Deploy usa um único entrypoint e identifica build/commit.
- [ ] Rollback foi executado em staging.
- [ ] Health, readiness, version e migração são verificados após deploy.
- [ ] Domínios, TLS, CORS, cookies e service workers foram verificados por superfície.
- [ ] Não há credenciais históricas embutidas em scripts ou artefatos publicados.
- [ ] Termos comerciais, política de privacidade e base legal foram revisados.

## 6. Gates de “disponível para venda”

### Gate A — integridade do produto

Obrigatório: nenhum P0 aberto; zero divergência de estado entre UI, API e banco nos fluxos de afiliado; conversão e comissão idempotentes; tenant isolation comprovado.

### Gate B — jornada comercial completa

Obrigatório: programa novo criado, publicado, candidato aprovado, onboarding concluído, PIX validado, primeiro contato distribuído, atendimento realizado, conversão registrada, comissão calculada, saque simulado e cancelamento/reembolso testado.

### Gate C — experiência real

Obrigatório: prova autenticada desktop e mobile de admin, parceiro e afiliado; nenhuma tela crítica com clipping; estados de erro, offline, retry, empty e sucesso evidenciados.

### Gate D — operação segura

Obrigatório: migrations aplicadas, backup/restore provado, logs correlacionáveis, alertas ativos, worker recuperável, rollback testado e entrypoint único.

### Gate E — venda e suporte

Obrigatório: documentação, termos, suporte, limites, SLA, cobrança, política de comissão e responsabilidade por LGPD definidos.

**Regra final:** somente classificar como “disponível para venda comercial” quando todos os gates estiverem verdes. “Typecheck/build verde” é apenas pré-requisito técnico.

## 7. Ordem recomendada de correção

1. **P0 — Consolidar o domínio de afiliados:** fonte canônica de oportunidade, executor único, progress idempotente, conversão transacional e resposta baseada no servidor.
2. **P0 — Tornar distribuição recuperável:** transações/locks, outbox, TTL de `processing`, deduplicação e testes concorrentes.
3. **P0 — Fechar financeiro:** venda, comissão, refund, payout e ledger com contrato único.
4. **P1 — Remover deriva de legado:** programa/configuração, servidor paralelo, dialectos SQL e automações concorrentes.
5. **P1 — Certificar UX/DS:** mobile real, tokens, estados e navegação por app.
6. **P1 — Certificar segurança e observabilidade:** tenant isolation, auditoria, request ID, alertas e restore.
7. **P2 — Certificação comercial:** onboarding de tenant novo, documentação, suporte, staging, deploy e rollout controlado.

## 8. Evidência mínima que deve acompanhar a próxima aprovação

- Matriz de testes com resultado, ambiente, usuário, marca, programa e timestamp.
- Screenshots desktop/mobile dos fluxos críticos.
- Requests/responses de claim, progress, conversão, comissão e payout.
- Consulta de banco antes/depois de cada transição.
- Log correlacionado por request/event ID.
- Resultado de testes concorrentes de claim e retry offline.
- Resultado de cancelamento/refund e reconciliação financeira.
- Lista de P0/P1 fechados e exceções aprovadas pelo responsável do produto.

