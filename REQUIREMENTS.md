# Requirements

Functional and non-functional requirements for NowYouSeeMe.

## 1. Identity

- **R1.1** Each device receives a unique ID (UUID, dashes stripped) on first
  load, stored in browser storage.
- **R1.2** The ID must not change on reload; it only changes if browser data
  is cleared or the app opens on a new phone.
- **R1.3** Every post is tagged with a unique hashtag derived from the ID:
  `#pu<id>`, always the last line of the caption.
- **R1.4** The same phone always produces the same ID and hashtag.

## 2. Posting flow

- **R2.1** The posting experience is a single, icon-guided, step-by-step flow
  with no text prompts on the action buttons: each step visually prompts
  exactly one next action; completed steps show a check mark.
- **R2.2** Flow order: upload picture → (crop, photos only) → record voice →
  location → phone → send/preview. Only the current action pulses.
- **R2.3** One upload button accepts photos and videos; there is no separate
  camera button.
- **R2.4** Uploading a video skips the crop step and goes straight to the
  voice step.

## 3. Photos

- **R3.1** Photos are cropped to Instagram-approved shapes: 1:1, 4:5, 1.91:1.
- **R3.2** The app suggests an aesthetic crop on-device (smartcrop.js) and
  re-suggests when the shape changes; the user can drag and zoom manually.
- **R3.3** Cropped photos are exported locally as JPEG, max 1080 px wide.

## 4. Video

- **R4.1** Uploaded videos longer than 10 seconds get a trim step: the user
  picks which 10 seconds to keep, with the excluded parts greyed out.
- **R4.2** After trimming, only the chosen 10 seconds remain — a new clip is
  built on the phone and used for all preview and further steps.
- **R4.3** The user may skip recording over a video (skip control next to the
  microphone) and keep the video's own sound; the voice disguise still applies
  to the video's audio.
- **R4.4** All videos (and photo reels) are rebuilt on the phone into the
  tall Reel shape, 720×1280, with a blurred letterbox background and a gentle
  zoom/drift. Nothing is uploaded for reshaping.
- **R4.5** When a recording is added over a video, the preview is rebuilt with
  the new audio automatically, before the disguise step; controls stay locked
  until the rebuilt video is ready.

## 5. Voice

- **R5.1** Voice recording is capped at 10 seconds, with a visible countdown
  while recording. For videos, the countdown target is the video's length
  (≤ 10 s); recordings shorter than the video are padded with silence, never
  past the cap.
- **R5.2** Recordings can be played back with a progress bar (play/pause),
  re-recorded, or deleted before sending.
- **R5.3** A local voice disguise is offered with three presets — Normal,
  Deep, High — all visible at the same time, with the current choice clearly
  highlighted.
- **R5.4** Disguise presets can be switched freely; a confirm check button
  advances the flow. The disguise is applied locally by post-processing the
  existing recording (no library downloads), so it can be changed or removed
  any time before sending.
- **R5.5** Disguise options stay visible during the first playback; the
  confirm step only appears after playback finishes.
- **R5.6** Photo reels pad silence up to at least 3 seconds (Instagram's
  minimum) but never beyond 10 seconds total.

## 6. Caption, location and phone

- **R6.1** The app drafts a caption on-device using a bundled produce
  recognition model (MobileNet v2 base + retrained head, shipped in
  `public/models/`), naming the produce when recognized with sufficient
  confidence, in the form "Fresh {produce} from a local farm near {location}.
  Contact via {phone | local tourism guide}."
- **R6.2** The caption is editable at the send/preview step, with a reset to
  the suggestion.
- **R6.3** Location is optional. The 📍 control requests GPS directly (no
  Wi-Fi/network positioning first) with a visible, large countdown of up to
  45 seconds; the nearest city comes from a bundled offline city list, so it
  works with no connection.
- **R6.4** An auto-filled location must not advance the flow on its own — the
  user moves on explicitly.
- **R6.5** Phone number is optional and validated (5–20 characters, digits,
  spaces, `+ ( ) . -`); it can be skipped with a dedicated skip control.
- **R6.6** Location ≤ 100 characters and phone ≤ 20 characters; the caption
  is capped at 2000 characters. Invalid values are rejected server-side.

## 7. Reel building and preview

- **R7.1** The Reel is built automatically when the send step is reached — no
  separate "create preview" action — with a progress bar while it works.
- **R7.2** The finished Reel is shown for preview before sending; nothing is
  posted until the user taps send.
- **R7.3** Reels must never exceed 10 seconds, whatever the source.
- **R7.4** Finished MP4s are repaired locally (mediabunny) to carry a real
  duration — previews must not show as "live broadcasts" and saved copies
  must not have absurd lengths.
- **R7.5** Changing the voice disguise or re-recording invalidates the built
  Reel; it is rebuilt before sending.

## 8. Sending and failure handling

- **R8.1** Photos with a voice note (and all videos) are posted as Instagram
  Reels; photos without a voice note are posted as images.
- **R8.2** Sending goes through the app's server (Zernio → Instagram). The
  Zernio API key is a server-side secret, never shipped to the client.
- **R8.3** Media constraints: JPEG/PNG ≤ 8 MB; MP4 video ≤ 100 MB.
- **R8.4** If sending fails, no file downloads automatically; a save option
  appears at the send step so the user can save the finished Reel (≤ 10 s) to
  their files.
- **R8.5** A start-over control is available at the send step. No back
  buttons elsewhere — the flow moves forward only.
- **R8.6** Instagram posting limits (Zernio): 100 posts per 24 h, captions
  ≤ 2200 characters, Business/Creator account required.

## 9. Offline and performance

- **R9.1** Everything except the final Instagram send happens locally on the
  phone: cropping, recording, disguise, Reel building, produce detection,
  nearest-city lookup, and ID generation.
- **R9.2** The produce model, MobileNet base, and city list are bundled with
  the app (`public/`) and cached on first open, so the app works offline from
  the first launch with no external downloads.
- **R9.3** The app is an installable PWA (manifest, icons, standalone
  display) — installed from the browser, no app store.
- **R9.4** Voice processing and Reel building must run without added
  libraries beyond small, pure-JS ones; pitch shifting uses a built-in
  AudioWorklet.

## 10. Compatibility and accessibility

- **R10.1** Voice changing and Reel building target Safari and recent Chrome;
  unsupported browsers get a clear message instead of a broken flow.
- **R10.2** All icon actions have accessible names; animations respect
  `prefers-reduced-motion`.
- **R10.3** No real posts to Instagram during testing.
