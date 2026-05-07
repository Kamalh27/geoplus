"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, Info, ExternalLink, MessageSquare, Settings2, Send, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAiSettings } from "./use-ai-settings";
import { useAiChat } from "./use-ai-chat";
import { chatWithAi } from "@/lib/geoplus/ai-service";
import type { AiProvider } from "./types";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { cn } from "@/lib/utils";

const providerInfo: Record<AiProvider, { name: string; url: string; models: string[] }> = {
  openai: {
    name: "OpenAI",
    url: "https://platform.openai.com/api-keys",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  anthropic: {
    name: "Anthropic",
    url: "https://console.anthropic.com/settings/keys",
    models: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
  },
  gemini: {
    name: "Google Gemini",
    url: "https://aistudio.google.com/app/apikey",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
  },
  deepseek: {
    name: "DeepSeek",
    url: "https://platform.deepseek.com",
    models: ["deepseek-chat", "deepseek-coder"],
  },
  qwen: {
    name: "Qwen (Alibaba)",
    url: "https://dashscope.aliyun.com",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"],
  },
  minimax: {
    name: "Minimax",
    url: "https://platform.minimaxi.com",
    models: ["abab6.5s-chat", "abab6.5-chat"],
  },
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/keys",
    models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "meta-llama/llama-3-8b-instruct"],
  },
  local: {
    name: "Custom / Local",
    url: "",
    models: ["llama3", "mistral", "phi3", "gemma", "local-model"],
  }
};

const LOCAL_ENDPOINT_CANDIDATES = [
  "http://localhost:11434",
  "http://127.0.0.1:11434",
  "http://localhost:1234/v1",
  "http://127.0.0.1:1234/v1",
  "http://localhost:8000/v1",
  "http://127.0.0.1:8000/v1",
];

const REMOTE_DEFAULT_MODELS = new Set(["gpt-4o", "gpt-4o-mini", "local-model"]);

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, "");

const stripV1Suffix = (baseUrl: string) => baseUrl.replace(/\/v1$/i, "");

const parseOllamaModels = (data: unknown): string[] => {
  if (!data || typeof data !== "object") {
    return [];
  }

  const models = (data as { models?: unknown }).models;
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .map((modelRecord) => {
      if (modelRecord && typeof modelRecord === "object" && typeof (modelRecord as { name?: unknown }).name === "string") {
        return (modelRecord as { name: string }).name;
      }
      return "";
    })
    .filter(Boolean);
};

const parseOpenAiCompatibleModels = (data: unknown): string[] => {
  if (!data || typeof data !== "object") {
    return [];
  }

  const models = (data as { data?: unknown }).data;
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .map((modelRecord) => {
      if (modelRecord && typeof modelRecord === "object" && typeof (modelRecord as { id?: unknown }).id === "string") {
        return (modelRecord as { id: string }).id;
      }
      return "";
    })
    .filter(Boolean);
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 2500): Promise<Response> => {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutHandle);
  }
};

const detectLocalModelsAtBaseUrl = async (
  baseUrl: string,
  apiKey?: string,
): Promise<{ resolvedBaseUrl: string; models: string[] } | null> => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const ollamaBaseUrl = stripV1Suffix(normalizedBaseUrl);

  try {
    const ollamaResponse = await fetchWithTimeout(`${ollamaBaseUrl}/api/tags`, { method: "GET" });
    if (ollamaResponse.ok) {
      const data = (await ollamaResponse.json()) as unknown;
      return {
        resolvedBaseUrl: ollamaBaseUrl,
        models: parseOllamaModels(data),
      };
    }
  } catch {
    // Continue to OpenAI-compatible check.
  }

  try {
    const headers: HeadersInit = {};
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const modelsEndpoint = normalizedBaseUrl.endsWith("/v1")
      ? `${normalizedBaseUrl}/models`
      : `${normalizedBaseUrl}/v1/models`;
    const modelsResponse = await fetchWithTimeout(modelsEndpoint, { method: "GET", headers });
    if (modelsResponse.ok) {
      const data = (await modelsResponse.json()) as unknown;
      return {
        resolvedBaseUrl: normalizedBaseUrl,
        models: parseOpenAiCompatibleModels(data),
      };
    }
  } catch {
    // No-op: endpoint not reachable/compatible.
  }

  return null;
};

const shouldAutoAssignLocalModel = (currentModel: string | undefined, detectedModels: string[]) => {
  if (detectedModels.length === 0) {
    return false;
  }
  if (!currentModel?.trim()) {
    return true;
  }
  return REMOTE_DEFAULT_MODELS.has(currentModel);
};

type AiAssistantPanelProps = {
  layers?: GeoPlusLayerItem[];
};

const buildLayerContextForPrompt = (layers: GeoPlusLayerItem[]): string => {
  if (layers.length === 0) {
    return "No layers are currently loaded in the workspace.";
  }

  const visibleCount = layers.filter((layer) => layer.visible).length;
  const topLayers = layers.slice(0, 8);
  const lines = topLayers.map((layer, index) => {
    const geometry = layer.duckDbDatasetProfile?.geometryTypes?.join(", ") || "unknown";
    const featureCount = layer.duckDbDatasetProfile?.featureCount ?? "unknown";
    const rowCount = layer.duckDbRowCount ?? "unknown";
    const filterClause = layer.duckDbWhereClause?.trim() ? layer.duckDbWhereClause : "none";
    const detectionSummary = layer.detectionSummary ? `, summary=${layer.detectionSummary}` : "";
    return `${index + 1}. ${layer.name} [type=${layer.layerType}, source=${layer.sourceMode}, visible=${layer.visible}, opacity=${Math.round(layer.opacity * 100)}%, rows=${rowCount}, features=${featureCount}, geometry=${geometry}, filter=${filterClause}${detectionSummary}]`;
  });

  const extraCount = layers.length - topLayers.length;
  const overflowLine = extraCount > 0 ? `...and ${extraCount} more layer(s).` : "";

  return [`Loaded layers: ${layers.length} (visible: ${visibleCount}).`, ...lines, overflowLine].filter(Boolean).join("\n");
};

const withLayerContext = (userMessage: string, layers: GeoPlusLayerItem[]): string => {
  const layerContext = buildLayerContextForPrompt(layers);
  return `${userMessage}

[GeoPlus auto-attached layer context]
${layerContext}

[Assistant instruction]
Use this context when answering. If the user asks about existing/current layers, summarize from this context. If no layer exists, say no layer is loaded and suggest adding one from the Layers tab.`;
};

export function AiAssistantPanel({ layers = [] }: AiAssistantPanelProps) {
  const { settings, updateSettings, isLoaded: isSettingsLoaded } = useAiSettings();
  const { messages, addMessage, clearHistory, isLoaded: isChatLoaded } = useAiChat();
  const [activeTab, setActiveTab] = useState<"chat" | "settings">("chat");
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [isDetectingLocalEndpoint, setIsDetectingLocalEndpoint] = useState(false);
  const [localEndpointStatus, setLocalEndpointStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoaded = isSettingsLoaded && isChatLoaded;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let isCancelled = false;

    async function autoDetectLocalEndpointAndModels() {
      if (settings.provider !== "local") {
        setLocalModels([]);
        setLocalEndpointStatus(null);
        setIsDetectingLocalEndpoint(false);
        return;
      }

      const hasConfiguredBaseUrl = Boolean(settings.baseUrl?.trim());
      const configuredBaseUrl = hasConfiguredBaseUrl ? normalizeBaseUrl(settings.baseUrl ?? "") : "";
      const configuredIsDefaultCandidate = LOCAL_ENDPOINT_CANDIDATES.some(
        (candidate) => normalizeBaseUrl(candidate) === configuredBaseUrl,
      );
      const candidateBaseUrls = hasConfiguredBaseUrl
        ? configuredIsDefaultCandidate
          ? [configuredBaseUrl, ...LOCAL_ENDPOINT_CANDIDATES.filter((candidate) => normalizeBaseUrl(candidate) !== configuredBaseUrl)]
          : [configuredBaseUrl]
        : LOCAL_ENDPOINT_CANDIDATES;

      setIsDetectingLocalEndpoint(true);
      setLocalEndpointStatus(
        hasConfiguredBaseUrl
          ? `Checking local endpoint at ${configuredBaseUrl}...`
          : "Auto-detecting local LLM on common localhost endpoints...",
      );

      let detectedEndpoint: { resolvedBaseUrl: string; models: string[] } | null = null;
      for (const candidateBaseUrl of candidateBaseUrls) {
        const result = await detectLocalModelsAtBaseUrl(candidateBaseUrl, settings.apiKey);
        if (result) {
          detectedEndpoint = result;
          break;
        }
      }

      if (isCancelled) {
        return;
      }

      if (!detectedEndpoint) {
        setLocalModels([]);
        setLocalEndpointStatus(
          hasConfiguredBaseUrl
            ? `No local model endpoint detected at ${configuredBaseUrl}.`
            : "No local LLM endpoint detected. Start Ollama/LM Studio and keep this provider selected.",
        );
        setIsDetectingLocalEndpoint(false);
        return;
      }

      setLocalModels(detectedEndpoint.models);
      setLocalEndpointStatus(
        detectedEndpoint.models.length > 0
          ? `Detected ${detectedEndpoint.models.length} local model${detectedEndpoint.models.length > 1 ? "s" : ""} at ${detectedEndpoint.resolvedBaseUrl}.`
          : `Connected to local endpoint at ${detectedEndpoint.resolvedBaseUrl}. Add a model to start chatting.`,
      );

      const nextSettings: Partial<{ baseUrl: string; model: string }> = {};
      if (!hasConfiguredBaseUrl || configuredBaseUrl !== detectedEndpoint.resolvedBaseUrl) {
        nextSettings.baseUrl = detectedEndpoint.resolvedBaseUrl;
      }
      if (shouldAutoAssignLocalModel(settings.model, detectedEndpoint.models)) {
        nextSettings.model = detectedEndpoint.models[0];
      }

      if (nextSettings.baseUrl || nextSettings.model) {
        updateSettings(nextSettings);
      }

      setIsDetectingLocalEndpoint(false);
    }

    void autoDetectLocalEndpointAndModels();
    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.provider, settings.baseUrl, settings.apiKey]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (!settings.provider || (settings.provider !== "local" && !settings.apiKey)) {
      setActiveTab("settings");
      return;
    }

    const userMsg = inputMessage.trim();
    const contextualUserMessage = withLayerContext(userMsg, layers);
    setInputMessage("");
    addMessage({ role: "user", content: userMsg });
    setIsSending(true);

    try {
      const history = [
        ...messages.map((message) => ({ role: message.role, content: message.content })),
        { role: "user" as const, content: contextualUserMessage },
      ];
      const response = await chatWithAi(settings, history);
      addMessage({ role: "assistant", content: response });
    } catch (error) {
      addMessage({ 
        role: "system", 
        content: `Error: ${error instanceof Error ? error.message : "Failed to connect to AI provider. Please check your settings."}` 
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isLoaded) return null;

  const currentProvider = providerInfo[settings.provider] ?? providerInfo.openai;
  const availableModels = settings.provider === "local" && localModels.length > 0 ? localModels : currentProvider.models;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="size-4 text-accent" />
          GeoPlus AI Assistant
        </h2>
        <div className="mt-3 flex rounded-md bg-muted/40 p-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors",
              activeTab === "chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare className="size-3.5" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors",
              activeTab === "settings" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings2 className="size-3.5" />
            Settings
          </button>
        </div>
      </div>

      {activeTab === "chat" ? (
        <div className="flex flex-1 flex-col overflow-hidden relative bg-card/20">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-4 space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                  <Sparkles className="size-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">How can I help you map?</h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[250px]">
                    Ask me to analyze spatial patterns, suggest queries, or explain geoprocessing concepts.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user" 
                      ? "bg-accent/20 text-foreground self-end ml-auto rounded-tr-sm" 
                      : msg.role === "system"
                      ? "bg-destructive/10 text-destructive self-center mx-auto text-xs"
                      : "bg-muted/50 text-foreground self-start mr-auto rounded-tl-sm"
                  )}
                >
                  <span className="whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                </div>
              ))
            )}
            {isSending && (
              <div className="flex self-start max-w-[85%] rounded-lg bg-muted/50 px-4 py-3 text-sm mr-auto rounded-tl-sm">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          
          <div className="border-t border-border/50 bg-background/95 p-3 backdrop-blur-sm shrink-0">
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the AI assistant..."
                  className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] max-h-[120px]"
                  rows={1}
                />
              </div>
              <Button 
                onClick={handleSendMessage} 
                disabled={!inputMessage.trim() || isSending}
                size="icon"
                className="h-10 w-10 shrink-0"
              >
                <Send className="size-4" />
              </Button>
            </div>
            {messages.length > 0 && (
              <div className="mt-2 flex justify-between items-center px-1">
                <span className="text-[0.6rem] text-muted-foreground">Using {currentProvider.name}</span>
                <button 
                  onClick={clearHistory}
                  className="flex items-center gap-1 text-[0.65rem] text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3" />
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Provider
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={settings.provider}
                onChange={(e) => {
                  const newProvider = e.target.value as AiProvider;
                  const newProviderInfo = providerInfo[newProvider];
                  const newModel = newProvider === "local" 
                    ? "" 
                    : (newProviderInfo?.models[0] || "");
                  
                  updateSettings({ 
                    provider: newProvider,
                    model: newModel
                  });
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
                <option value="deepseek">DeepSeek</option>
                <option value="qwen">Qwen (Alibaba)</option>
                <option value="minimax">Minimax</option>
                <option value="openrouter">OpenRouter</option>
                <option value="local">Custom / Local</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  API Key {settings.provider === "local" ? "(Optional)" : ""}
                </label>
                {currentProvider.url ? (
                  <a 
                    href={currentProvider.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[0.65rem] text-accent hover:underline"
                  >
                    Get key <ExternalLink className="size-2.5" />
                  </a>
                ) : null}
              </div>
              <Input
                type="password"
                placeholder={
                  settings.provider === "local"
                    ? "Optional for local endpoints"
                    : `Enter your ${currentProvider.name} API key`
                }
                value={settings.apiKey || ""}
                onChange={(e) => updateSettings({ apiKey: e.target.value })}
                className="bg-background/50"
              />
            </div>

            {settings.provider === "local" && (
              <div className="space-y-2">
                <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Base URL
                </label>
                <Input
                  placeholder="http://localhost:11434 or http://localhost:1234/v1"
                  value={settings.baseUrl || ""}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  className="bg-background/50"
                />
                {localEndpointStatus ? (
                  <div className="flex items-start gap-1.5 text-[0.65rem] text-muted-foreground">
                    {isDetectingLocalEndpoint ? <Loader2 className="mt-0.5 size-3 animate-spin text-accent" /> : <Info className="mt-0.5 size-3 text-accent" />}
                    <span>{localEndpointStatus}</span>
                  </div>
                ) : null}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </label>
              {availableModels.length > 0 ? (
                <div className="relative">
                  <Input
                    placeholder={availableModels[0] || "e.g. gpt-4o"}
                    value={settings.model || ""}
                    onChange={(e) => updateSettings({ model: e.target.value })}
                    className="bg-background/50 pr-8"
                    list={`${settings.provider}-models`}
                  />
                  <datalist id={`${settings.provider}-models`}>
                    {availableModels.map(m => <option key={m} value={m} />)}
                  </datalist>
                  {settings.provider === "local" && localModels.length > 0 ? (
                    <p className="mt-1 text-[0.65rem] text-muted-foreground">
                      Models auto-detected and auto-filled from local endpoint (`/api/tags` or `/v1/models`).
                    </p>
                  ) : null}
                </div>
              ) : (
                <Input
                  placeholder="e.g. your-custom-model-name"
                  value={settings.model || ""}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                  className="bg-background/50"
                />
              )}
            </div>
          </div>

          <div className="mt-auto rounded-lg border border-accent/20 bg-accent/5 p-3">
            <div className="flex gap-2">
              <Info className="size-4 shrink-0 text-accent" />
              <div className="space-y-1">
                <p className="text-[0.7rem] font-semibold text-accent uppercase">Privacy Note</p>
                <p className="text-[0.7rem] text-muted-foreground leading-normal">
                  Chats and layer data are processed securely. Your API keys and chat history are stored locally in your browser and never sent to our servers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
