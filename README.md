# GeoPlus (Standalone App)

This is the dedicated GeoPlus Next.js app extracted from the main website app.

## Run

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Notes

- This app contains only GeoPlus-focused code (`components/geoplus*`, map controls, and related UI primitives).
- The original `website` app was left untouched so migration can happen incrementally.

## OPFS cache strategy

- Editors use OPFS as a local working store for uploads, autosave-style recovery, and repeat access to large files.
- A successful backend Save refreshes the OPFS dashboard cache, but the backend remains the source of truth.
- Viewers and external users load published dashboard metadata and assets from the backend first.
- Viewer OPFS is only a read-only cache for repeat loads and offline-friendly reuse; if OPFS is missing or stale, backend data wins.
- Shared dashboards must never depend on another user's OPFS because OPFS is private to each browser profile.

Dashboard cache helpers live in `lib/geoplus/dashboard-cache-storage.ts`.
# geoplus
