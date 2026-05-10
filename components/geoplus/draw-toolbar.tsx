import { useState } from "react";
import { MousePointer2, MapPin, PenTool, Hexagon, Square, Circle, Triangle, Ruler, Scaling, Trash2, Save, X, Wand2, Minimize as MinimizeIcon, ChevronRight, ChevronDown } from "lucide-react";
import type { DrawMode, DrawTemplate } from "./use-geoplus-map";
import { CONTROL_BUTTON_CLASS, CONTROL_GROUP_BUTTON_CLASS, CONTROL_GROUP_CLASS } from "./control-button-styles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DrawTemplateManager } from "./draw-template-manager";

type DrawToolbarProps = {
  drawControlPos: string;
  drawControlOri: string;
  isDrawLeft: boolean;
  activeDrawMode?: DrawMode;
  drawPurpose?: "draw" | "measure";
  selectedDrawFeature?: GeoJSON.Feature | null;
  activeDrawTemplate: DrawTemplate | null;
  setActiveDrawTemplate: (template: DrawTemplate | null) => void;
  onSetDrawMode?: (mode: DrawMode, purpose?: "draw" | "measure") => void;
  onDeleteSelectedDraw?: () => void;
  onClearAllDrawings?: () => void;
  onSaveDrawingsAsLayer?: (name: string) => void;
  onSimplifySelectedDraw?: () => void;
  onSmoothSelectedDraw?: () => void;
  setIsSaving: (saving: boolean) => void;
};

export function DrawToolbar({
  drawControlPos,
  drawControlOri,
  isDrawLeft,
  activeDrawMode,
  drawPurpose,
  selectedDrawFeature,
  activeDrawTemplate,
  setActiveDrawTemplate,
  onSetDrawMode,
  onDeleteSelectedDraw,
  onClearAllDrawings,
  onSimplifySelectedDraw,
  onSmoothSelectedDraw,
  setIsSaving,
}: DrawToolbarProps) {
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  return (
    <div id="geoplus-draw-controls" className={`pointer-events-auto absolute z-30 flex gap-2 ${drawControlPos === 'top-left' ? 'left-3 top-3' : drawControlPos === 'top-right' ? 'right-3 top-3' : drawControlPos === 'bottom-left' ? 'left-3 bottom-8' : 'right-3 bottom-8'} ${drawControlOri === 'horizontal' ? 'flex-row' : 'flex-col'}`} style={isDrawLeft ? { marginLeft: "var(--geoplus-left-safe-area, 0)" } : undefined}>
      <div className={`${CONTROL_GROUP_CLASS} flex ${drawControlOri === 'horizontal' ? 'flex-row' : 'flex-col'}`} role="group" aria-label="Drawing tools">
        <button
          type="button"
          title="Select feature"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${activeDrawMode === "simple_select" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("simple_select", "draw")}
        >
          <MousePointer2 className="size-4" />
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <DrawTemplateManager activeDrawTemplate={activeDrawTemplate} setActiveDrawTemplate={setActiveDrawTemplate} />
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <button
          type="button"
          title="Draw point marker"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${activeDrawMode === "draw_point" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("draw_point", "draw")}
        >
          <MapPin className="size-4" />
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <button
          type="button"
          title="Draw line string"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${activeDrawMode === "draw_line_string" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("draw_line_string", "draw")}
        >
          <PenTool className="size-4" />
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <button
          type="button"
          title="Draw polygon area"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${activeDrawMode === "draw_polygon" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("draw_polygon", "draw")}
        >
          <Hexagon className="size-4" />
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <button
          type="button"
          title="Draw rectangular area"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${activeDrawMode === "draw_rectangle" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("draw_rectangle", "draw")}
        >
          <Square className="size-4" />
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <button
          type="button"
          title="Draw circular area"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${activeDrawMode === "draw_circle" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("draw_circle", "draw")}
        >
          <Circle className="size-4" />
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        <button
          type="button"
          title="Draw hexagonal area"
          className={`${CONTROL_GROUP_BUTTON_CLASS} flex justify-center items-center ${activeDrawMode === "draw_hexagon" && drawPurpose === "draw" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetDrawMode?.("draw_hexagon", "draw")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </button>
        <div className={drawControlOri === 'horizontal' ? 'w-px h-full bg-border/80 min-h-9' : 'h-px w-full bg-border/80 min-w-9'} />
        
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Measurement tools"
              className={`${CONTROL_GROUP_BUTTON_CLASS} relative z-10 ${drawPurpose === "measure" ? "bg-accent/20 text-accent" : ""}`}
            >
              <Ruler className="size-4" />
              {drawControlOri === 'horizontal' ? <ChevronRight className="absolute -right-1 size-3 opacity-50" /> : <ChevronDown className="absolute -bottom-1 size-3 opacity-50" />}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side={drawControlOri === 'horizontal' ? 'right' : 'bottom'}
            align="start"
            sideOffset={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="w-auto p-1 flex gap-1 shadow-lg border border-border bg-background/95 backdrop-blur-md"
          >            <div className={`flex ${drawControlOri === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
              <button
                type="button"
                title="Measure distance (Line)"
                className={`p-2.5 transition-colors hover:bg-accent/10 rounded-md focus:outline-none focus:ring-1 focus:ring-accent focus:ring-inset ${activeDrawMode === "draw_line_string" && drawPurpose === "measure" ? "bg-accent/20 text-accent" : "text-foreground"}`}
                onClick={() => { onSetDrawMode?.("draw_line_string", "measure"); }}
              >
                <Ruler className="size-4" />
              </button>
              <button
                type="button"
                title="Measure area (Polygon)"
                className={`p-2.5 transition-colors hover:bg-accent/10 rounded-md focus:outline-none focus:ring-1 focus:ring-accent focus:ring-inset ${activeDrawMode === "draw_polygon" && drawPurpose === "measure" ? "bg-accent/20 text-accent" : "text-foreground"}`}
                onClick={() => { onSetDrawMode?.("draw_polygon", "measure"); }}
              >
                <Scaling className="size-4" />
              </button>
              <button
                type="button"
                title="Measure area (Rectangle)"
                className={`p-2.5 transition-colors hover:bg-accent/10 rounded-md focus:outline-none focus:ring-1 focus:ring-accent focus:ring-inset ${activeDrawMode === "draw_rectangle" && drawPurpose === "measure" ? "bg-accent/20 text-accent" : "text-foreground"}`}
                onClick={() => { onSetDrawMode?.("draw_rectangle", "measure"); }}
              >
                <Square className="size-4" />
              </button>
              <button
                type="button"
                title="Measure area (Circle)"
                className={`p-2.5 transition-colors hover:bg-accent/10 rounded-md focus:outline-none focus:ring-1 focus:ring-accent focus:ring-inset ${activeDrawMode === "draw_circle" && drawPurpose === "measure" ? "bg-accent/20 text-accent" : "text-foreground"}`}
                onClick={() => { onSetDrawMode?.("draw_circle", "measure"); }}
              >
                <Circle className="size-4" />
              </button>
              <button
                type="button"
                title="Measure area (Hexagon)"
                className={`p-2.5 transition-colors hover:bg-accent/10 rounded-md flex justify-center items-center focus:outline-none focus:ring-1 focus:ring-accent focus:ring-inset ${activeDrawMode === "draw_hexagon" && drawPurpose === "measure" ? "bg-accent/20 text-accent" : "text-foreground"}`}
                onClick={() => { onSetDrawMode?.("draw_hexagon", "measure"); }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {(selectedDrawFeature || activeDrawMode !== "static") && (
        <div className={`flex gap-2 ${drawControlOri === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
          {selectedDrawFeature && drawPurpose === "draw" && selectedDrawFeature.geometry.type !== "Point" && selectedDrawFeature.geometry.type !== "MultiPoint" && (
            <>
              <button
                type="button"
                title="Simplify geometry"
                className={CONTROL_BUTTON_CLASS}
                onClick={onSimplifySelectedDraw}
              >
                <MinimizeIcon className="size-4 text-accent" />
              </button>

              <button
                type="button"
                title="Smooth geometry"
                className={CONTROL_BUTTON_CLASS}
                onClick={onSmoothSelectedDraw}
              >
                <Wand2 className="size-4 text-accent" />
              </button>
            </>
          )}

          <button
            type="button"
            title="Delete selected feature"
            className={CONTROL_BUTTON_CLASS}
            onClick={onDeleteSelectedDraw}
            disabled={!selectedDrawFeature}
          >
            <Trash2 className="size-4 text-rose-500" />
          </button>

          {drawPurpose !== "measure" && (
            <button
              type="button"
              title="Save drawings as layer"
              className={CONTROL_BUTTON_CLASS}
              onClick={() => setIsSaving(true)}
            >
              <Save className="size-4 text-accent" />
            </button>
          )}

          <button
            type="button"
            title="Clear all drawings"
            className={CONTROL_BUTTON_CLASS}
            onClick={onClearAllDrawings}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
