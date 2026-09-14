"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyTrips, type MyTripEntry } from "@/lib/myTrips";

function fmtShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myTrips, setMyTrips] = useState<MyTripEntry[]>([]);
  const [linkInput, setLinkInput] = useState("");

  useEffect(() => {
    setMyTrips(getMyTrips());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rangeStart, rangeEnd, organizerName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not create the trip");
      }
      const { trip, organizerId } = await res.json();
      if (organizerId) {
        localStorage.setItem(`camp-sync:${trip.slug}:participantId`, organizerId);
      }
      router.push(`/trip/${trip.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  function handleOpenLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    const slug = trimmed.split("/").filter(Boolean).pop() ?? trimmed;
    router.push(`/trip/${slug}`);
  }

  return (
    <main className="min-h-screen bg-cream">
      <nav className="flex items-center justify-between border-b border-slate bg-forest px-6 py-4 text-cream">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center bg-cream font-display text-xs font-semibold text-forest">
            CC
          </span>
          <span className="font-display text-lg font-medium">Campfire Calendar</span>
        </div>
        <div className="flex gap-6 font-mono text-xs uppercase tracking-wide">
          <a href="#start-trip" className="text-ember">
            Plan a trip
          </a>
          <a href="#how-it-works" className="text-cream/80 hover:text-cream">
            Campgrounds
          </a>
        </div>
      </nav>

      <section className="relative flex min-h-[420px] items-center overflow-hidden">
        <img
          src="/hero-camp.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark gradient so the light headline text stays readable over a
            busy photo/illustration — strongest on the left where the text
            sits, fading out toward the right side of the image. */}
        <div className="absolute inset-0 bg-gradient-to-r from-forest/85 via-forest/45 to-transparent" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-wide text-cream/80">Group trip planning</p>
          <h1 className="mt-3 font-display text-4xl font-medium leading-tight text-cream sm:text-5xl">
            Find the one weekend everybody can actually camp.
          </h1>
          <p className="mt-4 max-w-xl text-cream/90">
            Everyone marks the days they <em className="not-italic font-semibold">can&apos;t</em> go. We surface the
            best open stretch — then suggest park campgrounds and nearby trails for it.
          </p>
        </div>
      </section>

      {myTrips.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 pt-10">
          <h2 className="font-display text-lg font-medium text-paper">Your trips</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {myTrips.slice(0, 5).map((t) => (
              <li key={t.slug}>
                <a
                  href={`/trip/${t.slug}`}
                  className="flex items-center justify-between gap-4 border border-slate bg-pine px-4 py-3 hover:border-ember"
                >
                  <span className="font-medium text-paper">{t.name}</span>
                  <span className="font-mono text-xs text-sage">
                    {fmtShort(t.rangeStart)} – {fmtShort(t.rangeEnd)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="start-trip" className="mx-auto grid max-w-5xl gap-8 px-6 py-16 md:grid-cols-2">
        <div className="border border-slate bg-pine p-6">
          <h2 className="font-display text-2xl font-medium text-paper">Start a trip</h2>
          <p className="mt-1 text-sm text-sage">
            No account needed. You&apos;ll get a link to send your group.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-sage">Trip name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Fall camping with the Ramirez crew"
                className="border border-slate bg-cream px-3 py-2 text-paper placeholder:text-sage/60 focus:border-ember focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-sage">Your name</span>
              <input
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                placeholder="Eric"
                className="border border-slate bg-cream px-3 py-2 text-paper placeholder:text-sage/60 focus:border-ember focus:outline-none"
              />
            </label>

            <div className="flex gap-4">
              <label className="flex flex-1 flex-col gap-2">
                <span className="text-sm text-sage">Earliest date</span>
                <input
                  required
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full border border-slate bg-cream px-3 py-2 font-mono text-paper focus:border-ember focus:outline-none"
                />
              </label>
              <label className="flex flex-1 flex-col gap-2">
                <span className="text-sm text-sage">Latest date</span>
                <input
                  required
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="w-full border border-slate bg-cream px-3 py-2 font-mono text-paper focus:border-ember focus:outline-none"
                />
              </label>
            </div>

            {error && <p className="text-sm text-rust">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 bg-ember px-4 py-3 font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create trip and get a link"}
            </button>
          </form>
        </div>

        <div id="how-it-works" className="flex flex-col gap-8">
          {[
            { title: "Send one link", body: "Everyone opens it, types their name, and taps the days they're out." },
            { title: "See the open stretch", body: "Each possible run of nights is ranked by how many people are free." },
            { title: "Pick a campground", body: "Suggestions weigh the season, region, and how easy sites are to book." },
          ].map((step, i) => (
            <div key={step.title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-ember font-display text-sm font-semibold text-ink">
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-lg font-medium text-paper">{step.title}</h3>
                <p className="mt-1 text-sm text-sage">{step.body}</p>
              </div>
            </div>
          ))}

          <div className="border border-slate bg-pine p-5">
            <p className="font-mono text-xs uppercase tracking-wide text-sage">Already have a link?</p>
            <p className="mt-1 text-sm text-sage">
              Open the link the organizer sent you to add your unavailable dates. Nothing to sign up for.
            </p>
            <form onSubmit={handleOpenLink} className="mt-3 flex gap-2">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Paste the trip link or code"
                className="flex-1 border border-slate bg-cream px-3 py-2 text-sm text-paper placeholder:text-sage/60 focus:border-ember focus:outline-none"
              />
              <button
                type="submit"
                className="border border-slate px-3 py-2 font-mono text-xs text-paper hover:border-ember"
              >
                Open
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
