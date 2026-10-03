import { useEffect, useRef, useState } from "react";

export const MIN_SECONDS = 3; // Instagram Reels minimum
export const MAX_SECONDS = 90; // Instagram Reels maximum

type VoicePreset = "normal" | "deep" | "high";

const PRESETS: { id: VoicePreset; label: string; ratio: number }[] = [
  { id: "normal", label: "🎙 Normal", ratio: 1 },
  { id: "deep", label: "🕵️ Deep", ratio: 0.72 },
  { id: "high", label: "🐿 High", ratio: 1.35 },
];

// Tiny pitch shifter (two crossfaded modulated delay taps) running in an
// AudioWorklet, entirely on the device. Loaded from a Blob — no library.
const WORKLET_CODE = `
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "ratio", defaultValue: 1, minValue: 0.5, maxValue: 2 }];
  }
  constructor() {
    super();
    this.delay = Math.floor(0.06 * sampleRate);
    this.size = this.delay * 2;
    this.buf = new Float32Array(this.size);
    this.wp = 0;
    this.phase = 0;
  }
  readAt(offset) {
    let idx = this.wp - offset;
    idx = ((idx % this.size) + this.size) % this.size;
    const i0 = Math.floor(idx);
    const i1 = (i0 + 1) % this.size;
    const f = idx - i0;
    return this.buf[i0] * (1 - f) + this.buf[i1] * f;
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0][0];
    if (!inp) return true;
    const ratio = this.parameters.get("ratio").value ?? this.parameters.get("ratio")[0];
    for (let i = 0; i < out.length; i++) {
      this.buf[this.wp] = inp[i];
      this.phase += (1 - ratio) / this.delay;
      this.phase -= Math.floor(this.phase);
      const p2 = (this.phase + 0.5) % 1;
      const g1 = Math.sin(Math.PI * this.phase);
      const g2 = Math.sin(Math.PI * p2);
      out[i] = g1 * this.readAt(this.phase * this.delay) + g2 * this.readAt(p2 * this.delay);
      this.wp = (this.wp + 1) % this.size;
    }
    return true;
  }
}
registerProcessor("pitch-shifter", PitchShifter);
`;

let workletUrl: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
  }
  return workletUrl;
}

// Renders `raw` through the pitch shifter offline and returns a WAV blob.
async function pitchShift(raw: Blob, ratio: number): Promise<Blob> {
  const decodeCtx = new AudioContext();
  const buffer = await decodeCtx.decodeAudioData(await raw.arrayBuffer());
  await decodeCtx.close();

  const offline = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  await offline.audioWorklet.addModule(getWorkletUrl());
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const shifter = new AudioWorkletNode(offline, "pitch-shifter");
  shifter.parameters.get("ratio")!.value = ratio;
  src.connect(shifter).connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return audioBufferToWav(rendered);
}

// Minimal 16-bit PCM WAV encoder.
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const data = buffer.getChannelData(0);
  const bytes = new DataView(new ArrayBuffer(44 + data.length * 2));
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  bytes.setUint32(4, 36 + data.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true); // PCM
  bytes.setUint16(22, 1, true); // mono
  bytes.setUint32(24, buffer.sampleRate, true);
  bytes.setUint32(28, buffer.sampleRate * 2, true);
  bytes.setUint16(32, 2, true);
  bytes.setUint16(34, 16, true);
  writeStr(36, "data");
  bytes.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i] ?? 0));
    bytes.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([bytes.buffer], { type: "audio/wav" });
}

export function VoiceRecorder({
  recording,
  onChange,
}: {
  recording: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [preset, setPreset] = useState<VoicePreset>("normal");
  const rawRef = useRef<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!recording) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(recording);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [recording]);

  useEffect(() => () => stop(), []);

  // Re-process the kept raw recording whenever the preset changes.
  async function applyPreset(raw: Blob, next: VoicePreset) {
    const ratio = PRESETS.find((p) => p.id === next)!.ratio;
    if (ratio === 1) {
      onChange(raw);
      return;
    }
    setIsProcessing(true);
    try {
      onChange(await pitchShift(raw, ratio));
    } catch {
      setError("Voice disguise isn't supported here — keeping your normal voice.");
      onChange(raw);
    } finally {
      setIsProcessing(false);
    }
  }

  function pickPreset(next: VoicePreset) {
    setPreset(next);
    setError(null);
    if (rawRef.current) void applyPreset(rawRef.current, next);
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        const secs = (Date.now() - startedAt) / 1000;
        if (secs < MIN_SECONDS) {
          setError(`Recordings must be at least ${MIN_SECONDS} seconds long.`);
          return;
        }
        const raw = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        rawRef.current = raw;
        void applyPreset(raw, preset);
      };
      recorderRef.current = rec;
      rec.start();
      setSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      setError("Couldn't use the microphone. Please allow microphone access.");
    }
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
  }

  function clear() {
    rawRef.current = null;
    onChange(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <p className="text-sm font-medium text-foreground">Voice recording (optional)</p>
      <p className="text-xs text-muted-foreground">
        Add your voice to turn the picture into a Reel. {MIN_SECONDS}–{MAX_SECONDS} seconds.
      </p>

      <div className="mt-3">
        <p className="text-xs font-medium text-muted-foreground">Voice disguise</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={isRecording || isProcessing}
              onClick={() => pickPreset(p.id)}
              className={`rounded-md border px-2 py-2 text-xs font-medium ${
                preset === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-foreground hover:bg-accent"
              } disabled:opacity-50`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isRecording ? (
        <button
          type="button"
          onClick={stop}
          className="mt-3 w-full rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
        >
          ⏹ Stop recording ({seconds}s)
        </button>
      ) : url ? (
        <div className="mt-3">
          <audio src={url} controls className="w-full" />
          {isProcessing && (
            <p className="mt-1 text-xs text-muted-foreground">Changing voice…</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                clear();
                void start();
              }}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              🔁 Redo
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-destructive hover:bg-accent"
            >
              🗑 Delete
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={isProcessing}
          className="mt-3 w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          🎙 Record voice
        </button>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
