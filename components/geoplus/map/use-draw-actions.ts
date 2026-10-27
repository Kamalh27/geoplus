import { useCallback, useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import { normalizeDrawFeatureCollectionForLayer } from "@/components/geoplus/map/feature-utils";
import type { DrawMeasurements, DrawMode, DrawPurpose, DrawTemplate } from "@/components/geoplus/map/types";

type UseDrawActionsArgs = {
  drawRef: RefObject<MapboxDraw | null>;
  drawPurposeRef: RefObject<DrawPurpose>;
  activeDrawTemplate: DrawTemplate | null;
  activeDrawTemplateRef: RefObject<DrawTemplate | null>;
  setDrawPurpose: Dispatch<SetStateAction<DrawPurpose>>;
  setActiveDrawMode: Dispatch<SetStateAction<DrawMode>>;
  setSelectedDrawFeature: Dispatch<SetStateAction<GeoJSON.Feature | null>>;
  setDrawMeasurements: Dispatch<SetStateAction<DrawMeasurements>>;
  onSaveDrawLayer?: (name: string, features: GeoJSON.FeatureCollection) => void;
};

export function useDrawActions({
  drawRef,
  drawPurposeRef,
  activeDrawTemplate,
  activeDrawTemplateRef,
  setDrawPurpose,
  setActiveDrawMode,
  setSelectedDrawFeature,
  setDrawMeasurements,
  onSaveDrawLayer,
}: UseDrawActionsArgs) {
  // Sync state to ref for the event handler
  useEffect(() => {
    activeDrawTemplateRef.current = activeDrawTemplate;
  }, [activeDrawTemplate, activeDrawTemplateRef]);

  const setDrawMode = useCallback((mode: DrawMode, purpose: DrawPurpose = "draw") => {
    if (!drawRef.current) return;
    drawPurposeRef.current = purpose;
    setDrawPurpose(purpose);
    drawRef.current.changeMode(mode as string);
    setActiveDrawMode(mode);
  }, [drawPurposeRef, drawRef, setActiveDrawMode, setDrawPurpose]);

  const deleteSelectedDraw = useCallback(() => {
    if (!drawRef.current) return;
    drawRef.current.trash();
    setSelectedDrawFeature(null);
    setDrawMeasurements({});
  }, [drawRef, setDrawMeasurements, setSelectedDrawFeature]);

  const clearAllDrawings = useCallback(() => {
    if (!drawRef.current) return;
    drawRef.current.deleteAll();
    setSelectedDrawFeature(null);
    setDrawMeasurements({});
    setActiveDrawMode("static");
  }, [drawRef, setActiveDrawMode, setDrawMeasurements, setSelectedDrawFeature]);

  const updateDrawFeatureProperty = useCallback((featureId: string, key: string, value: unknown) => {
    if (!drawRef.current) return;
    drawRef.current.setFeatureProperty(featureId, key, value as string | number | boolean | object | null);
    // Refresh selected feature to update UI
    const selected = drawRef.current.getSelected();
    if (selected.features.length > 0 && String(selected.features[0].id) === String(featureId)) {
      setSelectedDrawFeature({ ...selected.features[0] });
    }
  }, [drawRef, setSelectedDrawFeature]);

  const saveDrawingsAsLayer = useCallback((name: string) => {
    if (!drawRef.current || !onSaveDrawLayer) return;
    const rawFeatures = drawRef.current.getAll();
    if (rawFeatures.features.length === 0) return;
    const normalizedFeatures = normalizeDrawFeatureCollectionForLayer(rawFeatures);
    if (normalizedFeatures.features.length === 0) return;
    onSaveDrawLayer(name, normalizedFeatures);
    clearAllDrawings();
  }, [onSaveDrawLayer, clearAllDrawings, drawRef]);

  const simplifySelectedDraw = useCallback(() => {
    if (!drawRef.current) return;
    const selected = drawRef.current.getSelected();
    if (selected.features.length === 0) return;

    const feature = selected.features[0];
    try {
      const simplified = turf.simplify(feature as GeoJSON.Feature, { tolerance: 0.005, highQuality: true, mutate: false });
      simplified.id = feature.id;
      // Preserve properties
      simplified.properties = { ...feature.properties };
      drawRef.current.add(simplified);
      setSelectedDrawFeature({ ...simplified } as GeoJSON.Feature);
      
      // Update measurements
      const measurements: DrawMeasurements = {};
      if (simplified.geometry.type === "LineString" || simplified.geometry.type === "MultiLineString") {
        measurements.lengthKm = turf.length(simplified, { units: "kilometers" });
      } else if (simplified.geometry.type === "Polygon" || simplified.geometry.type === "MultiPolygon") {
        measurements.areaSqM = turf.area(simplified);
        measurements.lengthKm = turf.length(simplified, { units: "kilometers" });
      }
      setDrawMeasurements(measurements);
    } catch (e) {
      console.error("Simplify failed", e);
    }
  }, [drawRef, setDrawMeasurements, setSelectedDrawFeature]);

  const smoothSelectedDraw = useCallback(() => {
    if (!drawRef.current) return;
    const selected = drawRef.current.getSelected();
    if (selected.features.length === 0) return;

    const feature = selected.features[0];
    try {
      let smoothed: GeoJSON.Feature | null = null;
      if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
        smoothed = turf.bezierSpline(feature as GeoJSON.Feature<GeoJSON.LineString>, { resolution: 10000, sharpness: 0.85 });
      } else if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
        const smoothedPolygons = turf.polygonSmooth(feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, { iterations: 2 });
        if (smoothedPolygons.features && smoothedPolygons.features.length > 0) {
          smoothed = smoothedPolygons.features[0];
        }
      }

      if (smoothed) {
        smoothed.id = feature.id;
        smoothed.properties = { ...feature.properties };
        drawRef.current.add(smoothed);
        setSelectedDrawFeature({ ...smoothed });

        // Update measurements
        const measurements: DrawMeasurements = {};
        if (smoothed.geometry.type === "LineString" || smoothed.geometry.type === "MultiLineString") {
          measurements.lengthKm = turf.length(smoothed, { units: "kilometers" });
        } else if (smoothed.geometry.type === "Polygon" || smoothed.geometry.type === "MultiPolygon") {
          measurements.areaSqM = turf.area(smoothed);
          measurements.lengthKm = turf.length(smoothed, { units: "kilometers" });
        }
        setDrawMeasurements(measurements);
      }
    } catch (e) {
      console.error("Smooth failed", e);
    }
  }, [drawRef, setDrawMeasurements, setSelectedDrawFeature]);

  return {
    setDrawMode,
    deleteSelectedDraw,
    clearAllDrawings,
    updateDrawFeatureProperty,
    saveDrawingsAsLayer,
    simplifySelectedDraw,
    smoothSelectedDraw,
  };
}
