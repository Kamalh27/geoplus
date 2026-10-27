import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { humanizeColumnName } from "@/lib/geoplus/duckdb-spatial-analytics";

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveFieldLabel = (layer: GeoPlusLayerItem | undefined, field: string) =>
  layer?.interactionConfig?.fieldDisplayNames?.[field]?.trim() || humanizeColumnName(field);

// Only these URL schemes may be emitted as <img>/<video> sources in popup HTML. Anything else
// (javascript:, http:, file:, arbitrary data: payloads, ...) is rendered as plain text.
const isAllowedMediaUrl = (val: string) => {
  if (val.startsWith("data:image/") || val.startsWith("data:video/") || val.startsWith("blob:")) {
    return true;
  }
  try {
    return new URL(val).protocol === "https:";
  } catch {
    return false;
  }
};

const isMediaString = (val: string): { isMedia: boolean; type: "image" | "video" } => {
  if (!isAllowedMediaUrl(val)) return { isMedia: false, type: "image" };
  if (val.startsWith("data:image/")) return { isMedia: true, type: "image" };
  if (val.startsWith("data:video/")) return { isMedia: true, type: "video" };
  if (val.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i)) return { isMedia: true, type: "image" };
  if (val.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) return { isMedia: true, type: "video" };
  return { isMedia: false, type: "image" };
};

const renderHtmlValue = (value: unknown, label: string) => {
  if (typeof value === "string") {
    const mediaCheck = isMediaString(value);
    if (mediaCheck.isMedia) {
      if (mediaCheck.type === "image") {
        return `<img src="${escapeHtml(value)}" alt="${escapeHtml(label)}" class="geoplus-popup-media" style="cursor:pointer; max-width:100%; height:auto; max-height:140px; border-radius:6px; object-fit:contain; border:1px solid rgba(148,163,184,0.4); transition:opacity 0.2s;" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1" data-media-type="image" data-media-title="${escapeHtml(label)}" />`;
      } else {
        return `<div class="geoplus-popup-media" style="position:relative; cursor:pointer; display:inline-block;" data-media-type="video" data-media-title="${escapeHtml(label)}" data-media-src="${escapeHtml(value)}">
          <video src="${escapeHtml(value)}" style="max-width:100%; height:auto; max-height:140px; border-radius:6px; object-fit:contain; border:1px solid rgba(148,163,184,0.4); pointer-events:none;"></video>
          <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.2); border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.4)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'">
            <div style="width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; color:white; padding-left:3px;">▶</div>
          </div>
        </div>`;
      }
    }
  }

  // Handle media array (unlocked schema)
  if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object" && "data" in value[0]) {
    return `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
      ${value.map((item: { data?: unknown; name?: unknown; type?: unknown }) => {
        const data = typeof item.data === "string" ? item.data : "";
        const name = typeof item.name === "string" ? item.name : "Media";
        const type = typeof item.type === "string" && item.type.startsWith("video/") ? "video" : "image";
        if (type === "image") {
          return `<img src="${escapeHtml(data)}" alt="${escapeHtml(name)}" class="geoplus-popup-media" style="cursor:pointer; width:48px; height:48px; border-radius:4px; object-fit:cover; border:1px solid rgba(148,163,184,0.3);" data-media-type="image" data-media-title="${escapeHtml(name)}" />`;
        } else {
          return `<div class="geoplus-popup-media" style="position:relative; cursor:pointer; width:48px; height:48px; border-radius:4px; overflow:hidden; border:1px solid rgba(148,163,184,0.3);" data-media-type="video" data-media-title="${escapeHtml(name)}" data-media-src="${escapeHtml(data)}">
            <video src="${escapeHtml(data)}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;"></video>
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.2);">
              <div style="width:16px; height:16px; border-radius:50%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; color:white; font-size:8px; padding-left:1px;">▶</div>
            </div>
          </div>`;
        }
      }).join("")}
    </div>`;
  }

  return escapeHtml(value);
};

export const buildTooltipHtml = (layer: GeoPlusLayerItem | undefined, properties: Record<string, unknown>) => {
  const tooltipFields = layer?.interactionConfig?.tooltipFields;
  const validTooltipFields = (tooltipFields ?? []).filter((field) => Object.prototype.hasOwnProperty.call(properties, field));
  if (validTooltipFields.length > 0) {
    return validTooltipFields
      .map((field) => {
        const label = resolveFieldLabel(layer, field);
        const renderedVal = renderHtmlValue(properties[field], label);
        const isMedia = (typeof properties[field] === "string" && isMediaString(properties[field]).isMedia) || 
                        (field === "media" && Array.isArray(properties[field]));
        if (isMedia) {
           return `<div style="margin-bottom:6px;"><b style="display:block; margin-bottom:2px;">${escapeHtml(label)}:</b> ${renderedVal}</div>`;
        }
        return `<div><b>${escapeHtml(label)}:</b> ${renderedVal}</div>`;
      })
      .join("");
  }

  const fallbackFields = Object.keys(properties)
    .filter((field) => field !== "layer" && field !== "source")
    .filter((field) => {
      const value = properties[field];
      if (field === "media" && Array.isArray(value)) return true;
      return value !== null && value !== undefined && typeof value !== "object";
    });

  if (fallbackFields.length > 0) {
    return fallbackFields
      .map((field) => {
        const label = resolveFieldLabel(layer, field);
        const renderedVal = renderHtmlValue(properties[field], label);
        const isMedia = (typeof properties[field] === "string" && isMediaString(properties[field]).isMedia) || 
                        (field === "media" && Array.isArray(properties[field]));
        if (isMedia) {
           return `<div style="margin-bottom:6px;"><b style="display:block; margin-bottom:2px;">${escapeHtml(label)}:</b> ${renderedVal}</div>`;
        }
        return `<div><b>${escapeHtml(label)}:</b> ${renderedVal}</div>`;
      })
      .join("");
  }

  const title = properties.name ?? properties.title ?? properties.id ?? "Feature Details";
  return `<b>${escapeHtml(title)}</b>`;
};

export const buildPopupHtml = (layer: GeoPlusLayerItem | undefined, properties: Record<string, unknown>) => {
  const popupFields = layer?.interactionConfig?.popupFields;
  const validPopupFields = (popupFields ?? []).filter((field) => Object.prototype.hasOwnProperty.call(properties, field));
  const fields =
    validPopupFields.length > 0
      ? validPopupFields
      : Object.keys(properties).filter((field) => field !== "layer" && field !== "source");
  const rows = fields
    .map((field) => {
      const value = properties[field];
      if (value === null || value === undefined || (typeof value === "object" && !Array.isArray(value))) {
        return null;
      }
      const label = resolveFieldLabel(layer, field);
      const isMedia = (typeof value === "string" && isMediaString(value).isMedia) || 
                      (field === "media" && Array.isArray(value));
      const renderedVal = renderHtmlValue(value, label);
      
      if (isMedia) {
         return `<tr><td colspan="2" style="padding-top:4px; padding-bottom:6px;"><div style="font-weight:600; margin-bottom:4px;">${escapeHtml(label)}</div>${renderedVal}</td></tr>`;
      }
      return `<tr><td style="padding-right:12px; font-weight:600; vertical-align:top;">${escapeHtml(label)}</td><td>${renderedVal}</td></tr>`;
    })
    .filter(Boolean)
    .join("");

  const bodyHtml =
    rows.length > 0
      ? `<div style="max-height: 220px; overflow-y: auto; padding: 6px 8px 8px;"><table style="font-size: 11px; width: 100%; border-collapse: separate; border-spacing: 0 3px;"><tbody>${rows}</tbody></table></div>`
      : `<div style="max-height: 220px; overflow-y: auto; padding: 6px 8px 8px; font-size: 11px;">No attributes available for this feature.</div>`;

  const title = "Information";
  const infoIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="display:block;">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
      <path d="M12 10v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      <circle cx="12" cy="7" r="1.2" fill="currentColor"></circle>
    </svg>
  `;

  return `
    <section style="min-width: 220px; max-width: 360px;">
      <header style="display:flex; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid rgba(148,163,184,0.25); padding:5px 8px;">
        <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; letter-spacing:0.02em;">
          <span style="display:inline-flex; align-items:center; color:inherit;">${infoIcon}</span>
          <span>${title}</span>
        </div>
        <button
          type="button"
          aria-label="Close information popup"
          onclick="this.closest('.maplibregl-popup')?.remove()"
          style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border:0; border-radius:4px; background:transparent; color:inherit; font-size:14px; line-height:1; cursor:pointer;"
        >
          ×
        </button>
      </header>
      ${bodyHtml}
    </section>
  `;
};
