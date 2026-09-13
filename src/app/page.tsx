"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rangeStart, rangeEnd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not create the trip");
      }
      const { trip } = await res.json();
      router.push(`/trip/${trip.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-wide text-sage">Camp Sync</p>
      <h1 className="mt-3 font-display text-4xl font-medium italic text-paper">
        Find the dates everyone can go.
      </h1>
      <p className="mt-4 text-sage">
        Set the season you are considering. Send the link to your group. Everyone
        blocks off the days they can not make it, and the best windows fall out
        on their own.
      </p>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-sage">Trip name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ouachita ridge weekend"
            className="rounded-none border border-slate bg-pine px-3 py-2 text-paper placeholder:text-sage/60 focus:border-ember focus:outline-none"
          />
        </label>

        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm text-sage">Earliest possible day</span>
            <input
              required
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="rounded-none border border-slate bg-pine px-3 py-2 font-mono text-paper focus:border-ember focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm text-sage">Latest possible day</span>
            <input
              required
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="rounded-none border border-slate bg-pine px-3 py-2 font-mono text-paper focus:border-ember focus:outline-none"
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
    </main>
  );
}
