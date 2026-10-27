import { useEffect } from "react";
import { registerCogProtocol, unregisterCogProtocol } from "@/lib/geoplus/tilesets/cog-maplibre";
import { registerPmtilesProtocol, unregisterPmtilesProtocol } from "@/lib/geoplus/tilesets/pmtiles-maplibre";
import { registerMbtilesProtocol } from "@/lib/geoplus/tilesets/mbtiles-maplibre";
import { registerOpfsProtocol, unregisterOpfsProtocol } from "@/lib/geoplus/opfs-storage";

export function useProtocolRegistration() {
  useEffect(() => {
    // Register OPFS protocol first so subsequent protocols (e.g. cog://) can
    // issue byte-range requests against opfs:// archive URLs.
    registerOpfsProtocol();
    registerCogProtocol();
    registerPmtilesProtocol();
    registerMbtilesProtocol();
    return () => {
      unregisterCogProtocol();
      unregisterPmtilesProtocol();
      unregisterOpfsProtocol();
    };
  }, []);
}
