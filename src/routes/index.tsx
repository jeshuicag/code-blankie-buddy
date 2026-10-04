import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { makeReel } from "@/lib/make-reel";

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
  const keyFileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [reelFile, setReelFile] = useState<File | null>(null);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");

  // Give each device a permanent random ID the first time the app opens.
  useEffect(() => {
    let id = localStorage.getItem("photoUserId");
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem("photoUserId", id);
    }
    setUserId(id);
  }, []);

  // Download a small key file containing the user's ID so they can
  // restore it later (e.g. after clearing browser data or switching phones).
  async function saveKeyFile() {
    if (!userId) return;
    const contents = `Photo Upload key file\nKeep this file safe. It restores your personal Instagram hashtag.\n\n${userId}\n`;
    const filename = `photo-key-${userId.slice(0, 8)}.txt`;
    const file = new File([contents], filename, { type: "text/plain" });

    // On phones, the share sheet is the reliable way to save a file.
    const isPhone = window.matchMedia("(pointer: coarse)").matches;
    if (isPhone && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Photo Upload key" });
        return;
      } catch {
        // User cancelled or share failed — fall through to download.
      }
    }

    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // Restore the ID from a previously saved key file.
  async function restoreKeyFile(selected: File | null) {
    if (!selected) return;
    const text = await selected.text();
    const match = text.match(/[a-f0-9]{32}/);
    if (!match) {
      setErrorMessage("That file doesn't contain a valid key.");
      setStatus("error");
      return;
    }
    localStorage.setItem("photoUserId", match[0]);
    setUserId(match[0]);
    setStatus("idle");
    setErrorMessage(null);
  }

  function pickFile(selected: File | null) {
    if (!selected) return;
    if (previewUrl && previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    const url = URL.createObjectURL(selected);
    setFile(selected);
    setOriginalUrl(url);
    setPreviewUrl(url);
    setCropping(true);
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
  }

  function clearReel() {
    if (reelUrl) URL.revokeObjectURL(reelUrl);
    setReelFile(null);
    setReelUrl(null);
  }

  async function sendPicture() {
    if (!file || !userId || cropping || status === "uploading") return;
    setStatus("uploading");
    setErrorMessage(null);
    try {
      // With a voice recording, build the Reel first and let the user
      // preview it before anything is sent.
      if (voice && !reelFile) {
        setProgress(0);
        const reel = await makeReel(file, voice, setProgress);
        setProgress(null);
        setReelFile(reel);
        setReelUrl(URL.createObjectURL(reel));
        setStatus("idle");
        return;
      }
      const formData = new FormData();
      formData.append("picture", file);
      formData.append("userId", userId);
      if (location.trim()) formData.append("location", location.trim());
      if (phone.trim()) formData.append("phone", phone.trim());
      if (reelFile) {
        formData.append("video", reelFile);
      }
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
      setProgress(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed",
      );
      setStatus("error");
    }
  }

  function reset() {
    if (previewUrl && previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    clearReel();
    setFile(null);
    setPreviewUrl(null);
    setOriginalUrl(null);
    setCropping(false);
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

        {userId && (
          <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <p className="break-all">
              Your ID: <span className="font-mono text-foreground">{userId}</span>
              <br />
              Your Instagram tag: <span className="font-mono text-foreground">#pu{userId}</span>
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={saveKeyFile}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Save key file
              </button>
              <button
                type="button"
                onClick={() => keyFileInputRef.current?.click()}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Restore key
              </button>
            </div>
            <input
              ref={keyFileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                void restoreKeyFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        )}

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

        {previewUrl && cropping ? (
          <PhotoCropper
            src={originalUrl ?? previewUrl}
            fileName={file?.name ?? "photo.jpg"}
            onCancel={reset}
            onDone={(cropped) => {
              if (previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl);
              setFile(cropped);
              setPreviewUrl(URL.createObjectURL(cropped));
              setCropping(false);
            }}
          />
        ) : previewUrl ? (
          <div className="mt-5">
            <div className="overflow-hidden rounded-xl border border-border">
              <img
                src={previewUrl}
                alt="Cropped picture preview"
                className="max-h-72 w-full object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setCropping(true)}
              className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Adjust crop
            </button>
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

        <VoiceRecorder
          recording={voice}
          onChange={(v) => {
            clearReel();
            setVoice(v);
          }}
        />

        {reelUrl && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-foreground">
              Your Reel — watch it before sending
            </p>
            <video
              src={reelUrl}
              controls
              playsInline
              className="max-h-96 w-full rounded-xl border border-border bg-black"
            />
            <button
              type="button"
              onClick={clearReel}
              className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Discard Reel
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={sendPicture}
          disabled={!file || !userId || cropping || status === "uploading"}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {progress !== null
            ? `Making Reel… ${Math.round(progress * 100)}%`
            : status === "uploading"
              ? "Sending…"
              : reelFile
                ? "Send Reel"
                : voice
                  ? "Preview Reel"
                  : "Send to server"}
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
