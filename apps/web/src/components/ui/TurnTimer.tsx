"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/i18n";

interface TurnTimerProps {
  secondsLeft: number | null;
  isHost: boolean;
  enabled: boolean;
  durationSeconds: number;
  autoResolve: boolean;
  onConfigure: (config: { enabled: boolean; durationSeconds: number; autoResolve: boolean }) => void;
}

export function TurnTimer({
  secondsLeft,
  isHost,
  enabled,
  durationSeconds,
  autoResolve,
  onConfigure,
}: TurnTimerProps) {
  const { t } = useTranslation();
  const [showConfig, setShowConfig] = useState(false);
  const [localDuration, setLocalDuration] = useState(durationSeconds);
  const [localAutoResolve, setLocalAutoResolve] = useState(autoResolve);

  useEffect(() => {
    setLocalDuration(durationSeconds);
    setLocalAutoResolve(autoResolve);
  }, [durationSeconds, autoResolve]);

  if (!enabled && !isHost) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const isLow = secondsLeft !== null && secondsLeft <= 30;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      fontSize: "0.78rem",
    }}>
      {enabled && secondsLeft !== null && (
        <span style={{
          color: isLow ? "#f87171" : "#fbbf24",
          fontWeight: 700,
          fontFamily: "monospace",
          fontSize: "0.85rem",
          animation: isLow ? "pulse 1s infinite" : undefined,
        }}>
          {formatTime(secondsLeft)}
        </span>
      )}

      {enabled && secondsLeft === null && (
        <span style={{ color: "#555", fontSize: "0.75rem" }}>
          {t("timer.timer")}: {formatTime(durationSeconds)}
        </span>
      )}

      {isHost && (
        <button
          onClick={() => setShowConfig(!showConfig)}
          style={{
            padding: "0.15rem 0.4rem",
            backgroundColor: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 4,
            color: "#888",
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          {enabled ? t("timer.timer") : t("timer.set_timer")}
        </button>
      )}

      {showConfig && isHost && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 4,
          padding: "0.6rem",
          backgroundColor: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 6,
          zIndex: 100,
          minWidth: 180,
        }}>
          <div style={{ marginBottom: "0.4rem" }}>
            <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: 2 }}>
              {t("timer.duration")}
            </label>
            <input
              type="number"
              min={30}
              max={600}
              step={30}
              value={localDuration}
              onChange={(e) => setLocalDuration(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "0.3rem",
                backgroundColor: "#111",
                border: "1px solid #333",
                borderRadius: 4,
                color: "#e0e0e0",
                fontSize: "0.8rem",
              }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#888", fontSize: "0.72rem", marginBottom: "0.4rem" }}>
            <input
              type="checkbox"
              checked={localAutoResolve}
              onChange={(e) => setLocalAutoResolve(e.target.checked)}
            />
            {t("timer.auto_resolve")}
          </label>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            <button
              onClick={() => {
                onConfigure({ enabled: true, durationSeconds: localDuration, autoResolve: localAutoResolve });
                setShowConfig(false);
              }}
              style={{
                flex: 1,
                padding: "0.3rem",
                backgroundColor: "#166534",
                border: "none",
                borderRadius: 4,
                color: "white",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("common.enable")}
            </button>
            {enabled && (
              <button
                onClick={() => {
                  onConfigure({ enabled: false, durationSeconds: localDuration, autoResolve: localAutoResolve });
                  setShowConfig(false);
                }}
                style={{
                  flex: 1,
                  padding: "0.3rem",
                  backgroundColor: "#7f1d1d",
                  border: "none",
                  borderRadius: 4,
                  color: "white",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("common.disable")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
