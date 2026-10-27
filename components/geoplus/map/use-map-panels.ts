import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

export function useMapPanels(searchInputRef: RefObject<HTMLInputElement | null>) {
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isLegendPanelOpen, setIsLegendPanelOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);

  useEffect(() => {
    if (!isSearchPanelOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isSearchPanelOpen, searchInputRef]);

  const toggleSearchPanel = useCallback(() => {
    setIsSearchPanelOpen((open) => !open);
  }, []);

  const toggleLegendPanel = useCallback(() => {
    setIsLegendPanelOpen((open) => !open);
  }, []);

  const toggleAttributionPanel = useCallback(() => {
    setIsAttributionOpen((open) => !open);
  }, []);

  const closeAttributionPanel = useCallback(() => {
    setIsAttributionOpen(false);
  }, []);

  return {
    isSearchPanelOpen,
    isLegendPanelOpen,
    isAttributionOpen,
    toggleSearchPanel,
    toggleLegendPanel,
    toggleAttributionPanel,
    closeAttributionPanel,
  };
}
