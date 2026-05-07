"use client";

import { type ComponentType, type FormEvent, useMemo, useState } from "react";
import { CircleHelp, Clipboard, Database, Download, FileText, Layers3, Link2, Plus, Upload, X } from "lucide-react";

import type { GeoPlusLayerItem, GeoPlusLayerTypePreference, GeoPlusRendererPreference, GeoPlusServiceType } from "@/components/geoplus/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  detectLayerPipeline,
  resolvePipeline,
  serviceOptions,
  serviceUrlPlaceholders,
  type GeoPlusAddDataMode,
} from "@/lib/geoplus/layer-pipeline";
import { buildLayerFromAddDataInput } from "@/lib/geoplus/add-layer";
import {
  detectGeoJsonSourceProjection,
  reprojectGeoJsonToWgs84,
  type GeoPlusSourceProjection,
  type GeoPlusSourceProjectionChoice,
} from "@/lib/geoplus/projection";
import { getServiceTilesetProfile } from "@/lib/geoplus/tilesets/profiles";
import {
  parseUploadedSpatialFile,
  supportedUploadAccept,
  supportedUploadExtensions,
  type ParsedUploadLayer,
} from "@/lib/geoplus/upload-parsers";
import { cn } from "@/lib/utils";

type AddDataDialogProps = {
  onAddLayer: (layer: GeoPlusLayerItem) => void;
  existingLayers: GeoPlusLayerItem[];
};

type SampleLayerOption = {
  id: string;
  serviceType: GeoPlusServiceType;
  name: string;
  description: string;
  sourceUrl: string;
  sourceHint?: string;
};

const modeOptions: {
  id: GeoPlusAddDataMode;
  label: string;
  icon: ComponentType<{ className?: string }>;
  helper: string;
}[] = [
  { id: "upload", label: "Upload", icon: Upload, helper: "Upload geospatial data from your local computer" },
  { id: "service", label: "Tileset", icon: Link2, helper: "Connect WMS, WMTS, MVT, PMTiles, COG, and more" },
  { id: "url", label: "URL", icon: Download, helper: "Load datasets from external URLs or object storage" },
  { id: "gis-paste", label: "Paste", icon: Clipboard, helper: "Paste GeoJSON or WKT geometry" },
  { id: "existing-layers", label: "Hosted Layers", icon: Database, helper: "View hosted account layers" },
  { id: "sample-layers", label: "Sample Layers", icon: Layers3, helper: "Quick-start demo layers" },
];

const sampleLayerOptions: SampleLayerOption[] = [
  {
    id: "wms-us-states",
    serviceType: "wms",
    name: "OpenStreetMap WMS",
    description: "Stable public WMS endpoint for quick raster overlay testing.",
    sourceUrl: "https://ows.terrestris.de/osm/service?layers=OSM-WMS",
    sourceHint: "Layer: OSM-WMS",
  },
  {
    id: "wmts-modis-truecolor",
    serviceType: "wmts",
    name: "NASA GIBS WMTS",
    description: "WMTS imagery endpoint for satellite-style tile rendering.",
    sourceUrl:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2015-06-07/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
    sourceHint: "Layer: MODIS_Terra_CorrectedReflectance_TrueColor · Max zoom: 9",
  },
  {
    id: "wfs-us-states-geojson",
    serviceType: "wfs",
    name: "US States WFS GeoJSON",
    description: "WFS GetFeature sample returning GeoJSON features.",
    sourceUrl:
      "https://ahocevar.com/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=topp:states&outputFormat=application/json",
    sourceHint: "Output: GeoJSON",
  },
  {
    id: "xyz-openstreetmap",
    serviceType: "xyz",
    name: "OpenStreetMap XYZ",
    description: "Classic XYZ tile URL template.",
    sourceUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  {
    id: "tms-open-topo",
    serviceType: "tms",
    name: "OpenTopoMap TMS",
    description: "TMS-style raster tile sample for terrain basemap overlays.",
    sourceUrl: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  },
  {
    id: "mvt-carto-streets",
    serviceType: "mvt",
    name: "CARTO Streets MVT",
    description: "Public vector tile sample using the Deck.gl MVTLayer reference pattern.",
    sourceUrl: "https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt",
  },
  {
    id: "pmtiles-protomaps",
    serviceType: "pmtiles",
    name: "Stamen Toner PMTiles",
    description: "Raster PMTiles sample rendered through the MapLibre protocol path.",
    sourceUrl: "https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles",
    sourceHint: "Stamen Toner raster PMTiles archive",
  },
  {
    id: "cog-usgs-raster",
    serviceType: "cog",
    name: "Geomatico COG Raster",
    description: "COG sample rendered through the MapLibre COG protocol path.",
    sourceUrl: "https://labs.geomatico.es/maplibre-cog-protocol/data/image.tif",
  },
  {
    id: "mlt-demo-stream",
    serviceType: "mlt",
    name: "MLT Demo Stream",
    description: "MLT tile stream sample URL template.",
    sourceUrl: "https://example.com/tiles/{z}/{x}/{y}.mlt",
  },
];

const projectionOptions: Array<{ value: GeoPlusSourceProjectionChoice; label: string }> = [
  { value: "default", label: "Default (Auto-detect / WGS84 OGC:CRS84)" },
  { value: "EPSG:4326", label: "EPSG:4326 (WGS84)" },
  { value: "OGC:CRS84", label: "OGC:CRS84 (WGS84 lon/lat)" },
  { value: "EPSG:3857", label: "EPSG:3857 (Web Mercator meters)" },
];

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const resolveProjectionChoice = (args: {
  choice: GeoPlusSourceProjectionChoice;
  parsedUploadLayer: ParsedUploadLayer | null;
}): GeoPlusSourceProjection => {
  const { choice, parsedUploadLayer } = args;
  if (choice !== "default") {
    return choice;
  }
  if (!parsedUploadLayer?.inlineData) {
    return "EPSG:4326";
  }
  return detectGeoJsonSourceProjection(parsedUploadLayer.inlineData) ?? "EPSG:4326";
};

export function AddDataDialog({ onAddLayer, existingLayers }: AddDataDialogProps) {
  const sampleLayersByServiceType = useMemo(() => {
    const grouped = Object.fromEntries(serviceOptions.map((type) => [type, [] as SampleLayerOption[]])) as Record<
      GeoPlusServiceType,
      SampleLayerOption[]
    >;
    for (const option of sampleLayerOptions) {
      grouped[option.serviceType].push(option);
    }
    return grouped;
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<GeoPlusAddDataMode>("upload");
  const [serviceType, setServiceType] = useState<GeoPlusServiceType>("wms");
  const [sampleServiceType, setSampleServiceType] = useState<GeoPlusServiceType>("wms");
  const [rendererPreference, setRendererPreference] = useState<GeoPlusRendererPreference>("deck");
  const [layerTypePreference, setLayerTypePreference] = useState<GeoPlusLayerTypePreference>("auto");
  const [layerName, setLayerName] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [sourceProjectionChoice, setSourceProjectionChoice] = useState<GeoPlusSourceProjectionChoice>("default");
  const [externalUrl, setExternalUrl] = useState("");
  const [hasFetchedUrl, setHasFetchedUrl] = useState(false);
  const [urlFetchError, setUrlFetchError] = useState("");
  const [layerConfigError, setLayerConfigError] = useState("");
  const [serviceUrl, setServiceUrl] = useState("");
  const [gisText, setGisText] = useState("");
  const [parsedUploadLayer, setParsedUploadLayer] = useState<ParsedUploadLayer | null>(null);
  const [selectedSampleLayerId, setSelectedSampleLayerId] = useState(sampleLayersByServiceType.wms[0]?.id ?? "");

  const resetForm = () => {
    setMode("upload");
    setServiceType("wms");
    setSampleServiceType("wms");
    setRendererPreference("deck");
    setLayerTypePreference("auto");
    setLayerName("");
    setFileName("");
    setFileSizeBytes(0);
    setSourceProjectionChoice("default");
    setExternalUrl("");
    setHasFetchedUrl(false);
    setUrlFetchError("");
    setLayerConfigError("");
    setServiceUrl("");
    setGisText("");
    setParsedUploadLayer(null);
    setSelectedSampleLayerId(sampleLayersByServiceType.wms[0]?.id ?? "");
  };

  const modeLabel = useMemo(() => modeOptions.find((option) => option.id === mode)?.label ?? "Data", [mode]);
  const activeSampleLayerOptions = useMemo(
    () => sampleLayersByServiceType[sampleServiceType] ?? [],
    [sampleLayersByServiceType, sampleServiceType],
  );
  const selectedSampleLayer = useMemo(
    () => sampleLayerOptions.find((option) => option.id === selectedSampleLayerId) ?? null,
    [selectedSampleLayerId],
  );
  const detectedPipeline = useMemo(
    () =>
      detectLayerPipeline({
        mode,
        fileName,
        inputUrl: mode === "service" ? serviceUrl : externalUrl,
        serviceType,
      }),
    [externalUrl, fileName, mode, serviceType, serviceUrl],
  );
  const activeServiceProfile = useMemo(() => {
    if (mode !== "service") {
      return null;
    }
    return getServiceTilesetProfile(serviceType);
  }, [mode, serviceType]);

  const isValidExternalUrl = useMemo(() => {
    const nextUrl = externalUrl.trim();
    if (!nextUrl) {
      return false;
    }

    try {
      new URL(nextUrl);
      return true;
    } catch {
      return false;
    }
  }, [externalUrl]);

  const resolvedSourceProjection = useMemo(
    () =>
      resolveProjectionChoice({
        choice: sourceProjectionChoice,
        parsedUploadLayer,
      }),
    [parsedUploadLayer, sourceProjectionChoice],
  );

  const willReprojectToWgs84 = mode === "upload" && Boolean(parsedUploadLayer?.inlineData) && resolvedSourceProjection === "EPSG:3857";

  const canSubmit = useMemo(() => {
    if (mode === "upload") {
      return Boolean(fileName) && parsedUploadLayer !== null;
    }
    if (mode === "url") {
      return isValidExternalUrl;
    }
    if (mode === "service") {
      return Boolean(serviceUrl.trim());
    }
    if (mode === "gis-paste") {
      return Boolean(gisText.trim());
    }
    if (mode === "existing-layers") {
      return false;
    }
    return Boolean(selectedSampleLayer);
  }, [fileName, gisText, isValidExternalUrl, mode, parsedUploadLayer, selectedSampleLayer, serviceUrl]);

  const onFetchUrl = () => {
    const nextUrl = externalUrl.trim();
    if (!nextUrl) {
      setHasFetchedUrl(false);
      setUrlFetchError("Enter a URL first.");
      return;
    }

    try {
      new URL(nextUrl);
      setHasFetchedUrl(true);
      setUrlFetchError("");
    } catch {
      setHasFetchedUrl(false);
      setUrlFetchError("Enter a valid URL before fetching.");
    }
  };

  const hasWmsLayersParam = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    try {
      const parsed = new URL(trimmed);
      return Array.from(parsed.searchParams.keys()).some((key) => {
        if (key.toLowerCase() !== "layers") {
          return false;
        }
        return Boolean(parsed.searchParams.get(key)?.trim());
      });
    } catch {
      return /(?:\?|&)layers=([^&]+)/i.test(trimmed);
    }
  };

  const hasTileTemplateParams = (value: string) => {
    const trimmed = value.trim();
    return trimmed.includes("{z}") && trimmed.includes("{x}") && trimmed.includes("{y}");
  };

  const clearStagedUpload = () => {
    setFileName("");
    setFileSizeBytes(0);
    setParsedUploadLayer(null);
    setSourceProjectionChoice("default");
    setLayerConfigError("");
    const fileInput = document.getElementById("dataset-upload") as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setLayerConfigError("");
    try {
      if (mode === "sample-layers" && !selectedSampleLayer) {
        setLayerConfigError("Choose a sample layer to continue.");
        return;
      }

      const submitMode: GeoPlusAddDataMode = mode === "sample-layers" ? "service" : mode;
      const submitServiceType = mode === "sample-layers" && selectedSampleLayer ? selectedSampleLayer.serviceType : serviceType;
      const submitServiceUrl = mode === "sample-layers" && selectedSampleLayer ? selectedSampleLayer.sourceUrl : serviceUrl;
      const submitPipelineDetection =
        mode === "sample-layers"
          ? detectLayerPipeline({
              mode: "service",
              fileName: "",
              inputUrl: submitServiceUrl,
              serviceType: submitServiceType,
            })
          : detectedPipeline;
      if (submitMode === "service" && submitServiceType === "wms" && !hasWmsLayersParam(submitServiceUrl)) {
        setLayerConfigError("WMS URLs must include a layers parameter, e.g. ?layers=workspace:layer_name.");
        return;
      }
      if (submitMode === "service" && submitServiceType === "wmts" && !hasTileTemplateParams(submitServiceUrl)) {
        setLayerConfigError("WMTS URLs must be tile templates with {z}, {x}, and {y}. Raw WMTS service endpoints are not parsed yet.");
        return;
      }
      const { engine: submitEngine, layerType: submitLayerType } = resolvePipeline({
        detected: submitPipelineDetection,
        rendererPreference,
        layerTypePreference,
      });

      const parsedUploadLayerForSubmit =
        submitMode === "upload" && parsedUploadLayer
          ? {
              ...parsedUploadLayer,
              inlineData:
                parsedUploadLayer.inlineData && resolvedSourceProjection === "EPSG:3857"
                  ? reprojectGeoJsonToWgs84(parsedUploadLayer.inlineData, resolvedSourceProjection)
                  : parsedUploadLayer.inlineData,
            }
          : parsedUploadLayer;

      const nextLayer = buildLayerFromAddDataInput({
        mode: submitMode,
        layerName,
        fileName,
        externalUrl,
        serviceUrl: submitServiceUrl,
        serviceType: submitServiceType,
        gisText,
        selectedSampleLayerName: selectedSampleLayer?.name,
        existingLayers,
        parsedUploadLayer: parsedUploadLayerForSubmit,
        detectedPipeline: submitPipelineDetection,
        resolvedLayerType: submitLayerType,
        resolvedEngine: submitEngine,
        rendererPreference,
        layerTypePreference,
      });

      onAddLayer(nextLayer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add layer.";
      setLayerConfigError(message);
      return;
    }

    setIsOpen(false);
    resetForm();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 rounded-sm bg-accent px-3.5 text-[0.82rem] font-semibold text-accent-foreground shadow-[0_8px_18px_rgba(20,212,159,0.2)] hover:bg-accent/85">
          <Plus className="mr-1 size-3.5" />
          Add Data
        </Button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="h-[min(82vh,44rem)] w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] lg:w-[calc(100%-3rem)] max-w-[64rem] gap-0 overflow-hidden border border-border/80 bg-background p-0 text-foreground shadow-[0_26px_70px_rgba(15,23,42,0.28)] dark:border-accent/30 dark:shadow-[0_34px_78px_rgba(0,0,0,0.62)]"
      >
        <form className="flex h-full min-h-0 flex-col" onSubmit={onSubmit}>
          <header className="flex items-center justify-between border-b border-border/80 bg-gradient-to-r from-background via-background to-muted/40 px-6 py-5">
            <div className="space-y-1">
              <DialogTitle className="text-[1.3rem] font-semibold tracking-tight text-foreground sm:text-[1.45rem]">Add New Layer</DialogTitle>
              <DialogDescription className="sr-only">
                Choose a data source, configure options, and add a new layer to the map.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border/80 bg-card/70 text-muted-foreground transition hover:border-accent/60 hover:bg-accent/12 hover:text-accent"
                title="Help"
                aria-label="Help"
              >
                <CircleHelp className="size-5" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border/80 bg-card/70 text-muted-foreground transition hover:border-accent/60 hover:bg-accent/12 hover:text-accent"
                title="Close"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap items-center border-b border-border/80">
              {modeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = option.id === mode;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setMode(option.id);
                      if (option.id === "sample-layers") {
                        const activeSamples = sampleLayersByServiceType[sampleServiceType] ?? [];
                        const hasCurrentSelection = activeSamples.some((sample) => sample.id === selectedSampleLayerId);
                        if (!hasCurrentSelection) {
                          setSelectedSampleLayerId(activeSamples[0]?.id ?? "");
                        }
                      }
                      setUrlFetchError("");
                      setLayerConfigError("");
                    }}
                    className={cn(
                      "flex items-center gap-2.5 border-t-2 border-t-transparent px-5 py-4 text-left text-[0.78rem] font-semibold uppercase tracking-[0.07em] transition sm:text-[0.8rem]",
                      isActive
                        ? "border-t-accent text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-5 px-6 py-6">
              {mode === "existing-layers" ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/35 px-5 py-6 text-center">
                    <p className="text-sm font-semibold text-foreground">No saved layers available</p>
                    <p className="mt-1 text-sm text-muted-foreground">Sign in to view layers from your account.</p>
                  </div>

                  {existingLayers.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Current Map Layers</h4>
                      {existingLayers.map((layer) => (
                        <div
                          key={layer.id}
                          className="flex items-center gap-2 rounded-md border border-border/80 bg-card/70 px-3 py-2.5 text-sm text-foreground"
                        >
                          <Database className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{layer.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <p
                    className={cn(
                      "text-muted-foreground",
                      mode === "service" ? "pb-1 text-[0.9rem] leading-snug" : "text-[1.01rem]",
                    )}
                  >
                    {mode === "upload"
                      ? "Load geospatial data from your local computer."
                      : mode === "url"
                        ? "Fetch data from an external URL or cloud object storage."
                      : mode === "service"
                        ? "Connect map services and stream live layers."
                      : mode === "gis-paste"
                          ? "Paste GIS features as GeoJSON or WKT."
                          : "Browse sample layers by service type and add them instantly."}
                  </p>

                  {mode === "service" ? null : (
                    <div className="space-y-1.5">
                      <label htmlFor="layer-name" className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Layer Name (Optional)
                      </label>
                      <Input
                        id="layer-name"
                        value={layerName}
                        onChange={(event) => setLayerName(event.target.value)}
                        placeholder={`${modeLabel} layer`}
                        className="border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-accent/20"
                      />
                    </div>
                  )}

                  {mode === "upload" ? (
                    <div className="space-y-3">
                      {!fileName ? (
                        <label
                          htmlFor="dataset-upload"
                          className="group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-muted/30 px-6 py-8 text-center transition hover:border-accent/70 hover:bg-accent/8"
                        >
                          <Upload className="size-9 text-muted-foreground transition group-hover:text-accent" />
                          <p className="mt-4 text-[1.02rem] font-medium text-foreground">Drop spatial files here or click to browse</p>
                          <p className="mt-2 text-sm text-muted-foreground">Supported formats: GeoJSON (.geojson), JSON (.json), TileJSON (.tilejson), CSV (.csv), TSV (.tsv), Shapefile (.shp or .zip), GeoPackage (.gpkg), Parquet/GeoParquet (.parquet), PMTiles (.pmtiles), COG/GeoTIFF (.tif), KML/KMZ (.kml, .kmz), and Zarr (.zarr, .zarr.zip)</p>
                        </label>
                      ) : null}
                      <Input
                        id="dataset-upload"
                        type="file"
                        className="hidden"
                        accept={supportedUploadAccept}
                        onChange={async (event) => {
                          const file = event.target.files?.[0] ?? null;
                          setLayerConfigError("");
                          setParsedUploadLayer(null);
                          setSourceProjectionChoice("default");

                          if (!file) {
                            setFileName("");
                            setFileSizeBytes(0);
                            return;
                          }

                          setFileName(file.name);
                          setFileSizeBytes(file.size);
                          const fileExtension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
                          if (!supportedUploadExtensions.includes(fileExtension)) {
                            setLayerConfigError(`Unsupported file type. Upload ${supportedUploadExtensions.join(", ")}.`);
                            return;
                          }

                          try {
                            const parsedLayer = await parseUploadedSpatialFile(file);
                            setParsedUploadLayer(parsedLayer);
                          } catch (error) {
                            const message = error instanceof Error ? error.message : "Unable to parse the selected file.";
                            setLayerConfigError(message);
                          }
                        }}
                      />
                      {fileName ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Staged Layers (1)</p>
                            <button
                              type="button"
                              onClick={clearStagedUpload}
                              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                            >
                              Clear all
                            </button>
                          </div>

                          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background/70 text-accent">
                                  <FileText className="size-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[1.04rem] font-semibold text-foreground">{fileName}</p>
                                  <p className="text-sm text-muted-foreground">1 file ({formatFileSize(fileSizeBytes)})</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={clearStagedUpload}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/20 hover:text-foreground"
                                aria-label="Remove staged layer"
                                title="Remove staged layer"
                              >
                                <X className="size-4" />
                              </button>
                            </div>

                            <div className="mt-4 space-y-1.5">
                              <label htmlFor="source-projection" className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                Source Projection (Optional)
                              </label>
                              <select
                                id="source-projection"
                                value={sourceProjectionChoice}
                                onChange={(event) => setSourceProjectionChoice(event.target.value as GeoPlusSourceProjectionChoice)}
                                className="h-10 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20"
                              >
                                {projectionOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>

                              <p className="text-xs text-muted-foreground">
                                {sourceProjectionChoice === "default" ? `Auto-detected source: ${resolvedSourceProjection}. ` : `Source projection: ${resolvedSourceProjection}. `}
                                {willReprojectToWgs84
                                  ? "Coordinates will be reprojected to WGS84 before adding."
                                  : "Target projection stays WGS84 (EPSG:4326 / OGC:CRS84)."}
                              </p>
                              {parsedUploadLayer ? <p className="text-xs text-muted-foreground">{parsedUploadLayer.readyMessage}</p> : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {mode === "url" ? (
                    <div className="space-y-3">
                      <label htmlFor="external-url" className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Data URL
                      </label>
                      <Input
                        id="external-url"
                        type="url"
                        value={externalUrl}
                        onChange={(event) => {
                          setExternalUrl(event.target.value);
                          setHasFetchedUrl(false);
                          setUrlFetchError("");
                        }}
                        className="border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-accent/20"
                        placeholder="https://example.com/data.geojson or s3://bucket/file.pmtiles"
                      />
                      <p className="text-xs text-muted-foreground">Supports public HTTP(S) links and cloud storage URLs.</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={onFetchUrl}
                          className="bg-accent text-accent-foreground shadow-[0_6px_14px_rgba(20,212,159,0.28)] hover:bg-accent/90 focus-visible:ring-accent/40"
                        >
                          <Download className="size-3.5" />
                          Validate
                        </Button>
                      </div>
                      {hasFetchedUrl ? <p className="text-xs text-accent">URL looks valid. Ready to add layer.</p> : null}
                      {urlFetchError ? <p className="text-xs text-destructive">{urlFetchError}</p> : null}
                    </div>
                  ) : null}

                  {mode === "service" ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Tile Type</label>
                        <div className="flex flex-wrap gap-2">
                          {serviceOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setServiceType(option)}
                              className={cn(
                                "rounded-sm border px-3 py-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.08em] transition",
                                serviceType === option
                                  ? "border-accent bg-accent/15 text-accent"
                                  : "border-border/80 bg-muted/35 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>

                      {activeServiceProfile ? (
                        <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2.5">
                          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Tileset Visualization</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{activeServiceProfile.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Script: <span className="font-semibold text-foreground">{activeServiceProfile.id}</span> · Engine:{" "}
                            <span className="font-semibold text-foreground">{activeServiceProfile.engine}</span> · Layer Type:{" "}
                            <span className="font-semibold text-foreground">{activeServiceProfile.layerType}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{activeServiceProfile.reason}</p>
                        </div>
                      ) : null}

                      <div className="space-y-1.5">
                        <label htmlFor="layer-name-service" className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Layer Name (Optional)
                        </label>
                        <Input
                          id="layer-name-service"
                          value={layerName}
                          onChange={(event) => setLayerName(event.target.value)}
                          placeholder={`${modeLabel} layer`}
                          className="border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-accent/20"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="service-url" className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Service URL
                        </label>
                        <Input
                          id="service-url"
                          value={serviceUrl}
                          onChange={(event) => setServiceUrl(event.target.value)}
                          className="border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-accent/20"
                          placeholder={serviceUrlPlaceholders[serviceType]}
                        />
                      </div>
                    </div>
                  ) : null}

                  {mode === "gis-paste" ? (
                    <textarea
                      id="gis-paste"
                      value={gisText}
                      onChange={(event) => setGisText(event.target.value)}
                      placeholder='{"type":"FeatureCollection","features":[...]} or WKT geometry'
                      className="max-h-52 min-h-40 w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20"
                    />
                  ) : null}

                  {mode === "sample-layers" ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {serviceOptions.map((option) => {
                          const isActive = option === sampleServiceType;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setSampleServiceType(option);
                                const nextOptions = sampleLayersByServiceType[option] ?? [];
                                setSelectedSampleLayerId(nextOptions[0]?.id ?? "");
                              }}
                              className={cn(
                                "rounded-sm border px-2.5 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] transition",
                                isActive
                                  ? "border-accent bg-accent/15 text-accent"
                                  : "border-border/80 bg-muted/35 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {activeSampleLayerOptions.map((option) => {
                          const isSelected = selectedSampleLayerId === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setSelectedSampleLayerId(option.id)}
                              className={cn(
                                "rounded-md border px-3 py-3 text-left transition",
                                isSelected
                                  ? "border-accent bg-accent/10 text-foreground"
                                  : "border-border/80 bg-muted/35 text-foreground/90 hover:border-accent/40",
                              )}
                            >
                              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-accent">{option.serviceType}</p>
                              <p className="mt-1 text-sm font-semibold">{option.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>

                      {selectedSampleLayer ? (
                        <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2.5">
                          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Sample Preview</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{selectedSampleLayer.name}</p>
                          <p className="mt-0.5 break-all font-mono text-[0.66rem] text-muted-foreground">{selectedSampleLayer.sourceUrl}</p>
                          {selectedSampleLayer.sourceHint ? (
                            <p className="mt-1 text-xs text-muted-foreground">{selectedSampleLayer.sourceHint}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border/80 bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[42rem] text-[0.74rem] leading-relaxed text-muted-foreground">
              GeoPlus runs client-side with no required backend. Your data stays in your browser and on your device.
              No map data is sent to our servers unless you explicitly connect to an external service.
            </p>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {layerConfigError ? <p className="mr-2 text-xs text-destructive">{layerConfigError}</p> : null}
              <Button type="button" variant="outline" className="border-border/80 bg-background text-foreground hover:bg-muted/65" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              {mode === "existing-layers" ? null : (
                <Button type="submit" disabled={!canSubmit} className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:bg-muted disabled:text-muted-foreground">
                  <Database className="size-3.5" />
                  Add Layer
                </Button>
              )}
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
