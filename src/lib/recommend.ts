import { milesBetween } from "@/lib/geo";
import { searchCampgrounds, guessCampingStyle, type RidbFacility, type CampingStyleGuess } from "@/lib/providers/ridb";
import { getNearbyTrails, type Trail } from "@/lib/providers/osmTrails";
import { summarizeWindowAvailability } from "@/lib/providers/recreationAvailability";
import { getStateAlerts, type NpsAlert } from "@/lib/providers/nps";

export type CampgroundRecommendation = {
  facilityId: string;
  name: string;
  description: string;
  distanceMiles: number;
  reservable: boolean;
  bookingUrl: string;
  nearbyTrailCount: number;
  topTrails: Trail[];
  availability:
    | { status: "ok"; daysWithAvailability: number; totalDays: number }
    | { status: "unknown"; reason?: string };
  campingStyle: CampingStyleGuess;
  score: number;
};

export type RecommendationResult = {
  campgrounds: CampgroundRecommendation[];
  stateAlerts: NpsAlert[];
  sourceNotes: string[];
};

const TRAIL_SEARCH_RADIUS_MILES = 15;
const MAX_CAMPGROUNDS_TO_ENRICH = 6; // shared cap for both the live-availability and style-guess lookups

export async function getRecommendations(opts: {
  latitude: number;
  longitude: number;
  stateCode: string | null;
  radiusMiles: number;
  windowStart: Date;
  windowEnd: Date;
  requiredStyle?: "CAR" | "BACKPACK" | "EITHER";
}): Promise<RecommendationResult> {
  const sourceNotes: string[] = [];

  // Each external source fails independently — a down or misconfigured
  // provider should degrade that one signal, not the whole recommendation.
  const [campgroundsResult, trailsResult, alertsResult] = await Promise.allSettled([
    searchCampgrounds({
      latitude: opts.latitude,
      longitude: opts.longitude,
      radiusMiles: opts.radiusMiles,
    }),
    getNearbyTrails({
      latitude: opts.latitude,
      longitude: opts.longitude,
      maxDistanceMiles: opts.radiusMiles,
      maxResults: 50,
    }),
    opts.stateCode ? getStateAlerts(opts.stateCode) : Promise.resolve([]),
  ]);

  const campgrounds: RidbFacility[] =
    campgroundsResult.status === "fulfilled" ? campgroundsResult.value : [];
  if (campgroundsResult.status === "rejected") {
    sourceNotes.push(`Campground search (RIDB) unavailable: ${campgroundsResult.reason}`);
  }

  const trails: Trail[] = trailsResult.status === "fulfilled" ? trailsResult.value : [];
  if (trailsResult.status === "rejected") {
    sourceNotes.push(`Trail data (OpenStreetMap) unavailable: ${trailsResult.reason}`);
  }

  const stateAlerts: NpsAlert[] = alertsResult.status === "fulfilled" ? alertsResult.value : [];
  if (alertsResult.status === "rejected") {
    sourceNotes.push(`NPS alerts unavailable: ${alertsResult.reason}`);
  }

  const withDistance = campgrounds
    .map((c) => ({
      ...c,
      distanceMiles: milesBetween(opts.latitude, opts.longitude, c.latitude, c.longitude),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  // Live availability and camping-style classification both cost an extra
  // RIDB/recreation.gov call per facility — only spend those on the
  // closest handful of candidates, not the whole list.
  const toEnrich = withDistance.slice(0, MAX_CAMPGROUNDS_TO_ENRICH);
  const availabilityByFacility = new Map<
    string,
    Awaited<ReturnType<typeof summarizeWindowAvailability>>
  >();
  const styleByFacility = new Map<string, CampingStyleGuess>();
  await Promise.all(
    toEnrich.map(async (c) => {
      const [availability, style] = await Promise.all([
        summarizeWindowAvailability(c.facilityId, opts.windowStart, opts.windowEnd),
        guessCampingStyle(c.facilityId).catch(() => "UNKNOWN" as const),
      ]);
      availabilityByFacility.set(c.facilityId, availability);
      styleByFacility.set(c.facilityId, style);
    })
  );

  const requiredStyle = opts.requiredStyle ?? "EITHER";

  const results: CampgroundRecommendation[] = withDistance
    .map((c) => {
      const nearbyTrails = trails
        .map((t) => ({ trail: t, distance: milesBetween(c.latitude, c.longitude, t.latitude, t.longitude) }))
        .filter((t) => t.distance <= TRAIL_SEARCH_RADIUS_MILES)
        // No rating signal from OSM (unlike the old plan), so rank by
        // trail length as a rough proxy for "worth hiking," then distance.
        .sort((a, b) => b.trail.distanceMiles - a.trail.distanceMiles || a.distance - b.distance);

      const avg = availabilityByFacility.get(c.facilityId);
      const availability: CampgroundRecommendation["availability"] = avg
        ? avg.status === "ok"
          ? { status: "ok", daysWithAvailability: avg.daysWithAvailability, totalDays: avg.totalDays }
          : { status: "unknown", reason: avg.reason }
        : { status: "unknown", reason: "not checked (outside the closest few results)" };

      const campingStyle = styleByFacility.get(c.facilityId) ?? "UNKNOWN";

      // No star ratings available (see osmTrails.ts) — score by how many
      // trails are nearby, capped so one campground with 40 short paths
      // doesn't dwarf one with 3 genuinely good ones.
      const trailScore = Math.min(nearbyTrails.length, 8) * 1.5;
      const availabilityScore =
        availability.status === "ok" && availability.totalDays > 0
          ? (availability.daysWithAvailability / availability.totalDays) * 10
          : 0;
      const distancePenalty = c.distanceMiles * 0.2;
      const reservableBonus = c.reservable ? 2 : 0;
      // A confirmed match to the group's required style is worth more than
      // any single other signal — it's a hard preference, not a nice-to-have.
      const styleBonus =
        requiredStyle === "EITHER" || campingStyle === "EITHER" || campingStyle === requiredStyle
          ? 0
          : campingStyle === "UNKNOWN"
            ? 0
            : -100; // confirmed mismatch — bury it rather than exclude it outright

      return {
        facilityId: c.facilityId,
        name: c.name,
        description: c.description,
        distanceMiles: Math.round(c.distanceMiles * 10) / 10,
        reservable: c.reservable,
        bookingUrl: c.bookingUrl,
        nearbyTrailCount: nearbyTrails.length,
        topTrails: nearbyTrails.slice(0, 3).map((t) => t.trail),
        availability,
        campingStyle,
        score:
          Math.round((trailScore + availabilityScore + reservableBonus - distancePenalty) * 10) / 10 +
          styleBonus,
      };
    })
    // Confirmed mismatches (not merely unknown) are dropped rather than
    // just buried, once real candidates exist for the requested style.
    .filter((c) => c.score > -100);

  results.sort((a, b) => b.score - a.score);

  return { campgrounds: results, stateAlerts, sourceNotes };
}
