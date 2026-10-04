# Icon-guided posting flow

## What will change
- Replace the current form-like screen with a vertical, step-by-step visual path. Only the current action pulses; completed steps become visually checked and the next step activates.
- Start with a pulsing **download + key** control. Saving creates `🔑.txt`; repeated saves keep the existing confirmation safeguard without adding permanent instructions.
- Follow with a pulsing **upload + key** control. Tapping it opens the phone's file picker directly, which is the only secure way for the user to choose where their saved key is.
- Show one **upload + picture** control next. Remove the camera-only action. After selection, guide the user through image positioning, crop shape, zoom, and confirmation using symbols rather than visible words.
- Reveal a **microphone** control after the crop. After recording, pulse the playback control, then guide through one suggested disguise, another playback, and finally expose all disguise choices.
- Guide the user next to **location**, then **phone**, followed by the final send/preview controls.
- Keep error and success messages readable when something fails or finishes; action instructions and labels will be visual-only.

## Technical details
- Use Lucide symbols, accessible names, and hover/focus tooltips while keeping action faces free of text.
- Add explicit progress callbacks between the photo, crop, voice, playback, disguise, location, and phone controls.
- Use a single shared pulse treatment that respects reduced-motion preferences.
- Preserve all existing local processing, Instagram upload behavior, crop rules, voice effects, location lookup, and duplicate-key protection.
- Verify the sequence on desktop and a phone-sized viewport without publishing or sending a real Instagram post.
