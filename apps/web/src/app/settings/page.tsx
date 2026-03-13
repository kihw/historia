"use client";

import { useState, useEffect, CSSProperties } from "react";
import { useTranslation } from "@/i18n";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

type LLMProvider = "openrouter" | "ollama";

const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", noteKey: "settings.openrouter.recommended" },
  { id: "openai/gpt-4o", label: "GPT-4o", noteKey: "" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", noteKey: "" },
  { id: "anthropic/claude-haiku-4", label: "Claude Haiku 4", noteKey: "" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", noteKey: "" },
  { id: "x-ai/grok-3-mini", label: "Grok 3 Mini", noteKey: "" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", noteKey: "" },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<LLMProvider>("openrouter");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [openrouterModel, setOpenrouterModel] = useState("openai/gpt-4o-mini");
  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434/v1");
  const [ollamaModel, setOllamaModel] = useState("llama3.1");

  const [serverStatus, setServerStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [serverProvider, setServerProvider] = useState<string>("Unknown");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const storedProvider = localStorage.getItem("historia_llm_provider") as LLMProvider | null;
    if (storedProvider === "openrouter" || storedProvider === "ollama") {
      setProvider(storedProvider);
    }

    const storedKey = localStorage.getItem("historia_openrouter_key");
    if (storedKey) setOpenrouterKey(storedKey);

    const storedOpenrouterModel = localStorage.getItem("historia_openrouter_model");
    if (storedOpenrouterModel) setOpenrouterModel(storedOpenrouterModel);

    const storedOllamaHost = localStorage.getItem("historia_ollama_host");
    if (storedOllamaHost) setOllamaHost(storedOllamaHost);

    const storedOllamaModel = localStorage.getItem("historia_ollama_model");
    if (storedOllamaModel) setOllamaModel(storedOllamaModel);

    checkServerHealth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem("historia_llm_provider", provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem("historia_openrouter_key", openrouterKey);
  }, [openrouterKey]);

  useEffect(() => {
    localStorage.setItem("historia_openrouter_model", openrouterModel);
  }, [openrouterModel]);

  useEffect(() => {
    localStorage.setItem("historia_ollama_host", ollamaHost);
  }, [ollamaHost]);

  useEffect(() => {
    localStorage.setItem("historia_ollama_model", ollamaModel);
  }, [ollamaModel]);

  const getApiBase = () => {
    return localStorage.getItem("historia_api_url") ?? "http://localhost:4000";
  };

  const checkServerHealth = async () => {
    setServerStatus("checking");
    try {
      const res = await fetch(`${getApiBase()}/health`);
      const data = await res.json();
      setServerStatus("connected");
      setServerProvider(data.provider ?? "Unknown");
    } catch {
      setServerStatus("disconnected");
      setServerProvider("N/A");
    }
  };

  const buildConfig = () => {
    if (provider === "openrouter") {
      return {
        provider: "openrouter" as const,
        apiKey: openrouterKey,
        model: openrouterModel,
      };
    }
    const base = ollamaHost.endsWith("/v1") ? ollamaHost : `${ollamaHost}/v1`;
    return {
      provider: "ollama" as const,
      baseUrl: base,
      model: ollamaModel,
    };
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/llm/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfig()),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message ?? t("settings.connection_success") });
      } else {
        const errKey = `errors.${data.error}`;
        const translated = t(errKey);
        setTestResult({ ok: false, message: translated !== errKey ? translated : (data.message ?? `Server responded with ${res.status}`) });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : t("settings.connection_failed"),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveApply = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/llm/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfig()),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveResult({ ok: true, message: data.message ?? t("settings.config_applied") });
        checkServerHealth();
      } else {
        const errKey2 = `errors.${data.error}`;
        const translated2 = t(errKey2);
        setSaveResult({ ok: false, message: translated2 !== errKey2 ? translated2 : (data.message ?? `Server responded with ${res.status}`) });
      }
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : t("settings.connection_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem",
        minHeight: "100vh",
        color: "#e0e0e0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>{t("settings.title")}</h1>
        <LanguageSwitcher />
      </div>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        {t("settings.subtitle")}
      </p>

      <div style={{ maxWidth: "640px", width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* -- Provider Selection -- */}
        <SettingsCard title={t("settings.llm_provider")}>
          <p style={{ fontSize: "0.82rem", color: "#888", marginBottom: "1rem" }}>
            {t("settings.llm_desc")}
          </p>
          <div style={{ display: "flex", gap: "1rem" }}>
            <ProviderCard
              selected={provider === "openrouter"}
              onClick={() => setProvider("openrouter")}
              name="OpenRouter"
              tag={t("settings.openrouter.tag")}
              variant="cloud"
              description={t("settings.openrouter.desc")}
            />
            <ProviderCard
              selected={provider === "ollama"}
              onClick={() => setProvider("ollama")}
              name="Ollama"
              tag={t("settings.ollama.tag")}
              variant="local"
              description={t("settings.ollama.desc")}
            />
          </div>
        </SettingsCard>

        {/* -- OpenRouter Config -- */}
        {provider === "openrouter" && (
          <SettingsCard title={t("settings.openrouter.title")}>
            {/* API Key */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>{t("settings.openrouter.api_key")}</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  style={smallBtnStyle}
                  title={showKey ? t("common.hide") : t("common.show")}
                >
                  {showKey ? t("common.hide") : t("common.show")}
                </button>
              </div>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.75rem", color: "#60a5fa", marginTop: "0.4rem", display: "inline-block" }}
              >
                {t("settings.openrouter.get_key")}
              </a>
            </div>

            {/* Model Selector */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>{t("settings.openrouter.model")}</label>
              <select
                value={openrouterModel}
                onChange={(e) => setOpenrouterModel(e.target.value)}
                style={inputStyle}
              >
                {OPENROUTER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.noteKey ? ` (${t(m.noteKey)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Connection */}
            <button onClick={handleTestConnection} disabled={testing || !openrouterKey} style={testBtnStyle(testing)}>
              {testing ? t("common.testing") : t("settings.test_connection")}
            </button>
            {testResult && (
              <div style={resultBannerStyle(testResult.ok)}>{testResult.message}</div>
            )}
          </SettingsCard>
        )}

        {/* -- Ollama Config -- */}
        {provider === "ollama" && (
          <SettingsCard title={t("settings.ollama.title")}>
            {/* Host */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>{t("settings.ollama.host_url")}</label>
              <input
                type="text"
                value={ollamaHost}
                onChange={(e) => setOllamaHost(e.target.value)}
                placeholder="http://localhost:11434/v1"
                style={inputStyle}
              />
              <p style={{ fontSize: "0.75rem", color: "#555", marginTop: "0.3rem" }}>
                {t("settings.ollama.host_note")}
              </p>
            </div>

            {/* Model */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>{t("settings.ollama.model")}</label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.1"
                style={inputStyle}
              />
              <p style={{ fontSize: "0.75rem", color: "#555", marginTop: "0.3rem" }}>
                {t("settings.ollama.model_note")}
              </p>
            </div>

            {/* Test Connection */}
            <button onClick={handleTestConnection} disabled={testing} style={testBtnStyle(testing)}>
              {testing ? t("common.testing") : t("settings.test_connection")}
            </button>
            {testResult && (
              <div style={resultBannerStyle(testResult.ok)}>{testResult.message}</div>
            )}
          </SettingsCard>
        )}

        {/* -- Server Status -- */}
        <SettingsCard title={t("settings.server_status")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <span style={{ fontSize: "0.82rem", color: "#888" }}>{t("settings.connection")}</span>
            {serverStatus === "checking" ? (
              <span style={{ color: "#fbbf24", fontSize: "0.82rem", fontWeight: 600 }}>{t("settings.checking")}</span>
            ) : serverStatus === "connected" ? (
              <span style={{ color: "#4ade80", fontSize: "0.82rem", fontWeight: 600 }}>{t("settings.connected")}</span>
            ) : (
              <span style={{ color: "#f87171", fontSize: "0.82rem", fontWeight: 600 }}>{t("settings.disconnected")}</span>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#888" }}>{t("settings.active_provider")}</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: serverStatus === "connected" ? "#60a5fa" : "#555" }}>
              {serverProvider}
            </span>
          </div>
          <button
            onClick={checkServerHealth}
            style={{
              marginTop: "0.8rem",
              padding: "0.4rem 0.8rem",
              backgroundColor: "transparent",
              border: "1px solid #333",
              borderRadius: "6px",
              color: "#888",
              fontSize: "0.78rem",
              cursor: "pointer",
              width: "100%",
            }}
          >
            {t("settings.refresh_status")}
          </button>
        </SettingsCard>

        {/* -- Save & Apply -- */}
        <button
          onClick={handleSaveApply}
          disabled={saving}
          style={{
            padding: "0.9rem 2rem",
            backgroundColor: saving ? "#1d4ed8" : "#2563eb",
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: saving ? "not-allowed" : "pointer",
            width: "100%",
            letterSpacing: "0.02em",
          }}
        >
          {saving ? t("common.saving") : t("settings.save_apply")}
        </button>
        {saveResult && (
          <div style={resultBannerStyle(saveResult.ok)}>{saveResult.message}</div>
        )}

        {/* -- Command Reference -- */}
        <SettingsCard title={t("settings.command_reference")}>
          <p style={{ fontSize: "0.82rem", color: "#888", marginBottom: "0.5rem" }}>
            {t("settings.command_examples")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.8rem" }}>
            <CommandExample cmd={t("commands.declare_war")} cat={t("settings.cmd_diplomacy")} />
            <CommandExample cmd={t("commands.propose_alliance")} cat={t("settings.cmd_diplomacy")} />
            <CommandExample cmd={t("commands.propose_peace")} cat={t("settings.cmd_diplomacy")} />
            <CommandExample cmd={t("commands.improve_relations")} cat={t("settings.cmd_diplomacy")} />
            <CommandExample cmd={t("commands.recruit")} cat={t("settings.cmd_military")} />
            <CommandExample cmd={t("commands.move_army")} cat={t("settings.cmd_military")} />
            <CommandExample cmd={t("commands.set_tax")} cat={t("settings.cmd_economy")} />
            <CommandExample cmd={t("commands.build")} cat={t("settings.cmd_economy")} />
            <CommandExample cmd={t("commands.enact_policy")} cat={t("settings.cmd_internal")} />
          </div>
        </SettingsCard>
      </div>

      <a
        href="/"
        style={{
          marginTop: "2rem",
          color: "#666",
          textDecoration: "none",
          fontSize: "0.85rem",
        }}
      >
        {t("common.back_home")}
      </a>
    </main>
  );
}

/* -------------------------------- Sub-components -------------------------------- */

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "1.2rem",
        backgroundColor: "#111",
        border: "1px solid #1e1e1e",
        borderRadius: "10px",
        borderTop: "2px solid #2563eb",
        position: "relative",
      }}
    >
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.8rem", color: "#ddd" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function ProviderCard({
  selected,
  onClick,
  name,
  tag,
  variant,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  tag: string;
  variant: "cloud" | "local";
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "1rem",
        backgroundColor: selected ? "#1a1a2e" : "#1a1a1a",
        border: `2px solid ${selected ? "#2563eb" : "#222"}`,
        borderRadius: "8px",
        cursor: "pointer",
        textAlign: "left",
        color: "#e0e0e0",
        transition: "border-color 0.15s",
        display: "flex",
        flexDirection: "column" as const,
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Radio dot */}
        <span
          style={{
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            border: `2px solid ${selected ? "#2563eb" : "#444"}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {selected && (
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#2563eb",
              }}
            />
          )}
        </span>
        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{name}</span>
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            padding: "0.1rem 0.4rem",
            borderRadius: "4px",
            backgroundColor: variant === "cloud" ? "#1e3a5f" : "#1a2e1a",
            color: variant === "cloud" ? "#60a5fa" : "#4ade80",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {tag}
        </span>
      </div>
      <span style={{ fontSize: "0.78rem", color: "#888", lineHeight: "1.4" }}>{description}</span>
    </button>
  );
}

function CommandExample({ cmd, cat }: { cmd: string; cat: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <code style={{ color: "#e0e0e0" }}>&quot;{cmd}&quot;</code>
      <span style={{ color: "#555", fontSize: "0.75rem" }}>{cat}</span>
    </div>
  );
}

/* -------------------------------- Shared styles -------------------------------- */

const labelStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "#888",
  display: "block",
  marginBottom: "0.35rem",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.8rem",
  backgroundColor: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: "6px",
  color: "#e0e0e0",
  fontSize: "0.85rem",
  outline: "none",
  boxSizing: "border-box",
};

const smallBtnStyle: CSSProperties = {
  padding: "0.5rem 0.8rem",
  backgroundColor: "#222",
  border: "1px solid #333",
  borderRadius: "6px",
  color: "#ccc",
  fontSize: "0.78rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const testBtnStyle = (busy: boolean): CSSProperties => ({
  padding: "0.5rem 1rem",
  backgroundColor: busy ? "#1a1a1a" : "#222",
  border: "1px solid #333",
  borderRadius: "6px",
  color: busy ? "#555" : "#e0e0e0",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: busy ? "not-allowed" : "pointer",
  width: "100%",
});

const resultBannerStyle = (ok: boolean): CSSProperties => ({
  marginTop: "0.6rem",
  padding: "0.5rem 0.8rem",
  borderRadius: "6px",
  fontSize: "0.8rem",
  fontWeight: 500,
  backgroundColor: ok ? "#1a2e1a" : "#2e1a1a",
  border: `1px solid ${ok ? "#166534" : "#7f1d1d"}`,
  color: ok ? "#4ade80" : "#f87171",
});
