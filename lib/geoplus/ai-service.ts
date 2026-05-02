import type { AiSettings, AiAnalysisRequest, AiAnalysisResponse, AiChatMessage } from "@/components/geoplus/ai/types";

const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434";

export async function chatWithAi(
  settings: AiSettings,
  messages: Omit<AiChatMessage, "id" | "timestamp">[]
): Promise<string> {
  const { provider, apiKey, baseUrl, model } = settings;

  if (!provider) {
    throw new Error("AI provider not configured.");
  }

  if (provider !== "local" && !apiKey) {
    throw new Error(`API key required for ${provider}.`);
  }

  const simplifiedMessages = messages.map((message) => ({ role: message.role, content: message.content }));

  try {
    if (provider === "openai") {
      return await chatOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, model || "gpt-4o-mini", simplifiedMessages);
    } else if (provider === "openrouter") {
      return await chatOpenAiCompatible("https://openrouter.ai/api/v1/chat/completions", apiKey, model || "openai/gpt-4o-mini", simplifiedMessages);
    } else if (provider === "deepseek") {
      return await chatOpenAiCompatible("https://api.deepseek.com/chat/completions", apiKey, model || "deepseek-chat", simplifiedMessages);
    } else if (provider === "qwen") {
      return await chatOpenAiCompatible("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", apiKey, model || "qwen-plus", simplifiedMessages);
    } else if (provider === "minimax") {
      return await chatOpenAiCompatible("https://api.minimax.chat/v1/text/chatcompletion_v2", apiKey, model || "abab6.5s-chat", simplifiedMessages);
    } else if (provider === "anthropic") {
      return await chatAnthropic(apiKey!, model || "claude-3-5-sonnet-20240620", simplifiedMessages);
    } else if (provider === "gemini") {
      return await chatGemini(apiKey!, model || "gemini-1.5-flash", simplifiedMessages);
    } else if (provider === "local") {
      return await chatLocal(baseUrl, apiKey, model, simplifiedMessages);
    }

    throw new Error(`Provider ${provider} not implemented.`);
  } catch (error) {
    console.error(`AI chat failed with ${provider}:`, error);
    throw error;
  }
}

async function chatLocal(
  baseUrl: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  messages: { role: string; content: string }[]
): Promise<string> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const openAiModel = model || "local-model";
  const ollamaModel = model || "llama3";
  const errors: string[] = [];

  for (const endpoint of buildLocalOpenAiChatEndpoints(normalizedBaseUrl)) {
    try {
      return await chatOpenAiCompatible(endpoint, apiKey, openAiModel, messages);
    } catch (error) {
      errors.push(`OpenAI-compatible (${endpoint}): ${toErrorMessage(error)}`);
    }
  }

  try {
    return await chatOllama(normalizedBaseUrl, ollamaModel, messages);
  } catch (error) {
    errors.push(`Ollama (${normalizedBaseUrl}/api/chat): ${toErrorMessage(error)}`);
    throw new Error(`Local endpoint failed. ${errors.join(" | ")}`);
  }
}

async function chatOpenAiCompatible(
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error from ${endpoint}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatAnthropic(apiKey: string, model: string, messages: { role: string; content: string }[]): Promise<string> {
  const systemMsg = messages.find((message) => message.role === "system")?.content;
  const filteredMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemMsg,
      messages: filteredMessages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || "Anthropic API error");
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}

async function chatGemini(apiKey: string, model: string, messages: { role: string; content: string }[]): Promise<string> {
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gemini API error");
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function chatOllama(baseUrl: string, model: string, messages: { role: string; content: string }[]): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error("Ollama API error");
  }

  const data = await response.json();
  return data.message?.content ?? "";
}

export async function runAiAnalysis(
  settings: AiSettings,
  request: AiAnalysisRequest
): Promise<AiAnalysisResponse> {
  const { provider, apiKey, baseUrl, model } = settings;

  if (!provider) {
    throw new Error("AI provider not configured.");
  }

  if (provider !== "local" && !apiKey) {
    throw new Error(`API key required for ${provider}.`);
  }

  const prompt = `
    You are a spatial data scientist assistant. Analyze the following dataset and provide insights.
    
    Layer Name: ${request.layerName}
    
    Dataset Profile:
    - Feature Count: ${request.datasetProfile?.featureCount}
    - Geometry Types: ${request.datasetProfile?.geometryTypes?.join(", ")}
    - Columns: ${request.datasetProfile?.dimensionColumns?.join(", ")}, ${request.datasetProfile?.measureColumns?.join(", ")}
    
    Chart Data (Summary of the data):
    ${JSON.stringify(request.chartData, null, 2)}
    
    User Question/Prompt: ${request.userPrompt || "Provide a summary and interesting insights about this data."}
    
    Provide your response in JSON format:
    {
      "insight": "Your detailed analysis and insights here...",
      "suggestedActions": ["Action 1", "Action 2"]
    }
  `;

  try {
    if (provider === "openai") {
      return await callOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, model || "gpt-4o-mini", prompt);
    } else if (provider === "openrouter") {
      return await callOpenAiCompatible("https://openrouter.ai/api/v1/chat/completions", apiKey, model || "openai/gpt-4o-mini", prompt);
    } else if (provider === "deepseek") {
      return await callOpenAiCompatible("https://api.deepseek.com/chat/completions", apiKey, model || "deepseek-chat", prompt);
    } else if (provider === "qwen") {
      return await callOpenAiCompatible("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", apiKey, model || "qwen-plus", prompt);
    } else if (provider === "minimax") {
      return await callOpenAiCompatible("https://api.minimax.chat/v1/text/chatcompletion_v2", apiKey, model || "abab6.5s-chat", prompt);
    } else if (provider === "anthropic") {
      return await callAnthropic(apiKey!, model || "claude-3-5-sonnet-20240620", prompt);
    } else if (provider === "gemini") {
      return await callGemini(apiKey!, model || "gemini-1.5-flash", prompt);
    } else if (provider === "local") {
      return await runLocalAnalysis(baseUrl, apiKey, model, prompt);
    }

    throw new Error(`Provider ${provider} not implemented.`);
  } catch (error) {
    console.error(`AI analysis failed with ${provider}:`, error);
    throw error;
  }
}

async function runLocalAnalysis(
  baseUrl: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  prompt: string
): Promise<AiAnalysisResponse> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const openAiModel = model || "local-model";
  const ollamaModel = model || "llama3";
  const errors: string[] = [];

  for (const endpoint of buildLocalOpenAiChatEndpoints(normalizedBaseUrl)) {
    try {
      return await callOpenAiCompatible(endpoint, apiKey, openAiModel, prompt);
    } catch (error) {
      errors.push(`OpenAI-compatible (${endpoint}): ${toErrorMessage(error)}`);
    }
  }

  try {
    return await callOllama(normalizedBaseUrl, ollamaModel, prompt);
  } catch (error) {
    errors.push(`Ollama (${normalizedBaseUrl}/api/generate): ${toErrorMessage(error)}`);
    throw new Error(`Local endpoint failed. ${errors.join(" | ")}`);
  }
}

async function callOpenAiCompatible(
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  prompt: string
): Promise<AiAnalysisResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON object.` }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error from ${endpoint}`);
  }

  const data = await response.json();
  return parseJsonResponse(data.choices?.[0]?.message?.content ?? "");
}

function parseJsonResponse(text: string): AiAnalysisResponse {
  try {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/{[\s\S]*}/);
    const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
    return JSON.parse(jsonString);
  } catch {
    console.error("Failed to parse AI JSON response:", text);
    return {
      insight: text,
      suggestedActions: [],
    };
  }
}

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<AiAnalysisResponse> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: `${prompt}\n\nIMPORTANT: Return ONLY the JSON object.` }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Anthropic API error");
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";
  return parseJsonResponse(text);
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<AiAnalysisResponse> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\nIMPORTANT: Return ONLY the JSON object.` }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Gemini API error");
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseJsonResponse(text);
}

async function callOllama(baseUrl: string, model: string, prompt: string): Promise<AiAnalysisResponse> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error("Ollama API error");
  }

  const data = await response.json();
  return parseJsonResponse(data.response ?? "");
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl?.trim()) {
    return DEFAULT_LOCAL_BASE_URL;
  }
  return baseUrl.trim().replace(/\/+$/, "");
}

function buildLocalOpenAiChatEndpoints(baseUrl: string): string[] {
  if (baseUrl.endsWith("/chat/completions")) {
    return [baseUrl];
  }

  const endpoints = [baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/chat/completions`];
  if (!baseUrl.endsWith("/v1")) {
    endpoints.push(`${baseUrl}/v1/chat/completions`);
  }

  return [...new Set(endpoints)];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
