// Offline nearest-city lookup. City list (GeoNames, pop ≥15k) lives in /cities.json
// as [name, countryCode, lat, lon]; loaded only when first needed.
type City = [string, string, number, number];
let cache: Promise<City[]> | null = null;

function loadCities() {
  cache ??= fetch("/cities.json").then((r) => {
    if (!r.ok) throw new Error("Could not load city list");
    return r.json() as Promise<City[]>;
  });
  return cache;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location not supported on this device"));
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location permission denied or unavailable")), {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 600000,
    });
  });
}

export async function findNearestCity(): Promise<string> {
  const [pos, cities] = await Promise.all([getPosition(), loadCities()]);
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
