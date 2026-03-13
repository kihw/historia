import type { LLMProvider, LLMProviderConfig } from "./base.js";
import { OpenRouterProvider } from "./openrouter.js";
import { OllamaProvider } from "./ollama.js";

/**
 * Create an LLM provider from config.
 * Only OpenRouter (cloud) and Ollama (local) are supported.
 * Returns null if config is missing or invalid.
 */
export function createLLMProvider(config?: LLMProviderConfig): LLMProvider | null {
  if (!config) return null;

  switch (config.provider) {
    case "openrouter":
      if (!config.apiKey) return null;
      return new OpenRouterProvider(config);

    case "ollama":
      return new OllamaProvider(config);

    default:
      return null;
  }
}

/**
 * Create provider from environment variables.
 * Priority: OPENROUTER_API_KEY > OLLAMA_HOST > null
 */
export function createLLMProviderFromEnv(): LLMProvider | null {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const ollamaHost = process.env.OLLAMA_HOST;

  if (openrouterKey) {
    return new OpenRouterProvider({
      provider: "openrouter",
      apiKey: openrouterKey,
      model: process.env.OPENROUTER_MODEL,
    });
  }

  if (ollamaHost) {
    return new OllamaProvider({
      provider: "ollama",
      baseUrl: ollamaHost.endsWith("/v1") ? ollamaHost : `${ollamaHost}/v1`,
      model: process.env.OLLAMA_MODEL,
    });
  }

  return null;
}
