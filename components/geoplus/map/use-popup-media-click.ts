import { useEffect, useState } from "react";
import type { MediaViewerData } from "@/components/geoplus/media-viewer-dialog";

export function usePopupMediaClick() {
  const [mediaViewerData, setMediaViewerData] = useState<MediaViewerData | null>(null);

  // Global click listener for popup media elements
  useEffect(() => {
    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mediaEl = target.closest(".geoplus-popup-media") as HTMLElement;
      if (mediaEl) {
        const type = mediaEl.getAttribute("data-media-type") as "image" | "video";
        const title = mediaEl.getAttribute("data-media-title") || undefined;
        let src = "";
        
        if (type === "image" && mediaEl instanceof HTMLImageElement) {
           src = mediaEl.src;
        } else if (type === "video") {
           src = mediaEl.getAttribute("data-media-src") || "";
        }

        if (src) {
          setMediaViewerData({ src, type, title });
        }
      }
    };

    document.addEventListener("click", handlePopupClick);
    return () => document.removeEventListener("click", handlePopupClick);
  }, []);

  return { mediaViewerData, setMediaViewerData };
}
