"use client";

type MapStatusMessageProps = {
  message: string | null;
  hidden: boolean;
};

export function MapStatusMessage({ message, hidden }: MapStatusMessageProps) {
  if (!message || hidden) {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute right-14 top-3 max-w-[min(19rem,calc(100%-4.5rem))] rounded-lg border border-border/70 bg-card/92 px-2.5 py-1.5 text-xs text-muted-foreground shadow-[0_10px_25px_rgba(15,23,42,0.2)] backdrop-blur dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      {message}
    </div>
  );
}
