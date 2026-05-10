import { Ruler, Maximize2, Minimize2, PlusCircle, X, Image as ImageIcon, FileVideo, Plus, Camera, Film, GripVertical, ChevronDown } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DrawTemplate } from "./use-geoplus-map";

type FeaturePropertiesPanelProps = {
  selectedDrawFeature: GeoJSON.Feature | null;
  drawPanelTop: string;
  isDrawLeft: boolean;
  activeDrawTemplate: DrawTemplate | null;
  onUpdateDrawFeatureProperty?: (featureId: string, key: string, value: unknown) => void;
  onViewMedia?: (data: { src: string; type: "image" | "video"; title?: string }) => void;
};

export function FeaturePropertiesPanel({
  selectedDrawFeature,
  drawPanelTop,
  isDrawLeft,
  activeDrawTemplate,
  onUpdateDrawFeatureProperty,
  onViewMedia,
}: FeaturePropertiesPanelProps) {
  const [newPropKey, setNewPropKey] = useState("");
  const [newPropValue, setNewPropValue] = useState("");
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [panelSize, setPanelSize] = useState<{ width: number; height: number | "auto" }>({ width: 256, height: "auto" });
  const [resizeMode, setResizeMode] = useState<"top" | "bottom" | "left" | "right" | null>(null);
  const sizeStartRef = useRef({ w: 0, h: 0, mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  useEffect(() => {
    if (!selectedDrawFeature) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelOffset({ x: 0, y: 0 });
      setIsPanelExpanded(false);
      setPanelSize({ width: 256, height: "auto" });
    }
  }, [selectedDrawFeature]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, textarea, .resize-handle")) return;
    e.preventDefault();
    const startX = e.clientX - panelOffset.x;
    const startY = e.clientY - panelOffset.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPanelOffset({
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY,
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, mode: "top" | "bottom" | "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    sizeStartRef.current = {
      w: panelSize.width,
      h: typeof panelSize.height === "number" ? panelSize.height : (e.currentTarget.parentElement?.offsetHeight || 420),
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: panelOffset.x,
      posY: panelOffset.y,
    };
    setResizeMode(mode);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeMode) return;
      const { w, h, mouseX, mouseY, posX, posY } = sizeStartRef.current;

      if (resizeMode === "left") {
        const dx = e.clientX - mouseX;
        const newWidth = Math.max(256, Math.min(800, w - dx));
        setPanelSize((prev) => ({ ...prev, width: newWidth }));
        setPanelOffset((prev) => ({ ...prev, x: posX + dx }));
      } else if (resizeMode === "right") {
        const dx = e.clientX - mouseX;
        const newWidth = Math.max(256, Math.min(800, w + dx));
        setPanelSize((prev) => ({ ...prev, width: newWidth }));
      } else if (resizeMode === "top") {
        const dy = e.clientY - mouseY;
        const newHeight = Math.max(150, Math.min(1000, h - dy));
        setPanelSize((prev) => ({ ...prev, height: newHeight }));
        setPanelOffset((prev) => ({ ...prev, y: posY + dy }));
      } else if (resizeMode === "bottom") {
        const dy = e.clientY - mouseY;
        const newHeight = Math.max(150, Math.min(1000, h + dy));
        setPanelSize((prev) => ({ ...prev, height: newHeight }));
      }
    };

    const handleMouseUp = () => setResizeMode(null);

    if (resizeMode) {
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    } else {
      document.body.style.userSelect = "";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [resizeMode]);

  const toggleExpand = () => {
    if (!isPanelExpanded) {
      setPanelSize({ width: 384, height: "auto" });
    } else {
      setPanelSize({ width: 256, height: "auto" });
    }
    setIsPanelExpanded(!isPanelExpanded);
  };

  const handleAddProperty = () => {
    if (selectedDrawFeature?.id && newPropKey.trim()) {
      onUpdateDrawFeatureProperty?.(selectedDrawFeature.id as string, newPropKey.trim(), newPropValue);
      setNewPropKey("");
      setNewPropValue("");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedDrawFeature?.id) return;

    const currentMedia = Array.isArray(selectedDrawFeature.properties?.media) ? [...selectedDrawFeature.properties.media] : [];
    
    const uploadPromises = Array.from(files).map((file) => {
      return new Promise<Record<string, string>>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target?.result as string;
          if (base64Data) {
            resolve({
              name: file.name,
              type: file.type,
              data: base64Data,
            });
          }
        };
        reader.readAsDataURL(file);
      });
    });

    try {
      const newMediaItems = await Promise.all(uploadPromises);
      if (newMediaItems.length > 0) {
        onUpdateDrawFeatureProperty?.(selectedDrawFeature.id as string, "media", [...currentMedia, ...newMediaItems]);
      }
    } catch (error) {
      console.error("Failed to upload media", error);
    }

    event.target.value = "";
  };

  if (!selectedDrawFeature) {
    return null;
  }

  const properties = selectedDrawFeature.properties || {};
  const mediaItems = Array.isArray(properties.media) ? properties.media : [];

  return (
    <div
      className={`pointer-events-auto absolute ${drawPanelTop} ${isDrawLeft ? "left-3" : "right-3"} z-30 flex flex-col rounded-md border border-border/75 bg-card/95 shadow-xl backdrop-blur-md transition-colors`}
      style={{
        marginLeft: isDrawLeft ? "var(--geoplus-left-safe-area, 0)" : undefined,
        transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
        width: `${panelSize.width}px`,
        height: panelSize.height === "auto" ? "auto" : `${panelSize.height}px`,
        maxHeight: "85vh",
      }}
    >
      <div
        className="resize-handle absolute left-0 right-0 top-0 z-50 flex h-2 cursor-ns-resize items-center justify-center group"
        onMouseDown={(e) => handleResizeStart(e, "top")}
      >
        <div className="h-1 w-8 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-accent/60" />
      </div>
      <div
        className="resize-handle absolute bottom-0 left-0 right-0 z-50 flex h-2 cursor-ns-resize items-center justify-center group"
        onMouseDown={(e) => handleResizeStart(e, "bottom")}
      >
        <div className="h-1 w-8 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-accent/60" />
      </div>
      <div
        className="resize-handle absolute bottom-0 left-0 top-0 z-50 flex w-2 cursor-ew-resize items-center justify-center group"
        onMouseDown={(e) => handleResizeStart(e, "left")}
      >
        <div className="h-8 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-accent/60" />
      </div>
      <div
        className="resize-handle absolute bottom-0 right-0 top-0 z-50 flex w-2 cursor-ew-resize items-center justify-center group"
        onMouseDown={(e) => handleResizeStart(e, "right")}
      >
        <div className="h-8 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-accent/60" />
      </div>

      <div className="flex h-full flex-col p-3">
        <div
          className="mb-3 flex shrink-0 cursor-grab items-center justify-between border-b border-border/50 pb-2 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground select-none flex items-center gap-1.5">
            <span className="group relative inline-flex items-center">
              <GripVertical className="size-3 text-muted-foreground transition-colors hover:text-accent" />
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.35rem)] z-40 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/95 px-2 py-1 text-[9px] font-semibold normal-case tracking-normal text-card-foreground opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                Drag panel
              </span>
            </span>
            <Ruler className="size-3 text-accent" />
            Feature info
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleExpand}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent/20 hover:text-accent transition-colors"
              title={isPanelExpanded ? "Minimize" : "Maximize"}
            >
              {isPanelExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 geoplus-panel-scroll flex flex-col gap-4">
          <Collapsible defaultOpen className="space-y-2">
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center justify-between rounded-sm text-left">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Properties {activeDrawTemplate ? "(Locked)" : ""}</h4>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1">
              {!activeDrawTemplate ? (
                <>
                  {Object.entries(properties)
                    .filter(([key]) => key !== "media")
                    .map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-2 rounded bg-accent/5 px-2 py-1 text-[10px]">
                        <span className="font-semibold text-accent">{key}:</span>
                        <span className="truncate text-foreground text-right">{String(value)}</span>
                      </div>
                    ))}
                  {Object.keys(properties).filter((k) => k !== "media").length === 0 && (
                    <p className="py-2 text-center text-[10px] text-muted-foreground italic">No properties yet</p>
                  )}

                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="flex gap-1">
                      <Input
                        placeholder="Key"
                        value={newPropKey}
                        onChange={(e) => setNewPropKey(e.target.value)}
                        className="h-7 text-[10px]"
                      />
                      <Input
                        placeholder="Value"
                        value={newPropValue}
                        onChange={(e) => setNewPropValue(e.target.value)}
                        className="h-7 text-[10px]"
                      />
                    </div>
                    <Button size="sm" className="h-7 w-full text-[10px]" onClick={handleAddProperty}>
                      <PlusCircle className="mr-1 size-3" /> Add Property
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-1 flex flex-col gap-2">
                  {Object.entries(activeDrawTemplate).map(([key, field]) => {
                    return (
                      <div key={key} className="flex flex-col gap-1 rounded bg-accent/5 px-2 py-1.5 border border-border/40">
                        <span className="font-semibold text-accent text-[10px]">{key}</span>
                        <Input
                          value={properties[key] === undefined || properties[key] === null ? "" : String(properties[key])}
                          onChange={(e) => {
                            if (selectedDrawFeature?.id) {
                               let val: string | number | boolean = e.target.value;
                               if (field.type === "float") val = parseFloat(e.target.value) || 0;
                               if (field.type === "integer") val = parseInt(e.target.value, 10) || 0;
                               if (field.type === "boolean") val = e.target.value.toLowerCase() === "true" || e.target.value === "1";
                               
                               onUpdateDrawFeatureProperty?.(selectedDrawFeature.id as string, key, val);
                            }
                          }}
                          placeholder={field.type === "boolean" ? "true / false" : `Enter ${field.type}...`}
                          className="h-7 text-[10px] bg-background border-border/50 shadow-none focus-visible:ring-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="border-t border-border/50 pt-3 pb-1">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Photo / Video</h4>
              <label className="cursor-pointer">
                <Input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
                <span className="inline-flex items-center justify-center rounded-sm bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent transition hover:bg-accent hover:text-accent-foreground">
                  <Plus className="mr-0.5 size-3" /> Attach
                </span>
              </label>
            </div>

            {mediaItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 pb-1">
                {mediaItems.map((item: Record<string, string>, idx: number) => (
                  <div key={idx} className="group relative">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border/70 bg-card/70 text-muted-foreground">
                      {item.type?.startsWith("image/") ? (
                        <Camera className="size-3.5" />
                      ) : item.type?.startsWith("video/") ? (
                        <Film className="size-3.5" />
                      ) : (
                        <ImageIcon className="size-3.5" />
                      )}
                    </div>

                    <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.35rem)] z-40 w-44 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 p-2 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                      <p className="truncate text-[9px] font-semibold text-muted-foreground">{item.name}</p>
                      <div 
                        className="relative mt-1 h-24 w-full overflow-hidden rounded-sm border border-border/50 bg-muted/60 pointer-events-auto cursor-pointer hover:opacity-90"
                        onClick={() => onViewMedia?.({ src: item.data, type: item.type?.startsWith("video/") ? "video" : "image", title: item.name })}
                      >
                        {item.type?.startsWith("image/") ? (
                          <Image src={item.data} alt={item.name} fill className="object-cover" unoptimized />
                        ) : item.type?.startsWith("video/") ? (
                          <video src={item.data} className="h-full w-full object-cover" controls={false} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <FileVideo className="size-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => {
                        const newMedia = [...mediaItems];
                        newMedia.splice(idx, 1);
                        if (onUpdateDrawFeatureProperty && selectedDrawFeature.id) {
                          onUpdateDrawFeatureProperty(selectedDrawFeature.id as string, "media", newMedia);
                        }
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
