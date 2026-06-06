export type UploadScale = "small" | "medium" | "large";

export type UploadSizeEstimate = {
  fileSizeBytes?: number;
  featureCountEstimate?: number;
};

const SMALL_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const SMALL_UPLOAD_MAX_FEATURES = 100_000;
const MEDIUM_UPLOAD_MAX_BYTES = 250 * 1024 * 1024;
const MEDIUM_UPLOAD_MAX_FEATURES = 1_000_000;

const exceedsThreshold = (value: number | undefined, threshold: number) =>
  typeof value === "number" && Number.isFinite(value) && value > threshold;

export const classifyUploadScale = (estimate: UploadSizeEstimate): UploadScale => {
  const { fileSizeBytes, featureCountEstimate } = estimate;

  if (
    exceedsThreshold(fileSizeBytes, MEDIUM_UPLOAD_MAX_BYTES) ||
    exceedsThreshold(featureCountEstimate, MEDIUM_UPLOAD_MAX_FEATURES)
  ) {
    return "large";
  }

  if (
    exceedsThreshold(fileSizeBytes, SMALL_UPLOAD_MAX_BYTES) ||
    exceedsThreshold(featureCountEstimate, SMALL_UPLOAD_MAX_FEATURES)
  ) {
    return "medium";
  }

  return "small";
};

export const shouldAutoAnalyzeUpload = (estimate: UploadSizeEstimate): boolean =>
  classifyUploadScale(estimate) !== "small";

export const formatUploadScaleLabel = (scale: UploadScale) =>
  scale.charAt(0).toUpperCase() + scale.slice(1);
