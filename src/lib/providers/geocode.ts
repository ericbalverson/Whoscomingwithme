import { stateNameToCode } from "@/lib/usStates";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
  stateCode: string | null;
};

// Nominatim is free and keyless but asks every client to identify itself
// with a real User-Agent/Referer and to keep requests to ~1/sec. Fine for
// a hobby app's on-demand lookups; do not hammer it in a loop.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "camp-sync/0.1 (hobby project; contact: set-your-email-here)";

export async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;

  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: { state?: string };
  }>;
  const first = results[0];
  if (!first) return null;

  return {
    latitude: parseFloat(first.lat),
    longitude: parseFloat(first.lon),
    displayName: first.display_name,
    stateCode: stateNameToCode(first.address?.state),
  };
}
