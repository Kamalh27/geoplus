export type MapProjectionMode = "flat" | "globe";
export type DrawMode = "simple_select" | "draw_point" | "draw_line_string" | "draw_polygon" | "draw_rectangle" | "draw_circle" | "draw_hexagon" | "direct_select" | "static";
export type DrawPurpose = "draw" | "measure";

export type DrawMeasurements = {
  lengthKm?: number;
  areaSqM?: number;
  coordinates?: [number, number];
};

export type DrawTemplateField = {
  value: string;
  type: "string" | "float" | "integer" | "boolean" | "image";
};

export type DrawTemplate = Record<string, DrawTemplateField>;

export type HoverHighlightStyle = {
  color: string;
  lineColor: string;
  fillOpacity: number;
  lineWidth: number;
  pointRadius: number;
};
