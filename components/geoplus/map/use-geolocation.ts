import { useCallback, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import * as maplibregl from "maplibre-gl";

type UseGeolocationArgs = {
  mapRef: RefObject<maplibregl.Map | null>;
  flyToCoordinates: (longitude: number, latitude: number, zoom?: number) => void;
  setMapMarker: (longitude: number, latitude: number) => void;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
};

export function useGeolocation({ mapRef, flyToCoordinates, setMapMarker, setStatusMessage }: UseGeolocationArgs) {
  const [isLocating, setIsLocating] = useState(false);

  const goToCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported in this browser.");
      return;
    }

    // Modern browsers require a Secure Context (HTTPS or localhost) for Geolocation.
    // If the user is accessing via a local IP (e.g. 192.168.x.x), this will likely be false.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatusMessage("Location requires a secure connection (HTTPS). If you are testing locally, use 'localhost' instead of an IP address.");
      return;
    }

    if (!mapRef.current) {
      setStatusMessage("Map is not ready yet. Please wait a moment.");
      return;
    }

    setIsLocating(true);
    setStatusMessage(null);

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      
      // Safety check for invalid coordinates
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setStatusMessage("Received invalid coordinates from your device.");
        setIsLocating(false);
        return;
      }

      flyToCoordinates(longitude, latitude, 15);
      setMapMarker(longitude, latitude);
      setStatusMessage(null);
      setIsLocating(false);
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn("Geolocation attempt failed:", error.message || "Unknown error", `(Code: ${error.code})`);
      
      if (error.code === error.PERMISSION_DENIED) {
        setStatusMessage("Location access was denied. Please enable it in your browser settings (check the address bar lock icon).");
        setIsLocating(false);
      } else {
        // For Code 2 (Unavailable) or Code 3 (Timeout), try one last attempt with low accuracy and no timeout
        // This sometimes helps wake up the OS location provider if it was stuck.
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (finalError) => {
            console.warn("Geolocation fallback failed:", finalError.message || "Unknown error", `(Code: ${finalError.code})`);
            if (finalError.code === finalError.TIMEOUT) {
              setStatusMessage("Location request timed out. Please ensure you have a clear view of the sky or a strong Wi-Fi signal.");
            } else if (finalError.code === 2) {
              setStatusMessage("Location unavailable. On macOS, go to System Settings > Privacy & Security > Location Services and ensure it's ON for your browser.");
            } else {
              setStatusMessage("Unable to determine your location. Please check your browser and OS privacy settings.");
            }
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 }
        );
      }
    };

    // First attempt: High accuracy with a generous timeout
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  }, [flyToCoordinates, setMapMarker, mapRef, setStatusMessage]);

  return { isLocating, goToCurrentLocation };
}
