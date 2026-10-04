import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  ChevronRight,
  Film,
  Image as ImageIcon,
  MapPin,
  Phone,
  Play,
  RotateCcw,
  Send,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildCaption, detectProduce, preloadProduceModel } from "@/lib/produce";
import { PhotoCropper } from "@/components/PhotoCropper";
import { VideoTrimmer, MAX_VIDEO_SECONDS } from "@/components/VideoTrimmer";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { makeReel, makeVideoReel, videoThumbnail } from "@/lib/make-reel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Guided Farm Photo Post" },
      { name: "description", content: "Create and send a farm photo or Reel through a simple visual guide." },
      { property: "og:title", content: "Guided Farm Photo Post" },
      { property: "og:description", content: "Create and send a farm photo or Reel through a simple visual guide." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type UploadResult = { filename: string; size: number; type: string };
type GuideStep = "photo" | "voice" | "location" | "phone" | "send";
const GUIDE_STEPS: GuideStep[] = ["photo", "voice", "location", "phone", "send"];

function ActionButton({ label, pulse = false, children, ...props }: React.ComponentProps<typeof Button> & { label: string; pulse?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" className={`h-20 w-20 [&_svg]:size-7 ${pulse ? "guide-pulse" : ""}`} aria-label={label} title={label} {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function StepPath({ current }: { current: GuideStep }) {
  const currentIndex = GUIDE_STEPS.indexOf(current);
  const icons = [ImageIcon, Play, MapPin, Phone, Send];
  return (
    <div className="mb-8 flex w-full items-center justify-between" aria-label="Posting progress">
      {icons.map((Icon, index) => (
        <div key={index} className="flex flex-1 items-center last:flex-none">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${index < currentIndex ? "border-primary bg-primary text-primary-foreground" : index === currentIndex ? "border-primary text-primary" : "border-border text-muted-foreground/40"}`}>
            {index < currentIndex ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
          </span>
          {index < icons.length - 1 && <span className={`mx-1 h-px flex-1 ${index < currentIndex ? "bg-primary" : "bg-border"}`} />}
        </div>
      ))}
    </div>
  );
}

function Index() {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<GuideStep>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
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
  const [locating, setLocating] = useState(false);
  const [gpsCountdown, setGpsCountdown] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [produce, setProduce] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [caption, setCaption] = useState("");
  const [sourceVideo, setSourceVideo] = useState<File | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);

  useEffect(() => { preloadProduceModel(); void import("@/lib/nearest-city").then((module) => module.preloadCities()); }, []);
  useEffect(() => {
    if (!previewUrl) { setProduce([]); return; }
    let cancelled = false; setDetecting(true);
    detectProduce(previewUrl).then((items) => !cancelled && setProduce(items)).catch(() => !cancelled && setProduce([])).finally(() => !cancelled && setDetecting(false));
    return () => { cancelled = true; };
  }, [previewUrl]);
  useEffect(() => { setCaption(buildCaption(produce, location, phone)); }, [produce, location, phone]);
  useEffect(() => {
    let id = localStorage.getItem("photoUserId");
    if (!id || !/^[a-f0-9]{32}$/.test(id)) { id = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("photoUserId", id); }
    setUserId(id);
  }, []);

  async function pickFile(selected: File | null) {
    if (!selected) return;
    if (selected.type.startsWith("video/")) {
      resetPhoto();
      try {
        const url = URL.createObjectURL(selected);
        const duration = await new Promise<number>((resolve, reject) => {
          const probe = document.createElement("video");
          probe.preload = "metadata"; probe.src = url;
          probe.onloadedmetadata = () => resolve(probe.duration);
          probe.onerror = () => reject(new Error("Couldn't read this video. Try an MP4 or MOV file."));
        });
        setSourceVideo(selected); setSourceVideoUrl(url);
        if (duration > MAX_VIDEO_SECONDS + 0.5) { setTrimming(true); return; }
        setTrimEnd(null);
        const cover = await videoThumbnail(selected);
        setFile(cover); setPreviewUrl(URL.createObjectURL(cover)); setStep("voice");
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Couldn't read this video."); setStatus("error"); }
      return;
    }
    if (previewUrl && previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    const url = URL.createObjectURL(selected); setFile(selected); setOriginalUrl(url); setPreviewUrl(url); setCropping(true); setStatus("idle"); setResult(null); setErrorMessage(null);
  }

  function clearReel() { if (reelUrl) URL.revokeObjectURL(reelUrl); setReelFile(null); setReelUrl(null); }

  async function sendPicture() {
    if (!file || !userId || cropping || status === "uploading") return;
    setStatus("uploading"); setErrorMessage(null);
    try {
      if ((voice || sourceVideo) && !reelFile) {
        setProgress(0); const reel = sourceVideo ? await makeVideoReel(sourceVideo, voice, setProgress, trimStart, trimStart + MAX_VIDEO_SECONDS) : await makeReel(file, voice!, setProgress); setProgress(null); setReelFile(reel); setReelUrl(URL.createObjectURL(reel)); setStatus("idle"); return;
      }
      const formData = new FormData(); formData.append("picture", file); formData.append("userId", userId);
      if (location.trim()) formData.append("location", location.trim()); if (phone.trim()) formData.append("phone", phone.trim()); if (caption.trim()) formData.append("caption", caption.trim()); if (reelFile) formData.append("video", reelFile);
      const response = await fetch("/api/public/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error((await response.text()) || `Upload failed (${response.status})`);
      setResult((await response.json()) as UploadResult); setStatus("success");
    } catch (error) { setProgress(null); if (reelFile) saveVideo(reelFile); setErrorMessage(error instanceof Error ? error.message : "Upload failed"); setStatus("error"); }
  }

  function saveVideo(video: File) {
    const link = document.createElement("a"); const href = URL.createObjectURL(video);
    link.href = href; link.download = `reel-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }

  // Cuts the uploaded video down to the chosen 10 seconds: builds a new video
  // containing only that clip, and uses it for the preview and every later step.
  async function cutVideo(start: number) {
    if (!sourceVideo) return;
    setProgress(0); setErrorMessage(null);
    try {
      const cut = await makeVideoReel(sourceVideo, null, setProgress, start, start + MAX_VIDEO_SECONDS);
      if (sourceVideoUrl) URL.revokeObjectURL(sourceVideoUrl);
      setSourceVideo(cut); setSourceVideoUrl(URL.createObjectURL(cut));
      setTrimStart(0); setTrimEnd(null); setTrimming(false);
      const cover = await videoThumbnail(cut, MAX_VIDEO_SECONDS / 2);
      setFile(cover); setPreviewUrl(URL.createObjectURL(cover)); setStep("voice");
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Couldn't cut this video."); setStatus("error"); }
    finally { setProgress(null); }
  }

  function resetPhoto() {
    if (sourceVideoUrl) URL.revokeObjectURL(sourceVideoUrl); setSourceVideo(null); setSourceVideoUrl(null); setTrimming(false); setTrimStart(0); setTrimEnd(null);
    if (previewUrl && previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl); if (originalUrl) URL.revokeObjectURL(originalUrl); clearReel();
    setFile(null); setPreviewUrl(null); setOriginalUrl(null); setCropping(false); setVoice(null); setStatus("idle"); setResult(null); setErrorMessage(null); setStep("photo");
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  async function useLocation() {
    setLocating(true); setGpsCountdown(45);
    try { const { findNearestCity } = await import("@/lib/nearest-city"); setLocation(await findNearestCity(setGpsCountdown)); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Could not get location"); setStatus("error"); }
    finally { setLocating(false); setGpsCountdown(null); }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center">
          <StepPath current={step} />
          <input ref={libraryInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => void pickFile(event.target.files?.[0] ?? null)} />

          {step === "photo" && !cropping && !trimming && (
            <ActionButton label="Upload a picture or video" pulse onClick={() => libraryInputRef.current?.click()}><Upload /><ImageIcon /></ActionButton>
          )}

          {step === "photo" && trimming && sourceVideoUrl && (
            <div className="flex w-full flex-col items-center gap-3">
              <VideoTrimmer src={sourceVideoUrl} onCancel={resetPhoto} onDone={(start) => void cutVideo(start)} />
              {progress !== null && <progress className="h-2 w-full accent-primary" max={1} value={progress} aria-label="Cutting video" />}
            </div>
          )}

          {step === "photo" && cropping && previewUrl && (
            <PhotoCropper src={originalUrl ?? previewUrl} fileName={file?.name ?? "photo.jpg"} onCancel={resetPhoto} onDone={(cropped) => { if (previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl); setFile(cropped); setPreviewUrl(URL.createObjectURL(cropped)); setCropping(false); setStep("voice"); }} />
          )}

          {step === "voice" && (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              {sourceVideoUrl ? (trimEnd !== null ? (
                <video src={`${sourceVideoUrl}#t=${trimStart.toFixed(1)},${trimEnd.toFixed(1)}`} controls playsInline onTimeUpdate={clampTrimmedPlayback} className="max-h-52 w-full rounded-md border border-border bg-foreground" />
              ) : (
                <video src={sourceVideoUrl} controls playsInline className="max-h-52 w-full rounded-md border border-border bg-foreground" />
              )) : previewUrl && <img src={previewUrl} alt="Selected crop" className="max-h-52 w-full rounded-md border border-border object-contain" />}
              <VoiceRecorder recording={voice} onChange={(nextVoice) => { clearReel(); setVoice(nextVoice); }} onGuideComplete={() => setStep("location")} skipSource={sourceVideo} />
              {!voice && !sourceVideo && <ActionButton label="Continue without voice" variant="ghost" onClick={() => setStep("location")}><ChevronRight /></ActionButton>}
            </div>
          )}

          {step === "location" && (
            <div className="flex w-full items-center gap-3 animate-fade-in">
              <ActionButton label="Use current location" pulse onClick={() => void useLocation()} disabled={locating}><MapPin />{locating && gpsCountdown !== null && <span className="absolute text-[10px] font-bold">{gpsCountdown}</span>}</ActionButton>
              <label className="flex h-14 flex-1 items-center rounded-md border border-input bg-background px-3"><MapPin className="mr-2 h-5 w-5 text-muted-foreground" /><input value={location} onChange={(event) => setLocation(event.target.value.slice(0, 100))} maxLength={100} aria-label="Location" className="min-w-0 flex-1 bg-transparent text-foreground outline-none" /></label>
              <ActionButton label="Continue" variant="outline" onClick={() => setStep("phone")}><ChevronRight /></ActionButton>
            </div>
          )}

          {step === "phone" && (
            <div className="flex w-full flex-col items-center gap-4 animate-fade-in">
              <div className="flex w-full items-center gap-3">
                <label className="guide-pulse flex h-16 flex-1 items-center rounded-md border border-primary bg-background px-4"><Phone className="mr-3 h-6 w-6 text-primary" /><input ref={phoneInputRef} type="tel" inputMode="tel" autoFocus value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 20))} maxLength={20} aria-label="Phone number" className="min-w-0 flex-1 bg-transparent text-foreground outline-none" /></label>
                <ActionButton label="Continue" variant="outline" onClick={() => setStep("send")}><ChevronRight /></ActionButton>
              </div>
              <ActionButton label="Skip phone number" variant="ghost" onClick={() => { setPhone(""); setStep("send"); }}><Phone /><X /></ActionButton>
            </div>
          )}

          {step === "send" && (
            <div className="flex w-full flex-col items-center gap-4 animate-fade-in">
              {reelUrl ? <video src={reelUrl} controls playsInline className="max-h-96 w-full rounded-md border border-border bg-foreground" /> : previewUrl && <img src={previewUrl} alt="Ready to send" className="max-h-72 w-full rounded-md border border-border object-contain" />}
              <textarea value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 2000))} maxLength={2000} rows={3} aria-label="Post caption" className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
              <div className="flex items-center gap-3">
                <ActionButton label="Start over with another picture" variant="outline" onClick={resetPhoto}><RotateCcw /></ActionButton>
                <ActionButton label={(voice || sourceVideo) && !reelFile ? "Create Reel preview" : reelFile ? "Send Reel" : "Send picture"} pulse disabled={!file || !userId || status === "uploading"} onClick={() => void sendPicture()}>
                  {(voice || sourceVideo) && !reelFile ? <Film /> : reelFile ? <Send /> : <Upload />}
                </ActionButton>
              </div>
              {progress !== null && <progress className="h-2 w-full accent-primary" max={1} value={progress} aria-label="Creating Reel" />}
            </div>
          )}

          {detecting && <span className="mt-5 h-2 w-2 animate-ping rounded-full bg-primary" aria-label="Recognizing produce" />}
          {status === "success" && result && <div className="mt-5 flex flex-col items-center gap-3 text-center text-sm text-foreground"><Check className="h-10 w-10 text-primary" /><span>{result.filename}</span></div>}
          {status === "error" && <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">{errorMessage ?? "Something went wrong. Please try again."}</p>}
          {status === "error" && reelFile && <div className="mt-3"><ActionButton label="Save the Reel to your files" variant="outline" onClick={() => saveVideo(reelFile)}><Download /><Film /></ActionButton></div>}
        </div>
      </main>
    </TooltipProvider>
  );
}
