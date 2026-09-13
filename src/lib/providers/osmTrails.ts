/**
 * Trail data via OpenStreetMap's Overpass API. Free and keyless — no
 * signup, no approval wait.
 *
 * This replaces an earlier plan to use the Hiking Project Data API. That
 * API was publicly deprecated by Adventure Projects in 2020, and onX
 * (which acquired Adventure Projects that December) has continued
 * declining all new key requests since — confirmed directly from
 * hikingproject.com/data, which still displays that notice. There is no
 * currently obtainable equivalent with star ratings; OSM has real trail
 * geometry and names, but no rating/popularity signal, so the "quality"
 * half of the original trail score is gone. Distance and trail density
 * are what's left to work with.
 *
 * Overpass is also a shared public service with modest rate limits and
 * no SLA — treat outages here the same as the other best-effort
 * providers (fail soft, don't take down the whole recommendation).
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const EARTH_RADIUS_MILES = 3958.8;
// overpass-api.de returns 406 Not Acceptable to requests with no descriptive
// User-Agent (or the default Node/fetch one) — this isn't optional courtesy
// like Nominatim's, it's an active block. See:
// https://community.openstreetmap.org/t/overpass-api-error-406/
const USER_AGENT = "camp-sync/0.1 (hobby project; contact: set-your-email-here)";

export type Trail = {
  id: string; // OSM way ID as a string, since IDs can exceed safe integer range on old ways
  name: string;
  distanceMiles: number; // length of the trail itself, not distance from the search point
  difficulty: string; // OSM's sac_scale tag when present, else "unrated"
  latitude: number; // representative point (first node) for map/distance purposes
  longitude: number;
  url: string;
};

type OverpassElement = {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

const SAC_SCALE_LABELS: Record<string, string> = {
  hiking: "easy",
  mountain_hiking: "moderate",
  demanding_mountain_hiking: "hard",
  alpine_hiking: "hard",
  demanding_alpine_hiking: "very hard",
  difficult_alpine_hiking: "very hard",
};

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function wayLengthMiles(geometry: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    total += milesBetween(geometry[i - 1].lat, geometry[i - 1].lon, geometry[i].lat, geometry[i].lon);
  }
  return total;
}

export async function getNearbyTrails(opts: {
  latitude: number;
  longitude: number;
  maxDistanceMiles?: number;
  maxResults?: number;
}): Promise<Trail[]> {
  const radiusMeters = Math.round((opts.maxDistanceMiles ?? 25) * 1609.34);

  // Named hiking-relevant ways within the radius: footpaths, tracks, and
  // paths explicitly tagged for foot traffic. Overpass QL, JSON output,
  // with geometry so trail length can be computed without a second call.
  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(path|footway|track)$"]["name"](around:${radiusMeters},${opts.latitude},${opts.longitude});
    );
    out geom;
  `.trim();

  let res: Response;
  try {
    res = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("network error contacting Overpass API");
  }

  if (!res.ok) {
    throw new Error(`Overpass request failed: ${res.status}`);
  }

  const body = (await res.json()) as { elements: OverpassElement[] };

  // OSM frequently splits one real trail into several way segments that
  // share a name (e.g. crossing a road). Group by name and sum lengths so
  // "Ridge Loop Trail" reports as one trail, not five fragments.
  const byName = new Map<string, { totalMiles: number; sacScale?: string; point: { lat: number; lon: number }; id: number }>();

  for (const el of body.elements ?? []) {
    if (el.type !== "way" || !el.tags?.name || !el.geometry || el.geometry.length < 2) continue;
    const name = el.tags.name;
    const length = wayLengthMiles(el.geometry);
    const existing = byName.get(name);
    if (existing) {
      existing.totalMiles += length;
    } else {
      byName.set(name, {
        totalMiles: length,
        sacScale: el.tags.sac_scale,
        point: el.geometry[0],
        id: el.id,
      });
    }
  }

  const trails: Trail[] = [...byName.entries()]
    .map(([name, t]) => ({
      id: String(t.id),
      name,
      distanceMiles: Math.round(t.totalMiles * 10) / 10,
      difficulty: (t.sacScale && SAC_SCALE_LABELS[t.sacScale]) || "unrated",
      latitude: t.point.lat,
      longitude: t.point.lon,
      url: `https://www.openstreetmap.org/way/${t.id}`,
    }))
    .filter((t) => t.distanceMiles > 0)
    .sort((a, b) => b.distanceMiles - a.distanceMiles);

  return trails.slice(0, opts.maxResults ?? 25);
}
