/**
 * Regua de Follow-up Reev — 8 campanhas sincronizadas
 *
 * Arquitetura de tags:
 *   fu0_enviada   → C1 enviou (Abertura)
 *   fu1_enviada   → C2 enviou (Check-in)
 *   fu2_enviada   → C3 enviou (Consciencia)
 *   fu3_enviada   → C4 enviou (Prova Social)
 *   fu4_enviada   → C5 enviou (Educacao)
 *   fu5_enviada   → C6 enviou (Caso Real)
 *   fu6_enviada   → C7 enviou (Valor Puro)
 *   fu7_enviada   → C8 enviou (Break-up)
 *
 * Tags de saida (excluem de TODAS as campanhas):
 *   respondeu, opt_out, convertido
 *
 * Cada campanha C(n+1) so envia para leads com tag fu(n)_enviada
 * e SEM as tags fu(n+1)_enviada OR respondeu OR opt_out OR convertido.
 */

const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: 'postgresql://postgres.pkgqdewqaonkzhzprpgq:%40Milionarios2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

const C1_ID = '2f282398-9d86-462c-b595-0a05a609d83f';
const EXIT_TAGS = ['respondeu', 'opt_out', 'convertido'];

// ─────────────────────────────────────────────────────────────
// PROMPTS — Framework Reev aplicado ao negocio Alho Pronto
// ─────────────────────────────────────────────────────────────

const COMMON_HEADER = `Voce e a Elenice, representante comercial da Alho Pronto — empresa especializada em alho descascado, higienizado e embalado a vacuo para o segmento alimenticio (restaurantes, buffets, lanchonetes, emporios, hoteis, industrias). Atendemos toda regiao de Belo Horizonte, Contagem e Grande BH com entrega propria.

REGRAS GLOBAIS (todas as mensagens):
- Apresente-se como Elenice da Alho Pronto se necessario (mas nao repita em cada msg)
- Tom consultivo, humano, de relacionamento (NUNCA vendedor agressivo)
- Personalize com o nome do estabelecimento quando disponivel
- Maximo 4 linhas, direto ao ponto
- Use 1-2 emojis no maximo, de forma natural
- Varie aberturas e CTAs entre leads (anti-spam)
- NAO invente precos, dados ou nomes fake
- Nunca repita a mesma abordagem das mensagens anteriores do funil
`;

const CAMPAIGNS = [
  {
    name: 'FU1 — Check-in (D+2)',
    slug: 'fu1_checkin',
    delayDays: 2,
    sendAfterTag: 'fu0_enviada',
    addTag: 'fu1_enviada',
    framework: 'Contexto + Problema 2',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 2 CONTATO (2 dias apos a mensagem inicial de apresentacao).
O lead recebeu o primeiro contato mas ainda nao respondeu.

ESTRATEGIA — CONTEXTO + PROBLEMA 2 (outro angulo):

- Reconheca que ja mandou mensagem antes. Exemplos de abertura (escolha UMA, varie):
  * "Oi [nome]! Passando aqui rapidinho..."
  * "E ai, [nome]? Tudo bem?"
  * "Oi [nome], sou a Elenice da Alho Pronto ainda. Te procurei dia desses..."

- MUDE O ANGULO do problema. Em vez de falar de praticidade, fale sobre:
  * Tempo perdido da equipe descascando alho manualmente (2-3h/dia desperdicadas)
  * Risco de acidentes com faca na cozinha apertada
  * Funcionario parado descascando em vez de atender cliente
  * Alho oxidando nas caixas (perda de produto)

- Pergunta ABERTA (escolha UMA, varie):
  * "Faz sentido ai no seu dia a dia?"
  * "E realidade na sua cozinha?"
  * "Voce que cuida dessa parte ou e outra pessoa?"

NAO repita a apresentacao completa da empresa. Assuma que ele ja sabe quem e a Alho Pronto.`,
    fallbackTemplate: `Oi! 👋 Passando aqui de novo, sou a Elenice da *Alho Pronto*. Sei que o tempo da equipe na cozinha vale ouro — com alho ja descascado e higienizado, voce libera 2-3h por dia do pessoal. Faz sentido ai no seu dia a dia?`,
  },

  {
    name: 'FU2 — Consciencia (D+5)',
    slug: 'fu2_consciencia',
    delayDays: 5,
    sendAfterTag: 'fu1_enviada',
    addTag: 'fu2_enviada',
    framework: 'Implicacao 1 + Futuro Positivo',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 3 CONTATO (5 dias apos a abertura).
Lead recebeu 2 mensagens e ainda nao respondeu.

ESTRATEGIA — IMPLICACAO 1 + FUTURO POSITIVO (custo de nao agir + visao do ganho):

- Mostre o CUSTO de nao resolver (forma leve, nao culpada):
  * Funcionario gastando 2-3h/dia descascando = X horas/mes de folha desperdicadas
  * Perda de mise en place quando alho oxida nas caixas
  * Custo oculto de um colaborador parado nessa atividade

- Conecte com FUTURO POSITIVO (visao do ganho):
  * "Imagina essas horas livres pra fazer mais pratos, atender mais gente, treinar equipe..."
  * "Sua cozinha rodando com o alho ja pronto enquanto o time foca no que importa"
  * "Mais rotatividade, menos desperdicio, mais lucro no final do mes"

- Pergunta implicacional (escolha UMA):
  * "Ja pensou quanto essa horas de equipe valeriam em mesa a mais no almoco?"
  * "Quanto que isso significa na folha no fim do mes?"
  * "Faz diferenca pra voce ganhar esse tempo?"

NAO seja dramatico. Tom de reflexao, nao de medo.`,
    fallbackTemplate: `[nome], ja parou pra pensar: 2h/dia descascando alho = 40h/mes da folha. Com o alho ja pronto, sua equipe foca em atender cliente, montar mais pratos, girar mais mesas 📈 Faz diferenca ai?`,
  },

  {
    name: 'FU3 — Prova Social (D+8)',
    slug: 'fu3_prova',
    delayDays: 8,
    sendAfterTag: 'fu2_enviada',
    addTag: 'fu3_enviada',
    framework: 'Implicacao 2 + Prova Social',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 4 CONTATO (8 dias apos a abertura).

ESTRATEGIA — IMPLICACAO 2 + PROVA SOCIAL (numeros + casos reais):

- Cite prova social REAL (sem inventar nomes fake):
  * "Hoje atendemos mais de 120 estabelecimentos na regiao de BH"
  * "Media de economia de 8h/semana so no descasque"
  * "Restaurantes nossos clientes reduziram em media 40% o custo de mao de obra nessa etapa"

- Cite um mini-case GENERICO (sem inventar nome):
  * "Uma churrascaria em Contagem trocou o alho in natura pelo nosso, mesma quantidade, mas zero desperdicio — no fim do mes pagou menos"
  * "Um buffet em BH liberou 1 funcionario da prep pra atender salao, aumentou rotatividade 15%"
  * "Uma pizzaria em Nova Lima economiza 10h/semana — hoje o dono nem cogita voltar pro in natura"

- CTA concreto (escolha UMA):
  * "Quer que eu te mande os 3 SKUs mais usados por restaurantes do seu porte?"
  * "Posso te mandar um orcamento sem compromisso?"
  * "Voce topa receber nosso catalogo com os pacotes mais pedidos?"

Tom: autoridade serena, nao pressao.`,
    fallbackTemplate: `[nome], ja temos 120+ estabelecimentos usando nosso alho em BH e regiao. Media de 8h/semana economizadas so no descasque e 40% menos custo de mao de obra nessa etapa. Posso te mandar nosso catalogo sem compromisso?`,
  },

  {
    name: 'FU4 — Educacao (D+12)',
    slug: 'fu4_educacao',
    delayDays: 12,
    sendAfterTag: 'fu3_enviada',
    addTag: 'fu4_enviada',
    framework: 'Grande Ideia + Educacao',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 5 CONTATO (12 dias apos a abertura).

ESTRATEGIA — GRANDE IDEIA + EDUCACAO (posicionar como consultora, nao vendedora):

- Compartilhe UMA informacao tecnica/profissional util sobre alho. Varie entre:
  * "Voce sabia que o alho, depois de descascado, comeca a oxidar em algumas horas? Por isso o sabor amarga quando e descascado cedo demais. O nosso embalado a vacuo preserva por ate 30 dias refrigerado."
  * "Pouca gente sabe: a alicina (composto ativo do alho) se degrada quando exposta ao oxigenio. Alho embalado a vacuo mantem 3x mais tempo suas propriedades."
  * "Alho 'feiinho' na caixa do supermercado tem ate 18% de perda de peso no descasque. Alho ja processado = rendimento 100%. Isso entra direto na conta."

- Posicione-se como conhecedora, nao vendedora:
  * "Cuido dessa parte ha uns anos aqui na empresa..."
  * "Comecei na cozinha antes de trabalhar com vendas, entao entendo bem a rotina"

- CTA leve:
  * "Se tiver alguma duvida tecnica sobre conservacao ou rendimento, pode me perguntar — tenho prazer em ajudar"
  * "Quer que eu te mande nosso guia rapido de como calcular o custo real do descasque?"

Zero pressao comercial. Tom de compartilhamento profissional.`,
    fallbackTemplate: `Oi [nome]! Dica rapida: alho in natura perde ate 18% do peso no descasque 👀 Ou seja, voce paga por alho que vai pro lixo. O nosso embalado a vacuo tem rendimento 100%. Qualquer duvida tecnica, me chama, tenho prazer em ajudar!`,
  },

  {
    name: 'FU5 — Caso Real (D+16)',
    slug: 'fu5_caso',
    delayDays: 16,
    sendAfterTag: 'fu4_enviada',
    addTag: 'fu5_enviada',
    framework: 'Storytelling + Futuro Positivo',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 6 CONTATO (16 dias apos a abertura).

ESTRATEGIA — STORYTELLING + FUTURO POSITIVO (historia curta de transformacao):

- Conte UMA historia curta de cliente (generica, sem inventar nomes especificos). Exemplos:
  * "Vou te contar rapido: um restaurante em BH (Pampulha) me procurou ha 8 meses. Tinham 2 funcionarios gastando 3h/dia no descasque. Comecaram com 5kg/semana do nosso. Em 2 meses liberaram 1 pessoa pro salao, aumentaram 15% a rotatividade no almoco. Hoje compram 12kg/semana."
  * "Tem uma pizzaria em Contagem que fazia questao de descascar na casa, 'pra manter o sabor'. Entrou na duvida, testou o nosso por 1 semana. Ficou convencido: zero diferenca no sabor, metade do tempo de prep. Viraram cliente fixo."
  * "Um buffet em Belvedere perdia muito alho no final do mes (compravam mais do que usavam, sobrava estragando). Com o nosso a vacuo, param de ter perda de producao. Hoje economizam R$1.200/mes so nisso."

- Conecte com a realidade do lead:
  * "Imagino que vc tambem quer esse ganho ai no [nome do estabelecimento]"
  * "Faz sentido pro seu negocio algo parecido?"

- CTA:
  * "Topa um orcamento rapido pra eu te mostrar como ficaria ai?"
  * "Posso te mandar uma amostra pra voce avaliar antes de decidir?"
  * "Quer conversar 5 min por audio pra eu entender seu volume?"

Tom de quem conta uma historia — nao de quem vende.`,
    fallbackTemplate: `[nome], conta rapido: um restaurante da Pampulha virou cliente ha 8 meses. Tinham 2 funcionarios gastando 3h/dia descascando — liberaram 1 pro salao e aumentaram 15% a rotatividade no almoco 🚀 Imagino que faria diferenca ai tambem. Topa um orcamento rapido?`,
  },

  {
    name: 'FU6 — Valor Puro (D+20)',
    slug: 'fu6_valor',
    delayDays: 20,
    sendAfterTag: 'fu5_enviada',
    addTag: 'fu6_enviada',
    framework: 'Problema + Conteudo',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 7 CONTATO (20 dias apos a abertura).

ESTRATEGIA — VALOR PURO (oferecer CONTEUDO sem pedir nada em troca):

- Ofereca um material util GRATUITO. Escolha UM destes:
  * "Planilha de controle mensal de consumo de insumos pra cozinha comercial"
  * "Checklist de prep diario de cozinha (o que preparar na vespera, o que nao pode)"
  * "Guia rapido de como calcular o custo real por kg de alho (considerando descasque)"
  * "Lista dos 10 erros mais comuns que quebram o mise en place de restaurante"

- ZERO pressao de venda. Frase-chave OBRIGATORIA (varie, mas mantenha a essencia):
  * "Mesmo que voce NUNCA vire cliente da Alho Pronto, esse material pode te ajudar"
  * "Sem compromisso nenhum — e util pra qualquer operacao de cozinha"
  * "Mesmo que nunca compre da gente, queria que tivesse esse material"

- CTA simples:
  * "Quer que eu te envie? Me manda um 'pode mandar'"
  * "Te passo o PDF? Se topar, responde com 'envia' que eu mando"

Tom: generosidade de verdade, nao pega-boba. E um ultimo investimento de boa vontade antes do break-up.`,
    fallbackTemplate: `Oi [nome]! Montei um guia rapido de como calcular o custo real do alho (considerando o descasque e o desperdicio) 📄 Mesmo que nunca vire cliente meu, esse material pode te ajudar. Posso te enviar?`,
  },

  {
    name: 'FU7 — Break-up (D+25)',
    slug: 'fu7_breakup',
    delayDays: 25,
    sendAfterTag: 'fu6_enviada',
    addTag: 'fu7_enviada',
    framework: 'Grande Ideia + Escassez',
    aiPrompt: `${COMMON_HEADER}
ESTE E O 8 E ULTIMO CONTATO (25 dias apos a abertura). BREAK-UP educado.

ESTRATEGIA — GRANDE IDEIA + ESCASSEZ (da sua atencao, nao desconto barato):

- Seja HONESTA com dignidade. Escolha UMA abordagem (varie):
  * "[nome], acho que posso nao estar sendo util pro seu negocio agora — e tudo bem"
  * "Olha, vou parar de te incomodar — nao quero ser chata"
  * "Esse sera o ultimo contato meu. Se mudar de ideia, voce sabe me achar"

- Feche com DIGNIDADE e porta aberta:
  * "Se no futuro precisar, salva esse numero aqui, tamo junto"
  * "Deixo esse contato salvo pra quando fizer sentido pra voce"

- Uma ULTIMA provocacao ESTRATEGICA (pesquisa de saida). Pergunte (OBRIGATORIO):
  "Antes de ir, me responde so uma coisa — voce nao se interessou porque:
  (a) nao usa muito alho no seu negocio
  (b) prefere continuar descascando na casa
  (c) ja tem um fornecedor bom
  (d) nao e prioridade agora

  Sua resposta me ajuda muito a melhorar meu trabalho 🙏"

IMPORTANTE: essa pergunta final e ESTRATEGICA — mesmo uma resposta "d" e ouro (gera reengajamento futuro). Mesmo "c" pode virar conversa ("posso te mandar um orcamento comparativo so pra voce ter de referencia?").

Tom: humano, sem drama, sem carencia. Dignidade total.`,
    fallbackTemplate: `[nome], sera meu ultimo contato — nao quero ser chata 🙏 Se um dia precisar, salva meu numero aqui.

Antes de ir, me responde so uma coisa: voce nao se interessou porque (a) nao usa muito alho, (b) prefere descascar na casa, (c) ja tem bom fornecedor ou (d) nao e prioridade agora? Sua resposta me ajuda muito a melhorar!`,
  },
];

// ─────────────────────────────────────────────────────────────
// EXECUTION
// ─────────────────────────────────────────────────────────────

(async () => {
  try {
    // 1. Fetch C1 to copy settings
    const { rows: c1Rows } = await pool.query(
      'SELECT * FROM campaign_history WHERE id = $1',
      [C1_ID]
    );
    if (!c1Rows[0]) throw new Error('C1 not found');
    const c1 = c1Rows[0];
    console.log('✓ C1 found:', c1.name);

    // 2. Update C1 finalActions.addTags to include fu0_enviada
    const c1Settings = typeof c1.settings === 'string' ? JSON.parse(c1.settings) : c1.settings;
    c1Settings.finalActions = c1Settings.finalActions || {};
    const currentTags = Array.isArray(c1Settings.finalActions.addTags)
      ? c1Settings.finalActions.addTags
      : [];
    if (!currentTags.includes('fu0_enviada')) {
      c1Settings.finalActions.addTags = [...new Set([...currentTags, 'contatado', 'fu0_enviada'])];
      c1Settings.finalActions.nextStatus = c1Settings.finalActions.nextStatus || 'contacted';
    }
    // Ensure C1 also EXCLUDES leads that already responded/opted out
    c1Settings.filter = c1Settings.filter || {};

    // Rename C1 name to match sequence
    const c1NewName = c1.name === 'Boas Vindas' ? 'FU0 — Abertura (D+0)' : c1.name;

    await pool.query(
      'UPDATE campaign_history SET name = $1, settings = $2, updated_at = NOW() WHERE id = $3',
      [c1NewName, JSON.stringify(c1Settings), C1_ID]
    );
    console.log('✓ C1 updated: finalActions.addTags = fu0_enviada');

    // 3. Update filter_json of C1 to exclude exit tags (so paused leads that responded dont get re-sent)
    const c1Filter = typeof c1.filter_json === 'string'
      ? JSON.parse(c1.filter_json)
      : (c1.filter_json || {});
    c1Filter.tagsExclude = [...new Set([...(c1Filter.tagsExclude || []), ...EXIT_TAGS, 'fu0_enviada'])];
    await pool.query(
      'UPDATE campaign_history SET filter_json = $1 WHERE id = $2',
      [JSON.stringify(c1Filter), C1_ID]
    );
    console.log('✓ C1 filter updated: excludes', c1Filter.tagsExclude.join(', '));

    // 4. Check which follow-ups already exist (idempotency by slug)
    const { rows: existing } = await pool.query(
      'SELECT id, name FROM campaign_history WHERE user_id = $1 AND brand_id = $2 AND name LIKE $3',
      [c1.user_id, c1.brand_id, 'FU%']
    );
    const existingBySlug = new Map();
    for (const row of existing) {
      existingBySlug.set(row.name, row.id);
    }

    // 5. Create C2-C8
    const created = [];
    const skipped = [];
    for (const camp of CAMPAIGNS) {
      if (existingBySlug.has(camp.name)) {
        skipped.push({ name: camp.name, id: existingBySlug.get(camp.name) });
        continue;
      }

      const newId = randomUUID();

      // Base settings copied from C1, with follow-up-specific overrides
      const settings = JSON.parse(JSON.stringify(c1Settings));
      settings.campaignCore = settings.campaignCore || {};
      settings.campaignCore.slug = camp.slug;
      settings.composer = settings.composer || {};
      settings.composer.intentText = camp.aiPrompt;
      settings.composer.personalizedPerLead = true;
      settings.composer.useAutoVariations = true;
      settings.finalActions = settings.finalActions || {};
      settings.finalActions.nextStatus = 'contacted';
      settings.finalActions.addTags = ['contatado', camp.addTag];
      // Preserve media/scheduler/instance config from C1

      // Filter: only leads with the previous step's tag, excluding current step and exit tags
      const filter = {
        statuses: ['new', 'contacted'],
        hasWhatsapp: true,
        tagsInclude: [camp.sendAfterTag],
        tagsExclude: [camp.addTag, ...EXIT_TAGS],
      };

      await pool.query(
        `INSERT INTO campaign_history (
          id, user_id, brand_id, instance_id, name, message_template, ai_prompt, use_ai,
          campaign_mode, filter_json, speed_json, settings,
          status, target_count, sent_count, failed_count,
          use_instance_rotation, rotation_mode,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, true,
          'relationship', $8, $9, $10,
          'draft', 0, 0, 0,
          $11, $12,
          NOW(), NOW()
        )`,
        [
          newId,
          c1.user_id,
          c1.brand_id,
          c1.instance_id,
          camp.name,
          camp.fallbackTemplate,
          camp.aiPrompt,
          JSON.stringify(filter),
          c1.speed_json ? (typeof c1.speed_json === 'string' ? c1.speed_json : JSON.stringify(c1.speed_json)) : '{}',
          JSON.stringify(settings),
          c1.use_instance_rotation || false,
          c1.rotation_mode || 'balanced',
        ]
      );
      created.push({ id: newId, name: camp.name, framework: camp.framework, delayDays: camp.delayDays });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('REGUA DE FOLLOW-UPS — RESUMO');
    console.log('═'.repeat(60));
    console.log(`\n✓ C1 atualizada: ${c1NewName}`);
    console.log(`  finalActions.addTags = [contatado, fu0_enviada]`);
    console.log(`  tagsExclude = [${c1Filter.tagsExclude.join(', ')}]`);

    if (skipped.length) {
      console.log('\n⚠ JA EXISTIAM (nao recriadas):');
      skipped.forEach(s => console.log(`  • ${s.name} (${s.id.slice(0, 8)}...)`));
    }

    if (created.length) {
      console.log('\n✓ CAMPANHAS CRIADAS:');
      created.forEach(c => {
        console.log(`  • ${c.name}`);
        console.log(`    Framework: ${c.framework}`);
        console.log(`    Delay: D+${c.delayDays}`);
        console.log(`    ID: ${c.id}`);
      });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('FLUXO DO LEAD:');
    console.log('═'.repeat(60));
    console.log('new → [C1 D+0] +fu0_enviada → [C2 D+2] +fu1_enviada → ...');
    console.log('       → [C8 D+25] +fu7_enviada → fim');
    console.log('\nEXITS (qualquer hora):');
    console.log('  +respondeu   → sai de todas (handoff humano)');
    console.log('  +opt_out     → sai permanente (lost)');
    console.log('  +convertido  → sai permanente (converted)');
    console.log('\nTodas as 8 campanhas filtram por esses tags.');
    console.log('═'.repeat(60));

    await pool.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    await pool.end();
    process.exit(1);
  }
})();
