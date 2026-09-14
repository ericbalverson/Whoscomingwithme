"use client";

// There's no login, so "your trips" can only ever mean "trips this browser
// has touched." Stored as a small JSON list in localStorage, most recent
// first, capped so it can't grow unbounded on a machine used for years.

export type MyTripEntry = {
  slug: string;
  name: string;
  rangeStart: string;
  rangeEnd: string;
  savedAt: string;
};

const STORAGE_KEY = "camp-sync:my-trips";
const MAX_ENTRIES = 30;

export function getMyTrips(): MyTripEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MyTripEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberTrip(entry: Omit<MyTripEntry, "savedAt">): void {
  if (typeof window === "undefined") return;
  const existing = getMyTrips().filter((t) => t.slug !== entry.slug);
  const next = [{ ...entry, savedAt: new Date().toISOString() }, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function forgetTrip(slug: string): void {
  if (typeof window === "undefined") return;
  const next = getMyTrips().filter((t) => t.slug !== slug);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
