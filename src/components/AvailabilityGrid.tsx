"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  rangeStart: Date;
  rangeEnd: Date;
  /** Set of UTC-midnight day timestamps this person has marked unavailable. */
  blocked: Set<number>;
  onChange: (next: Set<number>) => void;
  /** Optional: how many OTHER people are blocked on each day, for the heat row. */
  otherBlockedCounts?: Map<number, number>;
  totalOtherParticipants?: number;
};

function toUTCDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function buildWeeks(rangeStart: Date, rangeEnd: Date): number[][] {
  const start = toUTCDay(rangeStart);
  const end = toUTCDay(rangeEnd);
  const days: number[] = [];
  for (let d = start; d <= end; d += 86400000) days.push(d);

  // Pad the front so the grid lines up under Sun–Sat headers.
  const firstDow = new Date(start).getUTCDay();
  const padded: (number | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: number[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7) as number[]);
  }
  return weeks;
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function AvailabilityGrid({
  rangeStart,
  rangeEnd,
  blocked,
  onChange,
  otherBlockedCounts,
  totalOtherParticipants = 0,
}: Props) {
  const weeks = useMemo(() => buildWeeks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const [dragMode, setDragMode] = useState<"block" | "unblock" | null>(null);
  const draggingRef = useRef(false);

  function applyToDay(day: number, mode: "block" | "unblock") {
    const next = new Set(blocked);
    if (mode === "block") next.add(day);
    else next.delete(day);
    onChange(next);
  }

  function startDrag(day: number) {
    const mode = blocked.has(day) ? "unblock" : "block";
    draggingRef.current = true;
    setDragMode(mode);
    applyToDay(day, mode);
  }

  function enterDrag(day: number) {
    if (!draggingRef.current || !dragMode) return;
    applyToDay(day, dragMode);
  }

  function endDrag() {
    draggingRef.current = false;
    setDragMode(null);
  }

  return (
    <div className="select-none" onMouseUp={endDrag} onMouseLeave={endDrag}>
      <div className="grid grid-cols-7 gap-px text-center font-mono text-xs text-sage">
        {DOW.map((d, i) => (
          <div key={i} className="pb-1">
            {d}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-px">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-px">
            {week.map((day, di) => {
              if (day === null || Number.isNaN(day)) {
                return <div key={di} className="aspect-square" />;
              }
              const isBlocked = blocked.has(day);
              const otherCount = otherBlockedCounts?.get(day) ?? 0;
              const heat = totalOtherParticipants > 0 ? otherCount / totalOtherParticipants : 0;
              return (
                <button
                  key={di}
                  type="button"
                  onMouseDown={() => startDrag(day)}
                  onMouseEnter={() => enterDrag(day)}
                  title={
                    totalOtherParticipants > 0
                      ? `${otherCount}/${totalOtherParticipants} others already blocked`
                      : undefined
                  }
                  className={`aspect-square border border-slate font-mono text-xs transition-colors ${
                    isBlocked
                      ? "bg-rust text-paper"
                      : heat > 0
                        ? "text-paper"
                        : "bg-slate/40 text-paper hover:bg-slate"
                  }`}
                  style={
                    !isBlocked && heat > 0
                      ? { backgroundColor: `rgba(159, 214, 210, ${0.15 + heat * 0.5})` }
                      : undefined
                  }
                >
                  {new Date(day).getUTCDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 font-mono text-[11px] text-sage">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 border border-slate bg-rust" /> you are out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 border border-slate bg-moonlight/30" /> others blocked
        </span>
      </div>
    </div>
  );
}
