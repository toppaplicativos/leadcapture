# Gate final de operação dos afiliados — 09/08/2026

## Resultado

O código corrigido foi compilado, publicado e verificado em produção. O serviço de API está saudável, o banco responde, o frontend carrega o workspace autenticado e os deeplinks/catálogo de afiliados estão coerentes.

O sistema ainda não deve ser declarado automaticamente disponível para venda comercial. A razão restante não é uma falha técnica genérica: existem decisões operacionais e comerciais que precisam de um responsável, além de uma fila antiga que precisa ser classificada antes de qualquer ação destrutiva.

## Evidência de dados em produção

Auditoria somente leitura da marca `alhopronto`:

- fila: 1.387 itens `assigned`, 633 `pending` e 563 `filtered_out`;
- os 1.387 itens `assigned` têm atribuição existente; não foram encontrados órfãos de fila atribuída;
- os 633 itens `pending` são antigos: 629 têm mais de 7 dias;
- 527 itens pendentes vêm de `rehab_old_campaign_sequence`;
- 142 itens dessa sequência estão pendentes por `Nenhum afiliado elegível no momento`;
- 367 atribuições abertas continuam em `assigned_to_affiliate` sem contato registrado; 335 vieram de `panfleteiro_capture_batch`;
- não foi encontrado item novo em estado `assigned_to_affiliate` com ação de contato ou interação registrada;
- existem duas regras habilitadas para a marca, uma padrão e uma ligada ao programa, com requisitos de WhatsApp diferentes. Isso precisa de decisão explícita sobre qual política vale para cada campanha.

Interpretação: os números caracterizam backlog operacional e configuração potencialmente divergente, não uma base que possa ser “corrigida” em lote sem risco de perder oportunidades, reabrir contatos ou disparar mensagens indevidas.

## Ação segura recomendada

1. O responsável pelo programa deve classificar a sequência `rehab_old_campaign_sequence`: encerrar, reabrir ou manter em retry.
2. O responsável deve definir a regra canônica de elegibilidade de WhatsApp para a marca e para o programa.
3. A equipe deve revisar os 367 contatos sem primeiro contato por lote, priorizando os 335 do lote de captura.
4. Só depois da decisão deve ser executada uma operação idempotente e auditável de encerramento, re-enfileiramento ou atribuição.

Nenhuma dessas mutações foi executada automaticamente nesta auditoria.

## Snapshot e recuperação

Snapshot de código e artefatos criado no VPS:

`/root/leadcapture/snapshots/leadcapture_20260809_152732.tar.gz`

Checksum SHA-256 verificado no servidor:

`/root/leadcapture/snapshots/leadcapture_20260809_152732.tar.gz.sha256`

O snapshot cobre código e artefatos de deploy. Ele não substitui backup/restauração do banco. O teste de restore de banco em staging continua obrigatório antes da venda comercial.

## Procedimento de rollback

- preservar o snapshot e seu checksum;
- colocar o serviço em janela controlada;
- restaurar somente após confirmar o alvo, a versão e a compatibilidade do banco;
- reiniciar os processos `leadcapture-api` e `leadcapture-web`;
- validar `/api/health`, login, `/assistente`, distribuição e ausência de chunks quebrados;
- registrar o resultado e os IDs das mudanças.

Não foi executado rollback, pois o deploy atual está saudável e não existe incidente que justifique uma operação destrutiva.

## Decisão de release

- **Deploy técnico:** aprovado.
- **Integridade básica de fila:** aprovada para dados atribuídos; sem órfãos atribuídos.
- **Operação de fila:** pendente de classificação do backlog antigo.
- **Venda comercial:** bloqueada até a assinatura dos gates comerciais, legais, financeiros, de backup/restore e do fluxo autenticado completo.
