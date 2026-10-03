import { useEffect, useRef, useState } from "react";

export const MIN_SECONDS = 3; // Instagram Reels minimum
export const MAX_SECONDS = 90; // Instagram Reels maximum

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
