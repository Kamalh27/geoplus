"use client";

import { MapControls } from "@/components/geoplus/map-controls";
import { MapAttributionControl } from "@/components/geoplus/map-attribution-control";
import { MapLegendPanel } from "@/components/geoplus/map-legend-panel";
import { MediaViewerDialog } from "@/components/geoplus/media-viewer-dialog";
import { MapSearchPanel } from "@/components/geoplus/map-search-panel";
import { MapStatusMessage } from "@/components/geoplus/map-status-message";
import { getBasemapAttributionLines, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { useGeoPlusMap } from "@/components/geoplus/use-geoplus-map";
import type { AppSettings } from "@/components/geoplus/use-app-settings";

type GeoPlusMapProps = {
  selectedBasemapId: GeoPlusBasemapId;
  layers: GeoPlusLayerItem[];
  settings: AppSettings;
  zoomToLayerRequest?: { layerId: string; nonce: number } | null;
  zoomToFeatureRequest?: { feature: GeoJSON.Feature; nonce: number } | null;
  onToggleLayerVisibility?: (layerId: string) => void;
  onClearFilters?: () => void;
  onSaveDrawLayer?: (name: string, features: GeoJSON.FeatureCollection) => void;
};

export function GeoPlusMap({ selectedBasemapId, layers, settings, zoomToLayerRequest = null, zoomToFeatureRequest = null, onToggleLayerVisibility, onClearFilters, onSaveDrawLayer }: GeoPlusMapProps) {
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
    activeDrawMode,
    drawPurpose,
    selectedDrawFeature,
    drawMeasurements,
    activeDrawTemplate,
    setActiveDrawTemplate,
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
    setDrawMode,
    deleteSelectedDraw,
    clearAllDrawings,
    updateDrawFeatureProperty,
    saveDrawingsAsLayer,
    simplifySelectedDraw,
    smoothSelectedDraw,
    mediaViewerData,
    setMediaViewerData,
  } = useGeoPlusMap(selectedBasemapId, layers, zoomToLayerRequest, zoomToFeatureRequest, settings, onSaveDrawLayer);

  return (
    <div ref={mapRootRef} className="geoplus-map-root relative h-full w-full min-h-[420px] overflow-hidden">
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
          activeDrawMode={activeDrawMode}
          drawPurpose={drawPurpose}
          selectedDrawFeature={selectedDrawFeature}
          drawMeasurements={drawMeasurements}
          activeDrawTemplate={activeDrawTemplate}
          setActiveDrawTemplate={setActiveDrawTemplate}
          setMediaViewerData={setMediaViewerData}
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
          onSetDrawMode={setDrawMode}
          onDeleteSelectedDraw={deleteSelectedDraw}
          onClearAllDrawings={clearAllDrawings}
          onUpdateDrawFeatureProperty={updateDrawFeatureProperty}
          onSaveDrawingsAsLayer={saveDrawingsAsLayer}
          onSimplifySelectedDraw={simplifySelectedDraw}
          onSmoothSelectedDraw={smoothSelectedDraw}
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

        <MediaViewerDialog data={mediaViewerData} onClose={() => setMediaViewerData(null)} />
      </div>
    </div>
  );
}
