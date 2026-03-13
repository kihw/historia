import { api } from "./api";

/**
 * If the server has no LLM provider configured, attempt to restore from localStorage.
 * Returns true if the server is configured (either already or after auto-apply).
 */
export async function ensureLLMConfigured(): Promise<boolean> {
  try {
    const { configured } = await api.getLLMStatus();
    if (configured) return true;

    // Server not configured — try to apply saved client config
    const provider = localStorage.getItem("historia_llm_provider");
    if (!provider || (provider !== "openrouter" && provider !== "ollama")) {
      return false;
    }

    if (provider === "openrouter") {
      const apiKey = localStorage.getItem("historia_openrouter_key");
      if (!apiKey) return false;
      const model = localStorage.getItem("historia_openrouter_model") || undefined;
      await api.configureLLM({ provider: "openrouter", apiKey, model });
      return true;
    }

    if (provider === "ollama") {
      const host = localStorage.getItem("historia_ollama_host") || "http://localhost:11434";
      const baseUrl = host.endsWith("/v1") ? host : `${host}/v1`;
      const model = localStorage.getItem("historia_ollama_model") || undefined;
      await api.configureLLM({ provider: "ollama", baseUrl, model });
      return true;
    }
  } catch {
    // Server unreachable or config failed
  }
  return false;
}
