"use client";

import { useState } from "react";
import type { GroupCampingStyleResolution } from "@/lib/campingStyle";

type Trail = { id: string; name: string; difficulty: string; distanceMiles: number; url: string };

type Campground = {
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
  campingStyle: "CAR" | "BACKPACK" | "EITHER" | "UNKNOWN";
  score: number;
};

type Alert = { title: string; category: string; parkName: string; url: string };

type RecommendationResponse = {
  window: { startDate: string; endDate: string; freeCount: number; totalParticipants: number };
  resolvedLocation: string;
  campgrounds: Campground[];
  stateAlerts: Alert[];
  sourceNotes: string[];
  error?: string;
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function AvailabilityBadge({ availability }: { availability: Campground["availability"] }) {
  if (availability.status === "unknown") {
    return (
      <span className="font-mono text-[11px] text-sage" title={availability.reason}>
        availability unknown — check listing
      </span>
    );
  }
  const { daysWithAvailability, totalDays } = availability;
  if (totalDays === 0) {
    return <span className="font-mono text-[11px] text-sage">no data for these dates</span>;
  }
  const color = daysWithAvailability === totalDays ? "text-moonlight" : daysWithAvailability > 0 ? "text-ember" : "text-rust";
  return (
    <span className={`font-mono text-[11px] ${color}`}>
      {daysWithAvailability}/{totalDays} nights open (unofficial, verify before booking)
    </span>
  );
}

export function RecommendationsPanel({
  tripSlug,
  groupStyleResolution,
  pinnedFacilityId,
  onPinned,
}: {
  tripSlug: string;
  groupStyleResolution: GroupCampingStyleResolution;
  pinnedFacilityId: string | null;
  onPinned: () => void | Promise<void>;
}) {
  const defaultStyle = groupStyleResolution.status === "agreed" ? groupStyleResolution.style : "EITHER";
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(30);
  const [styleOverride, setStyleOverride] = useState<"CAR" | "BACKPACK" | "EITHER">(defaultStyle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!location.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripSlug}/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, radiusMiles: radius, campingStyleOverride: styleOverride }),
      });
      const body = (await res.json()) as RecommendationResponse;
      if (!res.ok) throw new Error(body.error ?? "lookup failed");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handlePin(c: Campground) {
    if (!data) return;
    setPinningId(c.facilityId);
    try {
      await fetch(`/api/trips/${tripSlug}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: c.facilityId,
          name: c.name,
          bookingUrl: c.bookingUrl,
          distanceMiles: c.distanceMiles,
          windowStart: data.window.startDate,
          windowEnd: data.window.endDate,
        }),
      });
      await onPinned();
    } finally {
      setPinningId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-slate pt-8">
      <div>
        <h2 className="font-display text-xl font-medium text-paper">Find a campground</h2>
        <p className="mt-1 text-sm text-sage">
          Searches near a place for the group&apos;s best window. Live availability comes from an
          unofficial source and can be wrong — always confirm on the booking link before you commit.
          Trail data is from OpenStreetMap, so it has real names and lengths but no popularity or
          quality ratings.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 min-w-[200px] flex-col gap-2">
          <span className="text-sm text-sage">Near</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ouachita National Forest, AR"
            className="border border-slate bg-pine px-3 py-2 text-paper placeholder:text-sage/60 focus:border-ember focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-sage">Radius (mi)</span>
          <input
            type="number"
            min={5}
            max={100}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-24 border border-slate bg-pine px-3 py-2 font-mono text-paper focus:border-ember focus:outline-none"
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-sage">Style</legend>
          <div className="flex gap-1">
            {(["CAR", "BACKPACK", "EITHER"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyleOverride(s)}
                className={`border px-3 py-2 font-mono text-xs ${
                  styleOverride === s ? "border-ember bg-ember text-ink" : "border-slate text-paper hover:border-ember"
                }`}
              >
                {s === "CAR" ? "Car" : s === "BACKPACK" ? "Backpack" : "Either"}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={loading}
          className="bg-ember px-4 py-2.5 font-medium text-ink hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-rust">{error}</p>}

      {data && (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-sage">
            For {fmt(data.window.startDate)} – {fmt(data.window.endDate)} ({data.window.freeCount}/
            {data.window.totalParticipants} free) near {data.resolvedLocation}
          </p>

          {data.sourceNotes.length > 0 && (
            <ul className="flex flex-col gap-1 border border-slate/60 px-3 py-2 font-mono text-[11px] text-sage">
              {data.sourceNotes.map((n, i) => (
                <li key={i}>⚠ {n}</li>
              ))}
            </ul>
          )}

          {data.stateAlerts.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-xs uppercase tracking-wide text-sage">NPS alerts in the area</h3>
              {data.stateAlerts.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-rust/50 px-3 py-2 text-sm text-paper hover:border-rust"
                >
                  <span className="text-rust">{a.category}</span> — {a.title}{" "}
                  {a.parkName && <span className="text-sage">({a.parkName})</span>}
                </a>
              ))}
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {data.campgrounds.slice(0, 8).map((c) => {
              const isPinned = pinnedFacilityId === c.facilityId;
              return (
                <li key={c.facilityId} className={`border p-4 ${isPinned ? "border-ember" : "border-slate"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <a
                        href={c.bookingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-display text-lg font-medium text-paper hover:text-ember"
                      >
                        {c.name}
                      </a>
                      <p className="mt-0.5 font-mono text-xs text-sage">
                        {c.distanceMiles} mi away · {c.reservable ? "reservable" : "first-come, first-served"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="whitespace-nowrap font-mono text-xs text-sage">score {c.score}</p>
                      <button
                        onClick={() => handlePin(c)}
                        disabled={pinningId === c.facilityId || isPinned}
                        className={`whitespace-nowrap border px-3 py-1.5 font-mono text-xs ${
                          isPinned
                            ? "border-ember bg-ember text-ink"
                            : "border-slate text-paper hover:border-ember disabled:opacity-50"
                        }`}
                      >
                        {isPinned ? "Pinned" : pinningId === c.facilityId ? "Pinning…" : "Pin this"}
                      </button>
                    </div>
                  </div>

                  {c.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-sage">{c.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <AvailabilityBadge availability={c.availability} />
                    <span className="font-mono text-[11px] text-sage">
                      {c.nearbyTrailCount} trail{c.nearbyTrailCount === 1 ? "" : "s"} within 15mi
                    </span>
                    <span
                      className="font-mono text-[11px] text-sage"
                      title="Guessed from RIDB campsite-type text — not an official field"
                    >
                      {c.campingStyle === "UNKNOWN" ? "style: unconfirmed" : `style: ${c.campingStyle.toLowerCase()}`}
                    </span>
                  </div>

                  {c.topTrails.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {c.topTrails.map((t) => (
                        <li key={t.id}>
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-moonlight hover:underline"
                          >
                            {t.name}
                          </a>{" "}
                          <span className="font-mono text-[11px] text-sage">
                            {t.difficulty} · {t.distanceMiles.toFixed(1)}mi long
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
