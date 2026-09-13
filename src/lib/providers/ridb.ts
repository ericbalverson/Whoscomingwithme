/**
 * RIDB (Recreation Information Database) — the official, documented API
 * behind recreation.gov. It covers NPS, Forest Service, BLM, and Army
 * Corps facilities, but ONLY metadata: name, description, location,
 * activities, whether it's reservable. It does not expose live per-date
 * booking availability — see providers/recreationAvailability.ts for the
 * best-effort, unofficial source for that.
 *
 * Get a free key at https://ridb.recreation.gov/landing/account/keys
 */

const RIDB_BASE = "https://ridb.recreation.gov/api/v1";
const CAMPING_ACTIVITY_ID = "9"; // RIDB's fixed activity ID for "Camping"

export type RidbFacility = {
  facilityId: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  reservable: boolean;
  distanceMiles: number;
  bookingUrl: string;
};

type RawFacility = {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription?: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  Reservable?: boolean;
  Enabled?: boolean;
};

export async function searchCampgrounds(opts: {
  latitude: number;
  longitude: number;
  radiusMiles?: number;
  limit?: number;
}): Promise<RidbFacility[]> {
  const apiKey = process.env.RIDB_API_KEY;
  if (!apiKey) throw new Error("RIDB_API_KEY is not set");

  const url = new URL(`${RIDB_BASE}/facilities`);
  url.searchParams.set("latitude", String(opts.latitude));
  url.searchParams.set("longitude", String(opts.longitude));
  url.searchParams.set("radius", String(opts.radiusMiles ?? 30));
  url.searchParams.set("activity", CAMPING_ACTIVITY_ID);
  url.searchParams.set("limit", String(opts.limit ?? 20));

  const res = await fetch(url, {
    headers: { apikey: apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`RIDB request failed: ${res.status}`);
  }

  const body = (await res.json()) as { RECDATA: RawFacility[] };
  return (body.RECDATA ?? [])
    .filter((f) => f.Enabled !== false)
    .map((f) => ({
      facilityId: f.FacilityID,
      name: f.FacilityName,
      description: stripHtml(f.FacilityDescription ?? ""),
      latitude: f.FacilityLatitude,
      longitude: f.FacilityLongitude,
      reservable: Boolean(f.Reservable),
      distanceMiles: 0, // filled in by the caller once it knows the origin point
      bookingUrl: `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`,
    }));
}

/**
 * RIDB has no direct "is this car camping or backpacking" field, so this
 * infers it from each campsite's free-text `CampsiteType` (e.g. "STANDARD
 * NONELECTRIC", "WALK TO", "RV NONELECTRIC"). Keyword-based and imperfect —
 * treat the result as a hint, not a guarantee. A facility with no
 * classifiable campsites (empty response, unrecognized types) comes back
 * as "unknown" rather than a guess.
 */
export type CampingStyleGuess = "CAR" | "BACKPACK" | "EITHER" | "UNKNOWN";

const BACKPACK_KEYWORDS = ["WALK TO", "HIKE TO", "BOAT TO", "PRIMITIVE", "REMOTE"];
const CAR_KEYWORDS = ["RV", "STANDARD", "PULL THROUGH", "PULL-THRU", "PULL THRU", "DRIVE", "GROUP", "CABIN", "YURT", "EQUESTRIAN"];

export async function guessCampingStyle(facilityId: string): Promise<CampingStyleGuess> {
  const apiKey = process.env.RIDB_API_KEY;
  if (!apiKey) throw new Error("RIDB_API_KEY is not set");

  const url = new URL(`${RIDB_BASE}/facilities/${facilityId}/campsites`);
  url.searchParams.set("limit", "50");

  const res = await fetch(url, { headers: { apikey: apiKey, Accept: "application/json" } });
  if (!res.ok) return "UNKNOWN";

  const body = (await res.json()) as { RECDATA?: { CampsiteType?: string }[] };
  const types = (body.RECDATA ?? []).map((c) => (c.CampsiteType ?? "").toUpperCase());
  if (types.length === 0) return "UNKNOWN";

  const hasCar = types.some((t) => CAR_KEYWORDS.some((k) => t.includes(k)));
  const hasBackpack = types.some((t) => BACKPACK_KEYWORDS.some((k) => t.includes(k)));

  if (hasCar && hasBackpack) return "EITHER";
  if (hasCar) return "CAR";
  if (hasBackpack) return "BACKPACK";
  return "UNKNOWN";
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
