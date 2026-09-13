/**
 * IMPORTANT: this hits an undocumented endpoint that recreation.gov's own
 * front end uses internally (the same one community tools like the
 * "camping.py" scraper rely on). It is NOT part of RIDB, has no official
 * support contract, and can change or start blocking requests without
 * notice. Every call is wrapped so a failure here degrades gracefully to
 * "unknown — check recreation.gov directly," never a thrown error that
 * takes down a recommendation request.
 */

export type DayAvailability = {
  date: string; // YYYY-MM-DD
  availableSiteCount: number;
  totalSiteCount: number;
};

export type AvailabilityResult =
  | { status: "ok"; days: DayAvailability[] }
  | { status: "unknown"; reason: string };

const USER_AGENT = "camp-sync/0.1 (hobby project, best-effort availability check)";

function monthStartISO(year: number, month0: number): string {
  return new Date(Date.UTC(year, month0, 1)).toISOString();
}

/**
 * Fetches one calendar month of per-site availability for a facility and
 * reduces it to a per-day count of open sites. recreation.gov returns data
 * one month at a time keyed by an ISO month-start timestamp.
 */
export async function getMonthAvailability(
  facilityId: string,
  year: number,
  month0: number // 0-indexed, matches Date's convention
): Promise<AvailabilityResult> {
  const url = `https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month?start_date=${encodeURIComponent(
    monthStartISO(year, month0)
  )}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // Short timeout via AbortSignal so one flaky facility can't stall a
      // whole recommendation request.
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    return { status: "unknown", reason: "network error contacting recreation.gov" };
  }

  if (!res.ok) {
    return { status: "unknown", reason: `recreation.gov returned ${res.status}` };
  }

  let body: { campsites?: Record<string, { availabilities?: Record<string, string> }> };
  try {
    body = await res.json();
  } catch {
    return { status: "unknown", reason: "unexpected response shape" };
  }

  const campsites = body.campsites ?? {};
  const perDayAvailable = new Map<string, number>();
  const totalSites = Object.keys(campsites).length;

  for (const site of Object.values(campsites)) {
    for (const [date, status] of Object.entries(site.availabilities ?? {})) {
      const day = date.slice(0, 10);
      const isAvailable = status === "Available";
      if (isAvailable) {
        perDayAvailable.set(day, (perDayAvailable.get(day) ?? 0) + 1);
      } else if (!perDayAvailable.has(day)) {
        perDayAvailable.set(day, 0);
      }
    }
  }

  const days: DayAvailability[] = [...perDayAvailable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, availableSiteCount]) => ({ date, availableSiteCount, totalSiteCount: totalSites }));

  return { status: "ok", days };
}

/**
 * Convenience wrapper: checks availability across a date range that may
 * span one or two months, and summarizes it as "how many days in the
 * window had at least one open site."
 */
export async function summarizeWindowAvailability(
  facilityId: string,
  startDate: Date,
  endDate: Date
): Promise<{ status: "ok" | "unknown"; daysWithAvailability: number; totalDays: number; reason?: string }> {
  const months = new Set<string>();
  for (
    let d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    d <= endDate;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  ) {
    months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
  }

  const results = await Promise.all(
    [...months].map((key) => {
      const [year, month0] = key.split("-").map(Number);
      return getMonthAvailability(facilityId, year, month0);
    })
  );

  const failure = results.find((r) => r.status === "unknown");
  if (failure && failure.status === "unknown") {
    return {
      status: "unknown",
      daysWithAvailability: 0,
      totalDays: 0,
      reason: failure.reason,
    };
  }

  const allDays = results.flatMap((r) => (r.status === "ok" ? r.days : []));
  const startKey = startDate.toISOString().slice(0, 10);
  const endKey = endDate.toISOString().slice(0, 10);
  const inWindow = allDays.filter((d) => d.date >= startKey && d.date <= endKey);

  return {
    status: "ok",
    daysWithAvailability: inWindow.filter((d) => d.availableSiteCount > 0).length,
    totalDays: inWindow.length,
  };
}
