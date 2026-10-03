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

export function VoiceRecorder({
  recording,
  onChange,
}: {
  recording: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [preset, setPreset] = useState<VoicePreset>("normal");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let recordStream: MediaStream = stream;

      const ratio = PRESETS.find((p) => p.id === preset)!.ratio;
      if (ratio !== 1) {
        try {
          const ctx = new AudioContext();
          const workletUrl = URL.createObjectURL(
            new Blob([WORKLET_CODE], { type: "application/javascript" }),
          );
          await ctx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);
          const src = ctx.createMediaStreamSource(stream);
          const shifter = new AudioWorkletNode(ctx, "pitch-shifter");
          shifter.parameters.get("ratio")!.value = ratio;
          const dest = ctx.createMediaStreamDestination();
          src.connect(shifter).connect(dest);
          audioCtxRef.current = ctx;
          recordStream = dest.stream;
        } catch {
          setError("Voice disguise isn't supported here — recording your normal voice.");
        }
      }

      const rec = new MediaRecorder(recordStream);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void audioCtxRef.current?.close();
        audioCtxRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        const secs = (Date.now() - startedAt) / 1000;
        if (secs < MIN_SECONDS) {
          setError(`Recordings must be at least ${MIN_SECONDS} seconds long.`);
          return;
        }
        onChange(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
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

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <p className="text-sm font-medium text-foreground">Voice recording (optional)</p>
      <p className="text-xs text-muted-foreground">
        Add your voice to turn the picture into a Reel. {MIN_SECONDS}–{MAX_SECONDS} seconds.
      </p>

      {!url && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">Voice disguise</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isRecording}
                onClick={() => setPreset(p.id)}
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
      )}

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
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                void start();
              }}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              🔁 Redo
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
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
          className="mt-3 w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          🎙 Record voice
        </button>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
