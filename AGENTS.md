# AGENTS.md — geoplus

## What This Is

A standalone Next.js geospatial dashboard editor. Extracted from the main `website` app for independent iteration. Users create, edit, and publish geospatial dashboards backed by the `core/backend` API.

## Commands

```bash
npm install
npm run dev      # development server at :3001
npm run build    # production build
npm run lint     # ESLint
```

## Key Concepts

### OPFS (Origin Private File System)

GeoPlus uses the browser's OPFS as a local draft store. This has important constraints:

- OPFS is **private per browser profile** — you cannot read another user's OPFS.
- **Backend is source of truth**: on Save, always refresh the OPFS cache from the response.
- **Viewer OPFS** is read-only cache; if stale or missing, load from backend.
- **Shared dashboards** must never assume another user's OPFS has data.

OPFS helpers: `lib/geoplus/dashboard-cache-storage.ts`.

### Component Layout

| Path | Contents |
|------|----------|
| `components/geoplus*` | GeoPlus-specific UI components |
| `components/` (other) | Map controls and shared UI primitives |
| `lib/geoplus/` | Dashboard cache helpers, utilities |
| `app/` | Next.js app router pages |

## Critical Constraints

1. **OPFS conflict resolution**: when OPFS data conflicts with backend response, backend wins. Never silently serve stale OPFS data to viewers.
2. **No backend code here**: this app is a pure frontend; it calls `core/backend` APIs.
3. **Migration in progress**: the original `website` app still exists. Only code in this `geoplus/` app should be modified for GeoPlus features — do not touch `website/` for geoplus work.
