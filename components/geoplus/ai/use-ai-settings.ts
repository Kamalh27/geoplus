"use client";

import { useEffect, useState } from "react";
import type { AiProvider, AiSettings } from "./types";

const AI_SETTINGS_KEY = "geoplus-ai-settings";

// API keys are kept in sessionStorage (per-tab, cleared on close) rather than localStorage so a
// leaked key has a bounded lifetime. Legacy localStorage entries are migrated and removed.
const readStoredSettings = (): string | null => {
  try {
    const fromSession = sessionStorage.getItem(AI_SETTINGS_KEY);
    if (fromSession) {
      return fromSession;
    }
    const legacy = localStorage.getItem(AI_SETTINGS_KEY);
    if (legacy) {
      localStorage.removeItem(AI_SETTINGS_KEY);
    }
    return legacy;
  } catch {
    return null;
  }
};

const writeStoredSettings = (settings: AiSettings) => {
  try {
    sessionStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode, quota); settings then live in memory only.
  }
};

const defaultSettings: AiSettings = {
  provider: "openai",
  model: "gpt-4o-mini",
};

const VALID_AI_PROVIDERS = new Set<AiProvider>(["openai", "anthropic", "gemini", "openrouter", "deepseek", "qwen", "minimax", "local"]);

const normalizeProvider = (provider: unknown): AiProvider => {
  if (provider === "ollama") {
    return "local";
  }
  if (typeof provider !== "string") {
    return defaultSettings.provider;
  }
  return VALID_AI_PROVIDERS.has(provider as AiProvider) ? (provider as AiProvider) : defaultSettings.provider;
};

const normalizeAiSettings = (value: unknown): AiSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<AiSettings> & { provider?: string }) : {};
  return {
    provider: normalizeProvider(candidate.provider),
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey : undefined,
    baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl : undefined,
    model: typeof candidate.model === "string" ? candidate.model : defaultSettings.model,
  };
};

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = readStoredSettings();
    if (saved) {
      try {
        const normalized = normalizeAiSettings(JSON.parse(saved));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings(normalized);
        writeStoredSettings(normalized);
      } catch (e) {
        console.error("Failed to parse AI settings", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<AiSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      writeStoredSettings(updated);
      return updated;
    });
  };

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
