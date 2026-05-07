"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertCircle, RefreshCw, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiSettings } from "./use-ai-settings";
import { runAiAnalysis } from "@/lib/geoplus/ai-service";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import type { AiAnalysisResponse } from "./types";
import { cn } from "@/lib/utils";

type GeoPlusAiInsightsProps = {
  layer: GeoPlusLayerItem;
};

export function GeoPlusAiInsights({ layer }: GeoPlusAiInsightsProps) {
  const { settings, isLoaded } = useAiSettings();
  const [analysis, setAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!settings.provider || (settings.provider !== "local" && !settings.apiKey)) {
      setError("Please configure your AI provider in the AI Assistant tab first (API key required for cloud providers).");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await runAiAnalysis(settings, {
        layerName: layer.name,
        datasetProfile: layer.duckDbDatasetProfile,
        chartData: layer.duckDbChartData || [],
      });
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <section className="mt-6 border-t border-border/50 pt-5">
      <div className="flex items-center justify-between px-1 mb-4">
        <p className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent">
          <Sparkles className="size-3.5" />
          AI Insights
        </p>
        
        {analysis && (
          <button 
            onClick={handleAnalyze}
            disabled={isLoading}
            className="text-[0.65rem] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-2.5", isLoading && "animate-spin")} />
            Regenerate
          </button>
        )}
      </div>

      {!analysis && !isLoading && !error && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-4 text-center">
          <p className="text-xs text-muted-foreground mb-4 px-2">
            Use AI to discover patterns, anomalies, and spatial relationships in this dataset.
          </p>
          <Button 
            onClick={handleAnalyze}
            size="sm"
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-8 rounded-lg w-full"
          >
            <Sparkles className="size-3.5 mr-2" />
            Analyze Layer
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-8 flex flex-col items-center justify-center text-center">
          <Loader2 className="size-6 text-accent animate-spin mb-3" />
          <p className="text-xs text-foreground font-medium">Consulting with AI...</p>
          <p className="text-[0.65rem] text-muted-foreground mt-1">Analyzing spatial patterns and distributions</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex gap-2 mb-2">
            <AlertCircle className="size-3.5 text-destructive shrink-0" />
            <p className="text-[0.7rem] font-semibold text-destructive uppercase">Analysis Error</p>
          </div>
          <p className="text-[0.7rem] text-destructive/80 leading-relaxed">
            {error}
          </p>
          {error.includes("configure") && (
            <p className="mt-3 text-[0.65rem] text-muted-foreground">
              Go to the <span className="text-accent font-medium">AI tab</span> in the sidebar to set up your credentials.
            </p>
          )}
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-muted/40 p-4">
            <div className="flex gap-2 mb-3">
              <MessageSquare className="size-3.5 text-accent shrink-0 mt-0.5" />
              <p className="text-xs text-foreground leading-relaxed">
                {analysis.insight}
              </p>
            </div>

            {analysis.suggestedActions && analysis.suggestedActions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase mb-2">Suggested Actions</p>
                <ul className="space-y-1.5">
                  {analysis.suggestedActions.map((action, i) => (
                    <li key={i} className="flex gap-2 text-[0.7rem] text-foreground/90">
                      <span className="text-accent mt-0.5">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
