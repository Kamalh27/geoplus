"use client";

import { useState } from "react";
import {
  BarChart3,
  BookMarked,
  Box,
  Columns3,
  Compass,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  EllipsisVertical,
  Focus,
  Globe,
  Info,
  Map,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Trash2,
  Ruler,
  Search,
  Settings2,
  Plus,
  GripVertical,
  ChevronDown,
  Sun,
  type LucideIcon,
  Table2,
  Type,
  Zap,
  ZoomIn,
  Rows3,
  PencilRuler,
} from "lucide-react";
import { GEOPLUS_BASEMAP_OPTIONS, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import { useAppSettings, type AppSettings, type AppSettingsUpdate, type ControlPosition, type ControlOrientation, type StandardControlItem, type ControlGroupSetting, type StandardControlLayout, type ControlGroupLayout } from "./use-app-settings";
import { SquareSwitch } from "@/components/ui/square-switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type SettingsPanelProps = {
  settings?: AppSettings;
  updateSettings?: (newSettings: AppSettingsUpdate) => void;
  isLoaded?: boolean;
};

export function SettingsPanel({ settings: settingsProp, updateSettings: updateSettingsProp, isLoaded: isLoadedProp }: SettingsPanelProps) {
  const appSettings = useAppSettings();
  const settings = settingsProp ?? appSettings.settings;
  const updateSettings = updateSettingsProp ?? appSettings.updateSettings;
  const isLoaded = isLoadedProp ?? appSettings.isLoaded;
  const [isStandardGroupModalOpen, setIsStandardGroupModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPosition, setNewGroupPosition] = useState<ControlPosition>("top-right");
  const [newGroupOrientation, setNewGroupOrientation] = useState<ControlOrientation>("vertical");
  const [newGroupLayout, setNewGroupLayout] = useState<ControlGroupLayout>("split");
  const [newGroupItems, setNewGroupItems] = useState<StandardControlItem[]>([]);
  const [draggedStandardControl, setDraggedStandardControl] = useState<StandardControlItem | null>(null);

  if (!isLoaded) return null;

  const controlPositionOptions: { value: ControlPosition; label: string; tooltip: string; icon: LucideIcon }[] = [
    { value: "top-left", label: "Top Left", tooltip: "Dock controls at top left", icon: CornerUpLeft },
    { value: "top-right", label: "Top Right", tooltip: "Dock controls at top right", icon: CornerUpRight },
    { value: "bottom-left", label: "Bottom Left", tooltip: "Dock controls at bottom left", icon: CornerDownLeft },
    { value: "bottom-right", label: "Bottom Right", tooltip: "Dock controls at bottom right", icon: CornerDownRight },
  ];

  const controlOrientationOptions: { value: ControlOrientation; label: string; tooltip: string; icon: LucideIcon }[] = [
    { value: "vertical", label: "Vertical", tooltip: "Stack controls vertically", icon: Columns3 },
    { value: "horizontal", label: "Horizontal", tooltip: "Arrange controls horizontally", icon: Rows3 },
  ];
  const standardControlOptions: { value: StandardControlItem; label: string; icon: LucideIcon }[] = [
    { value: "search", label: "Search", icon: Search },
    { value: "zoom", label: "Zoom", icon: ZoomIn },
    { value: "compass", label: "Compass", icon: Compass },
    { value: "view3d", label: "3D", icon: Box },
    { value: "projection", label: "Projection", icon: Globe },
    { value: "legend", label: "Legend", icon: BookMarked },
    { value: "locate", label: "Locate", icon: Focus },
    { value: "fullscreen", label: "Fullscreen", icon: Map },
  ];
  const selectedStandardControls = settings.standardControlItems ?? [];
  const standardControlLayout = settings.standardControlLayout ?? "default";
  const customControlGroups = settings.customControlGroups ?? [];
  const editingGroup = customControlGroups.find((group) => group.id === editingGroupId) ?? null;
  const blockedForCustomGroup = new Set<StandardControlItem>(selectedStandardControls);
  customControlGroups.forEach((group) => {
    if (group.id === editingGroupId) {
      return;
    }
    group.items.forEach((item) => blockedForCustomGroup.add(item));
  });
  const availableForGroupEditor = standardControlOptions.filter(
    (option) => !blockedForCustomGroup.has(option.value) || newGroupItems.includes(option.value),
  );
  const selectedStandardControlOptions = selectedStandardControls
    .map((value) => standardControlOptions.find((option) => option.value === value))
    .filter((option): option is (typeof standardControlOptions)[number] => Boolean(option));
  const unselectedStandardControlOptions = standardControlOptions.filter(
    (option) => !selectedStandardControls.includes(option.value),
  );

  const toggleStandardControl = (item: StandardControlItem) => {
    const isSelected = selectedStandardControls.includes(item);
    const nextControls = isSelected
      ? selectedStandardControls.filter((value) => value !== item)
      : [...selectedStandardControls, item];
    updateSettings({ standardControlItems: nextControls });
  };

  const reorderStandardControls = (from: StandardControlItem, to: StandardControlItem) => {
    if (from === to) {
      return;
    }
    if (!selectedStandardControls.includes(from) || !selectedStandardControls.includes(to)) {
      return;
    }
    const nextControls = [...selectedStandardControls];
    const fromIndex = nextControls.indexOf(from);
    const toIndex = nextControls.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    nextControls.splice(fromIndex, 1);
    nextControls.splice(toIndex, 0, from);
    updateSettings({ standardControlItems: nextControls });
  };

  const toggleNewGroupItem = (item: StandardControlItem) => {
    setNewGroupItems((previous) =>
      previous.includes(item) ? previous.filter((value) => value !== item) : [...previous, item],
    );
  };

  const saveControlGroup = () => {
    const trimmedName = newGroupName.trim();
    if (!trimmedName || newGroupItems.length === 0) {
      return;
    }
    const nextGroupNumber =
      customControlGroups.reduce((max, group) => {
        const match = group.id.match(/^group-(\d+)$/);
        const groupNumber = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
        return groupNumber > max ? groupNumber : max;
      }, 0) + 1;
    const targetGroupId = editingGroupId ?? `group-${nextGroupNumber}`;
    const nextGroup: ControlGroupSetting = {
      id: targetGroupId,
      name: trimmedName,
      position: newGroupPosition,
      orientation: newGroupOrientation,
      layout: newGroupLayout,
      items: newGroupItems,
    };
    const nextGroups = editingGroupId
      ? customControlGroups.map((group) => (group.id === editingGroupId ? nextGroup : group))
      : [...customControlGroups, nextGroup];
    updateSettings({ customControlGroups: nextGroups });
    setEditingGroupId(null);
    setNewGroupName("");
    setNewGroupPosition("top-right");
    setNewGroupOrientation("vertical");
    setNewGroupLayout("split");
    setNewGroupItems([]);
    setIsCreateGroupModalOpen(false);
  };

  const openCreateGroupModal = () => {
    setEditingGroupId(null);
    setNewGroupName("");
    setNewGroupPosition("top-right");
    setNewGroupOrientation("vertical");
    setNewGroupLayout("split");
    setNewGroupItems([]);
    setIsCreateGroupModalOpen(true);
  };

  const openEditGroupModal = (group: ControlGroupSetting) => {
    setEditingGroupId(group.id);
    setNewGroupName(group.name);
    setNewGroupPosition(group.position);
    setNewGroupOrientation(group.orientation);
    setNewGroupLayout(group.layout ?? "split");
    setNewGroupItems(group.items);
    setIsCreateGroupModalOpen(true);
  };

  const removeControlGroup = (groupId: string) => {
    if (editingGroupId === groupId) {
      setEditingGroupId(null);
      setIsCreateGroupModalOpen(false);
    }
    updateSettings({ customControlGroups: customControlGroups.filter((group) => group.id !== groupId) });
  };

  const updateCustomGroup = (groupId: string, patch: Partial<Omit<ControlGroupSetting, "id">>) => {
    updateSettings({
      customControlGroups: customControlGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              ...patch,
            }
          : group,
      ),
    });
  };

  const standardLayoutOptions: { value: StandardControlLayout; label: string; description: string }[] = [
    { value: "default", label: "Default", description: "Current separate buttons with spacing" },
    { value: "compact", label: "Compact", description: "Draw-style joined buttons without gaps" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="size-4 text-accent" />
          Settings
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label="Settings info"
              className="inline-flex size-3 items-center justify-center rounded text-muted-foreground transition hover:text-foreground -translate-y-[0.28rem]"
            >
              <Info className="size-3" />
            </button>
            <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 w-64 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2.5 py-2 text-[0.66rem] font-medium leading-snug text-card-foreground opacity-0 shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition-opacity duration-150 group-hover:opacity-100">
              Configure workspace behavior, map controls, and which layer actions appear in the layer panel.
            </span>
          </span>
        </h2>
      </div>

      <div className="geoplus-panel-scroll geoplus-settings-scroll flex-1 overflow-y-auto overflow-x-hidden p-4 pl-5 pr-3 space-y-6">
        
        {/* Theme Settings */}
        <section className="space-y-3">
          <Collapsible defaultOpen className="space-y-3">
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center justify-between rounded-sm text-left">
                <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Theme Settings</h3>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
          <div className="rounded-lg border border-border/50 bg-card/40 p-1">
            <div className="flex rounded-md bg-muted/40 p-1 gap-1">
              <button
                onClick={() => updateSettings({ theme: "light" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors ${
                  settings.theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sun className="size-3.5" />
                Light
              </button>
              <button
                onClick={() => updateSettings({ theme: "dark" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors ${
                  settings.theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Moon className="size-3.5" />
                Dark
              </button>
              <button
                onClick={() => updateSettings({ theme: "system" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors ${
                  settings.theme === "system" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Monitor className="size-3.5" />
                System
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                <Moon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Theme Toggle Button</p>
                <p className="text-[0.65rem] text-muted-foreground">Show or hide theme toggle in the header</p>
              </div>
            </div>
            <SquareSwitch checked={settings.showThemeToggle} onCheckedChange={(c) => updateSettings({ showThemeToggle: c })} />
          </label>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* Basemap Defaults */}
        <section className="space-y-3">
          <Collapsible defaultOpen className="space-y-3">
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center justify-between rounded-sm text-left">
                <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Basemap Defaults</h3>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
          <div className="rounded-lg border border-border/50 bg-card/40 p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                <Globe className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Default Basemap</p>
                <p className="text-[0.65rem] text-muted-foreground">Set startup basemap for your workspace</p>
              </div>
            </div>
            <select
              value={settings.defaultBasemap}
              onChange={(event) => updateSettings({ defaultBasemap: event.target.value as GeoPlusBasemapId })}
              className="mt-3 h-9 w-full rounded-md border border-border/70 bg-background/80 px-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/60"
            >
              {GEOPLUS_BASEMAP_OPTIONS.map((basemap) => (
                <option key={basemap.id} value={basemap.id}>
                  {basemap.label}
                </option>
              ))}
            </select>
          </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* Map Controls */}
        <section className="space-y-3">
          <Collapsible defaultOpen className="space-y-3">
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center justify-between rounded-sm text-left">
                <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Map Controls</h3>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
          <div className="space-y-2">
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Map className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Standard Controls</p>
                  <p className="text-[0.65rem] text-muted-foreground">Position and orientation</p>
                </div>
                <button
                  type="button"
                  title="Configure controls in standard group"
                  aria-label="Configure controls in standard group"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border/70 bg-card/70 text-foreground transition hover:border-accent/50 hover:bg-accent/10"
                  onClick={() => setIsStandardGroupModalOpen(true)}
                >
                  <Settings2 className="size-3.5" />
                </button>
              </div>

              <div className="mt-3 flex items-end justify-between gap-5">
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Position</p>
                  <div className="mt-1 inline-grid grid-cols-4 gap-2">
                    {controlPositionOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = settings.mapControlPosition === option.value;
                      return (
                        <span key={`map-pos-${option.value}`} className="group relative inline-flex">
                          <button
                            type="button"
                            aria-label={option.label}
                            title={option.label}
                            onClick={() => updateSettings({ mapControlPosition: option.value })}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition ${
                              isActive
                                ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                                : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                            }`}
                          >
                            <Icon className="size-3.5" />
                          </button>
                          <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-40 w-max -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2 py-1 text-[10px] font-semibold text-card-foreground opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                            {option.tooltip}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Orientation</p>
                  <div className="mt-1 inline-grid grid-cols-2 gap-2">
                    {controlOrientationOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = settings.mapControlOrientation === option.value;
                      return (
                        <span key={`map-ori-${option.value}`} className="group relative inline-flex">
                          <button
                            type="button"
                            aria-label={option.label}
                            title={option.label}
                            onClick={() => updateSettings({ mapControlOrientation: option.value })}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition ${
                              isActive
                                ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                                : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                            }`}
                          >
                            <Icon className="size-3.5" />
                          </button>
                          <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-40 w-max -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2 py-1 text-[10px] font-semibold text-card-foreground opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                            {option.tooltip}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-border/50 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Custom Groups</p>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-sm border border-border/70 bg-card/70 px-2 text-[10px] font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/10"
                    onClick={openCreateGroupModal}
                  >
                    <Plus className="size-3.5" />
                    Create New Group
                  </button>
                </div>
                {customControlGroups.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {customControlGroups.map((group) => (
                      <div
                        key={group.id}
                        className="rounded-sm border border-border/60 bg-card/65 px-2 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-foreground">{group.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {group.items.length} item{group.items.length === 1 ? "" : "s"} · {group.layout ?? "split"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title="Edit group"
                              aria-label={`Edit ${group.name}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border/70 bg-card/70 text-foreground transition hover:border-accent/50 hover:bg-accent/10"
                              onClick={() => openEditGroupModal(group)}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete group"
                              aria-label={`Delete ${group.name}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border/70 bg-card/70 text-rose-400 transition hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-300"
                              onClick={() => removeControlGroup(group.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex items-end justify-between gap-4">
                          <div>
                            <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">Position</p>
                            <div className="mt-1 inline-grid grid-cols-4 gap-1.5">
                              {controlPositionOptions.map((option) => {
                                const Icon = option.icon;
                                const isActive = group.position === option.value;
                                return (
                                  <button
                                    key={`custom-group-${group.id}-pos-${option.value}`}
                                    type="button"
                                    title={option.label}
                                    aria-label={`${group.name} ${option.label}`}
                                    onClick={() => updateCustomGroup(group.id, { position: option.value })}
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border transition ${
                                      isActive
                                        ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                                        : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                                    }`}
                                  >
                                    <Icon className="size-3" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">Orientation</p>
                            <div className="mt-1 inline-grid grid-cols-2 gap-1.5">
                              {controlOrientationOptions.map((option) => {
                                const Icon = option.icon;
                                const isActive = group.orientation === option.value;
                                return (
                                  <button
                                    key={`custom-group-${group.id}-ori-${option.value}`}
                                    type="button"
                                    title={option.label}
                                    aria-label={`${group.name} ${option.label}`}
                                    onClick={() => updateCustomGroup(group.id, { orientation: option.value })}
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border transition ${
                                      isActive
                                        ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                                        : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                                    }`}
                                  >
                                    <Icon className="size-3" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    No custom groups yet. Controls removed from Standard stay visible in split mode at top-right.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <PencilRuler className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Draw & Measure Toolbar</p>
                  <p className="text-[0.65rem] text-muted-foreground">Position and orientation</p>
                </div>
              </div>

              <div className="mt-3 flex items-end justify-between gap-5">
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Position</p>
                  <div className="mt-1 inline-grid grid-cols-4 gap-2">
                    {controlPositionOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = settings.drawControlPosition === option.value;
                      return (
                        <span key={`draw-pos-${option.value}`} className="group relative inline-flex">
                          <button
                            type="button"
                            aria-label={`Draw ${option.label}`}
                            title={option.label}
                            onClick={() => updateSettings({ drawControlPosition: option.value })}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition ${
                              isActive
                                ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                                : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                            }`}
                          >
                            <Icon className="size-3.5" />
                          </button>
                          <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-40 w-max -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2 py-1 text-[10px] font-semibold text-card-foreground opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                            Draw toolbar: {option.tooltip.toLowerCase()}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Orientation</p>
                  <div className="mt-1 inline-grid grid-cols-2 gap-2">
                    {controlOrientationOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = settings.drawControlOrientation === option.value;
                      return (
                        <span key={`draw-ori-${option.value}`} className="group relative inline-flex">
                          <button
                            type="button"
                            aria-label={`Draw ${option.label}`}
                            title={option.label}
                            onClick={() => updateSettings({ drawControlOrientation: option.value })}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition ${
                              isActive
                                ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                                : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                            }`}
                          >
                            <Icon className="size-3.5" />
                          </button>
                          <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-40 w-max -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2 py-1 text-[10px] font-semibold text-card-foreground opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
                            Draw toolbar: {option.tooltip.toLowerCase()}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          
            <div className="space-y-2">
              <Collapsible defaultOpen className="space-y-2">
                <CollapsibleTrigger asChild>
                  <button type="button" className="group flex w-full items-center justify-between rounded-sm pt-1 text-left">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Map Visibility
                    </p>
                    <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <ZoomIn className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Zoom Controls</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show +/- buttons on the map</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showZoomControl} 
                onCheckedChange={(c) => updateSettings({ showZoomControl: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Search className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Search</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show geocoding search panel</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showSearchControl} 
                onCheckedChange={(c) => updateSettings({ showSearchControl: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Compass className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Compass</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show map bearing/pitch reset</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showCompass} 
                onCheckedChange={(c) => updateSettings({ showCompass: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Ruler className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Scale Bar</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show distance scale at the bottom</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showScaleBar} 
                onCheckedChange={(c) => updateSettings({ showScaleBar: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Map className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Fullscreen</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show fullscreen toggle</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showFullscreenControl} 
                onCheckedChange={(c) => updateSettings({ showFullscreenControl: c })} 
              />
            </label>
                </CollapsibleContent>
              </Collapsible>
          </div>
          </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* Layer Settings */}
        <section className="space-y-3">
          <Collapsible defaultOpen className="space-y-3">
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center justify-between rounded-sm text-left">
                <h3 className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
                  Layer Settings
                  <span className="group relative inline-flex">
                    <span
                      aria-label="Layer settings info"
                      className="inline-flex size-3 items-center justify-center rounded text-muted-foreground transition hover:text-foreground -translate-y-[0.1rem]"
                    >
                      <Info className="size-3" />
                    </span>
                    <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 w-64 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2.5 py-2 text-[0.66rem] font-medium normal-case leading-snug tracking-normal text-card-foreground opacity-0 shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition-opacity duration-150 group-hover:opacity-100">
                      Show or hide layer actions dynamically like zoom, table, chart, style, labels, and more actions.
                    </span>
                  </span>
                </h3>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
          <div className="space-y-2">
            
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Zap className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Auto Zoom</p>
                  <p className="text-[0.65rem] text-muted-foreground">Zoom to layer bounds when added</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.autoZoomToLayers} 
                onCheckedChange={(c) => updateSettings({ autoZoomToLayers: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Info className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Tooltips</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show data tooltips on hover</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showLayerTooltips} 
                onCheckedChange={(c) => updateSettings({ showLayerTooltips: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Info className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Popups</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show detailed popups on click</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showLayerPopups} 
                onCheckedChange={(c) => updateSettings({ showLayerPopups: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Info className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Layer Info Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show source and data details action</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showInfo} onCheckedChange={(c) => updateSettings({ layerTools: { showInfo: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Pencil className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Rename Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show rename button for each layer</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showRename} onCheckedChange={(c) => updateSettings({ layerTools: { showRename: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Focus className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Zoom Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show zoom to layer button in tools row</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showZoom} onCheckedChange={(c) => updateSettings({ layerTools: { showZoom: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Table2 className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Table Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show layer table button</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showTable} onCheckedChange={(c) => updateSettings({ layerTools: { showTable: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <BarChart3 className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Chart Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show layer chart button</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showChart} onCheckedChange={(c) => updateSettings({ layerTools: { showChart: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Palette className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Style Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show style modal button</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showStyle} onCheckedChange={(c) => updateSettings({ layerTools: { showStyle: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Type className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Label Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show label configuration action</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showLabels} onCheckedChange={(c) => updateSettings({ layerTools: { showLabels: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <EllipsisVertical className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">More Action Menu</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show extra actions menu for opacity controls</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showMore} onCheckedChange={(c) => updateSettings({ layerTools: { showMore: c } })} />
            </label>

          </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

      </div>

      <Dialog open={isStandardGroupModalOpen} onOpenChange={setIsStandardGroupModalOpen}>
        <DialogContent className="max-w-md gap-3">
          <DialogHeader>
            <DialogTitle className="text-sm">Controls In Standard Group</DialogTitle>
            <DialogDescription className="text-xs">
              Unchecked controls stay visible as split controls at top-right until added to a custom group.
            </DialogDescription>
          </DialogHeader>
          <div className="border-t border-border/50 pt-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Style</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {standardLayoutOptions.map((option) => {
                const isActive = standardControlLayout === option.value;
                return (
                  <button
                    key={`standard-layout-${option.value}`}
                    type="button"
                    onClick={() => updateSettings({ standardControlLayout: option.value })}
                    className={`rounded-sm border px-2 py-1.5 text-left text-[10px] font-semibold transition ${
                      isActive
                        ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                        : "border-border/70 bg-card/70 text-muted-foreground hover:border-accent/50 hover:bg-accent/10 hover:text-foreground"
                    }`}
                  >
                    <p>{option.label}</p>
                    <p className={`mt-0.5 text-[9px] font-medium ${isActive ? "text-emerald-900/80" : "text-muted-foreground"}`}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border/50 pt-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Selected Controls (Drag To Order)</p>
            <div className="mt-1 space-y-1.5">
              {selectedStandardControlOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    key={`standard-control-modal-${option.value}`}
                    draggable
                    onDragStart={(event) => {
                      setDraggedStandardControl(option.value);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", option.value);
                    }}
                    onDragEnd={() => setDraggedStandardControl(null)}
                    onDragOver={(event) => {
                      if (draggedStandardControl) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedStandardControl) {
                        reorderStandardControls(draggedStandardControl, option.value);
                        setDraggedStandardControl(null);
                      }
                    }}
                    className="flex cursor-grab items-center gap-2 rounded-sm border border-emerald-400/50 bg-emerald-500/15 px-2 py-1.5 text-xs text-foreground transition active:cursor-grabbing"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-emerald-500"
                      checked
                      onChange={() => toggleStandardControl(option.value)}
                    />
                    <Icon className="size-3.5" />
                    <span className="flex-1">{option.label}</span>
                    <GripVertical className="size-3.5 text-muted-foreground transition-colors hover:text-accent" />
                  </label>
                );
              })}
              {selectedStandardControlOptions.length === 0 && (
                <p className="rounded-sm border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] text-muted-foreground">
                  No selected controls.
                </p>
              )}
            </div>
          </div>
          <div className="border-t border-border/50 pt-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Available Controls</p>
            <div className="mt-1 space-y-1.5">
              {unselectedStandardControlOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    key={`standard-control-available-${option.value}`}
                    className="flex cursor-pointer items-center gap-2 rounded-sm border border-border/70 bg-card/70 px-2 py-1.5 text-xs text-foreground transition hover:border-accent/50 hover:bg-accent/10"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-emerald-500"
                      checked={false}
                      onChange={() => toggleStandardControl(option.value)}
                    />
                    <Icon className="size-3.5" />
                    <span className="flex-1">{option.label}</span>
                    <GripVertical className="size-3.5 text-transparent" />
                  </label>
                );
              })}
              {unselectedStandardControlOptions.length === 0 && (
                <p className="rounded-sm border border-border/70 bg-card/70 px-2 py-1.5 text-[11px] text-muted-foreground">
                  All controls are selected.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateGroupModalOpen}
        onOpenChange={(open) => {
          setIsCreateGroupModalOpen(open);
          if (!open) {
            setEditingGroupId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg gap-3">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingGroup ? "Edit Control Group" : "Create New Control Group"}</DialogTitle>
            <DialogDescription className="text-xs">
              Pick a name, position, orientation, view, and controls for this custom group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Group Name</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="e.g. Navigation"
                className="h-9 w-full rounded-md border border-border/70 bg-background/80 px-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/60"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Position</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {controlPositionOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = newGroupPosition === option.value;
                    return (
                      <button
                        key={`group-pos-${option.value}`}
                        type="button"
                        title={option.label}
                        onClick={() => setNewGroupPosition(option.value)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition ${
                          isActive
                            ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                            : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                        }`}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Orientation</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {controlOrientationOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = newGroupOrientation === option.value;
                    return (
                      <button
                        key={`group-ori-${option.value}`}
                        type="button"
                        title={option.label}
                        onClick={() => setNewGroupOrientation(option.value)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition ${
                          isActive
                            ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                            : "border-border/70 bg-card/70 text-foreground hover:border-accent/50 hover:bg-accent/10"
                        }`}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">View</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "split", label: "Split" },
                  { value: "compact", label: "Compact" },
                ] as const).map((option) => {
                  const isActive = newGroupLayout === option.value;
                  return (
                    <button
                      key={`group-layout-${option.value}`}
                      type="button"
                      onClick={() => setNewGroupLayout(option.value)}
                      className={`rounded-sm border px-2 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "border-emerald-400/60 bg-emerald-500 text-emerald-950 shadow-[0_4px_10px_rgba(16,185,129,0.28)]"
                          : "border-border/70 bg-card/70 text-muted-foreground hover:border-accent/50 hover:bg-accent/10 hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Controls</p>
              {availableForGroupEditor.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {availableForGroupEditor.map((option) => {
                    const Icon = option.icon;
                    const isChecked = newGroupItems.includes(option.value);
                    return (
                      <label
                        key={`group-item-${option.value}`}
                        className="flex cursor-pointer items-center gap-2 rounded-sm border border-border/70 bg-card/70 px-2 py-1.5 text-xs text-foreground transition hover:border-accent/50 hover:bg-accent/10"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-emerald-500"
                          checked={isChecked}
                          onChange={() => toggleNewGroupItem(option.value)}
                        />
                        <Icon className="size-3.5" />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">No available controls for this group.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-sm border border-border/70 bg-card/70 px-3 text-xs font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/10"
              onClick={() => {
                setIsCreateGroupModalOpen(false);
                setEditingGroupId(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-sm bg-emerald-500 px-3 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={saveControlGroup}
              disabled={!newGroupName.trim() || newGroupItems.length === 0}
            >
              {editingGroup ? "Save Changes" : "Create Group"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
