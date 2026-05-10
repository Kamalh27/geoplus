import { GripVertical, Ruler, X } from "lucide-react";
import { useRef, useState } from "react";
import { DrawMeasurements } from "./use-geoplus-map";

type MeasurementPanelProps = {
  drawMeasurements: DrawMeasurements;
  lengthUnit: "km" | "m" | "mi" | "ft";
  setLengthUnit: (unit: "km" | "m" | "mi" | "ft") => void;
  areaUnit: "sqm" | "sqkm" | "acres" | "hectares" | "sqmi";
  setAreaUnit: (unit: "sqm" | "sqkm" | "acres" | "hectares" | "sqmi") => void;
  showLength?: boolean;
  showArea?: boolean;
};

export function MeasurementPanel({
  drawMeasurements,
  lengthUnit,
  setLengthUnit,
  areaUnit,
  setAreaUnit,
  showLength = true,
  showArea = true,
}: MeasurementPanelProps) {
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [isClosed, setIsClosed] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    event.preventDefault();
    dragStartRef.current = {
      x: event.clientX - panelOffset.x,
      y: event.clientY - panelOffset.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPanelOffset({
        x: moveEvent.clientX - dragStartRef.current.x,
        y: moveEvent.clientY - dragStartRef.current.y,
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

  const formatLength = (lengthKm?: number) => {
    if (lengthKm === undefined) return null;
    switch (lengthUnit) {
      case "m": return `${(lengthKm * 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} m`;
      case "mi": return `${(lengthKm * 0.621371).toLocaleString(undefined, { maximumFractionDigits: 2 })} mi`;
      case "ft": return `${(lengthKm * 3280.84).toLocaleString(undefined, { maximumFractionDigits: 1 })} ft`;
      case "km":
      default: return `${lengthKm.toLocaleString(undefined, { maximumFractionDigits: 2 })} km`;
    }
  };

  const formatArea = (areaSqM?: number) => {
    if (areaSqM === undefined) return null;
    switch (areaUnit) {
      case "sqkm": return `${(areaSqM / 1000000).toLocaleString(undefined, { maximumFractionDigits: 3 })} km²`;
      case "acres": return `${(areaSqM * 0.000247105).toLocaleString(undefined, { maximumFractionDigits: 2 })} acres`;
      case "hectares": return `${(areaSqM * 0.0001).toLocaleString(undefined, { maximumFractionDigits: 2 })} hectares`;
      case "sqmi": return `${(areaSqM * 3.861e-7).toLocaleString(undefined, { maximumFractionDigits: 3 })} mi²`;
      case "sqm":
      default: return `${areaSqM.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;
    }
  };

  if (
    isClosed ||
    (!showLength || drawMeasurements.lengthKm === undefined) &&
    (!showArea || drawMeasurements.areaSqM === undefined) &&
    drawMeasurements.coordinates === undefined
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-4 z-30 w-72 rounded-md border border-border/75 bg-card/95 shadow-xl backdrop-blur-md transition-all"
      style={{ transform: `translate(calc(-50% + ${panelOffset.x}px), ${panelOffset.y}px)` }}
    >
      <div
        className="flex cursor-grab items-center justify-between border-b border-border/60 px-3 py-2 active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        <h3 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
          <GripVertical className="size-3.5 text-muted-foreground transition-colors hover:text-accent" />
          <Ruler className="size-3.5 text-accent" />
          Measurement
        </h3>
        <button
          type="button"
          onClick={() => setIsClosed(true)}
          className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-accent"
          aria-label="Close measurement panel"
          title="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="space-y-3 p-3">
        {drawMeasurements.coordinates && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Coordinates</span>
            <span className="font-mono text-xs">
              {drawMeasurements.coordinates[0].toFixed(5)}, {drawMeasurements.coordinates[1].toFixed(5)}
            </span>
          </div>
        )}

        {showLength && drawMeasurements.lengthKm !== undefined && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              Length
              <select
                value={lengthUnit}
                onChange={(e) => setLengthUnit(e.target.value as "km" | "m" | "mi" | "ft")}
                className="ml-2 bg-transparent text-[9px] font-semibold text-accent focus:outline-none cursor-pointer"
              >
                <option value="km">km</option>
                <option value="m">m</option>
                <option value="mi">miles</option>
                <option value="ft">feet</option>
              </select>
            </span>
            <span className="font-mono text-xs">{formatLength(drawMeasurements.lengthKm)}</span>
          </div>
        )}

        {showArea && drawMeasurements.areaSqM !== undefined && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              Area
              <select
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value as "sqm" | "sqkm" | "acres" | "hectares" | "sqmi")}
                className="ml-2 bg-transparent text-[9px] font-semibold text-accent focus:outline-none cursor-pointer"
              >
                <option value="sqm">m²</option>
                <option value="sqkm">km²</option>
                <option value="acres">acres</option>
                <option value="hectares">hectares</option>
                <option value="sqmi">mi²</option>
              </select>
            </span>
            <span className="font-mono text-xs">{formatArea(drawMeasurements.areaSqM)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
