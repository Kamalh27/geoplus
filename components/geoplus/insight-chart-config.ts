export type ChartType = "bar" | "horizontal" | "pie" | "donut" | "line";
export type ChartPaletteId = "brand" | "ocean" | "sunset" | "forest" | "berry" | "slate" | "warm";

export type InsightChartDatum = {
  label: string;
  value: number;
};

export const chartTypeOptions: { id: ChartType; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "horizontal", label: "Horizontal" },
  { id: "pie", label: "Pie" },
  { id: "donut", label: "Donut" },
  { id: "line", label: "Line" },
];

export const chartPalettes: Record<ChartPaletteId, { label: string; colors: string[] }> = {
  brand: {
    label: "Brand",
    colors: ["#00c891", "#0ea67d", "#21d4a5", "#1f7f66", "#4de7be", "#76f0d0", "#8ec6b7", "#0f766e"],
  },
  ocean: {
    label: "Ocean",
    colors: ["#2563eb", "#0ea5e9", "#38bdf8", "#0284c7", "#14b8a6", "#22d3ee", "#1d4ed8", "#0f766e"],
  },
  sunset: {
    label: "Sunset",
    colors: ["#f97316", "#fb923c", "#f59e0b", "#f43f5e", "#e11d48", "#fb7185", "#fdba74", "#facc15"],
  },
  forest: {
    label: "Forest",
    colors: ["#15803d", "#22c55e", "#4ade80", "#86efac", "#166534", "#052e16", "#bbf7d0", "#dcfce7"],
  },
  berry: {
    label: "Berry",
    colors: ["#db2777", "#ec4899", "#f472b6", "#fbcfe8", "#9d174d", "#500724", "#fdf2f8", "#be185d"],
  },
  slate: {
    label: "Slate",
    colors: ["#475569", "#64748b", "#94a3b8", "#cbd5e1", "#334155", "#0f172a", "#e2e8f0", "#f8fafc"],
  },
  warm: {
    label: "Warm",
    colors: ["#eab308", "#facc15", "#fde047", "#fef08a", "#ca8a04", "#713f12", "#fef9c3", "#fefce8"],
  },
};

export const toSafeChartFileBase = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
