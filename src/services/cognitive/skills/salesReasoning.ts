/**
 * SALES STRATEGIC REASONING
 * Conduz comercialmente sem parecer vendedor artificial.
 * Mapeia estágio do funil → playbook curto de próxima ação,
 * que vai pro Reasoner e influencia "response_strategy".
 */

import { FunnelStage } from "../types";

interface PlaybookEntry {
  signals: string;        /* O que indica este estágio */
  goal: string;           /* Objetivo desta resposta */
  do: string[];           /* Ações recomendadas */
  avoid: string[];        /* Ações que matam o turn */
}

export const FUNNEL_PLAYBOOK: Record<FunnelStage, PlaybookEntry> = {
  awareness: {
    signals: "Curiosidade inicial, primeira mensagem, exploração sem comprometimento",
    goal: "Despertar interesse mostrando entendimento + abrir canal para qualificação",
    do: [
      "Demonstrar entendimento rápido do que ele pode estar buscando",
      "Trazer 1 informação concreta valiosa (não vaga)",
      "Fazer no máximo 1 pergunta para descobrir contexto real",
    ],
    avoid: ["Listar todo catálogo", "Pedir dados pessoais antes de criar valor", "Empurrar venda direta"],
  },
  consideration: {
    signals: "Comparando opções, fazendo perguntas técnicas, mencionando concorrentes",
    goal: "Posicionar diferencial real do produto + reduzir incerteza",
    do: [
      "Responder a pergunta exata sem rodeios",
      "Trazer 1 diferencial concreto do produto certo do catálogo",
      "Oferecer próxima informação útil (variação, prova social, política) sem ser invasivo",
    ],
    avoid: ["Falar mal de concorrentes", "Discurso de venda genérico", "Listar features sem amarrar a benefício"],
  },
  decision: {
    signals: "Pediu preço, perguntou como comprar, mostrou intenção clara de fechar",
    goal: "Remover última fricção e direcionar para a ação de compra",
    do: [
      "Confirmar o que ele quer com precisão (item + variação + qtd)",
      "Trazer próximo passo claro (link, pagamento, endereço de entrega)",
      "Adicionar urgência apenas se for legítima (estoque baixo de verdade)",
    ],
    avoid: ["Reabrir comparações", "Adicionar nova oferta cruzada que pode confundir", "Tom apressado/desesperado"],
  },
  objection: {
    signals: "Disse 'mas', 'porém', 'caro', 'não sei', 'depois', 'vou pensar'",
    goal: "Validar a objeção sem combatê-la, depois oferecer ângulo novo",
    do: [
      "Reconhecer a objeção em 1 frase antes de responder ('faz sentido perguntar isso...')",
      "Trazer dado/fato/garantia que neutralize a preocupação",
      "Reduzir o risco percebido (parcelamento, troca, prova social específica)",
    ],
    avoid: ["Discordar diretamente", "Repetir argumento de venda anterior", "Ignorar a preocupação"],
  },
  post_purchase: {
    signals: "Já comprou — está perguntando sobre status, uso, suporte pós-venda",
    goal: "Resolver com agilidade + reforçar percepção positiva da escolha que ele fez",
    do: [
      "Confirmar identificação do pedido se possível",
      "Resolver ou prometer prazo concreto",
      "Demonstrar cuidado real (não roteiro)",
    ],
    avoid: ["Oferecer upsell antes de resolver o problema atual", "Respostas genéricas tipo FAQ"],
  },
  support: {
    signals: "Dúvida operacional sem intenção comercial clara (endereço, horário, política)",
    goal: "Resolver a dúvida + identificar se há interesse latente",
    do: [
      "Responder a dúvida com precisão",
      "Se fizer sentido, conectar suavemente à oferta",
    ],
    avoid: ["Forçar venda quando a pergunta é puramente operacional"],
  },
  noise: {
    signals: "Mensagem sem sentido, áudio sem transcrição, sticker, teste",
    goal: "Reabrir conversa sem parecer perdido",
    do: ["Responder de forma humana e breve, pedindo para detalhar quando relevante"],
    avoid: ["Tom robótico tipo 'não entendi sua mensagem'"],
  },
};

export function buildSalesPlaybookBlock(): string {
  const lines = ["PLAYBOOK COMERCIAL POR ESTÁGIO DO FUNIL (use como referência ao definir response_strategy):"];
  for (const [stage, entry] of Object.entries(FUNNEL_PLAYBOOK)) {
    lines.push(`\n[${stage}] sinais: ${entry.signals}`);
    lines.push(`  meta: ${entry.goal}`);
    lines.push(`  faça: ${entry.do.join(" / ")}`);
    lines.push(`  evite: ${entry.avoid.join(" / ")}`);
  }
  return lines.join("\n");
}

export function playbookForStage(stage: FunnelStage): PlaybookEntry {
  return FUNNEL_PLAYBOOK[stage] || FUNNEL_PLAYBOOK.awareness;
}
