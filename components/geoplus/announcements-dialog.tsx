"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const guideAnnouncements: {
  date: string;
  title: string;
  description: string;
}[] = [
  {
    date: "May 2, 2026",
    title: "Guided Tour Expanded",
    description: "The interactive guided tour now covers all map controls and includes precise element highlighting.",
  },
  {
    date: "April 29, 2026",
    title: "Bot-Free Bug Reporting",
    description: "Enhanced bug reporting with Cloudflare Turnstile bot protection and anonymous submission options.",
  },
  {
    date: "April 28, 2026",
    title: "Header Actions Redesign",
    description: "Consolidated workspace actions into a unified header grouping for quick access to tour, preview, bug reporting, announcements, and documentation.",
  },
  {
    date: "April 24, 2026",
    title: "Layer Pipeline Update",
    description: "Improved vector ingestion and style defaults for uploaded geospatial layers.",
  },
];

type AnnouncementsDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function AnnouncementsDialog({ isOpen, onOpenChange }: AnnouncementsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Announcements</DialogTitle>
          <DialogDescription>
            Stay up-to-date with the latest features, improvements, and fixes in GeoPlus.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1 py-2">
          {guideAnnouncements.map((announcement, index) => (
            <div key={index} className="space-y-1 border-l-2 border-accent pl-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{announcement.date}</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{announcement.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{announcement.description}</p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
