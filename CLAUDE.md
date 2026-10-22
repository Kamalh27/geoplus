# CLAUDE.md — geoplus

Standalone Next.js geospatial dashboard editor, extracted from the main `website` app.

## Commands

```bash
npm install
npm run dev       # :3000
npm run build
npm run lint
```

## Architecture

### App Structure

```
app/             Next.js app router pages
components/      geoplus* components, map controls, UI primitives
lib/
  geoplus/
    dashboard-cache-storage.ts   OPFS cache helpers
types/
```

### OPFS Cache Strategy

Editors use Origin Private File System (OPFS) as a local working store. The **backend is always the source of truth**.

| Actor | OPFS role |
|-------|-----------|
| Editor | Read/write drafts, autosave recovery, repeat access to large uploads |
| Viewer | Read-only cache for repeat loads; falls back to backend if stale/missing |

Rules to enforce:
- A successful backend Save must refresh the OPFS dashboard cache.
- Shared dashboards must never depend on another user's OPFS (OPFS is private per browser profile).
- If OPFS data conflicts with backend data, backend wins.

Cache helpers: `lib/geoplus/dashboard-cache-storage.ts`.

## Key Notes

- This app contains only GeoPlus-focused code. The original `website` app is left untouched for incremental migration.
- No backend in this directory — it talks to `core/backend` APIs.
- `NEXT_PUBLIC_API_URL` controls the backend base URL.
