import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Image from "next/image";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MediaViewerData = {
  src: string;
  type: "image" | "video";
  title?: string;
};

type MediaViewerDialogProps = {
  data: MediaViewerData | null;
  onClose: () => void;
};

export function MediaViewerDialog({ data, onClose }: MediaViewerDialogProps) {
  if (!data) return null;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = data.src;
    a.download = data.title || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[90vw] w-[auto] max-h-[90vh] p-0 overflow-hidden bg-black/95 border-border/20 flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
          <DialogTitle className="text-white text-sm font-medium drop-shadow-md">
            {data.title || "Media Viewer"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={handleDownload}
              title="Download"
            >
              <Download className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={onClose}
              title="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        
        <DialogDescription className="sr-only">View full size media</DialogDescription>

        <div className="relative flex-1 flex items-center justify-center min-h-[300px] w-full bg-black/50">
          {data.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={data.src} 
              alt={data.title || "Media"} 
              className="max-h-[85vh] max-w-full object-contain"
            />
          ) : (
            <video 
              src={data.src} 
              controls 
              autoPlay 
              className="max-h-[85vh] max-w-full object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}