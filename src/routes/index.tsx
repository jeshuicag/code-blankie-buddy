import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Photo Upload — Snap or pick a picture" },
      {
        name: "description",
        content:
          "Take a photo with your camera or upload a picture from your device and send it to the server.",
      },
      { property: "og:title", content: "Photo Upload — Snap or pick a picture" },
      {
        property: "og:description",
        content:
          "Take a photo with your camera or upload a picture from your device and send it to the server.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type UploadResult = {
  filename: string;
  size: number;
  type: string;
};

function Index() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function pickFile(selected: File | null) {
    if (!selected) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
  }

  async function sendPicture() {
    if (!file || status === "uploading") return;
    setStatus("uploading");
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("picture", file);
      const response = await fetch("/api/public/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Upload failed (${response.status})`);
      }
      setResult((await response.json()) as UploadResult);
      setStatus("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed",
      );
      setStatus("error");
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-card-foreground">
          Send a picture
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Take a photo with your camera or choose one from your device, then
          send it to the server.
        </p>

        {/* Hidden file inputs — camera capture and library picker */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

        {previewUrl ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <img
              src={previewUrl}
              alt="Selected picture preview"
              className="max-h-72 w-full object-cover"
            />
          </div>
        ) : (
          <div className="mt-5 flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground">
            No picture selected yet
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            📷 Take photo
          </button>
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            🖼️ Upload picture
          </button>
        </div>

        <button
          type="button"
          onClick={sendPicture}
          disabled={!file || status === "uploading"}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "uploading" ? "Sending…" : "Send to server"}
        </button>

        {status === "success" && result && (
          <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
            <p className="font-medium">✅ Server received your picture</p>
            <p className="mt-1 text-muted-foreground">
              {result.filename} · {(result.size / 1024).toFixed(1)} KB ·{" "}
              {result.type}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Send another
            </button>
          </div>
        )}

        {status === "error" && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage ?? "Something went wrong. Please try again."}
          </p>
        )}
      </div>
    </div>
  );
}
