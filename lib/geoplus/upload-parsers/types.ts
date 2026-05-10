import type { GeoPlusLayerType } from "@/components/geoplus/types";

export type ParsedUploadLayer = {
  layerName?: string;
  layerType: GeoPlusLayerType;
  inlineData?: unknown;
  originalFile?: File;
  sourceUrl?: string;
  formatLabel: string;
  readyMessage: string;
};

export type UploadFileParser = (file: File) => Promise<ParsedUploadLayer[]>;
