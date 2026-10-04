import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import smartcrop from "smartcrop";
import { Check, RectangleHorizontal, RectangleVertical, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const RATIOS = [
  { label: "Square crop", value: 1, icon: Square },
  { label: "Portrait crop", value: 4 / 5, icon: RectangleVertical },
  { label: "Landscape crop", value: 1.91, icon: RectangleHorizontal },
];
const MAX_WIDTH = 1080;

async function cropToFile(src: string, area: Area, name: string): Promise<File> {
  const img = new Image(); img.src = src; await img.decode();
  const scale = Math.min(1, MAX_WIDTH / area.width);
  const canvas = document.createElement("canvas"); canvas.width = Math.round(area.width * scale); canvas.height = Math.round(area.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Crop failed");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Crop failed")), "image/jpeg", 0.92));
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}-cropped.jpg`, { type: "image/jpeg" });
}

export function PhotoCropper({ src, fileName, onDone, onCancel }: { src: string; fileName: string; onDone: (file: File) => void; onCancel: () => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 }); const [zoom, setZoom] = useState(1); const [aspect, setAspect] = useState(1);
  const [area, setArea] = useState<Area | null>(null); const [busy, setBusy] = useState(false); const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false; const element = containerRef.current; if (!element) return;
    const img = new Image(); img.src = src;
    img.decode().then(() => smartcrop.crop(img, { width: Math.round(100 * aspect), height: 100, minScale: 1 })).then((result) => {
      if (cancelled) return; const region = result.topCrop; const fit = Math.min(element.clientWidth / img.naturalWidth, element.clientHeight / img.naturalHeight);
      const nextZoom = Math.min(3, Math.max(1, Math.min(element.clientWidth / (region.width * fit), element.clientHeight / (region.height * fit))));
      const displayWidth = img.naturalWidth * fit * nextZoom; const displayHeight = img.naturalHeight * fit * nextZoom;
      setZoom(nextZoom); setCrop({ x: displayWidth / 2 - (region.x + region.width / 2) * fit * nextZoom, y: displayHeight / 2 - (region.y + region.height / 2) * fit * nextZoom });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [src, aspect]);

  async function apply() { if (!area) return; setBusy(true); try { onDone(await cropToFile(src, area, fileName)); } finally { setBusy(false); } }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="w-full animate-fade-in space-y-4">
        <div ref={containerRef} className="relative h-80 overflow-hidden rounded-md border border-border bg-muted">
          <Cropper image={src} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
        </div>
        <div className="flex items-center justify-center gap-3">
          {RATIOS.map((ratio) => { const RatioIcon = ratio.icon; return (
            <Tooltip key={ratio.label}><TooltipTrigger asChild><Button type="button" size="icon" variant={aspect === ratio.value ? "default" : "outline"} aria-label={ratio.label} title={ratio.label} onClick={() => setAspect(ratio.value)}><RatioIcon /></Button></TooltipTrigger><TooltipContent>{ratio.label}</TooltipContent></Tooltip>
          ); })}
        </div>
        <Slider aria-label="Crop zoom" min={1} max={3} step={0.01} value={[zoom]} onValueChange={(value) => setZoom(value[0] ?? 1)} />
        <div className="flex items-center justify-center gap-3">
          <Button type="button" size="icon" variant="outline" aria-label="Choose another picture" title="Choose another picture" onClick={onCancel}><RotateCcw /></Button>
          <Button type="button" size="icon" className="h-14 w-14 guide-pulse" aria-label="Use this crop" title="Use this crop" disabled={!area || busy} onClick={() => void apply()}><Check /></Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
