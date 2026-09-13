/**
 * National Park Service API — official and documented.
 * Get a free key at https://www.nps.gov/subjects/developer/get-started.htm
 *
 * Phase 2 uses this only for state-level alerts (closures, fire bans,
 * road conditions). RIDB's facility search already covers non-NPS land
 * (Forest Service, BLM, etc.), and RIDB facilities don't map cleanly to
 * NPS park codes, so this is deliberately kept as general "heads up"
 * context rather than merged per-campground.
 */

const NPS_BASE = "https://developer.nps.gov/api/v1";

export type NpsAlert = {
  title: string;
  category: string;
  parkName: string;
  description: string;
  url: string;
};

type RawAlert = {
  title: string;
  category: string;
  description: string;
  url: string;
  parkFullName?: string;
};

export async function getStateAlerts(stateCode: string, limit = 5): Promise<NpsAlert[]> {
  const apiKey = process.env.NPS_API_KEY;
  if (!apiKey) throw new Error("NPS_API_KEY is not set");

  const url = new URL(`${NPS_BASE}/alerts`);
  url.searchParams.set("stateCode", stateCode);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`NPS request failed: ${res.status}`);

  const body = (await res.json()) as { data: RawAlert[] };
  return (body.data ?? []).map((a) => ({
    title: a.title,
    category: a.category,
    parkName: a.parkFullName ?? "",
    description: a.description,
    url: a.url,
  }));
}
