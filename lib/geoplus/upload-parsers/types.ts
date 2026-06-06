import type { GeoPlusLayerType } from "@/components/geoplus/types";

export type ParsedUploadLayer = {
  layerName?: string;
  layerType: GeoPlusLayerType;
  inlineData?: unknown;
  originalFile?: File;
  sourceUrl?: string;
  uploadStorageUrl?: string;
  formatLabel: string;
  readyMessage: string;
  featureCountEstimate?: number;
};

export type UploadFileParser = (file: File) => Promise<ParsedUploadLayer[]>;
