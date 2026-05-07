"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GuidedTourStep = {
  id: string;
  title: string;
  description: string;
  details: string;
  targetId: string;
  position: "right" | "left" | "top" | "bottom";
};

type GuidedTourProps = {
  steps: GuidedTourStep[];
  activeStepIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStepClick: (index: number) => void;
};

export function GuidedTour({
  steps,
  activeStepIndex,
  isOpen,
  onClose,
  onNext,
  onPrev,
  onStepClick,
}: GuidedTourProps) {
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverSize, setPopoverSize] = useState({ width: 340, height: 250 });
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document === "undefined") {
      return true;
    }
    return document.documentElement.classList.contains("dark");
  });
  const activeStep = steps[activeStepIndex];
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!popoverRef.current || !isOpen) return;
    
    const observer = new ResizeObserver(() => {
      if (popoverRef.current) {
        setPopoverSize({
          width: popoverRef.current.offsetWidth,
          height: popoverRef.current.offsetHeight,
        });
      }
    });
    
    observer.observe(popoverRef.current);
    return () => observer.disconnect();
  }, [isOpen, activeStepIndex]);

  const updateTargetRect = useCallback(() => {
    if (!activeStep) return;
    const element = document.getElementById(activeStep.targetId);
    if (element) {
      setTargetRect(element.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [activeStep]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(updateTargetRect);
      window.addEventListener("resize", updateTargetRect);
      window.addEventListener("scroll", updateTargetRect, true);
      
      const observer = new MutationObserver(updateTargetRect);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });

      return () => {
        window.removeEventListener("resize", updateTargetRect);
        window.removeEventListener("scroll", updateTargetRect, true);
        observer.disconnect();
      };
    }
  }, [isOpen, updateTargetRect]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const root = document.documentElement;
    const syncTheme = () => setIsDarkTheme(root.classList.contains("dark"));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
    };
  }, [mounted]);

  if (!mounted || !isOpen || !activeStep) return null;

  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === steps.length - 1;

  const getPopoverStyle = (): React.CSSProperties => {
    if (!targetRect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

    const gap = 16;
    const padding = 16;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
    const { width, height } = popoverSize;

    let left = 0;
    let top = 0;
    
    switch (activeStep.position) {
      case "right":
        left = targetRect.right + gap;
        top = targetRect.top + targetRect.height / 2 - height / 2;
        break;
      case "left":
        left = targetRect.left - gap - width;
        top = targetRect.top + targetRect.height / 2 - height / 2;
        break;
      case "top":
        left = targetRect.left + targetRect.width / 2 - width / 2;
        top = targetRect.top - gap - height;
        break;
      case "bottom":
        left = targetRect.left + targetRect.width / 2 - width / 2;
        top = targetRect.bottom + gap;
        break;
    }

    // Clamp to viewport to ensure the popover is never cut off
    left = Math.max(padding, Math.min(left, vw - width - padding));
    top = Math.max(padding, Math.min(top, vh - height - padding));

    return {
      top: `${top}px`,
      left: `${left}px`,
    };
  };

  const tourContent = (
    <div className="fixed inset-0 z-[1000] overflow-hidden pointer-events-none">
      {/* Backdrop with hole */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto">
        <defs>
          <mask id="guided-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.x - 4}
                y={targetRect.y - 4}
                width={targetRect.width + 8}
                height={targetRect.height + 8}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={isDarkTheme ? "rgba(2, 6, 23, 0.76)" : "rgba(15, 23, 42, 0.58)"}
          mask="url(#guided-tour-mask)"
          className="backdrop-blur-[2px] transition-all duration-300"
          onClick={onClose}
        />
      </svg>

      {/* Highlight ring */}
      {targetRect && (
        <div
          className="absolute rounded-xl border-2 border-accent shadow-[0_0_0_4px_rgba(20,212,159,0.2)] transition-all duration-300 dark:shadow-[0_0_0_4px_rgba(20,212,159,0.3)]"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* Popover Panel */}
      <div
        ref={popoverRef}
        className="absolute pointer-events-auto w-[340px] max-w-[90vw] transition-all duration-300"
        style={getPopoverStyle()}
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
          <header className="px-4 pt-4 flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
                Step {activeStepIndex + 1} of {steps.length}
              </p>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {activeStep.title}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full -mt-1 -mr-1 text-muted-foreground hover:bg-muted"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="px-4 py-3 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {activeStep.description}
            </p>
            <div className="bg-muted/50 rounded-xl p-3 border border-border/50">
              <p className="text-xs text-foreground/80 leading-normal">
                {activeStep.details}
              </p>
            </div>
          </div>

          <footer className="bg-muted/30 px-4 py-3 flex items-center justify-between border-t border-border">
            <div className="flex gap-1">
              {steps.map((_, index) => (
                <button
                  key={index}
                  className={cn(
                    "size-1.5 rounded-full transition-all",
                    index === activeStepIndex
                      ? "bg-accent w-4"
                      : "bg-muted hover:bg-muted-foreground/30"
                  )}
                  onClick={() => onStepClick(index)}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={onPrev}
                disabled={isFirst}
              >
                <ChevronLeft className="mr-1 size-3" />
                Back
              </Button>
              <Button
                size="sm"
                className="h-8 px-4 text-xs font-semibold"
                onClick={isLast ? onClose : onNext}
              >
                {isLast ? "Finish" : "Continue"}
                {!isLast && <ChevronRight className="ml-1 size-3" />}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(tourContent, document.body);
}
