// Builds an MP4 Reel (9:16) in the browser from a still picture plus a voice recording.
// Uses MediaRecorder's MP4 output (Safari, Chrome/Edge 126+). Runs in real time.

const W = 720;
const H = 1280;
// Reels are never longer than this, whatever the source material.
export const MAX_REEL_SECONDS = 10;

function pickMime(): string | null {
  const options = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
  ];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function canMakeReel(): boolean {
  return typeof MediaRecorder !== "undefined" && pickMime() !== null;
}

// MediaRecorder writes "streaming" MP4s with no total length, so players show them
// as live broadcasts with a huge/unknown duration. Re-package (no re-encode) into a
// normal MP4 that records its real length.
async function hasRealLength(file: Blob): Promise<boolean> {
  const el = document.createElement("video");
  el.preload = "metadata"; el.muted = true;
  const url = URL.createObjectURL(file); el.src = url;
  try {
    const d = await new Promise<number>((resolve) => { el.onloadedmetadata = () => resolve(el.duration); el.onerror = () => resolve(NaN); setTimeout(() => resolve(NaN), 5000); });
    return Number.isFinite(d) && d > 0 && d <= MAX_REEL_SECONDS + 1;
  } finally { URL.revokeObjectURL(url); }
}

async function finalizeMp4(blob: Blob): Promise<File> {
  try {
    const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    // Some phones (Safari) stamp the first frame with a large clock time, which makes
    // the file look hours long. Start the cut at the real first frame so it starts at 0.
    const first = Math.max(0, (await input.getFirstTimestamp().catch(() => 0)) || 0);
    const conversion = await Conversion.init({ input, output, trim: { start: first, end: first + MAX_REEL_SECONDS } });
    if (!conversion.isValid) throw new Error(`Invalid conversion: ${conversion.discardedTracks.map((t) => t.reason).join(", ")}`);
    await conversion.execute();
    const buf = (output.target as InstanceType<typeof BufferTarget>).buffer;
    if (!buf || buf.byteLength === 0) throw new Error("Empty output");
    const fixed = new File([buf], "reel.mp4", { type: "video/mp4" });
    if (await hasRealLength(fixed)) return fixed;
    throw new Error("Output still has no length");
  } catch (err) {
    console.warn("Couldn't re-package reel", err);
  }
  return new File([blob], "reel.mp4", { type: "video/mp4" });
}

export async function makeReel(
  picture: Blob,
  audio: Blob,
  onProgress?: (fraction: number) => void,
): Promise<File> {
  const mime = pickMime();
  if (!mime) {
    throw new Error(
      "This browser can't make videos. Please use Safari or Chrome to send a picture with a recording.",
    );
  }

  const img = new Image();
  const imgUrl = URL.createObjectURL(picture);
  img.src = imgUrl;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // t: 0→1 over the Reel. Slow zoom-in (1.0→1.12) with a slight upward drift.
  const draw = (t = 0) => {
    const e = t * t * (3 - 2 * t); // ease in-out
    const z = 1 + 0.12 * e;
    const dy = -H * 0.02 * e;
    ctx.save();
    ctx.translate(W / 2, H / 2 + dy);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    // Blurred fill behind, picture fitted in the middle.
    const cover = Math.max(W / img.width, H / img.height) * 1.15;
    ctx.filter = "blur(40px) brightness(0.6)";
    ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
    ctx.filter = "none";
    const fit = Math.min(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * fit) / 2, (H - img.height * fit) / 2, img.width * fit, img.height * fit);
    ctx.restore();
  };
  draw();

  const audioCtx = new AudioContext();
  const fullBuffer = await audioCtx.decodeAudioData(await audio.arrayBuffer());
  // Never let a photo Reel run past the cap, even if the recording is longer.
  const maxLength = Math.ceil(MAX_REEL_SECONDS * fullBuffer.sampleRate);
  const buffer = fullBuffer.length > maxLength
    ? (() => { const cut = new AudioBuffer({ length: maxLength, numberOfChannels: 1, sampleRate: fullBuffer.sampleRate }); cut.copyToChannel(fullBuffer.getChannelData(0).subarray(0, maxLength), 0); return cut; })()
    : fullBuffer;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);

  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  let raf = 0;
  const startedAt = performance.now();
  const tick = () => {
    const p = Math.min(1, (performance.now() - startedAt) / 1000 / buffer.duration);
    draw(p);
    onProgress?.(p);
    raf = requestAnimationFrame(tick);
  };

  rec.start();
  source.start();
  tick();
  source.onended = () => setTimeout(() => rec.state !== "inactive" && rec.stop(), 300);
  await done;

  cancelAnimationFrame(raf);
  stream.getTracks().forEach((t) => t.stop());
  await audioCtx.close();
  URL.revokeObjectURL(imgUrl);

  return finalizeMp4(new Blob(chunks, { type: "video/mp4" }));
}

function loadVideo(source: Blob): Promise<{ el: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(source);
  const el = document.createElement("video");
  el.playsInline = true;
  el.preload = "auto";
  el.muted = true;
  el.src = url;
  return new Promise((resolve, reject) => {
    el.onloadeddata = () => resolve({ el, url });
    el.onerror = () => reject(new Error("Couldn't read this video. Try an MP4 or MOV file."));
  });
}

// Grabs a JPEG still from an uploaded video (used as the post's cover picture and for produce detection).
export async function videoThumbnail(source: Blob, atSeconds?: number): Promise<File> {
  const { el, url } = await loadVideo(source);
  await new Promise<void>((resolve) => {
    el.onseeked = () => resolve();
    el.currentTime = atSeconds ?? Math.min(0.5, (el.duration || 1) / 2);
  });
  const scale = Math.min(1, 1080 / el.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(el.videoWidth * scale);
  canvas.height = Math.round(el.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read this video."))), "image/jpeg", 0.9));
  return new File([blob], "cover.jpg", { type: "image/jpeg" });
}

// Re-encodes an uploaded video as a 9:16 MP4 Reel. Uses `audio` as the soundtrack when given,
// otherwise keeps the video's own sound. trimStart/trimEnd (seconds) select which part to keep.
export async function makeVideoReel(
  source: Blob,
  audio: Blob | null,
  onProgress?: (fraction: number) => void,
  trimStart = 0,
  trimEnd?: number,
): Promise<File> {
  const mime = pickMime();
  if (!mime) throw new Error("This browser can't make videos. Please use Safari or Chrome.");
  const { el, url } = await loadVideo(source);
  const end = Math.min(trimEnd ?? Infinity, Number.isFinite(el.duration) ? el.duration : Infinity, trimStart + MAX_REEL_SECONDS);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const draw = () => {
    const vw = el.videoWidth || W;
    const vh = el.videoHeight || H;
    const cover = Math.max(W / vw, H / vh) * 1.15;
    ctx.filter = "blur(40px) brightness(0.6)";
    ctx.drawImage(el, (W - vw * cover) / 2, (H - vh * cover) / 2, vw * cover, vh * cover);
    ctx.filter = "none";
    const fit = Math.min(W / vw, H / vh);
    ctx.drawImage(el, (W - vw * fit) / 2, (H - vh * fit) / 2, vw * fit, vh * fit);
  };

  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  let voice: AudioBufferSourceNode | null = null;
  if (audio) {
    voice = audioCtx.createBufferSource();
    voice.buffer = await audioCtx.decodeAudioData(await audio.arrayBuffer());
    voice.connect(dest);
  } else {
    el.muted = false;
    audioCtx.createMediaElementSource(el).connect(dest);
  }

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

  let raf = 0;
  const tick = () => {
    draw();
    if (end > trimStart) onProgress?.(Math.min(1, (el.currentTime - trimStart) / (end - trimStart)));
    if (el.currentTime >= end) rec.state !== "inactive" && rec.stop();
    raf = requestAnimationFrame(tick);
  };
  el.currentTime = trimStart;
  el.onended = () => setTimeout(() => rec.state !== "inactive" && rec.stop(), 200);
  rec.start();
  await el.play();
  voice?.start();
  tick();
  await done;

  cancelAnimationFrame(raf);
  voice?.stop();
  stream.getTracks().forEach((t) => t.stop());
  await audioCtx.close();
  URL.revokeObjectURL(url);
  return finalizeMp4(new Blob(chunks, { type: "video/mp4" }));
}
