import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Shield, Square, Trash2, UserRound, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const MIN_SECONDS = 3;
export const MAX_SECONDS = 10;

type VoicePreset = "normal" | "deep" | "high";
type GuideStage = "record" | "first-play" | "disguise" | "second-play" | "choose";

const PRESETS: { id: VoicePreset; label: string; ratio: number; icon: typeof UserRound }[] = [
  { id: "normal", label: "Normal voice", ratio: 1, icon: UserRound },
  { id: "deep", label: "Deep disguise", ratio: 0.72, icon: Shield },
  { id: "high", label: "High disguise", ratio: 1.35, icon: Volume2 },
];

const WORKLET_CODE = `
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: "ratio", defaultValue: 1, minValue: 0.5, maxValue: 2 }]; }
  constructor() { super(); this.delay = Math.floor(0.06 * sampleRate); this.size = this.delay * 2; this.buf = new Float32Array(this.size); this.wp = 0; this.phase = 0; }
  readAt(offset) { let idx = this.wp - offset; idx = ((idx % this.size) + this.size) % this.size; const i0 = Math.floor(idx); const i1 = (i0 + 1) % this.size; const f = idx - i0; return this.buf[i0] * (1 - f) + this.buf[i1] * f; }
  process(inputs, outputs, parameters) { const inp = inputs[0] && inputs[0][0]; const out = outputs[0][0]; if (!inp) return true; const ratio = parameters.ratio[0]; for (let i = 0; i < out.length; i++) { this.buf[this.wp] = inp[i]; this.phase += (1 - ratio) / this.delay; this.phase -= Math.floor(this.phase); const p2 = (this.phase + 0.5) % 1; const g1 = Math.sin(Math.PI * this.phase); const g2 = Math.sin(Math.PI * p2); out[i] = g1 * this.readAt(this.phase * this.delay) + g2 * this.readAt(p2 * this.delay); this.wp = (this.wp + 1) % this.size; } return true; }
}
registerProcessor("pitch-shifter", PitchShifter);
`;

let workletUrl: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
  return workletUrl;
}

async function pitchShift(raw: Blob, ratio: number): Promise<Blob> {
  const decodeCtx = new AudioContext();
  const buffer = await decodeCtx.decodeAudioData(await raw.arrayBuffer());
  await decodeCtx.close();
  const offline = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  await offline.audioWorklet.addModule(getWorkletUrl());
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const shifter = new AudioWorkletNode(offline, "pitch-shifter");
  const ratioParameter = shifter.parameters.get("ratio");
  if (ratioParameter) ratioParameter.value = ratio;
  src.connect(shifter).connect(offline.destination);
  src.start();
  return audioBufferToWav(await offline.startRendering());
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const data = buffer.getChannelData(0);
  const bytes = new DataView(new ArrayBuffer(44 + data.length * 2));
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF"); bytes.setUint32(4, 36 + data.length * 2, true); writeStr(8, "WAVE"); writeStr(12, "fmt ");
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, buffer.sampleRate, true); bytes.setUint32(28, buffer.sampleRate * 2, true);
  bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); writeStr(36, "data"); bytes.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) { const s = Math.max(-1, Math.min(1, data[i] ?? 0)); bytes.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([bytes.buffer], { type: "audio/wav" });
}

function IconButton({ label, pulse = false, active = false, children, ...props }: React.ComponentProps<typeof Button> & { label: string; pulse?: boolean; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} title={label} variant={active ? "default" : "outline"} size="icon" className={`h-14 w-14 ${pulse ? "guide-pulse" : ""}`} {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function VoiceRecorder({ recording, onChange, onGuideComplete }: { recording: Blob | null; onChange: (blob: Blob | null) => void; onGuideComplete?: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [preset, setPreset] = useState<VoicePreset>("normal");
  const [guideStage, setGuideStage] = useState<GuideStage>(recording ? "first-play" : "record");
  const rawRef = useRef<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!recording) { setUrl(null); setProgress(0); return; }
    const nextUrl = URL.createObjectURL(recording); setUrl(nextUrl); setProgress(0); setIsPlaying(false);
    return () => URL.revokeObjectURL(nextUrl);
  }, [recording]);
  useEffect(() => () => stop(), []);

  async function applyPreset(raw: Blob, next: VoicePreset) {
    const selected = PRESETS.find((item) => item.id === next);
    if (!selected || selected.ratio === 1) { onChange(raw); return; }
    setIsProcessing(true);
    try { onChange(await pitchShift(raw, selected.ratio)); }
    catch { setError("Voice disguise isn't supported here — keeping your normal voice."); onChange(raw); }
    finally { setIsProcessing(false); }
  }

  function pickPreset(next: VoicePreset) {
    setPreset(next); setError(null);
    if (rawRef.current) void applyPreset(rawRef.current, next);
    if (guideStage === "disguise") setGuideStage("second-play");
    if (guideStage === "choose") onGuideComplete?.();
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream); const chunks: Blob[] = []; const startedAt = Date.now();
      rec.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        if ((Date.now() - startedAt) / 1000 < MIN_SECONDS) { setError(`Recordings must be at least ${MIN_SECONDS} seconds long.`); return; }
        const raw = new Blob(chunks, { type: rec.mimeType || "audio/webm" }); rawRef.current = raw;
        void applyPreset(raw, preset); setGuideStage("first-play");
      };
      recorderRef.current = rec; rec.start(); setSeconds(MAX_SECONDS); setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = Math.max(0, MAX_SECONDS - elapsed);
        setSeconds(remaining);
        if (remaining === 0) stop();
      }, 250);
    } catch { setError("Couldn't use the microphone. Please allow microphone access."); }
  }

  function stop() { const rec = recorderRef.current; if (rec && rec.state !== "inactive") rec.stop(); recorderRef.current = null; }
  function clear() { rawRef.current = null; onChange(null); setGuideStage("record"); setPreset("normal"); }
  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }
  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (audio && audio.duration > 0) setProgress(Math.min(1, audio.currentTime / audio.duration));
  }
  function handleEnded() {
    setIsPlaying(false); setProgress(1);
    if (guideStage === "first-play") setGuideStage("disguise");
    else if (guideStage === "second-play") setGuideStage("choose");
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-col items-center gap-3 py-2">
        <audio ref={audioRef} src={url ?? undefined} className="hidden" />
        {isRecording ? (
          <div className="flex flex-col items-center gap-2">
            <IconButton label={`Stop recording, ${seconds} seconds remaining`} pulse onClick={stop} variant="destructive"><Square /></IconButton>
            <span className="text-2xl font-semibold tabular-nums text-foreground" aria-live="polite" aria-label={`${seconds} seconds remaining`}>
              {seconds}
            </span>
          </div>
        ) : !recording ? (
          <IconButton label="Record voice" pulse={guideStage === "record"} onClick={() => void start()}><Mic /></IconButton>
        ) : (
          <>
            <div className="flex items-center justify-center gap-3">
              <IconButton label="Play recording" pulse={guideStage === "first-play" || guideStage === "second-play"} onClick={play} disabled={isProcessing}><Play /></IconButton>
              <IconButton label="Record again" onClick={() => { clear(); void start(); }}><RotateCcw /></IconButton>
              <IconButton label="Delete recording" onClick={clear}><Trash2 /></IconButton>
            </div>
            <div className="flex items-center justify-center gap-3 animate-fade-in" role="group" aria-label="Voice disguise">
              {PRESETS.map((item) => {
                const PresetIcon = item.icon;
                return <IconButton key={item.id} label={item.label} active={preset === item.id} pulse={guideStage === "disguise" && item.id === "deep"} aria-pressed={preset === item.id} disabled={isProcessing} onClick={() => pickPreset(item.id)}><PresetIcon /></IconButton>;
              })}
            </div>
          </>
        )}
        {isProcessing && <span className="h-2 w-2 animate-ping rounded-full bg-primary" aria-label="Changing voice" />}
        {error && <p className="text-center text-xs text-destructive">{error}</p>}
      </div>
    </TooltipProvider>
  );
}
