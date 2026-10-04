import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
// The timeline shows the chosen clip bright and everything outside it greyed out.
export function VideoTrimmer({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (startSeconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);

  const maxStart = Math.max(0, duration - MAX_VIDEO_SECONDS);
  const clamped = Math.min(start, maxStart);

  useEffect(() => {
    const video = videoRef.current;
    if (video && duration > 0) video.currentTime = clamped;
  }, [clamped, duration]);

  function valueFromPointer(clientX: number) {
    const track = trackRef.current;
    if (!track || maxStart <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * maxStart * 10) / 10;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 1 : 0.1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); setStart((value) => Math.max(0, Math.round((value - step) * 10) / 10)); }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); setStart((value) => Math.min(maxStart, Math.round((value + step) * 10) / 10)); }
    if (event.key === "Home") { event.preventDefault(); setStart(0); }
    if (event.key === "End") { event.preventDefault(); setStart(maxStart); }
  }

  const windowStart = maxStart > 0 ? (clamped / duration) * 100 : 0;
  const windowWidth = duration > 0 ? Math.min(100, (MAX_VIDEO_SECONDS / duration) * 100) : 100;

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
        <div className="flex w-full flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">0s</span>
            <div
              ref={trackRef}
              role="slider"
              tabIndex={0}
              aria-label="Choose where the 10 seconds start"
              aria-valuemin={0}
              aria-valuemax={Math.round(maxStart * 10) / 10}
              aria-valuenow={Math.round(clamped * 10) / 10}
              onKeyDown={onKeyDown}
              onPointerDown={(event) => { draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); setStart(valueFromPointer(event.clientX)); }}
              onPointerMove={(event) => { if (draggingRef.current) setStart(valueFromPointer(event.clientX)); }}
              onPointerUp={() => { draggingRef.current = false; }}
              onPointerCancel={() => { draggingRef.current = false; }}
              className="relative flex h-10 flex-1 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted-foreground/40">
                <div className="absolute inset-y-0 bg-primary" style={{ left: `${windowStart}%`, width: `${windowWidth}%` }} />
              </div>
              <div
                className="pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-md"
                style={{ left: `${windowStart}%` }}
              />
            </div>
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{duration.toFixed(0)}s</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-10" />
            <span className="flex-1 text-center text-xs tabular-nums text-foreground">
              {clamped.toFixed(1)}s – {(clamped + MAX_VIDEO_SECONDS).toFixed(1)}s
            </span>
            <span className="w-10" />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <IconButton label="Choose another file" variant="outline" onClick={onCancel}><RotateCcw /></IconButton>
        <IconButton label="Keep these 10 seconds" pulse onClick={() => onDone(clamped)}><Check /></IconButton>
      </div>
    </div>
  );
}
