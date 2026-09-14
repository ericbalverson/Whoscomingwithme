"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";
import { resolveGroupCampingStyle, type CampingStyle } from "@/lib/campingStyle";
import { rememberTrip, forgetTrip } from "@/lib/myTrips";

type Trip = {
  id: string;
  slug: string;
  name: string;
  rangeStart: string;
  rangeEnd: string;
  participants: {
    id: string;
    name: string;
    campingStyle: CampingStyle;
    unavailableRanges: { startDate: string; endDate: string }[];
  }[];
  pinnedFacilityId: string | null;
  pinnedName: string | null;
  pinnedBookingUrl: string | null;
  pinnedDistanceMiles: number | null;
  pinnedWindowStart: string | null;
  pinnedWindowEnd: string | null;
  pinnedAt: string | null;
};

type CandidateWindow = {
  startDate: string;
  endDate: string;
  lengthDays: number;
  totalParticipants: number;
  freeCount: number;
  blockedNames: string[];
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function toUTCDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function rangesToDaySet(ranges: { startDate: string; endDate: string }[]): Set<number> {
  const set = new Set<number>();
  for (const r of ranges) {
    let cur = toUTCDay(new Date(r.startDate));
    const end = toUTCDay(new Date(r.endDate));
    while (cur <= end) {
      set.add(cur);
      cur += 86400000;
    }
  }
  return set;
}

function daySetToRanges(days: Set<number>): { startDate: string; endDate: string }[] {
  const sorted = [...days].sort((a, b) => a - b);
  const ranges: { startDate: string; endDate: string }[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] - sorted[j] === 86400000) j++;
    ranges.push({
      startDate: new Date(sorted[i]).toISOString(),
      endDate: new Date(sorted[j]).toISOString(),
    });
    i = j + 1;
  }
  return ranges;
}

export default function TripPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [windows, setWindows] = useState<CandidateWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [campingStyle, setCampingStyle] = useState<CampingStyle>("EITHER");
  const [blocked, setBlocked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const storageKey = `camp-sync:${params.id}:participantId`;

  async function load() {
    const res = await fetch(`/api/trips/${params.id}`, { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTrip(data.trip);
    setWindows(data.windows);
    setLoading(false);
    rememberTrip({
      slug: data.trip.slug,
      name: data.trip.name,
      rangeStart: data.trip.rangeStart,
      rangeEnd: data.trip.rangeEnd,
    });
    return data.trip as Trip;
  }

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    load().then((t) => {
      if (stored && t) {
        const mine = t.participants.find((p) => p.id === stored);
        if (mine) {
          setParticipantId(mine.id);
          setName(mine.name);
          setCampingStyle(mine.campingStyle);
          setBlocked(rangesToDaySet(mine.unavailableRanges));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const otherBlockedCounts = useMemo(() => {
    if (!trip) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const p of trip.participants) {
      if (p.id === participantId) continue;
      for (const day of rangesToDaySet(p.unavailableRanges)) {
        map.set(day, (map.get(day) ?? 0) + 1);
      }
    }
    return map;
  }, [trip, participantId]);

  const totalOtherParticipants =
    (trip?.participants.length ?? 0) - (participantId ? 1 : 0);

  const styleResolution = useMemo(
    () => resolveGroupCampingStyle(trip?.participants.map((p) => ({ name: p.name, campingStyle: p.campingStyle })) ?? []),
    [trip]
  );

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/trips/${params.id}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantId,
        name,
        campingStyle,
        ranges: daySetToRanges(blocked),
      }),
    });
    const data = await res.json();
    if (data.participantId) {
      setParticipantId(data.participantId);
      localStorage.setItem(storageKey, data.participantId);
    }
    await load();
    setSaving(false);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleUnpin() {
    await fetch(`/api/trips/${params.id}/pin`, { method: "DELETE" });
    await load();
  }

  async function handleDeleteTrip() {
    if (!trip) return;
    const confirmed = window.confirm(
      `Delete "${trip.name}" for everyone? This removes all availability that's been entered and can't be undone.`
    );
    if (!confirmed) return;
    setDeleting(true);
    await fetch(`/api/trips/${params.id}`, { method: "DELETE" });
    forgetTrip(params.id);
    router.push("/");
  }

  if (loading) {
    return <main className="p-8 text-sage">Loading…</main>;
  }

  if (!trip) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p className="font-mono text-sm text-rust">
          No trip found at this link. Check the URL, or start a new one.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-sage">Campfire Calendar</p>
          <h1 className="mt-1 font-display text-3xl font-medium text-paper">{trip.name}</h1>
          <p className="mt-1 text-sm text-sage">
            Searching {fmt(trip.rangeStart)} – {fmt(trip.rangeEnd)} · {trip.participants.length}{" "}
            {trip.participants.length === 1 ? "person" : "people"} in
          </p>
        </div>
        <button
          onClick={handleCopyLink}
          className="shrink-0 border border-slate px-3 py-2 font-mono text-xs text-paper hover:border-ember"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </header>

      {trip.pinnedName && (
        <section className="border border-ember/60 bg-ember/10 p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ember">Pinned campground</p>
          <div className="mt-1 flex items-start justify-between gap-4">
            <div>
              <a
                href={trip.pinnedBookingUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="font-display text-lg font-medium text-paper hover:text-ember"
              >
                {trip.pinnedName}
              </a>
              <p className="mt-0.5 font-mono text-xs text-sage">
                {trip.pinnedDistanceMiles != null && <>{trip.pinnedDistanceMiles} mi away · </>}
                {trip.pinnedWindowStart && trip.pinnedWindowEnd && (
                  <>
                    {fmt(trip.pinnedWindowStart)} – {fmt(trip.pinnedWindowEnd)}
                  </>
                )}
              </p>
            </div>
            <button
              onClick={handleUnpin}
              className="shrink-0 border border-slate px-3 py-2 font-mono text-xs text-paper hover:border-rust"
            >
              Unpin
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-1 min-w-[180px] flex-col gap-2 sm:w-64 sm:flex-none">
            <span className="text-sm text-sage">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="border border-slate bg-pine px-3 py-2 text-paper placeholder:text-sage/60 focus:border-ember focus:outline-none"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-sage">Camping style</legend>
            <div className="flex gap-1">
              {(["CAR", "BACKPACK", "EITHER"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCampingStyle(s)}
                  className={`border px-3 py-2 font-mono text-xs ${
                    campingStyle === s
                      ? "border-ember bg-ember text-ink"
                      : "border-slate text-paper hover:border-ember"
                  }`}
                >
                  {s === "CAR" ? "Car" : s === "BACKPACK" ? "Backpack" : "Either"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {styleResolution.status === "conflict" && (
          <p className="border border-rust/50 px-3 py-2 text-sm text-rust">
            No overlap yet: {styleResolution.carOnly.join(", ")} {styleResolution.carOnly.length === 1 ? "wants" : "want"} car
            camping only, {styleResolution.backpackOnly.join(", ")}{" "}
            {styleResolution.backpackOnly.length === 1 ? "wants" : "want"} backpacking only. Someone will need to
            compromise before a recommendation search can use the group's style.
          </p>
        )}

        <p className="text-sm text-sage">
          Click or drag across the days you know you <em className="text-paper not-italic">can not</em> go.
          Leave the rest blank.
        </p>

        <AvailabilityGrid
          rangeStart={new Date(trip.rangeStart)}
          rangeEnd={new Date(trip.rangeEnd)}
          blocked={blocked}
          onChange={setBlocked}
          otherBlockedCounts={otherBlockedCounts}
          totalOtherParticipants={totalOtherParticipants}
        />

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mt-2 self-start bg-ember px-4 py-2.5 font-medium text-ink hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save my availability"}
        </button>
      </section>

      <section className="flex flex-col gap-3 border-t border-slate pt-8">
        <h2 className="font-display text-xl font-medium text-paper">Best windows so far</h2>
        {windows.length === 0 ? (
          <p className="text-sm text-sage">
            No candidate windows yet — once a couple of people mark their availability,
            ranked windows will show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {windows.slice(0, 6).map((w, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 border border-slate px-4 py-3"
              >
                <div>
                  <p className="font-mono text-sm text-paper">
                    {fmt(w.startDate)} – {fmt(w.endDate)}{" "}
                    <span className="text-sage">({w.lengthDays}d)</span>
                  </p>
                  {w.blockedNames.length > 0 && (
                    <p className="mt-0.5 text-xs text-sage">Out: {w.blockedNames.join(", ")}</p>
                  )}
                </div>
                <p className="whitespace-nowrap font-mono text-sm text-moonlight">
                  {w.freeCount}/{w.totalParticipants} free
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecommendationsPanel
        tripSlug={trip.slug}
        groupStyleResolution={styleResolution}
        pinnedFacilityId={trip.pinnedFacilityId}
        onPinned={async () => {
          await load();
        }}
      />

      <footer className="border-t border-slate pt-6">
        <button
          onClick={handleDeleteTrip}
          disabled={deleting}
          className="font-mono text-xs text-sage underline decoration-dotted hover:text-rust disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete this trip"}
        </button>
      </footer>
    </main>
  );
}
