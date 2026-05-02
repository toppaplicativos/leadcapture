const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.pkgqdewqaonkzhzprpgq:%40Milionarios2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const CAMPAIGN_ID = '2f282398-9d86-462c-b595-0a05a609d83f';

const aiPrompt = `Voce e a Elenice, representante comercial da Alho Pronto — empresa especializada em alho descascado, higienizado e embalado a vacuo para o segmento alimenticio (restaurantes, buffets, lanchonetes, emporios, hoteis, industrias). Atendemos toda regiao de Belo Horizonte, Contagem e Grande BH com entrega propria.

REGRAS OBRIGATORIAS:
- Apresente-se como Elenice da Alho Pronto (nunca invente outro nome)
- Tom consultivo, humano e de relacionamento — como se estivesse conversando pelo WhatsApp com um potencial parceiro
- Personalize usando o nome do estabelecimento quando disponivel
- Mencione o segmento do lead naturalmente (ex: "sei que restaurantes como o seu usam bastante alho no dia a dia")
- Proposta de valor: praticidade (ja vem descascado e higienizado), economia de tempo na cozinha, entrega na regiao
- NAO fale preco na primeira mensagem
- NAO use linguagem de vendedor agressivo
- Mensagem curta (maximo 4 linhas), direta, sem enrolacao
- Use 1-2 emojis no maximo, de forma natural
- Termine SEMPRE com uma pergunta leve que convide resposta (ex: "Posso te mandar mais detalhes?" ou "Voce que cuida dessa parte ai?" ou "Quer conhecer nosso catalogo?")
- Varie as aberturas e CTAs entre leads para evitar repeticao e bloqueio por spam`;

const messageTemplate = `Oi! Tudo bem? 😊 Sou a Elenice da *Alho Pronto*. Trabalhamos com alho descascado e higienizado, pronto pra uso — entregamos na regiao de BH e Contagem. Posso te contar mais sobre como funciona?`;

(async () => {
  try {
    // Update ai_prompt and message_template
    const result = await pool.query(
      'UPDATE campaign_history SET ai_prompt = $1, message_template = $2, updated_at = NOW() WHERE id = $3',
      [aiPrompt, messageTemplate, CAMPAIGN_ID]
    );
    console.log('Rows updated:', result.rowCount);

    // Update settings.composer.intentText
    const { rows } = await pool.query('SELECT settings FROM campaign_history WHERE id = $1', [CAMPAIGN_ID]);
    if (rows[0]) {
      const settings = typeof rows[0].settings === 'string' ? JSON.parse(rows[0].settings) : rows[0].settings;
      settings.composer = settings.composer || {};
      settings.composer.intentText = aiPrompt;
      settings.composer.personalizedPerLead = true;
      settings.composer.useAutoVariations = true;

      await pool.query('UPDATE campaign_history SET settings = $1 WHERE id = $2', [JSON.stringify(settings), CAMPAIGN_ID]);
      console.log('Settings.composer updated');
    }

    // Verify
    const { rows: verify } = await pool.query(
      'SELECT ai_prompt, message_template FROM campaign_history WHERE id = $1',
      [CAMPAIGN_ID]
    );
    console.log('ai_prompt length:', verify[0].ai_prompt?.length);
    console.log('message_template preview:', verify[0].message_template?.slice(0, 80));
    console.log('DONE - campanha pronta pra ativar');
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
})();
