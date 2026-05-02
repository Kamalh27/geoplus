import type { GeoPlusLayerChartItem, GeoPlusLayerDatasetProfile } from "@/components/geoplus/types";

export type AiProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "deepseek" | "qwen" | "minimax" | "local";

export type AiSettings = {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string; // For local/custom endpoints
  model?: string;
};

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
};

export type AiAnalysisRequest = {
  layerName: string;
  datasetProfile?: GeoPlusLayerDatasetProfile;
  chartData: GeoPlusLayerChartItem[];
  userPrompt?: string;
};

export type AiAnalysisResponse = {
  insight: string;
  suggestedActions?: string[];
};
