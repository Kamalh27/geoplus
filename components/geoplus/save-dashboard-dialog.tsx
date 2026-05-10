"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { prepareLayersForSave, CORE_BACKEND_URL } from "@/lib/geoplus/dashboard-storage";
import type { AppSettings } from "@/components/geoplus/use-app-settings";

type SaveDashboardDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  layers: GeoPlusLayerItem[];
  settings: AppSettings;
  projectUid?: string;
};

export function SaveDashboardDialog({ isOpen, onOpenChange, layers, settings, projectUid = "00000000-0000-0000-0000-000000000000" }: SaveDashboardDialogProps) {
  const [dashboardName, setDashboardName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboardName.trim()) {
      setStatusMessage("Please enter a name for the dashboard.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("Preparing layers for upload (this may take a moment)...");

    try {
      // 1. Generate or use existing dashboard ID
      // If we're modifying, use the existing ID; if saving new, generate a temporary one
      const dashboardId = projectUid !== "00000000-0000-0000-0000-000000000000" 
        ? projectUid 
        : Math.random().toString(36).substring(2, 10);

      // 2. Prepare layers (compresses local files and uploads them)
      // Pass the dashboardId so the backend can organize files
      const persistableLayers = await prepareLayersForSave(layers, projectUid, dashboardId);

      setStatusMessage("Saving dashboard metadata...");

      // 3. Save dashboard metadata to the dedicated geoplus endpoint
      const response = await fetch(`${CORE_BACKEND_URL}/api/v1/geoplus/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: dashboardId, // Include the ID
          name: dashboardName,
          project_uid: projectUid,
          layers: persistableLayers,
          settings: settings,
          layout_config: { template: "geoplus" }
        })
      });

      if (!response.ok) {
        throw new Error("Failed to save dashboard metadata.");
      }

      const data = await response.json();
      const savedDashboardId = data.dashboard_id || dashboardId;

      setStatusMessage(`Dashboard saved! ID: ${savedDashboardId}`);
      
      // Update the browser URL so the user can easily copy and share it
      window.history.pushState(null, '', `?id=${savedDashboardId}`);

      setTimeout(() => {
        onOpenChange(false);
        setStatusMessage(null);
        setDashboardName("");
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

          {statusMessage && (
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !dashboardName.trim()}>
              {isSaving ? "Saving..." : "Save Dashboard"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
