import { integrationService } from "./integrations";
import { GeminiService } from "./gemini";
import { OpenAIProvider, type TextGenerationResult } from "./providers/openai-provider";
import { GrokProvider } from "./providers/grok-provider";
import { DEFAULT_PREFERENCES, type AICategory } from "../config/ai-models";
import { logger } from "../utils/logger";

export interface AIRouterScope {
  userId?: string;
  brandId?: string;
}

interface ProviderPreferences {
  text: { provider: string; model: string };
  image: { provider: string; model: string };
  video: { provider: string; model: string };
}

// Cache preferences per account for 2 minutes
const prefsCache = new Map<string, { data: ProviderPreferences; ts: number }>();
const PREFS_CACHE_TTL = 120_000;

function cacheKey(scope: AIRouterScope): string {
  return `${scope.userId || ""}::${scope.brandId || ""}`;
}

export class AIRouter {
  private gemini = new GeminiService();

  async getPreferences(scope: AIRouterScope): Promise<ProviderPreferences> {
    const key = cacheKey(scope);
    const cached = prefsCache.get(key);
    if (cached && Date.now() - cached.ts < PREFS_CACHE_TTL) return cached.data;

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

    // Invalidate cache
    prefsCache.delete(cacheKey(scope));
  }

  private async resolveProviderKey(providerName: string, scope: AIRouterScope): Promise<string | null> {
    try {
      const resolved = await integrationService.getProvider(providerName as any, {
        userId: scope.userId,
        brandId: scope.brandId,
      });
      return resolved?.key || null;
    } catch {
      return null;
    }
  }

  async generateText(prompt: string, scope: AIRouterScope, options?: { model?: string; temperature?: number; category?: AICategory }): Promise<TextGenerationResult> {
    const prefs = await this.getPreferences(scope);
    const category = options?.category || "text";
    const pref = prefs[category] || prefs.text;
    const providerName = pref.provider;
    const model = options?.model || pref.model;

    if (providerName === "openai") {
      const key = await this.resolveProviderKey("openai", scope);
      if (!key) throw new Error("API Key OpenAI nao configurada. Va em Provedores IA para configurar.");
      const provider = new OpenAIProvider(key, model);
      return provider.generateText(prompt, { model, temperature: options?.temperature });
    }

    if (providerName === "grok") {
      const key = await this.resolveProviderKey("grok", scope);
      if (!key) throw new Error("API Key Grok nao configurada. Va em Provedores IA para configurar.");
      const provider = new GrokProvider(key, model);
      return provider.generateText(prompt, { model, temperature: options?.temperature });
    }

    // Default: Gemini
    const text = await this.gemini.generatePlainText(prompt, { model, temperature: options?.temperature, userId: scope.userId });
    return { text, model, provider: "gemini" };
  }

  async generateJson<T>(prompt: string, scope: AIRouterScope, options?: { model?: string; temperature?: number }): Promise<T> {
    const prefs = await this.getPreferences(scope);
    const providerName = prefs.text.provider;
    const model = options?.model || prefs.text.model;

    if (providerName === "openai") {
      const key = await this.resolveProviderKey("openai", scope);
      if (!key) throw new Error("API Key OpenAI nao configurada.");
      return new OpenAIProvider(key, model).generateJson<T>(prompt, { model, temperature: options?.temperature });
    }

    if (providerName === "grok") {
      const key = await this.resolveProviderKey("grok", scope);
      if (!key) throw new Error("API Key Grok nao configurada.");
      return new GrokProvider(key, model).generateJson<T>(prompt, { model, temperature: options?.temperature });
    }

    return this.gemini.generateJson<T>(prompt, { model, temperature: options?.temperature, userId: scope.userId });
  }
}

export const aiRouter = new AIRouter();
