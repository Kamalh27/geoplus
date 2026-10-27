import { useCallback, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { searchNominatimLocations } from "@/components/geoplus/map-search-service";
import type { NominatimSearchResult } from "@/components/geoplus/types";

type UseMapSearchArgs = {
  searchAbortRef: RefObject<AbortController | null>;
  flyToCoordinates: (longitude: number, latitude: number, zoom?: number) => void;
  setMapMarker: (longitude: number, latitude: number) => void;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
};

export function useMapSearch({ searchAbortRef, flyToCoordinates, setMapMarker, setStatusMessage }: UseMapSearchArgs) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const focusSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      const longitude = Number(result.lon);
      const latitude = Number(result.lat);

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        setStatusMessage("Could not locate that search result on the map.");
        return;
      }

      flyToCoordinates(longitude, latitude);
      setMapMarker(longitude, latitude);
      setSearchQuery(result.display_name);
      setSearchResults([]);
      setStatusMessage(null);
    },
    [flyToCoordinates, setMapMarker, setStatusMessage],
  );

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setStatusMessage("Enter a place or address to search.");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    setStatusMessage(null);

    try {
      const results = await searchNominatimLocations(query, controller.signal);
      if (results.length === 0) {
        setSearchResults([]);
        setStatusMessage("No locations matched that search.");
        return;
      }

      setSearchResults(results);
      focusSearchResult(results[0]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setSearchResults([]);
      setStatusMessage("Search is temporarily unavailable.");
    } finally {
      setIsSearching(false);
    }
  }, [focusSearchResult, searchQuery, searchAbortRef, setStatusMessage]);

  return { searchQuery, setSearchQuery, searchResults, isSearching, focusSearchResult, runSearch };
}
