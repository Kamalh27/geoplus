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
  targetId: string | "center";
  position: "right" | "left" | "top" | "bottom" | "center";
  width?: number;
  capabilities?: { icon: React.ReactNode; title: string; desc: string }[];
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
  const activeStep = steps[activeStepIndex];
  const [popoverSize, setPopoverSize] = useState({ width: activeStep?.width || 360, height: 250 });
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document === "undefined") {
      return true;
    }
    return document.documentElement.classList.contains("dark");
  });
  
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
    if (activeStep.targetId === "center" || activeStep.position === "center") {
      setTargetRect(null);
      return;
    }
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
    if (activeStep.position === "center" || !targetRect) {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }

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
            {targetRect && activeStep.position !== "center" && (
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
      {targetRect && activeStep.position !== "center" && (
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
        className="absolute pointer-events-auto max-w-[95vw] transition-all duration-300"
        style={{ ...getPopoverStyle(), width: activeStep.width || 360 }}
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 flex flex-col max-h-[85vh]">
          <header className="px-5 pt-5 pb-2 flex justify-between items-start shrink-0">
            <div className="space-y-1 pr-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
                Step {activeStepIndex + 1} of {steps.length}
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {activeStep.title}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full shrink-0 -mt-1 -mr-2 text-muted-foreground hover:bg-muted"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="px-5 py-2 overflow-y-auto geoplus-panel-scroll">
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-4">
              {activeStep.description}
            </p>

            {activeStep.capabilities && activeStep.capabilities.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                {activeStep.capabilities.map((cap, i) => (
                  <div key={i} className="flex flex-col p-3.5 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                     <div className="mb-2.5 h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                       {cap.icon}
                     </div>
                     <h4 className="text-sm font-semibold mb-1 text-foreground">{cap.title}</h4>
                     <p className="text-xs text-muted-foreground leading-relaxed">{cap.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-muted/40 rounded-xl p-3.5 mb-2">
                <p className="text-[13px] text-foreground/90 leading-relaxed">
                  {activeStep.details}
                </p>
              </div>
            )}
          </div>

          <footer className="bg-muted/20 px-5 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex gap-1.5 flex-wrap flex-1 mr-2">
              {steps.map((_, index) => (
                <button
                  key={index}
                  className={cn(
                    "h-1.5 rounded-full transition-all shrink-0",
                    index === activeStepIndex
                      ? "bg-accent w-5"
                      : "bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/50"
                  )}
                  onClick={() => onStepClick(index)}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>
            <div className="flex gap-2 shrink-0">
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
