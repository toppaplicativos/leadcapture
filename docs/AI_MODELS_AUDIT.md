# Auditoria de modelos — custo × performance (2026-07)

**Premissa de produto:** para **chat/copy/classificação**, a inteligência principal está na **estrutura de treino e prompt**, não em raciocínio frontier. Preferir modelos **baratos**.  
Para **criativos de produto**, priorizar modelos com **referências (produto + logo)** e custo previsível.

**Hub preferido:** [Atlas Cloud](https://atlascloud.ai) — uma chave para LLM + imagem + vídeo + áudio. Providers nativos (OpenAI, Gemini, Grok, Veo) **permanecem** disponíveis.

Preços LLM Atlas: API `GET https://api.atlascloud.ai/v1/models` (USD/token). Imagem: docs/pricing Atlas (~USD/imagem).

---

## 1. Texto / chat (LLM)

| Provider | Model ID | Custo aprox. (prompt/completion por 1M tok) | Funções | Nota |
|----------|----------|-----------------------------------------------|---------|------|
| **atlas** | `google/gemini-2.5-flash-lite` | **$0.10 / $0.40** | chat, copy, JSON, classificar | **Recomendado default** |
| ~~atlas~~ | ~~`google/gemini-2.0-flash-lite`~~ | — | — | **REMOVIDO** — shutdown Google 2026-06-01; usar 2.5 Flash Lite |
| atlas | `deepseek-ai/deepseek-v4-flash` | $0.14 / $0.28 | chat, JSON | Ótimo C/B |
| atlas | `openai/gpt-5-nano` | $0.05 / $0.40 | chat | Ultra barato |
| atlas | `openai/gpt-4.1-nano` | $0.10 / $0.40 | chat | Nano estável |
| atlas | `openai/gpt-4o-mini` | $0.15 / $0.60 | chat, JSON | Versátil |
| atlas | `google/gemini-2.5-flash` | $0.30 / $2.50 | chat, vision | Degrau acima |
| atlas | `qwen/qwen3.5-flash` | $0.10 / $0.40 | chat | Alternativa |
| atlas | `deepseek-ai/DeepSeek-V3.1` | $0.30 / $0.95 | chat + leve reason | Só se treino pedir |
| gemini | `gemini-2.5-flash-lite` | nativo | chat | Sem Atlas |
| openai | `gpt-4o-mini` / nano | nativo | chat | Sem Atlas |

**Não usar como default de chat:** Claude Sonnet/Opus, GPT-5.4 full, Gemini Pro — custo alto sem ganho proporcional no nosso pipeline de mensagens.

---

## 2. Imagem (estúdio / criativos) — com referência de marca

| Provider | Model ID | Refs | Custo aprox. | Funções | Studio? |
|----------|----------|------|--------------|---------|---------|
| **gemini** | `gemini-3.1-flash-image` | **Sim (multi)** | default C/B | product_studio, t2i, edit | **Default** |
| gemini | `gemini-3.1-flash-image-preview` | Sim | similar | product_studio | Sim |
| gemini | `gemini-2.5-flash-image` | Sim | barato | product_studio | Sim |
| gemini | `gemini-3-pro-image-preview` | Sim | premium | 4K studio | Sim (caro) |
| **openai** | `gpt-image-2` | **Sim (até ~10)** | ~$0.01–0.41/img | tipografia + lógica espacial | Sim |
| openai | `gpt-image-1` / `1.5` / mini | Sim | médio | product_studio | Sim |
| **atlas** | `google/gemini-3.1-flash-image` | Sim | via Atlas | product_studio | Sim |
| atlas | `openai/gpt-image-2` | Sim | via Atlas | product_studio | Sim |
| atlas | `google/nano-banana-2/text-to-image` | Sim (até 14) | ~$0.07–0.16 | séries / marca | Sim |
| atlas | `seedream-3.0` | Sim (i2i) | ~$0.02–0.04 | volume | Sim |
| atlas | `flux-kontext-dev` | Sim (contexto) | ~$0.03–0.05 | edit / consistência | Sim |
| atlas | `flux-1.1-pro` | parcial | ~$0.03–0.06 | qualidade | Sim |
| grok | `grok-imagine-image*` | **Não** | $0.02–0.07 | só T2I | Não (tipografia ok, sem foto produto) |

---

## 3. Vídeo / áudio (Atlas-first)

| Categoria | Modelos foco | Custo |
|-----------|--------------|-------|
| Vídeo | `kling-v2.0`, Kling 2.1, MiniMax video (Atlas); Veo nativo | por segundo |
| Áudio TTS | MiniMax Speech HD/Turbo, OpenAI TTS via Atlas | por request |

---

## 4. Política no LeadCapture

1. **Master · Providers** — cadastrar chave `atlas` (e opcionalmente gemini/openai nativos).  
2. **Master · Algoritmos** — mapear `function_key` → provider+model (texto barato via Atlas).  
3. **Criativos (org)** — seletor de modelo **no compositor**, default Gemini 3.1 Flash Image; opções OpenAI Image 2 + Atlas com refs.  
4. **Não remover** openai/gemini/grok/veo/kling — só concentrar o uso operacional no Atlas quando a chave existir.

---

*Atualizar este arquivo quando a API `/v1/models` ou pricing Atlas mudar.*
