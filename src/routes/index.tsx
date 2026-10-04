import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  MapPin,
  Phone,
  Play,
  RotateCcw,
  Send,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildCaption, detectProduce, preloadProduceModel } from "@/lib/produce";
import { PhotoCropper } from "@/components/PhotoCropper";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { makeReel } from "@/lib/make-reel";

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
type GuideStep = "save-key" | "restore-key" | "photo" | "voice" | "location" | "phone" | "send";
const GUIDE_STEPS: GuideStep[] = ["save-key", "restore-key", "photo", "voice", "location", "phone", "send"];

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
  const icons = [KeyRound, Upload, ImageIcon, Play, MapPin, Phone, Send];
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
  const keyFileInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<GuideStep>("save-key");
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
  const [confirmingKeySave, setConfirmingKeySave] = useState(false);

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

  async function saveKeyFile() {
    if (!userId) return;
    if (localStorage.getItem("photoKeySaved") === userId) { setConfirmingKeySave(true); return; }
    await performKeySave();
  }

  async function performKeySave() {
    if (!userId) return;
    setConfirmingKeySave(false);
    const contents = `Photo Upload key file\nKeep this file safe. It restores your personal Instagram hashtag.\n\n${userId}\n`;
    const keyFile = new File([contents], "🔑.txt", { type: "text/plain" });
    const isPhone = window.matchMedia("(pointer: coarse)").matches;
    if (isPhone && navigator.canShare?.({ files: [keyFile] })) {
      try { await navigator.share({ files: [keyFile], title: "🔑" }); localStorage.setItem("photoKeySaved", userId); setStep("restore-key"); return; }
      catch { return; }
    }
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "🔑.txt"; anchor.rel = "noopener"; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    localStorage.setItem("photoKeySaved", userId); setStep("restore-key");
  }

  async function restoreKeyFile(selected: File | null) {
    if (!selected) return;
    const text = await selected.text(); const match = text.match(/[a-f0-9]{32}/);
    if (!match) { setErrorMessage("That file doesn't contain a valid key."); setStatus("error"); return; }
    localStorage.setItem("photoUserId", match[0]); localStorage.setItem("photoKeySaved", match[0]); setUserId(match[0]);
    setStatus("idle"); setErrorMessage(null); setStep("photo");
  }

  function pickFile(selected: File | null) {
    if (!selected) return;
    if (previewUrl && previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    const url = URL.createObjectURL(selected); setFile(selected); setOriginalUrl(url); setPreviewUrl(url); setCropping(true); setStatus("idle"); setResult(null); setErrorMessage(null);
  }

  function clearReel() { if (reelUrl) URL.revokeObjectURL(reelUrl); setReelFile(null); setReelUrl(null); }

  async function sendPicture() {
    if (!file || !userId || cropping || status === "uploading") return;
    setStatus("uploading"); setErrorMessage(null);
    try {
      if (voice && !reelFile) {
        setProgress(0); const reel = await makeReel(file, voice, setProgress); setProgress(null); setReelFile(reel); setReelUrl(URL.createObjectURL(reel)); setStatus("idle"); return;
      }
      const formData = new FormData(); formData.append("picture", file); formData.append("userId", userId);
      if (location.trim()) formData.append("location", location.trim()); if (phone.trim()) formData.append("phone", phone.trim()); if (caption.trim()) formData.append("caption", caption.trim()); if (reelFile) formData.append("video", reelFile);
      const response = await fetch("/api/public/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error((await response.text()) || `Upload failed (${response.status})`);
      setResult((await response.json()) as UploadResult); setStatus("success");
    } catch (error) { setProgress(null); setErrorMessage(error instanceof Error ? error.message : "Upload failed"); setStatus("error"); }
  }

  function resetPhoto() {
    if (previewUrl && previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl); if (originalUrl) URL.revokeObjectURL(originalUrl); clearReel();
    setFile(null); setPreviewUrl(null); setOriginalUrl(null); setCropping(false); setVoice(null); setStatus("idle"); setResult(null); setErrorMessage(null); setStep("photo");
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  async function useLocation() {
    setLocating(true); setGpsCountdown(45);
    try { const { findNearestCity } = await import("@/lib/nearest-city"); setLocation(await findNearestCity(setGpsCountdown)); setStep("phone"); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Could not get location"); setStatus("error"); }
    finally { setLocating(false); setGpsCountdown(null); }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center">
          <StepPath current={step} />
          <input ref={keyFileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(event) => { void restoreKeyFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <input ref={libraryInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />

          {step === "save-key" && userId && (
            <div className="flex flex-col items-center gap-5 animate-fade-in">
              <ActionButton label="Download key file" pulse onClick={() => void saveKeyFile()}><Download /><KeyRound /></ActionButton>
              {confirmingKeySave && (
                <div className="flex gap-3">
                  <ActionButton label="Download another copy" pulse onClick={() => void performKeySave()}><Download /><KeyRound /></ActionButton>
                  <ActionButton label="Cancel" variant="outline" onClick={() => setConfirmingKeySave(false)}><RotateCcw /></ActionButton>
                </div>
              )}
            </div>
          )}

          {step === "restore-key" && (
            <ActionButton label="Find and upload your saved key file" pulse onClick={() => keyFileInputRef.current?.click()}><Upload /><KeyRound /></ActionButton>
          )}

          {step === "photo" && !cropping && (
            <ActionButton label="Upload a picture" pulse onClick={() => libraryInputRef.current?.click()}><Upload /><ImageIcon /></ActionButton>
          )}

          {step === "photo" && cropping && previewUrl && (
            <PhotoCropper src={originalUrl ?? previewUrl} fileName={file?.name ?? "photo.jpg"} onCancel={resetPhoto} onDone={(cropped) => { if (previewUrl !== originalUrl) URL.revokeObjectURL(previewUrl); setFile(cropped); setPreviewUrl(URL.createObjectURL(cropped)); setCropping(false); setStep("voice"); }} />
          )}

          {step === "voice" && (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              {previewUrl && <img src={previewUrl} alt="Selected crop" className="max-h-52 w-full rounded-md border border-border object-contain" />}
              <VoiceRecorder recording={voice} onChange={(nextVoice) => { clearReel(); setVoice(nextVoice); }} onGuideComplete={() => setStep("location")} />
              {!voice && <ActionButton label="Continue without voice" variant="ghost" onClick={() => setStep("location")}><ChevronRight /></ActionButton>}
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
            <div className="flex w-full items-center gap-3 animate-fade-in">
              <label className="guide-pulse flex h-16 flex-1 items-center rounded-md border border-primary bg-background px-4"><Phone className="mr-3 h-6 w-6 text-primary" /><input ref={phoneInputRef} type="tel" inputMode="tel" autoFocus value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 20))} maxLength={20} aria-label="Phone number" className="min-w-0 flex-1 bg-transparent text-foreground outline-none" /></label>
              <ActionButton label="Continue" variant="outline" onClick={() => setStep("send")}><ChevronRight /></ActionButton>
            </div>
          )}

          {step === "send" && (
            <div className="flex w-full flex-col items-center gap-4 animate-fade-in">
              {reelUrl ? <video src={reelUrl} controls playsInline className="max-h-96 w-full rounded-md border border-border bg-foreground" /> : previewUrl && <img src={previewUrl} alt="Ready to send" className="max-h-72 w-full rounded-md border border-border object-contain" />}
              <div className="flex items-center gap-3">
                <ActionButton label="Start over with another picture" variant="outline" onClick={resetPhoto}><RotateCcw /></ActionButton>
                <ActionButton label={voice && !reelFile ? "Create Reel preview" : reelFile ? "Send Reel" : "Send picture"} pulse disabled={!file || !userId || status === "uploading"} onClick={() => void sendPicture()}>
                  {voice && !reelFile ? <Film /> : reelFile ? <Send /> : <Upload />}
                </ActionButton>
              </div>
              {progress !== null && <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
            </div>
          )}

          {detecting && <span className="mt-5 h-2 w-2 animate-ping rounded-full bg-primary" aria-label="Recognizing produce" />}
          {status === "success" && result && <div className="mt-5 flex flex-col items-center gap-3 text-center text-sm text-foreground"><Check className="h-10 w-10 text-primary" /><span>{result.filename}</span></div>}
          {status === "error" && <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">{errorMessage ?? "Something went wrong. Please try again."}</p>}
        </div>
      </main>
    </TooltipProvider>
  );
}
