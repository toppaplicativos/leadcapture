/**
 * Safe error reporting (Bug-6 fix)
 *
 * LLM providers (Gemini, OpenAI) typically include the FULL REQUEST BODY in
 * their error messages when something goes wrong (400 invalid schema, 429
 * quota, etc). That request body contains our internal prompt — every
 * instruction, schema definition, example, brand-specific tuning. Returning
 * `err.message` straight to the HTTP client leaks all of that and gives a
 * prompt-injection attacker a perfect map of our prompt structure.
 *
 * Use these helpers at every error boundary that crosses to the network:
 *   - `safeErrorMessage(err)` for the user-facing message (always generic
 *     unless the error is explicitly tagged as `public: true`)
 *   - `safeErrorPayload(err)` for the full JSON body to return
 *   - keep raw `err` / `err.message` ONLY in `logger.error(...)` calls
 */

/** Errors throwable with `(err as any).public = true` get their message exposed verbatim. */
export interface PublicError extends Error {
  public?: boolean;
  code?: string;
}

/** Known patterns that indicate a prompt/payload leak — never let them reach the client.
 *  Better to over-detect than miss; false positives just produce a generic message. */
const LEAK_PATTERNS = [
  /\byou are\b/i,                                    // system prompt opener (PT/EN)
  /voc[êe] [eé] um/i,                                // "você é um..." (PT system prompts)
  /\bextrator\b/i,                                   // smartLeadImport opener
  /\bextrai\w*\s+leads?/i,                           // any "extrair lead(s)" form
  /retorne (?:em\s+)?json/i,                         // "retorne json" / "retorne em json"
  /retorne\s+somente\s+json/i,
  /\binstru[cç][õo]es?\b/i,                          // "instruções" / "instrucoes"
  /\bcontexto\s*:?\s*\n/i,                           // "CONTEXTO:" header common in prompts
  /SYSTEM_INSTRUCTION/i,
  /<\|im_start\|>/i,                                 // chat ML tokens
  /generationConfig/i,                               // gemini request body
  /"contents"\s*:\s*\[/,                             // gemini request shape
  /"messages"\s*:\s*\[/,                             // openai request shape
  /"role"\s*:\s*"(?:user|system|assistant|model)"/i, // any chat role
  /"parts"\s*:\s*\[/,                                // gemini parts array
  /"inlineData"\s*:\s*\{/i,                          // gemini image part
  /```json/,                                          // markdown JSON fence (model output)
  /\bschema\b.*\{/i,                                  // "...schema {..."
  /\bREGRAS\b[\s\S]*?\d\./,                          // "REGRAS:" followed by enumerated rules (multiline)
];

/** Detect whether a free-text error message likely contains a leaked prompt. */
export function looksLikePromptLeak(msg: string): boolean {
  if (!msg) return false;
  if (msg.length > 800) return true;                 // 800+ chars in an error message is almost always a payload dump
  return LEAK_PATTERNS.some((re) => re.test(msg));
}

/**
 * Map common technical error shapes to friendly user-facing copy + a stable code.
 * Order matters — more specific first.
 */
function classify(err: any): { message: string; code: string } {
  const raw = String(err?.message || err || "");
  const lower = raw.toLowerCase();
  const status = Number(err?.status || err?.statusCode || 0);

  /* Auth / quota / model availability */
  if (status === 401 || /unauthorized|invalid.api.key/i.test(raw)) {
    return { message: "Chave de IA inválida ou não configurada.", code: "AI_AUTH" };
  }
  if (status === 429 || /quota|rate.?limit|too many requests/i.test(raw)) {
    return { message: "Limite de uso da IA atingido. Aguarde alguns minutos.", code: "AI_QUOTA" };
  }
  if (status === 404 || /model.*not.found|not.?found/i.test(raw)) {
    return { message: "Modelo de IA indisponível no momento.", code: "AI_MODEL_UNAVAILABLE" };
  }
  if (/timeout|timed.out|deadline/i.test(raw)) {
    return { message: "Tempo limite excedido. Tente novamente.", code: "AI_TIMEOUT" };
  }

  /* Image / payload validation */
  if (/payload.too.large|413|too large/i.test(raw)) {
    return { message: "Arquivo muito grande. Limite 10MB.", code: "FILE_TOO_LARGE" };
  }
  if (/unsupported.?(image|mime|format)|invalid.?image/i.test(raw)) {
    return { message: "Formato de imagem não suportado. Use JPG, PNG ou WebP.", code: "FILE_UNSUPPORTED" };
  }

  /* Parse failures — usually mean the AI returned malformed JSON */
  if (/json|parse|unexpected token/i.test(lower) && /falha|fail/i.test(lower)) {
    return { message: "A IA não retornou um resultado utilizável. Tente reformular o conteúdo.", code: "AI_PARSE" };
  }

  /* Public-tagged errors keep their message (caller opted in) */
  if (err?.public === true) {
    return { message: raw, code: err?.code || "EXPLICIT" };
  }

  /* Fall through — could be a prompt leak */
  if (looksLikePromptLeak(raw)) {
    return { message: "Falha ao processar conteúdo. Tente novamente em alguns instantes.", code: "PROCESSING_FAILED" };
  }

  /* Short generic-looking errors are usually safe to surface (e.g. "brand_id is required") */
  if (raw.length < 200) {
    return { message: raw || "Falha ao processar requisição.", code: err?.code || "UNKNOWN" };
  }

  return { message: "Falha ao processar requisição.", code: "UNKNOWN" };
}

/** Returns a safe user-facing message — never the raw provider error. */
export function safeErrorMessage(err: any): string {
  return classify(err).message;
}

/** Returns a complete safe JSON body to send to the HTTP client. */
export function safeErrorPayload(err: any, extra?: Record<string, any>): Record<string, any> {
  const { message, code } = classify(err);
  return { error: message, code, ...extra };
}

/**
 * Wrap a thrown LLM provider error so when it propagates upward, callers
 * higher in the stack still see classified info but never the original payload.
 *
 * Typical usage in services:
 *   try { return await provider.generate(...) }
 *   catch (e) { throw wrapProviderError(e, "lead-extraction"); }
 */
export function wrapProviderError(err: any, context: string): Error {
  const { code } = classify(err);
  const wrapped: any = new Error(`[${context}] ${code}`);
  wrapped.code = code;
  wrapped.context = context;
  /* preserve the original on a non-enumerable property so logger can dig if needed */
  Object.defineProperty(wrapped, "__cause", { value: err, enumerable: false });
  return wrapped;
}
