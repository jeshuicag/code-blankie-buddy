# NowYouSeeMe

A phone-first web app (installable PWA) that lets small local farms post to
Instagram in a few guided taps: pick a photo or short video, optionally record
a voice note, and the app builds a ready-to-post Instagram Reel entirely on the
phone, then sends it to Instagram.

**Live app**: https://code-blankie-buddy.lovable.app

## What it does

- **Icon-guided posting flow** — no text prompts; each step shows exactly one
  pulsing action (upload picture → record voice → location → phone → send).
  Completed steps get a check mark.
- **Photo or video upload** — photos are cropped to Instagram shapes
  (1:1, 4:5, 1.91:1) with a smart, on-phone crop suggestion. Videos longer than
  10 seconds get an on-phone trim step; everything is rebuilt into the tall
  Reel shape (720×1280) locally.
- **Voice notes with voice changer** — record up to 10 seconds, play it back
  with a progress bar, and disguise the voice locally (Normal / Deep / High)
  so the speaker stays anonymous. The disguise can be changed any time before
  sending.
- **Automatic captions with on-device AI** — a small image-recognition model
  bundled with the app identifies the produce in the picture and drafts a
  caption like “Fresh tomatoes from a local farm near [location]…”.
- **Location** — optional GPS-based nearest-city lookup that works offline
  (bundled world city list, GPS-first with a visible 45-second countdown).
- **Phone number** — optional field, added to the caption.
- **Anonymous IDs** — each device gets a unique ID; posts are tagged with a
  unique hashtag (`#pu<id>`) so every farm's photos collect under their own
  tag on the Instagram account. The ID survives reloads and is never regenerated
  unless browser data is cleared.
- **Reel preview** — the finished Reel is shown before anything is posted,
  with an editable caption.
- **Safe on failure** — if sending fails, the finished Reel can be saved to the
  phone's files (always 10 seconds or less, with a real, playable duration).

## How it works

Almost everything runs **locally on the phone**: taking/choosing the picture,
cropping, voice recording, the voice disguise, Reel building (picture or video,
with zoom and drift), the produce-recognition model, the city list, and the
device ID. The only server part is the final Instagram posting, which goes
through [Zernio](https://docs.zernio.com/platforms/instagram) — that is where
the Zernio API key lives, never in the app code.

- Photos become Reels when a voice note is attached; otherwise they post as
  regular image posts.
- Uploaded videos keep their own sound if no voice note is recorded; the voice
  disguise still works on the video's audio.
- Reels are limited to 10 seconds everywhere, and short recordings are padded
  with silence (photos: up to 3 seconds, Instagram's minimum).

## Technology

- [TanStack Start](https://tanstack.com/start) (React 19, Vite) + Tailwind CSS v4
- PWA: installable from the browser, no app store needed
- TensorFlow.js — MobileNet v2 (alpha 0.5) with a custom retrained produce
  head, fully bundled in `public/models/` (works offline from the first open)
- Web Audio API + AudioWorklet — local voice recording and pitch-shifting
- Canvas + MediaRecorder — local Reel building (720×1280, blurred letterbox
  background, gentle zoom)
- [mediabunny](https://mediabunny.dev) — final MP4 repair so previews and
  saved videos have a real duration
- [smartcrop.js](https://github.com/jwagner/smartcrop.js) — on-phone crop
  suggestions
- [react-easy-crop](https://github.com/ricardo-ch/react-easy-crop) — the
  crop UI
- Zernio API — Instagram publishing (server side only)

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

### Configuration

The app needs one secret to post to Instagram:

- `ZERNIO_API_KEY` — a Zernio API key with access to the target Instagram
  Business/Creator account. Set it as a server-side secret (never in client
  code).

Everything else (models, city list) ships with the app in `public/`.

### Notes

- The Instagram posting endpoint lives in `src/routes/api/public/upload.ts`.
- Voice changing and Reel building require Safari or a recent Chrome; other
  browsers show a friendly message instead.
- The bundled models are pre-trained; nothing trains on the user's phone.

This project was built with [Lovable](https://lovable.dev).
