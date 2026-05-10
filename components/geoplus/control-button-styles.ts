export const CONTROL_ICON_HOVER_CLASS =
  "transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:inset-0 before:bg-accent/0 hover:before:bg-accent/20 before:transition-colors before:pointer-events-none";

export const CONTROL_GROUP_SURFACE_CLASS =
  "bg-card/92 text-card-foreground backdrop-blur";

export const CONTROL_BUTTON_CLASS =
  `relative inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border/75 bg-card/92 text-card-foreground backdrop-blur overflow-hidden shadow-[0_10px_25px_rgba(15,23,42,0.2)] ${CONTROL_ICON_HOVER_CLASS} dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]`;

export const CONTROL_GROUP_CLASS =
  `overflow-hidden rounded-sm border border-border/75 ${CONTROL_GROUP_SURFACE_CLASS} shadow-[0_10px_25px_rgba(15,23,42,0.2)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]`;

export const CONTROL_GROUP_BUTTON_CLASS =
  `relative inline-flex h-9 w-9 items-center justify-center bg-transparent text-card-foreground overflow-hidden ${CONTROL_ICON_HOVER_CLASS}`;
