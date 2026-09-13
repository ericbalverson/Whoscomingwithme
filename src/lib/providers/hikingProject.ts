/**
 * Hiking Project Data API (run by REI/Adventure Projects). Free key from
 * https://www.hikingproject.com/data — used here as the trail-quality
 * signal AllTrails would provide if it had a public API (it doesn't).
 */

const HIKING_PROJECT_BASE = "https://www.hikingproject.com/data/get-trails";

export type Trail = {
  id: number;
  name: string;
  distanceMiles: number;
  difficulty: string;
  stars: number;
  starVotes: number;
  latitude: number;
  longitude: number;
  url: string;
};

type RawTrail = {
  id: number;
  name: string;
  length: number;
  difficulty: string;
  stars: number;
  starVotes: number;
  latitude: number;
  longitude: number;
  url: string;
};

export async function getNearbyTrails(opts: {
  latitude: number;
  longitude: number;
  maxDistanceMiles?: number;
  maxResults?: number;
}): Promise<Trail[]> {
  const apiKey = process.env.HIKING_PROJECT_API_KEY;
  if (!apiKey) throw new Error("HIKING_PROJECT_API_KEY is not set");

  const url = new URL(HIKING_PROJECT_BASE);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("lat", String(opts.latitude));
  url.searchParams.set("lon", String(opts.longitude));
  url.searchParams.set("maxDistance", String(opts.maxDistanceMiles ?? 25));
  url.searchParams.set("maxResults", String(opts.maxResults ?? 25));

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Hiking Project request failed: ${res.status}`);

  const body = (await res.json()) as { trails: RawTrail[] };
  return (body.trails ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    distanceMiles: t.length,
    difficulty: t.difficulty,
    stars: t.stars,
    starVotes: t.starVotes,
    latitude: t.latitude,
    longitude: t.longitude,
    url: t.url,
  }));
}
