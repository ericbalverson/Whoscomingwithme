import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RangeInput = { startDate: string; endDate: string };
type CampingStyleInput = "CAR" | "BACKPACK" | "EITHER";

// Upserts one participant's full set of unavailable ranges plus their
// camping-style preference. The client always sends the complete current
// set of ranges for that person (simplest mental model: "here is
// everything I've blocked out," not incremental add/remove).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { participantId, name, ranges, campingStyle } = body as {
    participantId?: string;
    name?: string;
    ranges: RangeInput[];
    campingStyle?: CampingStyleInput;
  };

  const trip = await prisma.trip.findUnique({ where: { slug: params.id } });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  for (const r of ranges ?? []) {
    if (Number.isNaN(Date.parse(r.startDate)) || Number.isNaN(Date.parse(r.endDate))) {
      return NextResponse.json({ error: "invalid range" }, { status: 400 });
    }
  }

  const participant = participantId
    ? await prisma.participant.findUnique({ where: { id: participantId } })
    : null;

  const resolvedParticipant =
    participant ??
    (await prisma.participant.create({
      data: {
        tripId: trip.id,
        name: name?.trim() || "Guest",
        campingStyle: campingStyle ?? "EITHER",
      },
    }));

  await prisma.$transaction([
    prisma.participant.update({
      where: { id: resolvedParticipant.id },
      data: {
        name: name?.trim() || resolvedParticipant.name,
        campingStyle: campingStyle ?? resolvedParticipant.campingStyle,
      },
    }),
    prisma.unavailableRange.deleteMany({
      where: { participantId: resolvedParticipant.id },
    }),
    prisma.unavailableRange.createMany({
      data: (ranges ?? []).map((r) => ({
        participantId: resolvedParticipant.id,
        startDate: new Date(r.startDate),
        endDate: new Date(r.endDate),
      })),
    }),
  ]);

  return NextResponse.json({ participantId: resolvedParticipant.id });
}
