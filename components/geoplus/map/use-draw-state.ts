import { useRef, useState } from "react";
import type { DrawMeasurements, DrawMode, DrawPurpose, DrawTemplate } from "@/components/geoplus/map/types";

export function useDrawState() {
  const [activeDrawMode, setActiveDrawMode] = useState<DrawMode>("static");
  const [selectedDrawFeature, setSelectedDrawFeature] = useState<GeoJSON.Feature | null>(null);
  const [drawMeasurements, setDrawMeasurements] = useState<DrawMeasurements>({});
  const [activeDrawTemplate, setActiveDrawTemplate] = useState<DrawTemplate | null>(null);
  const drawPurposeRef = useRef<DrawPurpose>("draw");
  const [drawPurpose, setDrawPurpose] = useState<DrawPurpose>("draw");
  const activeDrawTemplateRef = useRef<DrawTemplate | null>(null);

  return {
    activeDrawMode,
    setActiveDrawMode,
    selectedDrawFeature,
    setSelectedDrawFeature,
    drawMeasurements,
    setDrawMeasurements,
    activeDrawTemplate,
    setActiveDrawTemplate,
    drawPurposeRef,
    drawPurpose,
    setDrawPurpose,
    activeDrawTemplateRef,
  };
}
