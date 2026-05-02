"use client";

import { useEffect, useRef } from "react";
import { Info } from "lucide-react";

import type { GeoPlusAttributionLine } from "@/components/geoplus/map-style";

type MapAttributionControlProps = {
  isOpen: boolean;
  lines: GeoPlusAttributionLine[];
  onToggle: () => void;
  onClose: () => void;
  showScaleBar?: boolean;
};

export function MapAttributionControl({ isOpen, lines, onToggle, onClose, showScaleBar }: MapAttributionControlProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="pointer-events-auto absolute bottom-3 right-3 z-20">
      {isOpen ? (
        <div className="absolute right-[calc(100%+0.55rem)] top-1/2 w-max max-w-[min(20rem,calc(100vw-4.5rem))] -translate-y-1/2 rounded-md border border-border/75 bg-card/94 px-3 py-2 text-xs text-muted-foreground shadow-[0_12px_28px_rgba(15,23,42,0.24)] backdrop-blur-md dark:shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
          {lines.map((line) => (
            <p key={`${line.text}:${line.href ?? "plain"}`} className="first:mt-0 mt-1">
              {line.href ? (
                <a href={line.href} target="_blank" rel="noreferrer noopener" className="text-foreground underline decoration-border/80 underline-offset-2 transition hover:text-accent">
                  {line.text}
                </a>
              ) : (
                line.text
              )}
            </p>
          ))}
        </div>
      ) : null}

      <div className="group relative">
        <button
          type="button"
          aria-label={isOpen ? "Hide attribution details" : "Show attribution details"}
          title={isOpen ? "Hide attribution details" : "Show attribution details"}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/75 bg-card/92 text-card-foreground shadow-[0_10px_25px_rgba(15,23,42,0.2)] backdrop-blur transition hover:bg-accent/20 hover:text-accent dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${isOpen ? "bg-accent/20 text-accent" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <Info className="size-4" />
        </button>
        <span className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] right-0 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
          Attribution
        </span>
      </div>
    </div>
  );
}
