import JSZip from "jszip";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";

/**
 * Backend URL for core services.
 */
export const CORE_BACKEND_URL = "http://localhost:8000";

/**
 * Compresses a File using JSZip. Skips compression if the file is already 
 * an archive or compressed format.
 */
export async function compressFileForUpload(file: File): Promise<File> {
  const isAlreadyCompressed = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['zip', 'kmz', 'gpkg', 'zarr', 'pmtiles', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm'].includes(ext || '');
  };

  if (isAlreadyCompressed(file.name)) {
    return file;
  }

  const zip = new JSZip();
  zip.file(file.name, file);
  
  const zipBlob = await zip.generateAsync({ 
    type: "blob", 
    compression: "DEFLATE",
    compressionOptions: { level: 6 } 
  });
  
  return new File([zipBlob], `${file.name}.zip`, { type: "application/zip" });
}

/**
 * Uploads a layer's raw File to the core backend.
 */
export async function uploadDashboardLayerToCore(
  file: File, 
  projectUid: string, 
  datasetName: string,
  dashboardId: string // Added dashboardId
): Promise<string> {
  const compressedFile = await compressFileForUpload(file);

  const formData = new FormData();
  formData.append("file", compressedFile);
  formData.append("project_uid", projectUid);
  formData.append("dataset_name", datasetName);
  formData.append("dashboard_id", dashboardId); // Send dashboard_id to backend
  
  const response = await fetch(`${CORE_BACKEND_URL}/api/v1/geoplus/uploads/datasets`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to upload dataset: ${response.statusText} ${errorText}`);
  }

  const data = await response.json();
  if (!data?.dataset?.source_uri) {
     throw new Error("Invalid response format from upload API");
  }
  return data.dataset.source_uri; 
}

/**
 * Optimizes an image (Data URL) by resizing it to a maximum dimension and converting it to a compressed JPEG.
 * Returns the original Data URL if it's not an image or if optimization fails.
 */
async function optimizeImage(dataUrl: string, maxDimension = 1920, quality = 0.8): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  // Skip SVG or already highly optimized formats if needed, but for now we'll process standard images
  if (dataUrl.includes("image/svg+xml")) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height *= maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round((width *= maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // Fill white background in case of transparent PNGs being converted to JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to compressed JPEG
      const optimizedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(optimizedDataUrl);
    };
    img.onerror = () => resolve(dataUrl); // Fallback to original on error
    img.src = dataUrl;
  });
}

/**
 * Prepares layers for saving by uploading any local files and stripping heavy in-memory data.
 */
export async function prepareLayersForSave(
  layers: GeoPlusLayerItem[],
  projectUid: string,
  dashboardId: string // Added dashboardId
): Promise<GeoPlusLayerItem[]> {
  return Promise.all(layers.map(async (layer) => {
    if (layer.originalFile && layer.sourceMode === 'upload') {
      const uploadedUrl = await uploadDashboardLayerToCore(
        layer.originalFile, 
        projectUid,
        layer.name,
        dashboardId
      );
      
      return {
        ...layer,
        sourceMode: 'url',
        sourceUrl: uploadedUrl,
        fileName: layer.fileName || layer.originalFile.name,
        inlineData: undefined,
        rawInlineData: undefined,
        originalFile: undefined,
      };
    }
    
    // Convert drawn layers and analysis results into zipped GeoJSON files.
    // This prevents the dashboard JSON payload from becoming too large (e.g. from embedded base64 media).
    if ((layer.sourceMode === 'gis-paste' || layer.sourceMode === 'analysis') && (layer.inlineData || layer.rawInlineData)) {
       const geojsonData = JSON.parse(JSON.stringify(layer.rawInlineData || layer.inlineData)); // Deep clone to safely mutate
       
       // Process media attachments: Extract base64, optimize, upload individually, replace with URLs
       for (const feature of geojsonData.features) {
         if (feature.properties && Array.isArray(feature.properties.media)) {
           for (let i = 0; i < feature.properties.media.length; i++) {
             const mediaItem = feature.properties.media[i];
             if (mediaItem.data && mediaItem.data.startsWith('data:')) {
               try {
                 const isImage = mediaItem.data.startsWith('data:image/');
                 const isVideo = mediaItem.data.startsWith('data:video/');
                 
                 // Optimize image on the frontend before uploading
                 const processedDataUrl = isImage ? await optimizeImage(mediaItem.data) : mediaItem.data;
                 
                 // Convert Data URL to Blob
                 const res = await fetch(processedDataUrl);
                 const blob = await res.blob();
                 
                 // Determine correct extension
                 let defaultExt = 'bin';
                 if (isImage) defaultExt = processedDataUrl.includes('image/jpeg') ? 'jpg' : 'png';
                 if (isVideo) defaultExt = 'mp4';
                 
                 // Clean up the filename to reflect the new extension if it was optimized
                 let originalName = mediaItem.name || `attachment-${Date.now()}`;
                 if (isImage && originalName.includes('.')) {
                    originalName = originalName.substring(0, originalName.lastIndexOf('.'));
                 }
                 const mediaFileName = `${originalName}.${defaultExt}`;
                 
                 const mediaFile = new File([blob], mediaFileName, { type: blob.type });
                 
                 // Upload raw media file to core backend
                 const uploadedUrl = await uploadDashboardLayerToCore(
                   mediaFile, 
                   projectUid,
                   `${layer.name} - ${mediaFileName}`,
                   dashboardId
                 );
                 
                 // Replace the heavy base64 string with the clean remote URL
                 mediaItem.data = uploadedUrl;
                 // Update metadata to match optimized file
                 if (isImage) {
                   mediaItem.type = "image/jpeg";
                   mediaItem.name = mediaFileName;
                 }
               } catch (error) {
                 console.error("Failed to extract and upload media item:", error);
                 // Keep the base64 if upload fails so data isn't lost
               }
             }
           }
         }
       }

       const geojsonStr = JSON.stringify(geojsonData);
       const fileName = `${layer.id}.geojson`;
       const file = new File([geojsonStr], fileName, { type: "application/geo+json" });
       
       const uploadedUrl = await uploadDashboardLayerToCore(
         file, 
         projectUid,
         layer.name,
         dashboardId
       );

       return {
         ...layer,
         sourceMode: 'url',
         sourceUrl: uploadedUrl,
         fileName: fileName,
         inlineData: undefined,
         rawInlineData: undefined,
         originalFile: undefined,
       };
    }
    
    return {
       ...layer,
       inlineData: undefined,
       rawInlineData: undefined,
       originalFile: undefined,
    };
  }));
}
