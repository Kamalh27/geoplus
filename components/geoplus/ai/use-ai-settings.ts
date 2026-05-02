"use client";

import { useEffect, useState } from "react";
import type { AiProvider, AiSettings } from "./types";

const AI_SETTINGS_KEY = "geoplus-ai-settings";

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
    const saved = localStorage.getItem(AI_SETTINGS_KEY);
    if (saved) {
      try {
        const normalized = normalizeAiSettings(JSON.parse(saved));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings(normalized);
        localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalized));
      } catch (e) {
        console.error("Failed to parse AI settings", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<AiSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
