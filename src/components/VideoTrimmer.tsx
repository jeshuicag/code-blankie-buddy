import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const MAX_VIDEO_SECONDS = 10;

function IconButton({ label, pulse = false, children, ...props }: React.ComponentProps<typeof Button> & { label: string; pulse?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" className={`h-16 w-16 [&_svg]:size-6 ${pulse ? "guide-pulse" : ""}`} aria-label={label} title={label} {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Lets the user pick which 10-second window of a longer video to keep.
export function VideoTrimmer({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (startSeconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);

  const maxStart = Math.max(0, duration - MAX_VIDEO_SECONDS);

  useEffect(() => {
    const video = videoRef.current;
    if (video && duration > 0) video.currentTime = start;
  }, [start, duration]);

  return (
    <div className="flex w-full flex-col items-center gap-4 animate-fade-in">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        className="max-h-64 w-full rounded-md border border-border bg-foreground"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />
      {duration > 0 && (
        <div className="flex w-full items-center gap-3">
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{start.toFixed(1)}s</span>
          <Slider
            value={[start]}
            min={0}
            max={maxStart}
            step={0.1}
            onValueChange={([value]) => setStart(value ?? 0)}
            aria-label="Choose where the 10 seconds start"
            className="flex-1"
          />
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{(start + MAX_VIDEO_SECONDS).toFixed(1)}s</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <IconButton label="Choose another file" variant="outline" onClick={onCancel}><RotateCcw /></IconButton>
        <IconButton label="Keep these 10 seconds" pulse onClick={() => onDone(start)}><Check /></IconButton>
      </div>
    </div>
  );
}
