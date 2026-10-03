// Builds an MP4 Reel (9:16) in the browser from a still picture plus a voice recording.
// Uses MediaRecorder's MP4 output (Safari, Chrome/Edge 126+). Runs in real time.

const W = 720;
const H = 1280;

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

  const draw = () => {
    // Blurred fill behind, picture fitted in the middle.
    const cover = Math.max(W / img.width, H / img.height);
    ctx.filter = "blur(40px) brightness(0.6)";
    ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
    ctx.filter = "none";
    const fit = Math.min(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * fit) / 2, (H - img.height * fit) / 2, img.width * fit, img.height * fit);
  };
  draw();

  const audioCtx = new AudioContext();
  const buffer = await audioCtx.decodeAudioData(await audio.arrayBuffer());
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
    draw(); // keep frames flowing
    onProgress?.(Math.min(1, (performance.now() - startedAt) / 1000 / buffer.duration));
    raf = requestAnimationFrame(tick);
  };

  rec.start(1000);
  source.start();
  tick();
  source.onended = () => setTimeout(() => rec.state !== "inactive" && rec.stop(), 300);
  await done;

  cancelAnimationFrame(raf);
  stream.getTracks().forEach((t) => t.stop());
  await audioCtx.close();
  URL.revokeObjectURL(imgUrl);

  return new File([new Blob(chunks, { type: "video/mp4" })], "reel.mp4", { type: "video/mp4" });
}
