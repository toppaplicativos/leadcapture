import { integrationService } from "./integrations";
import { GeminiService } from "./gemini";
import { OpenAIProvider, type TextGenerationResult } from "./providers/openai-provider";
import { GrokProvider } from "./providers/grok-provider";
import { AtlasProvider } from "./providers/atlas-provider";
import { DEFAULT_PREFERENCES, resolveLiveModelId, type AICategory } from "../config/ai-models";
import { MODALITY_DEFAULT_KEYS } from "../config/ai-algorithms";
import { algorithmsService } from "./algorithms";
import { logger } from "../utils/logger";

export interface AIRouterScope {
  userId?: string;
  brandId?: string;
}

interface ProviderPreferences {
  text: { provider: string; model: string };
  image: { provider: string; model: string };
  video: { provider: string; model: string };
  audio?: { provider: string; model: string };
}

export type GenerateOptions = {
  model?: string;
  temperature?: number;
  category?: AICategory;
  /** Master · Algoritmos function key — preferred routing */
  functionKey?: string;
};

// Cache preferences per account for 2 minutes
const prefsCache = new Map<string, { data: ProviderPreferences; ts: number }>();
const PREFS_CACHE_TTL = 120_000;

function cacheKey(scope: AIRouterScope): string {
  return `${scope.userId || ""}::${scope.brandId || ""}`;
}

export class AIRouter {
  private gemini = new GeminiService();

  /**
   * Modality-level defaults for text/image/video.
   * PR1: when algorithms_v1_enabled, uses Master global algorithms
   * (text.router.default / image.product.studio / video.generate.veo).
   * Legacy: per-org __preferences__ row.
   */
  async getPreferences(scope: AIRouterScope): Promise<ProviderPreferences> {
    const key = cacheKey(scope);
    const cached = prefsCache.get(key);
    if (cached && Date.now() - cached.ts < PREFS_CACHE_TTL) return cached.data;

    const useGlobal = await algorithmsService.isEnabled().catch(() => true);

    if (useGlobal) {
      try {
        const globalPrefs = await algorithmsService.getGlobalModalityPreferences();
        prefsCache.set(key, { data: globalPrefs, ts: Date.now() });
        return globalPrefs;
      } catch (err: any) {
        logger.warn(`[aiRouter] global prefs failed: ${err?.message}`);
      }
    }

    try {
      const resolved = await integrationService.getProvider("__preferences__" as any, {
        userId: scope.userId,
        brandId: scope.brandId,
      });

      if (resolved?.config) {
        const prefs = {
          text: resolved.config.text || DEFAULT_PREFERENCES.text,
          image: resolved.config.image || DEFAULT_PREFERENCES.image,
          video: resolved.config.video || DEFAULT_PREFERENCES.video,
        };
        prefsCache.set(key, { data: prefs, ts: Date.now() });
        return prefs;
      }
    } catch {
      // Fallback to defaults silently
    }

    prefsCache.set(key, { data: DEFAULT_PREFERENCES as any, ts: Date.now() });
    return DEFAULT_PREFERENCES as any;
  }

  async savePreferences(prefs: Partial<ProviderPreferences>, scope: AIRouterScope): Promise<void> {
    const useGlobal = await algorithmsService.isEnabled().catch(() => true);
    if (useGlobal) {
      /* Org no longer owns model selection — persist is no-op for models.
         Keep write for backward-compat clients but log once. */
      logger.info(
        `[aiRouter] savePreferences ignored (algorithms_v1); use Master · Algoritmos. scope=${cacheKey(scope)}`,
      );
      return;
    }

    const current = await this.getPreferences(scope);
    const merged = {
      text: prefs.text || current.text,
      image: prefs.image || current.image,
      video: prefs.video || current.video,
    };

    await integrationService.saveProvider("__preferences__" as any, {
      config: merged,
      is_active: true,
    }, { userId: scope.userId, brandId: scope.brandId });

    prefsCache.delete(cacheKey(scope));
  }

  private async resolveProviderKey(providerName: string, scope: AIRouterScope): Promise<string | null> {
    try {
      const keyProvider = providerName === "veo" ? "gemini" : providerName;
      const resolved = await integrationService.getProvider(keyProvider as any, {
        userId: scope.userId,
        brandId: scope.brandId,
      });
      return resolved?.key || null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve algorithm for a function_key (Master policy) + API key chain.
   */
  async resolveAlgorithm(
    functionKey: string,
    scope: AIRouterScope,
  ): Promise<{
    provider: string;
    model: string;
    key: string | null;
    temperature: number | null;
    function_key: string;
    source: string;
  }> {
    const useGlobal = await algorithmsService.isEnabled().catch(() => true);
    if (useGlobal) {
      const r = await algorithmsService.resolve(functionKey, scope);
      if (r.coming_soon) {
        throw new Error(
          `Algoritmo ${functionKey} ainda não tem adapter runtime (coming_soon). Configure outro modelo no Master · Algoritmos.`,
        );
      }
      if (!r.is_enabled) {
        throw new Error(`Algoritmo ${functionKey} está desativado no Master · Algoritmos.`);
      }
      return {
        provider: r.provider,
        model: r.model,
        key: r.key,
        temperature: r.temperature,
        function_key: r.function_key,
        source: r.source,
      };
    }

    /* legacy modality map */
    const prefs = await this.getPreferences(scope);
    const modality =
      functionKey.startsWith("image.") || functionKey.startsWith("video.")
        ? functionKey.startsWith("video.")
          ? "video"
          : "image"
        : "text";
    const pref = prefs[modality as AICategory] || prefs.text;
    const key = await this.resolveProviderKey(pref.provider, scope);
    return {
      provider: pref.provider,
      model: pref.model,
      key,
      temperature: null,
      function_key: functionKey,
      source: "legacy_prefs",
    };
  }

  /**
   * Image routing — prefers functionKey image.product.studio (global algorithm).
   */
  async getImageProvider(
    scope: AIRouterScope,
    opts?: { functionKey?: string },
  ): Promise<{
    provider: "openai" | "gemini" | "grok" | "atlas";
    model: string;
    key: string | null;
  }> {
    const functionKey = opts?.functionKey || MODALITY_DEFAULT_KEYS.image;
    try {
      const r = await this.resolveAlgorithm(functionKey, scope);
      const provider = (r.provider as "openai" | "gemini" | "grok" | "atlas") || "gemini";
      return { provider, model: resolveLiveModelId(r.model), key: r.key };
    } catch {
      const prefs = await this.getPreferences(scope);
      const pref = prefs.image || DEFAULT_PREFERENCES.image;
      const provider = (pref.provider as "openai" | "gemini" | "grok" | "atlas") || "gemini";
      const model = resolveLiveModelId(pref.model || DEFAULT_PREFERENCES.image.model);
      const key = await this.resolveProviderKey(provider, scope);
      return { provider, model, key };
    }
  }

  async generateText(
    prompt: string,
    scope: AIRouterScope,
    options?: GenerateOptions,
  ): Promise<TextGenerationResult> {
    const functionKey =
      options?.functionKey ||
      (options?.category === "image"
        ? MODALITY_DEFAULT_KEYS.image
        : options?.category === "video"
          ? MODALITY_DEFAULT_KEYS.video
          : MODALITY_DEFAULT_KEYS.text);

    let providerName: string;
    let model: string;
    let temperature = options?.temperature;

    const useGlobal = await algorithmsService.isEnabled().catch(() => true);
    if (useGlobal && !options?.model) {
      const algo = await this.resolveAlgorithm(functionKey, scope);
      providerName = algo.provider;
      model = resolveLiveModelId(algo.model);
      if (temperature === undefined && algo.temperature != null) temperature = algo.temperature;
    } else {
      const prefs = await this.getPreferences(scope);
      const category = options?.category || "text";
      const pref = prefs[category] || prefs.text;
      providerName = pref.provider;
      model = resolveLiveModelId(options?.model || pref.model);
    }

    const callPrimary = async (): Promise<TextGenerationResult> => {
      if (providerName === "openai") {
        const key = await this.resolveProviderKey("openai", scope);
        if (!key) throw new Error("API Key OpenAI nao configurada. Configure em Master · Providers ou Provedores IA.");
        const provider = new OpenAIProvider(key, model);
        return provider.generateText(prompt, { model, temperature });
      }

      if (providerName === "grok") {
        const key = await this.resolveProviderKey("grok", scope);
        if (!key) throw new Error("API Key Grok nao configurada. Configure em Master · Providers ou Provedores IA.");
        const provider = new GrokProvider(key, model);
        return provider.generateText(prompt, { model, temperature });
      }

      if (providerName === "atlas") {
        const key = await this.resolveProviderKey("atlas", scope);
        if (!key) throw new Error("API Key Atlas Cloud nao configurada. Configure em Master · Providers (atlas).");
        const provider = new AtlasProvider(key, model);
        return provider.generateText(prompt, { model, temperature });
      }

      // Default: Gemini (also handles veo key path for text via gemini)
      const text = await this.gemini.generatePlainText(prompt, {
        model,
        temperature,
        userId: scope.userId,
        brandId: scope.brandId,
      });
      return { text, model, provider: "gemini" };
    };

    try {
      return await callPrimary();
    } catch (err: any) {
      // On quota/rate-limit, try alternate providers that already have keys configured
      const msg = String(err?.message || err || "");
      const isQuota =
        /429|quota|rate.?limit|too many requests|resource.?exhausted/i.test(msg);
      if (!isQuota) throw err;

      const chain: Array<"atlas" | "openai" | "grok" | "gemini"> = ["atlas", "openai", "grok", "gemini"];
      for (const alt of chain) {
        if (alt === providerName) continue;
        try {
          if (alt === "atlas") {
            const key = await this.resolveProviderKey("atlas", scope);
            if (!key) continue;
            logger.warn(`[aiRouter] primary ${providerName} quota — falling back to atlas`);
            return new AtlasProvider(key).generateText(prompt, { temperature });
          }
          if (alt === "openai") {
            const key = await this.resolveProviderKey("openai", scope);
            if (!key) continue;
            logger.warn(`[aiRouter] primary ${providerName} quota — falling back to openai`);
            return new OpenAIProvider(key).generateText(prompt, { temperature });
          }
          if (alt === "grok") {
            const key = await this.resolveProviderKey("grok", scope);
            if (!key) continue;
            logger.warn(`[aiRouter] primary ${providerName} quota — falling back to grok`);
            return new GrokProvider(key).generateText(prompt, { temperature });
          }
          if (alt === "gemini") {
            logger.warn(`[aiRouter] primary ${providerName} failed — falling back to gemini`);
            const text = await this.gemini.generatePlainText(prompt, {
              temperature,
              userId: scope.userId,
              brandId: scope.brandId,
            });
            return { text, model: "gemini-2.5-flash", provider: "gemini" };
          }
        } catch (altErr: any) {
          logger.warn(`[aiRouter] fallback ${alt} failed: ${altErr?.message || altErr}`);
        }
      }
      throw err;
    }
  }

  async generateJson<T>(
    prompt: string,
    scope: AIRouterScope,
    options?: GenerateOptions,
  ): Promise<T> {
    const functionKey = options?.functionKey || MODALITY_DEFAULT_KEYS.text;

    let providerName: string;
    let model: string;
    let temperature = options?.temperature;

    const useGlobal = await algorithmsService.isEnabled().catch(() => true);
    if (useGlobal && !options?.model) {
      const algo = await this.resolveAlgorithm(functionKey, scope);
      providerName = algo.provider;
      model = resolveLiveModelId(algo.model);
      if (temperature === undefined && algo.temperature != null) temperature = algo.temperature;
    } else {
      const prefs = await this.getPreferences(scope);
      providerName = prefs.text.provider;
      model = resolveLiveModelId(options?.model || prefs.text.model);
    }

    if (providerName === "openai") {
      const key = await this.resolveProviderKey("openai", scope);
      if (!key) throw new Error("API Key OpenAI nao configurada.");
      return new OpenAIProvider(key, model).generateJson<T>(prompt, { model, temperature });
    }

    if (providerName === "grok") {
      const key = await this.resolveProviderKey("grok", scope);
      if (!key) throw new Error("API Key Grok nao configurada.");
      return new GrokProvider(key, model).generateJson<T>(prompt, { model, temperature });
    }

    if (providerName === "atlas") {
      const key = await this.resolveProviderKey("atlas", scope);
      if (!key) throw new Error("API Key Atlas Cloud nao configurada.");
      return new AtlasProvider(key, model).generateJson<T>(prompt, { model, temperature });
    }

    return this.gemini.generateJson<T>(prompt, {
      model,
      temperature,
      userId: scope.userId,
      brandId: scope.brandId,
    });
  }
}

export const aiRouter = new AIRouter();
