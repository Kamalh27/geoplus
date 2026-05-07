"use client";

import { MapControls } from "@/components/geoplus/map-controls";
import { MapAttributionControl } from "@/components/geoplus/map-attribution-control";
import { MapLegendPanel } from "@/components/geoplus/map-legend-panel";
import { MapSearchPanel } from "@/components/geoplus/map-search-panel";
import { MapStatusMessage } from "@/components/geoplus/map-status-message";
import { getBasemapAttributionLines, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { useGeoPlusMap } from "@/components/geoplus/use-geoplus-map";
import { useAppSettings } from "@/components/geoplus/use-app-settings";

type GeoPlusMapProps = {
  selectedBasemapId: GeoPlusBasemapId;
  layers: GeoPlusLayerItem[];
  zoomToLayerRequest?: { layerId: string; nonce: number } | null;
  zoomToFeatureRequest?: { feature: GeoJSON.Feature; nonce: number } | null;
  onToggleLayerVisibility?: (layerId: string) => void;
  onClearFilters?: () => void;
};

export function GeoPlusMap({ selectedBasemapId, layers, zoomToLayerRequest = null, zoomToFeatureRequest = null, onToggleLayerVisibility, onClearFilters }: GeoPlusMapProps) {
  const { settings } = useAppSettings();
  const hasOverlayLayers = layers.length > 0;

  const {
    mapRootRef,
    mapContainerRef,
    searchInputRef,
    isFullscreen,
    isLocating,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isSearchPanelOpen,
    isLegendPanelOpen,
    isAttributionOpen,
    mapViewMode,
    mapProjectionMode,
    statusMessage,
    mapBearing,
    toggleSearchPanel,
    toggleLegendPanel,
    toggleAttributionPanel,
    closeAttributionPanel,
    setMapMode,
    toggleProjectionMode,
    runSearch,
    focusSearchResult,
    zoomIn,
    zoomOut,
    resetNavigation,
    goToCurrentLocation,
    toggleFullscreen,
  } = useGeoPlusMap(selectedBasemapId, layers, hasOverlayLayers, zoomToLayerRequest, zoomToFeatureRequest, settings);

  return (
    <div ref={mapRootRef} className="geoplus-map-root relative h-full w-full min-h-[420px]">
      <div ref={mapContainerRef} aria-label="GeoPlus map" className="h-full w-full min-h-[420px]" />

      <div className="pointer-events-none absolute inset-0 z-20">
        <MapSearchPanel
          isOpen={isSearchPanelOpen}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          isSearching={isSearching}
          searchResults={searchResults}
          statusMessage={statusMessage}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={runSearch}
          onSelectResult={focusSearchResult}
        />

        <MapControls
          isSearchPanelOpen={isSearchPanelOpen}
          isLegendPanelOpen={isLegendPanelOpen}
          mapViewMode={mapViewMode}
          mapProjectionMode={mapProjectionMode}
          isLocating={isLocating}
          isFullscreen={isFullscreen}
          mapBearing={mapBearing}
          onToggleSearchPanel={toggleSearchPanel}
          onToggleLegendPanel={toggleLegendPanel}
          onSetMapMode={setMapMode}
          onToggleProjectionMode={toggleProjectionMode}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetNavigation={resetNavigation}
          onGoToCurrentLocation={goToCurrentLocation}
          onToggleFullscreen={toggleFullscreen}
          onClearFilters={onClearFilters}
          settings={settings}
        />

        <MapLegendPanel
          isOpen={isLegendPanelOpen}
          onToggle={toggleLegendPanel}
          layers={layers}
          onToggleLayerVisibility={(layerId) => {
            if (onToggleLayerVisibility) {
              onToggleLayerVisibility(layerId);
            }
          }}
        />

        <MapStatusMessage message={statusMessage} hidden={isSearchPanelOpen} />

        <MapAttributionControl
          isOpen={isAttributionOpen}
          lines={getBasemapAttributionLines(selectedBasemapId)}
          onToggle={toggleAttributionPanel}
          onClose={closeAttributionPanel}
        />
      </div>
    </div>
  );
}
