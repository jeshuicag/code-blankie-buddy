# Requirements (Dependencies)

Everything the code needs to build and run. Versions are managed in `package.json`.

## Runtime packages

| Package | Used for |
| --- | --- |
| `react`, `react-dom` | UI |
| `@tanstack/react-start` | Full-stack framework, server functions |
| `@tanstack/react-router` | Routing |
| `@tanstack/react-query` | Data fetching/cache |
| `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css` | Styling |
| `lucide-react` | Icons for the guided flow |
| `react-easy-crop` | Photo crop UI (drag/zoom, Instagram shapes) |
| `smartcrop` | Aesthetic crop suggestion (runs on-device) |
| `mediabunny` | MP4 re-packaging — fixes reel duration / "live broadcast" files |
| `@tensorflow/tfjs` | Runs the produce model on-device |
| `@tensorflow-models/mobilenet` | Image feature extraction (MobileNet v2 base) |
| `zod` | Server-side input validation on the upload endpoint |

Build tooling: `vite`, `@vitejs/plugin-react`, `@lovable.dev/vite-tanstack-config`, `typescript`, `vitest`, `eslint`, `prettier`.

## Bundled assets (shipped in `public/`)

| Asset | Size | Used for |
| --- | --- | --- |
| `models/mobilenet/` | ~7.6 MB | MobileNet v2 (alpha 0.5) base model, `inputRange [0,1]` |
| `models/produce/` | ~180 KB | Retrained produce-recognition head (36 classes) |
| `cities.json` | ~1 MB | Offline nearest-city lookup (GeoNames cities15000) |
| `icons/` | — | PWA icons (192, 512, apple-touch) |

## Server-side

- `ZERNIO_API_KEY` secret — Instagram posting via Zernio (`src/routes/api/public/upload.ts`). Never in code.
- Instagram account must be Business/Creator.

## Browser capabilities required

- MediaRecorder + AudioContext/AudioWorklet (voice recording, pitch disguise)
- Canvas capture + video encoding (reel building)
- Geolocation (📍 GPS lookup)
- Cache Storage (offline caching of models and city list)
- Works in Safari and recent Chrome; other browsers get a clear message.
