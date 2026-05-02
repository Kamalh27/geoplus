"use client";

import { useEffect, useState } from "react";
import type { AiChatMessage } from "./types";

const AI_CHAT_HISTORY_KEY = "geoplus-ai-chat-history";

export function useAiChat() {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(AI_CHAT_HISTORY_KEY);
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse AI chat history", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const addMessage = (message: Omit<AiChatMessage, "id" | "timestamp">) => {
    const newMessage: AiChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    setMessages((prev) => {
      const updated = [...prev, newMessage];
      localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });

    return newMessage;
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(AI_CHAT_HISTORY_KEY);
  };

  return {
    messages,
    addMessage,
    clearHistory,
    isLoaded,
  };
}
