import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import smartcrop from "smartcrop";

// Instagram feed aspect ratios (all within the allowed 4:5 – 1.91:1 range).
const RATIOS = [
  { label: "Square 1:1", value: 1 },
  { label: "Portrait 4:5", value: 4 / 5 },
  { label: "Landscape 1.91:1", value: 1.91 },
];
const MAX_WIDTH = 1080; // Instagram's recommended max width

async function cropToFile(src: string, area: Area, name: string): Promise<File> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_WIDTH / area.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), "image/jpeg", 0.92),
  );
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}-cropped.jpg`, { type: "image/jpeg" });
}

export function PhotoCropper({
  src,
  fileName,
  onDone,
  onCancel,
}: {
  src: string;
  fileName: string;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Suggest an aesthetic starting crop: find the most interesting region of
  // the photo (faces, detail, color) on the device and center the box on it.
  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el) return;
    const img = new Image();
    img.src = src;
    img
      .decode()
      .then(() => smartcrop.crop(img, { width: Math.round(100 * aspect), height: 100, minScale: 1 }))
      .then((result) => {
        if (cancelled) return;
        const r = result.topCrop;
        const cw = el.clientWidth;
        const ch = el.clientHeight;
        const fit = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
        const nextZoom = Math.min(
          3,
          Math.max(1, Math.min(cw / (r.width * fit), ch / (r.height * fit))),
        );
        const dispW = img.naturalWidth * fit * nextZoom;
        const dispH = img.naturalHeight * fit * nextZoom;
        const regionCenterX = (r.x + r.width / 2) * fit * nextZoom;
        const regionCenterY = (r.y + r.height / 2) * fit * nextZoom;
        setZoom(nextZoom);
        setCrop({ x: dispW / 2 - regionCenterX, y: dispH / 2 - regionCenterY });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, aspect]);

  async function apply() {
    if (!area) return;
    setBusy(true);
    try {
      onDone(await cropToFile(src, area, fileName));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div ref={containerRef} className="relative h-72 overflow-hidden rounded-xl border border-border bg-muted">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, px) => setArea(px)}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {RATIOS.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setAspect(r.value)}
            className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              aspect === r.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:bg-accent"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        Zoom
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!area || busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Cropping…" : "Apply crop"}
        </button>
      </div>
    </div>
  );
}
