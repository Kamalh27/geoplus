import type { Dispatch, RefObject, SetStateAction } from "react";
import * as maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import type { DrawMeasurements, DrawMode, DrawPurpose, DrawTemplate } from "@/components/geoplus/map/types";

type DrawEventContext = {
  drawRef: RefObject<MapboxDraw | null>;
  drawPurposeRef: RefObject<DrawPurpose>;
  activeDrawTemplateRef: RefObject<DrawTemplate | null>;
  setDrawPurpose: Dispatch<SetStateAction<DrawPurpose>>;
  setSelectedDrawFeature: Dispatch<SetStateAction<GeoJSON.Feature | null>>;
  setDrawMeasurements: Dispatch<SetStateAction<DrawMeasurements>>;
  setActiveDrawMode: Dispatch<SetStateAction<DrawMode>>;
};

// maplibre-gl 6 types `Map#on` against its own event map; mapbox-gl-draw fires its `draw.*`
// events through `map.fire(type, data)` (still supported at runtime), so subscribe via a typed shim.
type DrawEventMap = MapboxDraw.DrawEvents;
function onDrawEvent<T extends keyof DrawEventMap>(map: maplibregl.Map, type: T, listener: (event: DrawEventMap[T]) => void) {
  (map as unknown as { on(type: string, listener: (event: unknown) => void): void }).on(type, listener as (event: unknown) => void);
}

export function attachDrawEvents(map: maplibregl.Map, draw: MapboxDraw, ctx: DrawEventContext) {
  const {
    drawRef,
    drawPurposeRef,
    activeDrawTemplateRef,
    setDrawPurpose,
    setSelectedDrawFeature,
    setDrawMeasurements,
    setActiveDrawMode,
  } = ctx;

  const updateMeasurements = () => {
    const selected = draw.getSelected();
    if (selected.features.length > 0) {
      const feature = selected.features[0];
      
      // Auto-detect purpose based on properties or fallback to current mode
      if (feature.properties?.isMeasurement) {
        drawPurposeRef.current = "measure";
        setDrawPurpose("measure");
      } else if (drawPurposeRef.current === "measure" && !feature.properties?.isMeasurement) {
        // If we just created it under 'measure' mode, ensure property is saved.
        draw.setFeatureProperty(feature.id as string, "isMeasurement", true);
        feature.properties = feature.properties || {};
        feature.properties.isMeasurement = true;
      }

      setSelectedDrawFeature(feature);
      
      const measurements: DrawMeasurements = {};
      if (feature.geometry.type === "Point") {
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        measurements.coordinates = [coords[0], coords[1]];
      } else if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
        measurements.lengthKm = turf.length(feature, { units: "kilometers" });
      } else if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
        measurements.areaSqM = turf.area(feature);
        measurements.lengthKm = turf.length(feature, { units: "kilometers" });
      }
      setDrawMeasurements(measurements);
    } else {
      setSelectedDrawFeature(null);
      if (drawPurposeRef.current !== "measure") {
        setDrawMeasurements({});
      }
    }
  };

  onDrawEvent(map, "draw.create", (e) => {
    if (e.features.length > 0 && drawPurposeRef.current === "measure") {
      draw.setFeatureProperty(e.features[0].id as string, "isMeasurement", true);
      // Pre-update measurements before deselection so the final value is captured
      updateMeasurements();
      
      // Deselect the newly created measurement feature to remove the editing highlight/vertices
      setTimeout(() => {
        if (drawRef.current) {
          drawRef.current.changeMode("simple_select", { featureIds: [] });
        }
      }, 0);
      return;
    }

    // If a draw template is active and this is not a measurement, inject the template properties
    if (e.features.length > 0 && drawPurposeRef.current === "draw" && activeDrawTemplateRef.current) {
      const featureId = e.features[0].id as string;
      const template = activeDrawTemplateRef.current;
      for (const [key, field] of Object.entries(template)) {
        let injectedValue: string | number | boolean | unknown[] = field.value;
        
        if (field.type === "float") {
          injectedValue = parseFloat(field.value) || 0;
        } else if (field.type === "integer") {
          injectedValue = parseInt(field.value, 10) || 0;
        } else if (field.type === "boolean") {
          injectedValue = field.value.toLowerCase() === "true" || field.value === "1";
        } else if (field.type === "image") {
          // Special handling if needed, usually we leave it empty until user uploads
          injectedValue = field.value || "";
        }

        draw.setFeatureProperty(featureId, key, injectedValue);
      }
      
      // Force the feature to be selected so the properties panel opens automatically
      setTimeout(() => {
        if (drawRef.current) {
          drawRef.current.changeMode("simple_select", { featureIds: [featureId] });
          updateMeasurements();
        }
      }, 0);
      return; // we call updateMeasurements inside the timeout after re-selection
    }

    updateMeasurements();
  });
  onDrawEvent(map, "draw.delete", updateMeasurements);
  onDrawEvent(map, "draw.update", updateMeasurements);
  onDrawEvent(map, "draw.selectionchange", updateMeasurements);
  onDrawEvent(map, "draw.modechange", (e) => {
    setActiveDrawMode(e.mode as DrawMode);
    if (e.mode === "draw_point" || e.mode === "draw_line_string" || e.mode === "draw_polygon") {
      // Mode changed externally without setDrawMode (e.g. via keyboard shortcut), assume draw by default if not set
      if (!drawPurposeRef.current) {
        drawPurposeRef.current = "draw";
        setDrawPurpose("draw");
      }
    }
  });
}
