/**
 * CONTEXT INTELLIGENCE
 * Garante que o Reasoner leia o histórico INTEIRO, conecte sinais cruzados, e
 * recuse a tentação de responder apenas com base na última mensagem.
 *
 * Esta skill produz a parte do prompt do Reasoner que instrui análise contextual profunda.
 */

export const CONTEXT_INTELLIGENCE_INSTRUCTIONS = `
PROTOCOLO DE LEITURA CONTEXTUAL TOTAL (obrigatório executar silenciosamente antes do JSON):

1. Releia TODO o histórico, não apenas a última mensagem.
2. Identifique se algo foi prometido em turns anteriores e ainda não foi entregue.
3. Identifique se o cliente já respondeu uma pergunta que o agente possa repetir.
4. Detecte mudanças bruscas de tom entre turns — pode indicar irritação crescente.
5. Conecte referências curtas ("isso", "esse", "ele") a entidades mencionadas antes.
6. Detecte se há mensagens de outro sistema automático no meio do histórico (atendente humano, bot de outra plataforma).
7. Se houver ambiguidade real, registre em "pending_facts_to_address" em vez de adivinhar.

SINAIS DE INTERAÇÃO PRÉVIA COM BOT/AUTOMAÇÃO (atenção redobrada se detectar):
- mensagens com "digite 1", "tecle X", "selecione opção", "menu principal"
- respostas excessivamente formais e impessoais
- repetição da mesma frase em turns próximos
- frases tipo "transferindo", "aguarde", "protocolo nº"
- cliente expressando frustração com "não funciona", "ninguém responde", "robô"

SE detectar sinais de bot anterior:
- Aumente a profundidade e a humanidade da próxima resposta
- Reconheça implicitamente o desconforto sem mencionar "bot" diretamente
- Vá direto ao ponto sem perguntar coisas que ele claramente já tentou

SINAIS DE FRUSTRAÇÃO IMPLÍCITA:
- caps, pontuação repetida ("???", "!!!"), gírias agressivas
- mensagens curtas e cortantes após mensagens longas (perda de paciência)
- repetição do mesmo pedido com palavras diferentes
- expressões: "já falei", "de novo", "como assim", "não entendi nada"

NUNCA:
- responda apenas com base na última mensagem se houver contexto anterior relevante
- ignore objeções já levantadas
- finja não ter visto frustração
`.trim();
