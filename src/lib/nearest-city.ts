// Offline nearest-city lookup. City list (GeoNames, pop ≥15k) lives in /cities.json
// as [name, countryCode, lat, lon]. It is preloaded into Cache Storage when the app
// opens (see preloadCities), so the first 📍 tap is instant and works offline.
type City = [string, string, number, number];
const CACHE_NAME = "photo-app-data";
const CITIES_URL = "/cities.json";
let cache: Promise<City[]> | null = null;

// Call once on app start; downloads the list into Cache Storage in the background.
export function preloadCities(): void {
  if (typeof caches === "undefined") return;
  caches
    .open(CACHE_NAME)
    .then(async (c) => {
      if (!(await c.match(CITIES_URL))) await c.add(CITIES_URL);
    })
    .catch(() => {
      /* preload is best-effort; loadCities fetches on demand */
    });
}

function loadCities() {
  cache ??= (async () => {
    // Prefer the preloaded copy; fall back to the network (and store it).
    if (typeof caches !== "undefined") {
      const c = await caches.open(CACHE_NAME);
      const hit = await c.match(CITIES_URL);
      if (hit) return (await hit.json()) as City[];
      const res = await fetch(CITIES_URL);
      if (!res.ok) throw new Error("Could not load city list");
      await c.put(CITIES_URL, res.clone());
      return (await res.json()) as City[];
    }
    const res = await fetch(CITIES_URL);
    if (!res.ok) throw new Error("Could not load city list");
    return (await res.json()) as City[];
  })();
  return cache;
}

const GPS_TIMEOUT_MS = 45000;

// Goes straight to the GPS chip (works with Wi-Fi/data off). onTick is called
// each second with the remaining seconds so the UI can show a countdown.
// Uses watchPosition and keeps listening through "position unavailable" hiccups
// (phones report these instantly while the GPS chip is still warming up with
// Wi-Fi off). Only a real permission block stops it early.
function getPosition(onTick?: (secondsLeft: number) => void): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location not supported on this device"));
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return reject(new Error("Location only works on a secure (https) page"));
    }
    let secondsLeft = Math.ceil(GPS_TIMEOUT_MS / 1000);
    let watchId: number | null = null;
    let done = false;
    const finish = () => {
      done = true;
      clearInterval(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    onTick?.(secondsLeft);
    const timer = setInterval(() => {
      secondsLeft -= 1;
      onTick?.(Math.max(secondsLeft, 0));
      if (secondsLeft <= 0 && !done) {
        finish();
        reject(new Error("Couldn't get a GPS fix in 45 seconds. Try outdoors with a clear view of the sky."));
      }
    }, 1000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return;
        finish();
        resolve(pos);
      },
      (err) => {
        if (done) return;
        if (err.code === err.PERMISSION_DENIED) {
          finish();
          const inFrame = typeof window !== "undefined" && window.self !== window.top;
          reject(
            new Error(
              inFrame
                ? "Location is blocked inside this preview window. Open the app in its own tab or the installed app."
                : "Location permission is blocked. Turn on Location for this browser/app in your phone settings, then allow it for this site.",
            ),
          );
        }
        // POSITION_UNAVAILABLE / TIMEOUT: keep waiting until our own countdown ends.
      },
      {
        enableHighAccuracy: true,
        timeout: GPS_TIMEOUT_MS,
        maximumAge: 600000,
      },
    );
  });
}

export async function findNearestCity(onTick?: (secondsLeft: number) => void): Promise<string> {
  const [pos, cities] = await Promise.all([getPosition(onTick), loadCities()]);
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best: City | undefined;
  let bestD = Infinity;
  for (const c of cities) {
    let dLon = Math.abs(c[3] - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const dx = dLon * cosLat;
    const dy = c[2] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) throw new Error("No city found");
  return `${best[0]}, ${best[1]}`;
}
