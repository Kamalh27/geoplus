import type { GeoPlusLayerItem } from "@/components/geoplus/types";

const areStringArraysEqual = (left?: string[], right?: string[]) => {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const areRecordStringValuesEqual = (left?: Record<string, string>, right?: Record<string, string>) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
};

const areStyleConfigsEqual = (left?: GeoPlusLayerItem["styleConfig"], right?: GeoPlusLayerItem["styleConfig"]) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.fillColor === right.fillColor &&
    left.lineColor === right.lineColor &&
    left.pointColor === right.pointColor &&
    left.labelColor === right.labelColor &&
    left.lineWidth === right.lineWidth &&
    left.pointRadius === right.pointRadius &&
    left.labelSize === right.labelSize &&
    left.markerStyle === right.markerStyle &&
    left.markerSymbol === right.markerSymbol &&
    left.customMarkerDataUrl === right.customMarkerDataUrl &&
    left.colorByField === right.colorByField &&
    left.colorRamp === right.colorRamp &&
    left.classificationMethod === right.classificationMethod &&
    left.classificationClasses === right.classificationClasses &&
    areStringArraysEqual(left.customColorRamp, right.customColorRamp)
  );
};

const areInteractionConfigsEqual = (
  left?: GeoPlusLayerItem["interactionConfig"],
  right?: GeoPlusLayerItem["interactionConfig"],
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.tooltipEnabled === right.tooltipEnabled &&
    left.popupEnabled === right.popupEnabled &&
    left.hoverHighlightEnabled === right.hoverHighlightEnabled &&
    left.hoverHighlightColor === right.hoverHighlightColor &&
    left.hoverLineColor === right.hoverLineColor &&
    left.hoverFillOpacity === right.hoverFillOpacity &&
    left.hoverLineWidth === right.hoverLineWidth &&
    left.hoverPointRadius === right.hoverPointRadius &&
    areStringArraysEqual(left.tooltipFields, right.tooltipFields) &&
    areStringArraysEqual(left.popupFields, right.popupFields) &&
    areRecordStringValuesEqual(left.fieldDisplayNames, right.fieldDisplayNames)
  );
};

export const areLayersEquivalentForRender = (previousLayers: GeoPlusLayerItem[], nextLayers: GeoPlusLayerItem[]) => {
  if (previousLayers.length !== nextLayers.length) {
    return false;
  }

  return previousLayers.every((previousLayer, index) => {
    const nextLayer = nextLayers[index];
    if (!nextLayer || previousLayer.id !== nextLayer.id) {
      return false;
    }

    return (
      previousLayer.sourceMode === nextLayer.sourceMode &&
      previousLayer.engine === nextLayer.engine &&
      previousLayer.layerType === nextLayer.layerType &&
      previousLayer.tilesetProfileId === nextLayer.tilesetProfileId &&
      previousLayer.rendererPreference === nextLayer.rendererPreference &&
      previousLayer.layerTypePreference === nextLayer.layerTypePreference &&
      previousLayer.sourceUrl === nextLayer.sourceUrl &&
      previousLayer.serviceType === nextLayer.serviceType &&
      previousLayer.fileName === nextLayer.fileName &&
      previousLayer.uploadFileSizeBytes === nextLayer.uploadFileSizeBytes &&
      previousLayer.uploadFeatureCountEstimate === nextLayer.uploadFeatureCountEstimate &&
      previousLayer.uploadScale === nextLayer.uploadScale &&
      previousLayer.uploadStorageUrl === nextLayer.uploadStorageUrl &&
      previousLayer.originalFile === nextLayer.originalFile &&
      previousLayer.rawInlineData === nextLayer.rawInlineData &&
      previousLayer.inlineData === nextLayer.inlineData &&
      previousLayer.visible === nextLayer.visible &&
      previousLayer.opacity === nextLayer.opacity &&
      previousLayer.stylePreset === nextLayer.stylePreset &&
      previousLayer.labelEnabled === nextLayer.labelEnabled &&
      previousLayer.labelField === nextLayer.labelField &&
      previousLayer.duckDbWhereClause === nextLayer.duckDbWhereClause &&
      previousLayer.duckDbChartLabelColumn === nextLayer.duckDbChartLabelColumn &&
      areStyleConfigsEqual(previousLayer.styleConfig, nextLayer.styleConfig) &&
      areInteractionConfigsEqual(previousLayer.interactionConfig, nextLayer.interactionConfig)
    );
  });
};
