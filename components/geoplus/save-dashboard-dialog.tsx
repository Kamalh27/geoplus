"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { GeoPlusLayerItem, GeoPlusUser } from "@/components/geoplus/types";
import { prepareLayersForSave, CORE_BACKEND_URL } from "@/lib/geoplus/dashboard-storage";
import { writeCachedDashboard } from "@/lib/geoplus/dashboard-cache-storage";
import type { AppSettings } from "@/components/geoplus/use-app-settings";

type SaveDashboardDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  layers: GeoPlusLayerItem[];
  settings: AppSettings;
  user: GeoPlusUser | null;
  projectUid?: string | null;
  projectName?: string | null;
  onRequireLogin: () => void;
};

type ProjectOption = {
  uid: string;
  name: string;
};

function buildCurrentProjectOption(projectUid: string, projectName?: string | null): ProjectOption {
  return {
    uid: projectUid,
    name: projectName?.trim() || "Current project",
  };
}

function getPreferredProjectUid(fallbackProjectUid?: string | null): string {
  if (typeof window !== "undefined") {
    const urlProjectUid = new URL(window.location.href).searchParams.get("project_uid")?.trim();
    if (urlProjectUid) {
      return urlProjectUid;
    }
  }

  return fallbackProjectUid?.trim() ?? "";
}

export function SaveDashboardDialog({
  isOpen,
  onOpenChange,
  layers,
  settings,
  user,
  projectUid,
  projectName,
  onRequireLogin,
}: SaveDashboardDialogProps) {
  const [dashboardName, setDashboardName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectUid, setSelectedProjectUid] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<"draft" | "published">("draft");
  const [dashboardVisibility, setDashboardVisibility] = useState<"private" | "public">("private");
  const normalizedProjectUid = projectUid?.trim() ?? "";
  const normalizedProjectName = projectName?.trim() ?? "";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const preferredProjectUid = getPreferredProjectUid(normalizedProjectUid);
    setSelectedProjectUid(preferredProjectUid);

    if (!user) {
      setProjects([]);
      setProjectsError(null);
      setIsLoadingProjects(false);
      return;
    }

    if (preferredProjectUid) {
      setProjects([buildCurrentProjectOption(preferredProjectUid, normalizedProjectName)]);
      setProjectsError(null);
      setIsLoadingProjects(false);
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      setIsLoadingProjects(true);
      setProjectsError(null);

      try {
        const response = await fetch(`${CORE_BACKEND_URL}/api/v1/projects?limit=200&offset=0`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Please sign in to load your projects.");
          }
          throw new Error(`Failed to load projects (HTTP ${response.status}).`);
        }

        const payload = await response.json();
        const projectOptions = Array.isArray(payload)
          ? payload
              .filter(
                (item): item is { uid: string; name: string } =>
                  !!item &&
                  typeof item === "object" &&
                  typeof item.uid === "string" &&
                  item.uid.trim().length > 0 &&
                  typeof item.name === "string" &&
                  item.name.trim().length > 0,
              )
              .map((item) => ({
                uid: item.uid.trim(),
                name: item.name.trim(),
              }))
          : [];

        if (cancelled) {
          return;
        }

        setProjects(projectOptions);

        const nextSelectedProjectUid = projectOptions.some((item) => item.uid === preferredProjectUid)
          ? preferredProjectUid
          : projectOptions.length === 1
            ? projectOptions[0].uid
            : "";
        setSelectedProjectUid(nextSelectedProjectUid);

        if (projectOptions.length === 0) {
          setProjectsError("No projects are available for your account yet.");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setProjects([]);
        setProjectsError(error instanceof Error ? error.message : "Unable to load your projects.");
      } finally {
        if (!cancelled) {
          setIsLoadingProjects(false);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [isOpen, user, normalizedProjectUid, normalizedProjectName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setStatusMessage("Please sign in to save dashboards.");
      onRequireLogin();
      return;
    }
    if (!dashboardName.trim()) {
      setStatusMessage("Please enter a name for the dashboard.");
      return;
    }
    if (!selectedProjectUid.trim()) {
      setStatusMessage("Please choose the project where this dashboard should be saved.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("Preparing layers for upload (this may take a moment)...");

    try {
      // 1. Generate or use existing dashboard ID from URL (?id=...) for modify mode.
      const currentUrl = new URL(window.location.href);
      const existingDashboardId = currentUrl.searchParams.get("id")?.trim();
      const dashboardId = existingDashboardId || Math.random().toString(36).substring(2, 10);
      const resolvedProjectUid = selectedProjectUid.trim();

      // 2. Prepare layers (compresses local files and uploads them)
      // Pass the dashboardId so the backend can organize files
      const persistableLayers = await prepareLayersForSave(
        layers,
        resolvedProjectUid,
        dashboardId,
      );

      setStatusMessage("Saving dashboard metadata...");

      // 3. Save dashboard metadata to the dedicated geoplus endpoint
      const response = await fetch(`${CORE_BACKEND_URL}/api/v1/geoplus/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: dashboardId, // Include the ID
          name: dashboardName,
          project_uid: resolvedProjectUid,
          status: dashboardStatus,
          visibility: dashboardStatus === "published" ? dashboardVisibility : "private",
          layers: persistableLayers,
          settings: settings,
          layout_config: { template: "geoplus" },
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Please sign in to save dashboards.");
        }
        throw new Error(`Failed to save dashboard metadata (HTTP ${response.status}).`);
      }

      const data = await response.json();
      const savedDashboardId = data.dashboard_id || dashboardId;
      void writeCachedDashboard(
        savedDashboardId,
        {
          id: savedDashboardId,
          name: dashboardName,
          project_uid: resolvedProjectUid,
          status: dashboardStatus,
          visibility: dashboardStatus === "published" ? dashboardVisibility : "private",
          layers: persistableLayers,
          settings,
          layout_config: { template: "geoplus" },
          updated_at: typeof data?.data?.updated_at === "string" ? data.data.updated_at : null,
        },
        { role: "editor" },
      );

      setStatusMessage(`Dashboard saved! ID: ${savedDashboardId}`);
      
      // Preserve project context in the URL for follow-up saves and sharing.
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("id", savedDashboardId);
      if (resolvedProjectUid) {
        nextUrl.searchParams.set("project_uid", resolvedProjectUid);
      } else {
        nextUrl.searchParams.delete("project_uid");
      }
      window.history.pushState(null, "", `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`);

      setTimeout(() => {
        onOpenChange(false);
        setStatusMessage(null);
        setDashboardName("");
        setDashboardStatus("draft");
        setDashboardVisibility("private");
      }, 2000);

    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : "An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Dashboard</DialogTitle>
          <DialogDescription>
            Save your current map workspace to the backend. Local datasets will be compressed and uploaded.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="dashboard-name" className="text-sm font-medium">Dashboard Name</label>
            <Input 
              id="dashboard-name"
              placeholder="e.g. Regional Analysis" 
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dashboard-project" className="text-sm font-medium">Project</label>
            <Select
              id="dashboard-project"
              value={selectedProjectUid}
              onChange={(e) => {
                setSelectedProjectUid(e.target.value);
                if (statusMessage?.includes("project")) {
                  setStatusMessage(null);
                }
              }}
              disabled={isSaving || isLoadingProjects || !user || projects.length === 0}
            >
              <option value="">
                {isLoadingProjects ? "Loading projects..." : "Select a project"}
              </option>
              {projects.map((project) => (
                <option key={project.uid} value={project.uid}>
                  {project.name}
                </option>
              ))}
            </Select>
            {projectsError ? (
              <p className="text-sm text-muted-foreground">{projectsError}</p>
            ) : selectedProjectUid ? (
              <p className="text-sm text-muted-foreground">
                This dashboard will be saved to the project already linked in the GeoPlus URL.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="dashboard-status" className="text-sm font-medium">Status</label>
              <Select
                id="dashboard-status"
                value={dashboardStatus}
                onChange={(event) => {
                  const nextStatus = event.target.value as "draft" | "published";
                  setDashboardStatus(nextStatus);
                  if (nextStatus === "draft") {
                    setDashboardVisibility("private");
                  }
                }}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="dashboard-visibility" className="text-sm font-medium">Visibility</label>
              <Select
                id="dashboard-visibility"
                value={dashboardVisibility}
                onChange={(event) => setDashboardVisibility(event.target.value as "private" | "public")}
                disabled={dashboardStatus !== "published"}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </Select>
            </div>
          </div>

          {statusMessage && (
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || isLoadingProjects || !dashboardName.trim() || !selectedProjectUid.trim()}
            >
              {isSaving ? "Saving..." : "Save Dashboard"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
