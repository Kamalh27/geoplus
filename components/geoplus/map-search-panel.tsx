"use client";

import type { RefObject } from "react";
import { Loader2, Search } from "lucide-react";

import type { NominatimSearchResult } from "@/components/geoplus/types";

type MapSearchPanelProps = {
  isOpen: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  isSearching: boolean;
  searchResults: NominatimSearchResult[];
  statusMessage: string | null;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSelectResult: (result: NominatimSearchResult) => void;
};

export function MapSearchPanel({
  isOpen,
  searchInputRef,
  searchQuery,
  isSearching,
  searchResults,
  statusMessage,
  onSearchQueryChange,
  onSearchSubmit,
  onSelectResult,
}: MapSearchPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute right-14 top-3 w-[min(19rem,calc(100%-4.5rem))] rounded-2xl border border-border/80 bg-card/90 p-2.5 shadow-[0_14px_36px_rgba(15,23,42,0.25)] backdrop-blur-md dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSearchSubmit();
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="geoplus-map-search" className="sr-only">
          Search location
        </label>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchInputRef}
          id="geoplus-map-search"
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search places"
          className="h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label="Search places"
          title="Search places"
          disabled={isSearching}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border/70 bg-secondary px-2 text-xs font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearching ? <Loader2 className="size-3.5 animate-spin" /> : "Go"}
        </button>
      </form>

      {searchResults.length > 0 ? (
        <ul className="mt-2 max-h-44 space-y-1 overflow-auto rounded-lg border border-border/65 bg-background/60 p-1">
          {searchResults.map((result) => (
            <li key={`${result.lat}:${result.lon}:${result.display_name}`}>
              <button
                type="button"
                onClick={() => onSelectResult(result)}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-accent/20 hover:text-foreground"
                title={result.display_name}
              >
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {statusMessage ? <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p> : null}
    </div>
  );
}
