export const DRAFT_USER_MANUAL_MARKDOWN = `
# GeoPlus User Manual (Draft)

## 1. Overview
GeoPlus is a map-first geospatial workspace for loading, styling, and analyzing vector datasets.

## 2. Quick Start
1. Open the **Layers** tab and add a data source.
2. Confirm the layer is visible on the map canvas.
3. Use **Tools** for filtering, clip, and buffer operations.
4. Switch basemap context from the **Basemap** tab.

## 3. Layer Management
- Toggle visibility and opacity in Layer Manager.
- Rename operational layers for collaboration.
- Reorder draw priority to control map stacking.

## 4. Analysis Workflow
- Apply SQL-like filters to queryable layers.
- Run buffer analysis for proximity insights.
- Run clip analysis for area-specific extraction.

## 5. Reporting Issues
- Open the bug form from the header toolbar.
- Include reproducible steps and expected behavior.
- Set severity to help triage quickly.

## 6. Best Practices
- Use consistent naming for uploaded layers.
- Keep raw source data unchanged when testing filters.
- Save screenshots with exact map zoom for bug reports.
`.trim();
