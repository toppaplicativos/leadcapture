/**
 * HUMANIZATION ENGINE
 * Elimina padrões robóticos da resposta final.
 * Atua em duas frentes:
 *   1. Instruções fortes no prompt do Composer
 *   2. Post-processor que rejeita ou aciona retry quando detecta clichês ou repetição
 */

/** Frases bloqueadas. Aparecer qualquer uma = reescrever. */
export const BANNED_PHRASES: string[] = [
  "fico à disposição",
  "estou à disposição",
  "permaneço à disposição",
  "estarei à disposição",
  "qualquer dúvida estou aqui",
  "qualquer dúvida estou à disposição",
  "como posso ajudar?",
  "em que posso ajudar?",
  "em que posso ser útil?",
  "como posso te ajudar?",
  "agradeço o contato",
  "agradecemos seu contato",
  "agradeço o seu contato",
  "agradeço pelo contato",
  "obrigado por entrar em contato",
  "obrigada por entrar em contato",
  "ficamos à disposição",
  "qualquer dúvida é só chamar",
  "qualquer coisa é só falar",
];

/** Aberturas que viram tique se repetidas. Composer deve variar. */
export const REPETITIVE_OPENERS: string[] = [
  "olá!",
  "oi,",
  "perfeito!",
  "ótimo!",
  "claro!",
  "com certeza!",
  "entendi!",
  "que bom",
];

export interface HumanizationCheckResult {
  ok: boolean;
  issues: string[];
  suggestions: string[];
}

/**
 * Auditoria pós-resposta. Retorna issues acionáveis.
 * O agente pode usar esse resultado para gerar uma retry com correções específicas.
 */
export function auditHumanization(
  text: string,
  lastOutgoingMessages: string[] = []
): HumanizationCheckResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const normalized = text.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (normalized.includes(phrase)) {
      issues.push(`Frase clichê detectada: "${phrase}"`);
      suggestions.push(`Remova "${phrase}" e termine com algo concreto ou uma pergunta específica.`);
    }
  }

  /* Repetição da abertura em relação ao turn anterior */
  if (lastOutgoingMessages.length > 0) {
    const lastReply = String(lastOutgoingMessages[lastOutgoingMessages.length - 1] || "").trim().toLowerCase();
    const lastOpener = lastReply.split(/[\.\!\?\n]/)[0]?.trim().slice(0, 40) || "";
    const thisOpener = normalized.split(/[\.\!\?\n]/)[0]?.trim().slice(0, 40) || "";
    if (lastOpener && thisOpener && lastOpener === thisOpener) {
      issues.push(`Abertura idêntica à resposta anterior: "${thisOpener}"`);
      suggestions.push("Comece de forma diferente. Não repita a mesma saudação ou expressão de transição.");
    }
  }

  /* Excesso de emojis (mais que 3) */
  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F6FF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emojiCount > 3) {
    issues.push(`Excesso de emojis (${emojiCount})`);
    suggestions.push("Use no máximo 2 emojis, e apenas se realmente agregar.");
  }

  /* Markdown leaked */
  if (/\*\*|__|^#{1,6}\s/m.test(text)) {
    issues.push("Markdown detectado (asteriscos duplos, hashtags) — WhatsApp não renderiza");
    suggestions.push("Escreva texto puro. Para ênfase use *único asterisco* (negrito WhatsApp).");
  }

  /* Lista numerada longa */
  const numberedLines = (text.match(/^\s*\d+[\.\)]\s/gm) || []).length;
  if (numberedLines > 4) {
    issues.push("Lista numerada longa demais para WhatsApp");
    suggestions.push("Reduza para no máximo 3 itens ou transforme em prosa curta.");
  }

  return {
    ok: issues.length === 0,
    issues,
    suggestions,
  };
}

export const HUMANIZATION_INSTRUCTIONS = `
PROTOCOLO DE NATURALIDADE HUMANA (regras absolutas para a resposta final):

PROIBIDO ESCREVER (frases clichê de SAC):
- "fico à disposição" / "estou à disposição" / "ficamos à disposição"
- "como posso ajudar?" / "em que posso ajudar?"
- "agradeço o contato" / "obrigado por entrar em contato"
- "qualquer dúvida é só chamar"

VARIAÇÃO OBRIGATÓRIA:
- NUNCA comece a resposta com a mesma palavra/expressão da resposta anterior
- Varie aberturas: às vezes vá direto ao ponto, sem saudação
- Varie fechamentos: nem toda mensagem precisa de pergunta no final

TOM:
- Escreva como alguém experiente e seguro escreveria pelo WhatsApp para um amigo cliente
- Pessoal, mas profissional. Sem formalidade artificial.
- Use contrações naturais ("tá", "pra", "vc") apenas se o tom da marca permitir — caso contrário pt-BR natural
- Frases curtas. Quebra de linha quando ajuda leitura no celular.

CONCRETUDE:
- Sempre que possível, cite o produto/serviço/preço específico em vez de generalidades
- Se faltar info, admita: "deixa eu confirmar e te volto"
- NUNCA invente prazo, preço, estoque ou promoção
- Próximo passo claro mas natural — não force "CTA"

EVITE:
- Markdown (** ou __) — WhatsApp não renderiza
- Listas numeradas com mais de 3 itens
- Mais de 2 emojis na mesma mensagem
- Repetir nome do cliente artificialmente em toda resposta
`.trim();
