export type CampingStyle = "CAR" | "BACKPACK" | "EITHER";

/**
 * What a person who chose `preference` is actually willing to do.
 * CAR-only people won't backpack; BACKPACK-only people won't car camp;
 * EITHER is willing to do whichever the group lands on.
 */
function acceptableStyles(preference: CampingStyle): Set<"CAR" | "BACKPACK"> {
  if (preference === "EITHER") return new Set(["CAR", "BACKPACK"]);
  return new Set([preference]);
}

export type GroupCampingStyleResolution =
  | { status: "agreed"; style: "CAR" | "BACKPACK" | "EITHER" }
  | { status: "conflict"; carOnly: string[]; backpackOnly: string[] };

/**
 * Intersects every participant's acceptable styles. If everyone allows
 * both (or there are no participants yet), the group is open to either.
 * If the allowed sets share exactly one style, that's the group's style.
 * If they share none — someone is car-only while someone else is
 * backpack-only — that's a real scheduling conflict worth surfacing
 * rather than silently picking one side.
 */
export function resolveGroupCampingStyle(
  participants: { name: string; campingStyle: CampingStyle }[]
): GroupCampingStyleResolution {
  if (participants.length === 0) return { status: "agreed", style: "EITHER" };

  let intersection = new Set<"CAR" | "BACKPACK">(["CAR", "BACKPACK"]);
  for (const p of participants) {
    const mine = acceptableStyles(p.campingStyle);
    intersection = new Set([...intersection].filter((s) => mine.has(s)));
  }

  if (intersection.size === 2) return { status: "agreed", style: "EITHER" };
  if (intersection.size === 1) return { status: "agreed", style: [...intersection][0] };

  return {
    status: "conflict",
    carOnly: participants.filter((p) => p.campingStyle === "CAR").map((p) => p.name),
    backpackOnly: participants.filter((p) => p.campingStyle === "BACKPACK").map((p) => p.name),
  };
}
