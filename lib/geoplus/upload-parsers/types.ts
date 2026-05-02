import type { GeoPlusLayerType } from "@/components/geoplus/types";

export type ParsedUploadLayer = {
  layerType: GeoPlusLayerType;
  inlineData?: unknown;
  sourceUrl?: string;
  formatLabel: string;
  readyMessage: string;
};

export type UploadFileParser = (file: File) => Promise<ParsedUploadLayer>;
