"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DRAFT_USER_MANUAL_MARKDOWN } from "@/lib/geoplus/docs";

type UserManualDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onOpenGuidedTour: () => void;
};

export function UserManualDialog({ isOpen, onOpenChange, onOpenGuidedTour }: UserManualDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>User Manual & Documentation</DialogTitle>
          <DialogDescription>
            Learn how to use GeoPlus effectively. For detailed API documentation and advanced workflows, please visit the full documentation site.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border/70 bg-muted/20 px-4 py-3">
          <article className="prose prose-sm dark:prose-invert prose-headings:font-semibold prose-a:text-accent hover:prose-a:text-accent/80 prose-code:rounded prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none max-w-none">
            {/* Extremely simple Markdown renderer for the demo. In production, use a library like react-markdown. */}
            <div dangerouslySetInnerHTML={{ __html: DRAFT_USER_MANUAL_MARKDOWN.replace(/\n/g, "<br />") }} />
          </article>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" asChild>
              <a href="/geoplus/docs" target="_blank" rel="noreferrer">
                Open /geoplus/docs
              </a>
            </Button>
            <Button onClick={() => {
              onOpenChange(false);
              onOpenGuidedTour();
            }}>
              Open Guided Tour
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
