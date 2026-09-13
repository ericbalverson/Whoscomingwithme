/**
 * Given a trip's searchable date range and each participant's unavailable
 * date ranges, compute a day-by-day headcount of how many people are
 * BLOCKED on each day, then collapse that into ranked candidate windows.
 *
 * This deliberately doesn't require unanimous overlap. A group of 6 rarely
 * has a date where literally everyone is free — the useful output is
 * "here are the best windows, ranked by how many people they work for and
 * how long they run," so the organizer can make the call.
 */

export type DateRange = { startDate: Date; endDate: Date };

export type ParticipantAvailability = {
  participantId: string;
  name: string;
  unavailable: DateRange[];
};

export type CandidateWindow = {
  startDate: Date;
  endDate: Date;
  lengthDays: number;
  totalParticipants: number;
  blockedNames: string[]; // people blocked on at least one day of this window
  freeCount: number; // totalParticipants - blockedNames.length
};

function toUTCDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function eachDay(start: Date, end: Date): number[] {
  const days: number[] = [];
  let cur = toUTCDay(start);
  const last = toUTCDay(end);
  while (cur <= last) {
    days.push(cur);
    cur += 86400000;
  }
  return days;
}

/**
 * Returns, for every day in [rangeStart, rangeEnd], the set of participant
 * names who are unavailable that day.
 */
export function buildDailyBlockMap(
  rangeStart: Date,
  rangeEnd: Date,
  participants: ParticipantAvailability[]
): Map<number, Set<string>> {
  const days = eachDay(rangeStart, rangeEnd);
  const map = new Map<number, Set<string>>();
  for (const day of days) map.set(day, new Set());

  for (const p of participants) {
    for (const block of p.unavailable) {
      for (const day of eachDay(block.startDate, block.endDate)) {
        if (map.has(day)) map.get(day)!.add(p.name);
      }
    }
  }
  return map;
}

/**
 * Finds contiguous windows of at least `minLengthDays`, ranked best-first
 * by (fewest blocked, then longest).
 *
 * A single pass with one "max blocked" ceiling isn't enough: if the whole
 * range never exceeds, say, 2 blocked people, a single greedy pass reports
 * the ENTIRE range as one window and never surfaces the fully-free week
 * sitting inside it. So this runs the scan once per threshold (0 people
 * blocked, then <=1, then <=2, ...) and keeps the best window seen at each
 * distinct date range, so a perfect week isn't buried under a longer but
 * worse one.
 */
export function findCandidateWindows(
  rangeStart: Date,
  rangeEnd: Date,
  participants: ParticipantAvailability[],
  opts: { minLengthDays?: number; maxBlocked?: number } = {}
): CandidateWindow[] {
  const minLengthDays = opts.minLengthDays ?? 2;
  const totalParticipants = participants.length;
  const maxBlockedCeiling = opts.maxBlocked ?? Math.max(0, totalParticipants - 1);

  const dailyBlocks = buildDailyBlockMap(rangeStart, rangeEnd, participants);

  const byRange = new Map<string, CandidateWindow>();
  for (let threshold = 0; threshold <= maxBlockedCeiling; threshold++) {
    for (const w of scanAtThreshold(dailyBlocks, threshold, minLengthDays, totalParticipants)) {
      const key = `${w.startDate.getTime()}-${w.endDate.getTime()}`;
      const existing = byRange.get(key);
      // Same date range can qualify at multiple thresholds; keep the one
      // with the (identical, by construction) blocked set once.
      if (!existing) byRange.set(key, w);
    }
  }

  return [...byRange.values()].sort((a, b) => {
    if (a.freeCount !== b.freeCount) return b.freeCount - a.freeCount;
    return b.lengthDays - a.lengthDays;
  });
}

function scanAtThreshold(
  dailyBlocks: Map<number, Set<string>>,
  maxBlocked: number,
  minLengthDays: number,
  totalParticipants: number
): CandidateWindow[] {
  const days = [...dailyBlocks.keys()].sort((a, b) => a - b);
  const windows: CandidateWindow[] = [];
  let i = 0;
  while (i < days.length) {
    const blockedHere = dailyBlocks.get(days[i])!;
    if (blockedHere.size > maxBlocked) {
      i++;
      continue;
    }
    // Extend the window while every day added keeps the union of blocked
    // names within maxBlocked.
    let j = i;
    const unionBlocked = new Set<string>();
    while (j < days.length) {
      const dayBlocked = dailyBlocks.get(days[j])!;
      const trial = new Set([...unionBlocked, ...dayBlocked]);
      if (trial.size > maxBlocked) break;
      unionBlocked.clear();
      trial.forEach((n) => unionBlocked.add(n));
      j++;
    }
    const lengthDays = j - i;
    if (lengthDays >= minLengthDays) {
      windows.push({
        startDate: new Date(days[i]),
        endDate: new Date(days[j - 1]),
        lengthDays,
        totalParticipants,
        blockedNames: [...unionBlocked],
        freeCount: totalParticipants - unionBlocked.size,
      });
    }
    i = j > i ? j : i + 1;
  }

  return windows.sort((a, b) => {
    if (a.freeCount !== b.freeCount) return b.freeCount - a.freeCount;
    return b.lengthDays - a.lengthDays;
  });
}
