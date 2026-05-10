export type NominatimSearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

export type GeoPlusLayerSourceMode = "upload" | "url" | "service" | "gis-paste" | "sample-layers" | "analysis";
export type GeoPlusLayerEngine = "deck" | "maplibre";
export type GeoPlusRendererPreference = "deck";
export type GeoPlusLayerType = "geojson" | "scatterplot" | "mvt" | "raster-tile" | "wms";
export type GeoPlusLayerTypePreference = "auto" | GeoPlusLayerType;
export type GeoPlusServiceType = "wms" | "wmts" | "wfs" | "xyz" | "tms" | "mvt" | "pmtiles" | "cog" | "mlt" | "mbtiles";
export type GeoPlusLayerStylePreset = "emerald" | "sky" | "amber" | "rose" | "slate" | "violet" | "lime" | "teal";
export type GeoPlusLayerDuckDbStatus = "idle" | "processing" | "ready" | "error";
export type GeoPlusLayerColumnKind = "text" | "number" | "boolean";
export type GeoPlusSpatialAnalysisOperation = "buffer" | "clip" | "simplify" | "smooth" | "fix_geometry";
export type GeoPlusSpatialBufferUnit = "meters" | "kilometers" | "miles";
export type GeoPlusMarkerStyle = "solid" | "ring" | "glow" | "symbol" | "image";
export type GeoPlusMarkerSymbol = "dot" | "diamond" | "triangle" | "square" | "star" | "pin";
export type GeoPlusColorRamp = "vivid" | "earth" | "pastel" | "magma" | "inferno" | "plasma" | "viridis" | "ylgnbu" | "orrd" | "coolwarm" | "spring" | "summer" | "autumn" | "winter" | "jet" | "bone" | "copper" | "custom";
export type GeoPlusClassificationMethod = "categorical" | "equal-interval" | "quantile";

export type GeoPlusLayerStyleConfig = {
  fillColor?: string;
  lineColor?: string;
  pointColor?: string;
  labelColor?: string;
  fillOpacity?: number;
  lineWidth?: number;
  pointRadius?: number;
  labelSize?: number;
  markerStyle?: GeoPlusMarkerStyle;
  markerSymbol?: GeoPlusMarkerSymbol;
  customMarkerDataUrl?: string;
  colorByField?: string;
  colorRamp?: GeoPlusColorRamp;
  customColorRamp?: string[];
  classificationMethod?: GeoPlusClassificationMethod;
  classificationClasses?: number;
};

export type GeoPlusLayerChartItem = {
  label: string;
  value: number;
};

export type GeoPlusLayerChartColumn = {
  columnName: string;
  label: string;
  kind: GeoPlusLayerColumnKind;
};

export type GeoPlusLayerFilterOption = {
  label: string;
  value: string;
  count: number;
  predicate: string;
};

export type GeoPlusLayerFilterRange = {
  label: string;
  min: number;
  max: number;
  count: number;
  predicate: string;
};

export type GeoPlusLayerFilterField = {
  columnName: string;
  label: string;
  kind: GeoPlusLayerColumnKind;
  distinctCount?: number;
  min?: number;
  max?: number;
  options?: GeoPlusLayerFilterOption[];
  ranges?: GeoPlusLayerFilterRange[];
};

export type GeoPlusLayerDatasetProfile = {
  featureCount: number;
  geometryTypes: string[];
  dimensionColumns: string[];
  measureColumns: string[];
  filterColumns: string[];
};

export type GeoPlusLayerItem = {
  id: string;
  name: string;
  sourceMode: GeoPlusLayerSourceMode;
  engine: GeoPlusLayerEngine;
  layerType: GeoPlusLayerType;
  tilesetProfileId?: string;
  rendererPreference: GeoPlusRendererPreference;
  layerTypePreference: GeoPlusLayerTypePreference;
  sourceUrl?: string;
  serviceType?: GeoPlusServiceType;
  fileName?: string;
  originalFile?: File;
  rawInlineData?: unknown;
  inlineData?: unknown;
  detectionSummary?: string;
  visible: boolean;
  opacity: number;
  stylePreset: GeoPlusLayerStylePreset;
  styleConfig?: GeoPlusLayerStyleConfig;
  labelEnabled?: boolean;
  labelField?: string;
  duckDbWhereClause?: string;
  duckDbColumns?: string[];
  duckDbChartLabelColumn?: string;
  duckDbChartColumns?: GeoPlusLayerChartColumn[];
  duckDbChartData?: GeoPlusLayerChartItem[];
  duckDbFilterFields?: GeoPlusLayerFilterField[];
  duckDbDatasetProfile?: GeoPlusLayerDatasetProfile;
  duckDbRowCount?: number;
  duckDbStatus?: GeoPlusLayerDuckDbStatus;
  duckDbError?: string;

  interactionConfig?: {
    tooltipEnabled?: boolean;
    popupEnabled?: boolean;
    tooltipFields?: string[];
    popupFields?: string[];
    fieldDisplayNames?: Record<string, string>;
    hoverHighlightEnabled?: boolean;
    hoverHighlightColor?: string;
    hoverLineColor?: string;
    hoverFillOpacity?: number;
    hoverLineWidth?: number;
    hoverPointRadius?: number;
  };
};
